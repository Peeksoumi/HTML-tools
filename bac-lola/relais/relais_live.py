#!/usr/bin/env python3
"""Relais sans mémoire pour la page bac-lola : les positions AIS de Lola des 30 dernières minutes, tenues en mémoire vive.

- Aucune base de données ni fichier de relevés : une fenêtre glissante de 30 min en RAM, perdue au redémarrage.
- Toutes les 5 min, il publie cette fenêtre (positions.json) dans un dépôt GitHub public, en écrasant tout (un seul commit, aucun historique git) :
  la page bac-lola y relit les positions pour se resynchroniser. Variables : LOLA_RELAIS_REPO (ex. git@github.com:Peeksoumi/lola-relais.git) et la clé de dépôt `deploy_key` (systemd LoadCredential).
- Ne lit JAMAIS les relevés enregistrés (releves_*.csv) : ceux-ci ne servent qu'à entraîner le modèle.
- Interroge AISVesselTracker (source principale) puis Shiptrail (secours si AVT échoue ou a plus de 3 min de retard).
- GET /positions -> {"maj": ms, "fenetre_min": 30, "n": N, "source": "avt|shiptrail", "samples": [[ts_ms, lat, lon, vitesse|null, cap|null], ...]}
  (ts = heure de la position côté source ; les en-têtes CORS sont ajoutés par nginx.)
Écoute sur 127.0.0.1:18791 ; nginx le publie sous /lola-direct/ (flux « direct » lu par la page, avec CORS).
Autonome : aucune dépendance au dépôt privé (déployé sur le VPS depuis ce dépôt public).
"""
import json, os, shutil, subprocess, threading, time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import re, urllib.request

# --- lecture des sources AIS (AISVesselTracker, puis Shiptrail en secours) ---------------------
MMSI = 227158520
URL_SHIPTRAIL = "https://shiptrail.io/mcp"
TIMEOUT = 5
UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36"


def http(url, corps=None, entetes=None):
    h = {"User-Agent": UA, "Accept-Language": "fr-FR,fr;q=0.9", "Cache-Control": "no-store"}
    h.update(entetes or {})
    req = urllib.request.Request(url, data=corps, headers=h)
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.status, r.read().decode("utf-8", "replace").strip()


def trouver(obj, noms):
    """Premier nombre rencontré (en profondeur) sous une clé de `noms` (insensible à la casse)."""
    noms = [n.lower() for n in noms]
    pile = [obj]
    while pile:
        o = pile.pop(0)
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower() in noms and isinstance(v, (int, float)) and not isinstance(v, bool):
                    return v
            pile.extend(o.values())
        elif isinstance(o, list):
            pile.extend(o)
    return None


def trouver_texte(obj, noms):
    noms = [n.lower() for n in noms]
    pile = [obj]
    while pile:
        o = pile.pop(0)
        if isinstance(o, dict):
            for k, v in o.items():
                if k.lower() in noms and isinstance(v, (str, int, float)):
                    return str(v)
            pile.extend(o.values())
        elif isinstance(o, list):
            pile.extend(o)
    return ""


