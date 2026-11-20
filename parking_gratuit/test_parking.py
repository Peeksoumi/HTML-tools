#!/usr/bin/env python3
"""Tests hors ligne (réseau simulé) : python3 test_parking.py"""
import json
import os
import sys
import threading
import unittest
import urllib.request
from http.server import ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources  # noqa: E402

LAT, LON = 47.2184, -1.5536
D = 0.0001  # ~11 m en latitude


def way(name, tags, n=20, pas=0.0002):
    geom = [{"lat": LAT + 0.001, "lon": LON + i * pas} for i in range(n)]
    t = {"highway": "residential", "name": name}
    t.update(tags)
    return {"type": "way", "tags": t, "geometry": geom}


def parking(name, dlat, fee=None, cap=None, **extra):
    t = {"amenity": "parking", "name": name}
    if fee:
        t["fee"] = fee
    if cap:
        t["capacity"] = str(cap)
    t.update(extra)
    return {"type": "node", "lat": LAT + dlat, "lon": LON, "tags": t}


OSM = [
    parking("Parking du Stade", 0.001, "no", 120),
    parking("Parking Relais Beaujoire", 0.0035, "no", 300),   # fusionné avec le temps réel
    parking("Parking Cathédrale", 0.002, "yes", 80),           # exclu (requête) mais testé au parsing
    parking("Parking privé", 0.002, "no", 50, access="private"),
    parking("Parking souterrain", 0.002, None, 400, parking="underground"),
    parking("Parking sans info", 0.0015, None),
    {"type": "node", "lat": LAT + 0.0012, "lon": LON + 0.01, "tags": {"amenity": "parking", "capacity": "2"}},
    {"type": "node", "lat": LAT + 0.0012, "lon": LON + 0.02, "tags": {"amenity": "parking", "capacity": "60", "addr:street": "Rue Neuve"}},
    way("Rue Large", {"parking:lane:both": "parallel", "parking:condition:both": "free"}),
    way("Rue Payante", {"parking:lane:both": "parallel", "parking:condition:both": "ticket"}),
    way("Rue Épis", {"parking:lane:right": "perpendicular"}),
    way("Rue Bleue", {"parking:lane:both": "parallel", "parking:condition:both": "disc"}, n=5),
]

RT = [
    {"nom": "Relais Beaujoire (P+R)", "lat": LAT + 0.00355, "lon": LON, "capacite": 310, "libres": 42,
     "gratuit": True, "certitude": "opérateur", "sources": ["Naolib"], "horodatage": "2026-11-14T09:30"},
    {"nom": "Parking Commerce", "lat": LAT + 0.004, "lon": LON, "capacite": 600, "libres": 10,
     "gratuit": False, "certitude": "opérateur", "sources": ["Naolib"], "horodatage": None},
    {"nom": "Parking du Stade", "lat": LAT + 0.0011, "lon": LON, "capacite": 118, "libres": 7,
     "gratuit": None, "certitude": "opérateur", "sources": ["Mairie"], "horodatage": None},
]


