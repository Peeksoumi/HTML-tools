#!/usr/bin/env python3
"""parking_gratuit : récupération et fusion des sources de stationnement gratuit.

Sources fusionnées :
  1. OpenStreetMap (Overpass) : parkings (fee=no / non renseigné) et rues avec stationnement
     le long de la voirie (tags parking:lane:*), d'où l'estimation « rues avec beaucoup de places ».
  2. Open data temps réel (sources.json) : nombre de places libres par parking (API Opendatasoft).
Les doublons entre sources sont fusionnés (proximité + ressemblance des noms).
Bibliothèque standard uniquement.
"""
import json
import math
import os
import re
import time
import unicodedata
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
UA = "parking-gratuit/1.0 (+https://github.com/Peeksoumi/private)"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"

# Longueur de chaussée par voiture (m) selon l'orientation ; part réellement utilisable
# (carrefours, passages piétons, entrées charretières).
SLOT = {"parallel": 5.5, "diagonal": 3.0, "perpendicular": 2.5}
PART_UTILE = 0.85
CONDITIONS_EXCLUES = {"ticket", "customers", "residents", "private", "disabled", "loading",
                      "no_parking", "no_standing", "no_stopping", "permit", "delivery"}

_cache = {}


def cached(key, ttl, fn):
    hit = _cache.get(key)
    if hit and time.time() - hit[0] < ttl:
        return hit[1]
    val = fn()
    _cache[key] = (time.time(), val)
    return val


def http_json(url, data=None, timeout=40):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": UA, "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2
         + math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 12742000 * math.asin(math.sqrt(a))