def appel_mcp(url, outil, variantes):
    derniere = None
    for args in variantes:
        corps = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                            "params": {"name": outil, "arguments": args}}).encode()
        statut, txt = http(url, corps, {"Content-Type": "application/json",
                                        "Accept": "application/json, text/event-stream"})
        if txt.startswith("event:") or txt.startswith("data:"):  # réponse en flux SSE
            lignes = [l[5:].strip() for l in txt.splitlines() if l.startswith("data:")]
            txt = lignes[-1] if lignes else txt
        rep = json.loads(txt)
        res = rep.get("result") or {}
        if rep.get("error") or res.get("isError"):
            derniere = ValueError("MCP erreur avec %r : %s" % (args, txt[:300]))
            continue
        donnees = res.get("structuredContent")
        if not donnees:
            for c in res.get("content", []):
                try:
                    donnees = json.loads(c.get("text", ""))
                    break
                except ValueError:
                    pass
        if not donnees:
            derniere = ValueError("MCP sans données : %s" % txt[:300])
            continue
        lat = trouver(donnees, ("lat", "latitude"))
        lon = trouver(donnees, ("lon", "lng", "longitude"))
        vit = trouver(donnees, ("speedKn", "speed", "sog", "speedKnots", "speed_knots", "speedOverGround"))
        cap = trouver(donnees, ("courseDeg", "course", "cog", "courseOverGround"))
        if lat is None or lon is None:
            derniere = ValueError("MCP champs introuvables (lat=%s lon=%s vitesse=%s) : %s" % (lat, lon, vit, txt[:400]))
            continue
        horo = trouver_texte(donnees, ("lastHeard", "last_pos", "lastPosition", "timestamp", "lastSeen", "updated", "heard"))
        return [str(lat), str(lon), "" if vit is None else str(vit), "" if cap is None else str(cap), horo.replace(",", " ")]
    raise derniere or ValueError("MCP sans réponse")


def source_avt():
    """aisvesseltracker.com : page publique, position rafraîchie toutes les ~30-80 s."""
    statut, h = http("https://aisvesseltracker.com/vessel/%d" % MMSI)
    m = re.search(r'geo\.position" content="(-?\d+\.\d+);(-?\d+\.\d+)"', h)
    if not m:
        raise ValueError("AVT: position introuvable (HTTP %s) : %s" % (statut, h[:200].replace("\n", " ")))
    v = re.search(r"moving at ([\d.]+) knots", h)
    c = re.search(r'"(?:cog|course|courseOverGround)\\?":\s*([\d.]+)', h)
    t = re.search(r"20\d\d-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z?", h)
    return [m.group(1), m.group(2), v.group(1) if v else "", c.group(1) if c else "", t.group(0) if t else ""]


def source_shiptrail():
    return appel_mcp(URL_SHIPTRAIL, "get_ship", [{"mmsi": MMSI}, {"mmsi": str(MMSI)}])



PAS = 15            # s entre deux interrogations
RETARD_MAX = 180    # s : au-delà, on bascule sur la source de secours
FENETRE_S = 30 * 60   # on ne conserve jamais plus de 30 minutes de positions
PUBLIER_S = 300       # publication GitHub toutes les 5 min
RUN = os.environ.get("RUNTIME_DIRECTORY", "/run/lola-relais")  # tmpfs : en RAM
REPO = os.environ.get("LOLA_RELAIS_REPO", "")
anneau = []
etat = {"source": None, "erreur": None}
verrou = threading.Lock()


def vers_ms(txt):
    if not txt:
        return None
    try:
        d = datetime.fromisoformat(txt.replace("Z", "+00:00"))
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return int(d.timestamp() * 1000)
    except ValueError:
        return None


def flottant(x):
    try:
        return float(x) if x not in ("", None) else None
    except ValueError:
        return None


def lire(nom, fonction):
    champs = fonction()  # [lat, lon, vitesse, cap, heure_source]
    ts = vers_ms(champs[4] if len(champs) > 4 else "") or int(time.time() * 1000)
    return [ts, float(champs[0]), float(champs[1]), flottant(champs[2]), flottant(champs[3])]


def ajouter(s):
    """Insère la position dans l'anneau, triée par heure et sans doublon (±2 s) : une position d'AVT, souvent en retard de ~30 s sur Shiptrail,
    n'est plus perdue quand la source de secours a déjà fourni une position plus récente."""
    with verrou:
        if any(abs(x[0] - s[0]) <= 2000 for x in anneau):
            return
        anneau.append(s)
        anneau.sort(key=lambda x: x[0])
        limite = time.time() * 1000 - FENETRE_S * 1000
        while anneau and anneau[0][0] < limite:
            anneau.pop(0)