class Tests(unittest.TestCase):
    def test_parse_parkings(self):
        noms = {p["nom"] for p in sources.parse_parkings(OSM)}
        self.assertIn("Parking du Stade", noms)
        self.assertNotIn("Parking privé", noms)
        self.assertNotIn("Parking souterrain", noms)
        sans = [p for p in sources.parse_parkings(OSM) if p["nom"] == "Parking sans info"][0]
        self.assertEqual(sans["certitude"], "probable")

    def test_anonymes(self):
        m = [0]
        noms = [p["nom"] for p in sources.parse_parkings(OSM, m)]
        self.assertEqual(m[0], 1)                      # le petit anonyme est masqué
        self.assertIn("Parking Rue Neuve", noms)       # le gros anonyme est nommé d'après sa rue
        self.assertFalse(any("sans nom" in n for n in noms))  # le gros anonyme est nommé

    def test_noms_deduits(self):
        rue = {"type": "way", "tags": {"highway": "residential", "name": "Quai des Brumes"},
               "geometry": [{"lat": LAT, "lon": LON + 0.05}, {"lat": LAT, "lon": LON + 0.052}]}
        poi = {"type": "node", "lat": LAT + 0.5, "lon": LON, "tags": {"name": "Intermarché", "shop": "supermarket"}}
        def anon(lat, lon, **t):
            return {"type": "node", "lat": lat, "lon": lon, "tags": dict({"amenity": "parking"}, **t)}
        els = [rue, poi, anon(LAT + 0.0001, LON + 0.051),                 # ~11 m de la rue
               anon(LAT + 0.5001, LON),                                    # ~11 m du magasin
               anon(LAT + 2, LON, **{"addr:street": "Rue X", "addr:housenumber": "4"}),
               anon(LAT + 3, LON, parking="surface")]
        res = {p["nom"]: p["nom_deduit"] for p in sources.parse_parkings(els)}
        self.assertEqual(res["Parking Quai des Brumes"], "rue proche")
        self.assertEqual(res["Parking Intermarché"], "lieu proche")
        self.assertEqual(res["Parking 4 Rue X"], "adresse")
        self.assertEqual(res["Parking de surface"], "inconnu")
        # une rue loin (> 40 m) ne nomme pas
        loin = anon(LAT + 0.001, LON + 0.051)
        self.assertEqual(sources.parse_parkings([rue, loin])[0]["nom_deduit"], "inconnu")

    def test_geocodage_inverse(self):
        orig = sources.http_json
        sources._cache.clear()
        sources.http_json = lambda url, **k: {"address": {"road": "Rue Verte", "house_number": "8"}}
        try:
            p = {"nom": "Parking sans nom", "nom_deduit": "inconnu", "lat": 1.0, "lon": 2.0}
            sources.completer_noms([p])
            self.assertEqual((p["nom"], p["nom_deduit"]), ("Parking 8 Rue Verte", "géocodage"))
        finally:
            sources.http_json = orig

    def test_rues(self):
        rues = {r["nom"]: r for r in sources.parse_rues(OSM)}
        self.assertNotIn("Rue Payante", rues)
        large, epis = rues["Rue Large"], rues["Rue Épis"]
        # ~3,8 km... en fait 19 pas * 0,0002° ≈ 280 m ; deux côtés parallèles à 5,5 m, 85 % utiles
        self.assertAlmostEqual(large["places_estimees"], 280 * 2 * 0.85 / 5.5, delta=6)
        self.assertEqual(large["dont_sur"], large["places_estimees"])
        self.assertEqual(epis["dont_probable"], epis["places_estimees"])
        self.assertGreater(epis["places_estimees"], 50)  # 1 côté mais épis serrés
        self.assertEqual(rues["Rue Bleue"]["dont_disque"], rues["Rue Bleue"]["places_estimees"])

    def test_fusion(self):
        base = sources.parse_parkings(OSM)
        res = sources.fusionner(base + RT)
        beau = [p for p in res if "Beaujoire" in p["nom"]]
        self.assertEqual(len(beau), 1)
        self.assertEqual(beau[0]["libres"], 42)
        self.assertEqual(beau[0]["capacite"], 310)
        self.assertEqual(sorted(beau[0]["sources"]), ["Naolib", "OpenStreetMap"])
        self.assertTrue(beau[0]["gratuit"])
        stade = [p for p in res if p["nom"] == "Parking du Stade"]
        self.assertEqual(len(stade), 1)
        self.assertEqual(stade[0]["libres"], 7)
        self.assertTrue(stade[0]["gratuit"])  # OSM fee=no, opérateur inconnu -> gratuit
        self.assertTrue(any(p["nom"] == "Parking Commerce" and p["gratuit"] is False for p in res))

    def test_desaccord(self):
        a = {"nom": "P Test", "lat": LAT, "lon": LON, "capacite": 10, "libres": None, "gratuit": True,
             "certitude": "sûr", "sources": ["OSM"], "horodatage": None}
        b = dict(a, gratuit=False, libres=3, certitude="opérateur", sources=["X"])
        r = sources.fusionner([a, b])
        self.assertEqual(len(r), 1)
        self.assertIsNone(r[0]["gratuit"])
        self.assertTrue(r[0]["notes"])

    def test_tri_gratuite(self):
        base = {"gratuit": True, "certitude": "sûr"}
        self.assertEqual(sources.rang_gratuite(base), 0)
        self.assertEqual(sources.rang_gratuite(dict(base, certitude="opérateur")), 0)
        self.assertEqual(sources.rang_gratuite(dict(base, certitude="probable")), 1)
        self.assertEqual(sources.rang_gratuite(dict(base, gratuit=None)), 2)

    def test_totaux(self):
        res = sources.fusionner(sources.parse_parkings(OSM) + RT)
        tot = sources.totaux(res, sources.parse_rues(OSM))
        self.assertEqual(tot["libres_temps_reel"], 42 + 7)
        self.assertEqual(tot["parkings_temps_reel"], 2)
        self.assertEqual(tot["capacite_sans_temps_reel"], 60)  # seul « Parking Rue Neuve » (60) a une capacité
        self.assertGreater(tot["places_rues_estimees"], 100)

    def test_ods(self):
        v21 = {"results": [{"grp_nom": "Relais X", "grp_disponible": 12, "grp_exploitation": 50,
                            "location": {"lon": -1.5, "lat": 47.2}}]}
        v1 = {"records": [{"fields": {"nom": "Y", "libre": 5, "total": 20, "geo_point_2d": [48.5, 7.7]}}]}
        orig = sources.http_json
        try:
            src = sources.charger_sources()[0]
            sources.http_json = lambda url, **k: v21
            r = sources.lire_temps_reel(src)[0]
            self.assertEqual((r["libres"], r["capacite"], r["gratuit"]), (12, 50, True))
            self.assertEqual((r["lat"], r["lon"]), (47.2, -1.5))
            src2 = dict(sources.charger_sources()[1], positions_url=None)
            sources.http_json = lambda url, **k: v1
            r = sources.lire_temps_reel(src2)[0]
            self.assertEqual((r["libres"], r["lat"]), (5, 48.5))
            self.assertEqual(sources.to_int("-3"), None)
        finally:
            sources.http_json = orig

    def test_bout_en_bout(self):
        """Serveur réel + réseau simulé."""
        import server
        orig = sources.http_json

        def faux(url, data=None, **k):
            if "overpass" in url:
                return {"elements": [dict(e, id=i) for i, e in enumerate(OSM)]}
            if "nantesmetropole" in url:
                return {"results": [{"grp_nom": "Relais Beaujoire", "grp_disponible": 42,
                                     "grp_exploitation": 310, "location": {"lat": LAT + 0.00355, "lon": LON}}]}
            if "nominatim" in url:
                return [{"display_name": "Nantes, France", "lat": str(LAT), "lon": str(LON)}]
            raise OSError("réseau coupé : " + url)
        sources.http_json = faux
        sources._cache.clear()
        srv = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = f"http://127.0.0.1:{srv.server_address[1]}"
        try:
            d = json.load(urllib.request.urlopen(f"{base}/api/recherche?lat={LAT}&lon={LON}&rayon=1000"))
            self.assertEqual(d["totaux"]["libres_temps_reel"], 42)
            rangs = [sources.rang_gratuite(p) for p in d["parkings"]]
            self.assertEqual(rangs, sorted(rangs))   # gratuits d'abord, tarif inconnu en dernier
            self.assertEqual(d["rues"][0]["nom"], "Rue Épis")
            ids = {s["id"]: s["ok"] for s in d["sources"]}
            self.assertTrue(ids["osm_parkings"] and ids["osm_rues"] and ids["nantes"])
            self.assertEqual(d["anonymes_masques"], 1)
            g = json.load(urllib.request.urlopen(f"{base}/api/geocode?q=Nantes"))
            self.assertEqual(g["resultats"][0]["lat"], LAT)
            page = urllib.request.urlopen(base + "/").read().decode()
            self.assertIn("github.com/Peeksoumi/HTML-tools/issues", page)
            self.assertIn('id="geo"', page)
            with self.assertRaises(urllib.error.HTTPError) as c:
                urllib.request.urlopen(f"{base}/api/recherche?lat=abc&lon=1")
            self.assertEqual(c.exception.code, 400)
        finally:
            srv.shutdown()
            sources.http_json = orig

    def test_panne_osm(self):
        orig = sources.http_json
        sources._cache.clear()
        sources.http_json = lambda *a, **k: (_ for _ in ()).throw(OSError("coupé"))
        try:
            d = sources.rechercher(10.0, 10.0, 500)
            self.assertFalse(d["sources"][0]["ok"])
            self.assertEqual(d["totaux"]["parkings_gratuits"], 0)
        finally:
            sources.http_json = orig


if __name__ == "__main__":
    unittest.main(verbosity=2)