def norm(s):
    s = unicodedata.normalize("NFD", str(s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9 ]+", " ", s)


_STOP = {"parking", "parc", "de", "du", "la", "le", "les", "des", "d", "l", "et", "en", "ouvrage", "enclos", "public"}


def tokens(name):
    return {t for t in norm(name).split() if t not in _STOP}


def similarite(a, b):
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return 0.0
    return len(ta & tb) / len(ta | tb)


def to_int(v):
    m = re.match(r"\s*(\d+)", str(v)) if v is not None else None
    return int(m.group(1)) if m else None


# ------------------------------------------------------------------ OpenStreetMap

def _overpass(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    derniere = None
    for url in OVERPASS_URLS:
        try:
            return http_json(url, data=body, timeout=35).get("elements", [])
        except Exception as e:  # noqa: BLE001 - on essaie le miroir suivant
            derniere = e
    raise derniere


def requete_parkings(lat, lon, r):
    """Parkings + (pour nommer les anonymes) rues nommées à < 35 m et lieux nommés à < 60 m."""
    return _overpass(f"""[out:json][timeout:25];
nwr["amenity"="parking"]["fee"!="yes"](around:{r},{lat},{lon})->.p;
.p out center tags;
way(around.p:35)["highway"]["name"]->.h;
.h out tags geom;
(nwr(around.p:60)["name"]["shop"];nwr(around.p:60)["name"]["leisure"];
 nwr(around.p:60)["name"]["tourism"];nwr(around.p:60)["name"]["amenity"]["amenity"!="parking"];)->.o;
.o out center tags;""")


def requete_rues(lat, lon, r):
    reg = '~"^(parallel|diagonal|perpendicular)$"'
    return _overpass(f"""[out:json][timeout:25];
(
way["highway"]["name"]["parking:lane:both"{reg}](around:{r},{lat},{lon});
way["highway"]["name"]["parking:lane:right"{reg}](around:{r},{lat},{lon});
way["highway"]["name"]["parking:lane:left"{reg}](around:{r},{lat},{lon});
);
out tags geom;""")


def _xy(lat, lon, lat0):
    return lon * math.cos(lat0 * math.pi / 180) * 111320, lat * 110540


def dist_polyligne(lat, lon, geom):
    """Distance (m) d'un point à une polyligne [{'lat','lon'}…], projection locale."""
    px, py = _xy(lat, lon, lat)
    best = float("inf")
    pts = [_xy(g["lat"], g["lon"], lat) for g in geom]
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        t = 0 if dx == dy == 0 else max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
        best = min(best, math.hypot(px - (ax + t * dx), py - (ay + t * dy)))
    return best


def contexte(elements):
    """Rues nommées (avec géométrie) et lieux nommés présents dans la réponse Overpass."""
    rues, lieux = [], []
    for el in elements:
        t = el.get("tags") or {}
        if not t.get("name") or t.get("amenity") == "parking":
            continue
        if "highway" in t and el.get("geometry"):
            rues.append((t["name"], el["geometry"]))
        elif any(k in t for k in ("shop", "leisure", "tourism", "amenity")):
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat is not None and lon is not None:
                lieux.append((t["name"], lat, lon))
    return rues, lieux


def deduire_nom(t, lat, lon, rues, lieux):
    """(nom, origine) d'un parking anonyme d'après ses tags puis sa position."""
    if t.get("addr:street"):
        num = t.get("addr:housenumber")
        return f"Parking {num + ' ' if num else ''}{t['addr:street']}", "adresse"
    proches = sorted((haversine(lat, lon, la, lo), n) for n, la, lo in lieux)
    if proches and proches[0][0] <= 50:
        return f"Parking {proches[0][1]}", "lieu proche"
    rp = sorted((dist_polyligne(lat, lon, g), n) for n, g in rues)
    if rp and rp[0][0] <= 40:
        return f"Parking {rp[0][1]}", "rue proche"
    return {"surface": "Parking de surface", "street_side": "Parking en bord de rue",
            "lane": "Parking en bord de rue"}.get(t.get("parking"), "Parking sans nom"), "inconnu"


def parse_parkings(elements, masques=None):
    out = []
    masques = masques if masques is not None else [0]
    rues, lieux = contexte(elements)
    for el in elements:
        t = el.get("tags") or {}
        if t.get("amenity") != "parking":
            continue
        if t.get("access") in ("private", "customers", "permit", "delivery", "no"):
            continue
        if t.get("fee") == "yes" or "charge" in t or "fee:conditional" in t:
            continue
        sur = t.get("fee") == "no"
        # Les parkings en ouvrage / souterrains sont presque toujours payants : fee=no exigé.
        if t.get("parking") in ("underground", "multi-storey", "rooftop") and not sur:
            continue
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat is None or lon is None:
            continue
        cap = to_int(t.get("capacity"))
        nom = t.get("name") or t.get("operator") or t.get("brand")
        deduit = None
        if not nom:
            if not sur and cap is not None and cap < 5:   # mini parkings anonymes : bruit
                masques[0] += 1
                continue
            nom, deduit = deduire_nom(t, lat, lon, rues, lieux)
        out.append({
            "nom": nom, "nom_deduit": deduit,
            "lat": lat, "lon": lon,
            "capacite": cap,
            "libres": None,
            "gratuit": True,
            "certitude": "sûr" if sur else "probable",
            "sources": ["OpenStreetMap"],
            "horodatage": None,
        })
    return out


def geocodage_inverse(lat, lon):
    url = "https://nominatim.openstreetmap.org/reverse?" + urllib.parse.urlencode(
        {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 18, "accept-language": "fr"})
    d = cached(("rev", round(lat, 5), round(lon, 5)), 86400, lambda: http_json(url, timeout=15))
    a = d.get("address", {})
    rue = a.get("road") or a.get("pedestrian") or a.get("residential")
    if rue:
        num = a.get("house_number")
        return f"Parking {num + ' ' if num else ''}{rue}"
    return d.get("name") and f"Parking {d['name']}"


def completer_noms(parkings, max_requetes=6):
    """Dernier recours pour les anonymes restants : Nominatim inverse (1 requête/s, plafonné)."""
    n = 0
    for p in parkings:
        if p.get("nom_deduit") != "inconnu" or n >= max_requetes:
            continue
        if n:
            time.sleep(1.1)
        n += 1
        try:
            nom = geocodage_inverse(p["lat"], p["lon"])
        except Exception:  # noqa: BLE001 - on garde le nom générique
            break
        if nom:
            p["nom"], p["nom_deduit"] = nom, "géocodage"


def _cote(t, side, cle):
    """Valeur d'un tag pour un côté, avec repli sur « both »."""
    for s in (side, "both"):
        v = t.get(f"{cle}:{s}")
        if v:
            return v
    return None


def parse_rues(elements):
    """Regroupe les tronçons par nom de rue et estime le nombre de places gratuites."""
    rues = {}
    for el in elements:
        t = el.get("tags") or {}
        if el.get("type") != "way" or "highway" not in t or t.get("amenity") == "parking":
            continue
        geom = el.get("geometry") or []
        if len(geom) < 2:
            continue
        longueur = sum(haversine(a["lat"], a["lon"], b["lat"], b["lon"]) for a, b in zip(geom, geom[1:]))
        mid = geom[len(geom) // 2]
        cotes = [s for s in ("both", "left", "right")
                 if t.get(f"parking:lane:{s}") in SLOT]
        if "both" in cotes:
            cotes = ["both"]
        for s in cotes:
            orient = t[f"parking:lane:{s}"]
            cond = (_cote(t, s, "parking:condition") or "").split(";")[0].strip()
            fee = _cote(t, s, "parking:fee") or t.get(f"parking:lane:{s}:fee")
            if cond in CONDITIONS_EXCLUES or fee == "yes" or cond == "no_parking":
                continue
            if cond == "free" or fee == "no":
                statut = "sûr"
            elif cond == "disc":
                statut = "disque"
            else:
                statut = "probable"
            nb_cotes = 2 if s == "both" else 1
            cap = to_int(t.get(f"parking:lane:{s}:capacity"))
            places = cap if cap is not None else longueur * nb_cotes * PART_UTILE / SLOT[orient]
            nom = t["name"]
            r = rues.setdefault(nom, {"nom": nom, "lat": 0.0, "lon": 0.0, "poids": 0.0,
                                      "places": 0.0, "sur": 0.0, "probable": 0.0, "disque": 0.0,
                                      "longueur_m": 0.0, "orientations": set()})
            r["places"] += places
            r[{"sûr": "sur", "disque": "disque", "probable": "probable"}[statut]] += places
            r["longueur_m"] += longueur
            r["orientations"].add(orient)
            r["lat"] += mid["lat"] * longueur
            r["lon"] += mid["lon"] * longueur
            r["poids"] += longueur
    res = []
    for r in rues.values():
        if r["poids"] <= 0:
            continue
        res.append({
            "nom": r["nom"], "lat": r["lat"] / r["poids"], "lon": r["lon"] / r["poids"],
            "places_estimees": int(round(r["places"])),
            "dont_sur": int(round(r["sur"])), "dont_probable": int(round(r["probable"])),
            "dont_disque": int(round(r["disque"])),
            "longueur_m": int(round(r["longueur_m"])),
            "orientation": "/".join(sorted(r["orientations"])),
            "sources": ["OpenStreetMap"],
        })
    return [r for r in res if r["places_estimees"] > 0]


# ------------------------------------------------------------------ Open data temps réel

def charger_sources():
    chemin = os.path.join(HERE, "sources.json")
    try:
        with open(chemin, encoding="utf-8") as f:
            return json.load(f).get("sources", [])
    except FileNotFoundError:
        return []


def pick(rec, candidats):
    for c in candidats:
        if c in rec and rec[c] not in (None, ""):
            return rec[c]
    return None


def extraire_position(rec):
    for k in ("location", "geo_point_2d", "position", "coordonnees", "geopoint", "geometry"):
        g = rec.get(k)
        if isinstance(g, dict):
            if "lat" in g and "lon" in g:
                return float(g["lat"]), float(g["lon"])
            c = g.get("coordinates") or (g.get("geometry") or {}).get("coordinates")
            if c and len(c) >= 2 and not isinstance(c[0], list):
                return float(c[1]), float(c[0])
        elif isinstance(g, (list, tuple)) and len(g) == 2:
            return float(g[0]), float(g[1])
        elif isinstance(g, str) and "," in g:
            a, b = g.split(",", 1)
            try:
                return float(a), float(b)
            except ValueError:
                pass
    lat = pick(rec, ("latitude", "lat", "y"))
    lon = pick(rec, ("longitude", "lon", "lng", "x"))
    if lat is not None and lon is not None:
        try:
            return float(lat), float(lon)
        except ValueError:
            return None
    return None


def enregistrements(url):
    d = http_json(url)
    if "results" in d:
        return d["results"]
    return [r.get("fields", r) for r in d.get("records", [])]


def gratuit_selon_source(src, nom):
    rx = src.get("gratuit_si_nom")
    if rx and re.search(rx, nom or "", re.I):
        return True
    return src.get("gratuit")  # True / False / None (inconnu)


def lire_temps_reel(src):
    champs = src.get("champs", {})
    positions = {}
    if src.get("positions_url"):
        for rec in enregistrements(src["positions_url"]):
            nom = pick(rec, champs.get("nom_position", champs.get("nom", ["nom"])))
            pos = extraire_position(rec)
            if nom and pos:
                positions[norm(nom)] = pos
    out = []
    for rec in enregistrements(src["url"]):
        nom = pick(rec, champs.get("nom", ["nom"]))
        if not nom:
            continue
        libres = to_int(pick(rec, champs.get("libres", ["libres"])))
        if libres is not None and libres < 0:
            libres = None
        total = to_int(pick(rec, champs.get("total", ["total"])))
        pos = extraire_position(rec) or positions.get(norm(nom))
        out.append({
            "nom": str(nom), "lat": pos[0] if pos else None, "lon": pos[1] if pos else None,
            "capacite": total, "libres": libres,
            "gratuit": gratuit_selon_source(src, str(nom)),
            "certitude": "opérateur",
            "sources": [src.get("nom", src["id"])],
            "horodatage": pick(rec, champs.get("horodatage", ["horodatage"])),
        })
    return out


def temps_reel_pour(lat, lon, r):
    """Interroge les sources proches ; renvoie (parkings, rapport par source)."""
    sources = [s for s in charger_sources()
               if haversine(lat, lon, *s["centre"]) <= s.get("rayon_km", 30) * 1000 + r]
    rapport, tout = [], []

    def un(src):
        try:
            items = cached(("rt", src["id"]), 120, lambda: lire_temps_reel(src))
            return src, items, None
        except Exception as e:  # noqa: BLE001
            return src, [], f"{type(e).__name__}: {e}"

    with ThreadPoolExecutor(max_workers=4) as ex:
        for src, items, err in ex.map(un, sources):
            rapport.append({"id": src["id"], "nom": src.get("nom", src["id"]),
                            "ok": err is None, "nb": len(items), "erreur": err})
            tout.extend(items)
    return tout, rapport


# ------------------------------------------------------------------ Fusion

SEUIL_PROCHE_M = 25      # même parking si à moins de 25 m (des parkings distincts peuvent se toucher)
SEUIL_NOM_M = 300        # ... ou à moins de 300 m avec un nom assez proche
SEUIL_NOM = 0.4


def _meme_parking(a, b):
    if a["lat"] is None or b["lat"] is None:
        return similarite(a["nom"], b["nom"]) >= 0.6
    d = haversine(a["lat"], a["lon"], b["lat"], b["lon"])
    if d <= SEUIL_PROCHE_M:
        return True
    return d <= SEUIL_NOM_M and similarite(a["nom"], b["nom"]) >= SEUIL_NOM


def fusionner(parkings):
    """Fusionne les doublons ; les valeurs de l'opérateur (temps réel) l'emportent."""
    res = []
    for p in sorted(parkings, key=lambda x: x["certitude"] != "opérateur"):
        cible = next((r for r in res if _meme_parking(r, p)), None)
        if cible is None:
            res.append(dict(p, sources=list(p["sources"]), notes=[]))
            continue
        cible["sources"] += [s for s in p["sources"] if s not in cible["sources"]]
        if cible.get("nom_deduit") and not p.get("nom_deduit"):   # un nom réel remplace un nom déduit
            cible["nom"], cible["nom_deduit"] = p["nom"], None
        if p["libres"] is not None:
            cible["libres"] = p["libres"]
            cible["horodatage"] = p.get("horodatage")
        if p["capacite"] is not None and (cible["capacite"] is None or p["certitude"] == "opérateur"):
            cible["capacite"] = p["capacite"]
        if cible["lat"] is None and p["lat"] is not None:
            cible["lat"], cible["lon"] = p["lat"], p["lon"]
        # Tarif : on fusionne en signalant les désaccords.
        g1, g2 = cible["gratuit"], p["gratuit"]
        if g1 is None:
            cible["gratuit"] = g2
        elif g2 is not None and g1 != g2:
            cible["gratuit"] = None
            cible["notes"].append("sources en désaccord sur la gratuité")
        if p["certitude"] == "sûr":
            cible["certitude"] = "sûr" if cible["certitude"] != "opérateur" else "opérateur"
    return res


def rang_gratuite(p):
    """Tri : gratuit confirmé (0), gratuit probable (1), tarif inconnu (2)."""
    if p["gratuit"] is None:
        return 2
    return 1 if p["certitude"] == "probable" else 0


def totaux(parkings, rues):
    gratuits = [p for p in parkings if p["gratuit"] is True]
    inconnus = [p for p in parkings if p["gratuit"] is None]
    tr = [p for p in gratuits if p["libres"] is not None]
    sans = [p for p in gratuits if p["libres"] is None and p["capacite"]]
    return {
        "parkings_gratuits": len(gratuits),
        "parkings_tarif_inconnu": len(inconnus),
        "libres_temps_reel": sum(p["libres"] for p in tr),
        "parkings_temps_reel": len(tr),
        "capacite_sans_temps_reel": sum(p["capacite"] for p in sans),
        "parkings_sans_temps_reel": len(sans),
        "rues": len(rues),
        "places_rues_estimees": sum(r["places_estimees"] for r in rues),
        "libres_temps_reel_tarif_inconnu": sum(p["libres"] for p in inconnus if p["libres"] is not None),
    }


def rechercher(lat, lon, rayon=1000, max_rues=20):
    rayon = max(100, min(int(rayon), 4000))
    rapport = []

    def osm(nom, ident, fn):
        cle = (ident, round(lat, 3), round(lon, 3), rayon)
        try:
            el = cached(cle, 600, lambda: fn(lat, lon, rayon))
            rapport.append({"id": ident, "nom": nom, "ok": True, "nb": len(el), "erreur": None})
            return el
        except Exception as e:  # noqa: BLE001
            rapport.append({"id": ident, "nom": nom, "ok": False, "nb": 0,
                            "erreur": f"{type(e).__name__}: {e}"})
            return []

    with ThreadPoolExecutor(max_workers=2) as ex:
        fp = ex.submit(osm, "OpenStreetMap (parkings)", "osm_parkings", requete_parkings)
        fr = ex.submit(osm, "OpenStreetMap (rues)", "osm_rues", requete_rues)
        el_p, el_r = fp.result(), fr.result()
    rapport.sort(key=lambda r: r["id"] != "osm_parkings")
    masques = [0]
    osm_p = parse_parkings(el_p, masques)
    rues = parse_rues(el_r)
    rt, rap_rt = temps_reel_pour(lat, lon, rayon)
    rapport += rap_rt
    parkings = fusionner(osm_p + rt)
    for p in parkings:
        p["distance_m"] = int(haversine(lat, lon, p["lat"], p["lon"])) if p["lat"] is not None else None
    parkings = [p for p in parkings
                if p["gratuit"] is not False and (p["distance_m"] is None or p["distance_m"] <= rayon)]
    parkings.sort(key=lambda p: (rang_gratuite(p), p["distance_m"] is None, p["distance_m"] or 0))
    completer_noms([p for p in parkings if p["lat"] is not None])
    for r in rues:
        r["distance_m"] = int(haversine(lat, lon, r["lat"], r["lon"]))
    rues.sort(key=lambda r: -r["places_estimees"])
    return {
        "centre": {"lat": lat, "lon": lon}, "rayon": rayon,
        "totaux": totaux(parkings, rues),
        "parkings": parkings, "rues": rues[:max_rues], "sources": rapport,
        "anonymes_masques": masques[0],
        "avertissement": "Les places libres ne sont connues que là où une source temps réel existe ; "
                         "ailleurs, c'est la capacité (OpenStreetMap). Les places de rue sont des estimations.",
    }


def geocoder(q):
    url = NOMINATIM_URL + "?" + urllib.parse.urlencode(
        {"q": q, "format": "jsonv2", "limit": 5, "accept-language": "fr"})
    data = cached(("geo", norm(q)), 3600, lambda: http_json(url, timeout=20))
    return [{"nom": d.get("display_name"), "lat": float(d["lat"]), "lon": float(d["lon"])} for d in data]