def lire_avt():
    """AVT avec une seconde tentative (page parfois lente ou incomplète)."""
    try:
        return lire("avt", source_avt)
    except Exception:
        time.sleep(3)
        return lire("avt", source_avt)


def interroger():
    maintenant = time.time() * 1000
    for nom, f in (("avt", lire_avt), ("shiptrail", lambda: lire("shiptrail", source_shiptrail))):
        try:
            s = f()
            if nom == "avt" and maintenant - s[0] > RETARD_MAX * 1000:
                etat["avt"] = "en retard de %d s" % ((maintenant - s[0]) / 1000)
                continue
            if nom == "avt":
                etat["avt"] = "ok"
            ajouter(s)
            etat["source"], etat["erreur"] = nom, None
            return
        except Exception as e:
            etat["erreur"] = "%s: %s" % (nom, str(e)[:200])
            if nom == "avt":
                etat["avt"] = "échec : " + str(e)[:150]


def boucle():
    while True:
        try:
            interroger()
        except Exception as e:
            etat["erreur"] = str(e)[:200]
        time.sleep(PAS)


def charge_utile():
    with verrou:
        limite = time.time() * 1000 - FENETRE_S * 1000
        return {"maj": int(time.time() * 1000), "fenetre_min": FENETRE_S // 60, "n": len(anneau), "source": etat["source"],
                "samples": [x for x in anneau if x[0] >= limite]}


def publier(dernier):
    """Pousse positions.json dans le dépôt public, sans historique : dépôt neuf, un seul commit, push forcé."""
    cle = os.path.join(os.environ.get("CREDENTIALS_DIRECTORY", ""), "deploy_key")
    if not REPO or not os.path.exists(cle):
        return dernier
    d = charge_utile()
    if not d["samples"] or d["samples"][-1][0] == dernier:
        return dernier
    rep = os.path.join(RUN, "pub")
    shutil.rmtree(rep, ignore_errors=True)
    os.makedirs(rep)
    with open(os.path.join(rep, "positions.json"), "w") as f:
        json.dump(d, f, separators=(",", ":"))
    with open(os.path.join(rep, "README.md"), "w") as f:
        f.write("# lola-relais\n\nPositions AIS du bac Lola des %d dernières minutes (AISVesselTracker, repli Shiptrail), mises à jour toutes les 5 min.\n"
                "Un seul commit, jamais d'historique. Lu par la page bac-lola (HTML-tools).\n" % (FENETRE_S // 60))
    env = dict(os.environ, HOME=RUN, GIT_SSH_COMMAND="ssh -i %s -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=%s/known_hosts" % (cle, RUN))
    for cmd in (["git", "init", "-q", "-b", "main"], ["git", "add", "-A"],
                ["git", "-c", "user.name=lola-relais", "-c", "user.email=lola-relais@users.noreply.github.com", "commit", "-q", "-m", "positions"],
                ["git", "push", "-q", "-f", REPO, "main"]):
        subprocess.run(cmd, cwd=rep, env=env, check=True, capture_output=True, timeout=60)
    shutil.rmtree(rep, ignore_errors=True)
    return d["samples"][-1][0]


def boucle_publication():
    dernier = None
    while True:
        time.sleep(PUBLIER_S)
        try:
            dernier = publier(dernier)
            etat["publication"] = "ok %d" % int(time.time())
        except subprocess.CalledProcessError as e:
            etat["publication"] = "échec : " + (e.stderr or b"").decode("utf8", "replace")[-200:]
        except Exception as e:
            etat["publication"] = "échec : %s" % str(e)[:200]


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path.split("?")[0] not in ("/positions", "/positions.json", "/"):
            self.send_error(404); return
        corps = json.dumps(dict(charge_utile(), publication=etat.get("publication"), avt=etat.get("avt"), erreur=etat.get("erreur"))).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=boucle, daemon=True).start()
    threading.Thread(target=boucle_publication, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 18791), H).serve_forever()
