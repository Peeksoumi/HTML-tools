#!/usr/bin/env python3
"""Relais sans mémoire pour la page bac-lola : les positions AIS de Lola de la dernière heure, tenues en mémoire vive.

- Aucune base de données ni fichier de relevés : une fenêtre glissante de 60 min en RAM, perdue au redémarrage.
- Dès qu'une nouvelle position diffère de la dernière publiée, il publie cette fenêtre (positions.json) dans un dépôt GitHub public, en écrasant tout
  (un seul commit, aucun historique git), au plus toutes les 15 s (GitHub recommande ≤ 6 pushes/min/dépôt) : la page bac-lola y relit les positions pour se resynchroniser.
  Variables : LOLA_RELAIS_REPO (ex. git@github.com:Peeksoumi/lola-relais.git) et la clé de dépôt `deploy_key` (systemd LoadCredential).
- Ne lit JAMAIS les relevés enregistrés (releves_*.csv) : ceux-ci ne servent qu'à entraîner le modèle.
- Source principale : aisstream.io (websocket tenu ouvert, clé = identifiant systemd `aisstream_key`, jamais dans le dépôt).
  Secours, interrogés seulement si aisstream n'a rien donné depuis 4 min : AISVesselTracker puis Shiptrail.
- GET /positions -> {"maj": ms, "fenetre_min": 60, "n": N, "source": "aisstream|avt|shiptrail", "samples": [[ts_ms, lat, lon, vitesse|null, cap|null], ...]}
  (ts = heure de la position côté source ; les en-têtes CORS sont ajoutés par nginx.)
- GET /aisstream -> même format, mais uniquement les positions reçues d'aisstream (page lola-position).
Écoute sur 127.0.0.1:18791 ; nginx le publie sous /lola-direct/ (flux « direct » lu par la page, avec CORS).
Autonome : aucune dépendance au dépôt privé (déployé sur le VPS depuis ce dépôt public).
"""
import base64, hashlib, json, os, select, shutil, socket, ssl, struct, subprocess, threading, time
from urllib.parse import urlparse
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
FENETRE_S = 60 * 60   # on ne conserve jamais plus d'une heure de positions
PUBLIER_MIN_S = 15    # s minimum entre deux publications GitHub (≤ 4/min, sous les 6 pushes/min recommandés)
AIS_FRAIS_S = 240     # s : tant qu'aisstream a donné une position plus récente, on n'interroge pas les sources de secours
AIS_URL = os.environ.get("AISSTREAM_URL", "wss://stream.aisstream.io/v0/stream")
RUN = os.environ.get("RUNTIME_DIRECTORY", "/run/lola-relais")  # tmpfs : en RAM
REPO = os.environ.get("LOLA_RELAIS_REPO", "")
anneau = []
anneau_ais = []     # uniquement les positions d'aisstream (endpoint /aisstream)
nouveau = threading.Event()   # posé quand une position inédite entre dans `anneau`
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


def ajouter(s, ring=None):
    """Insère la position dans l'anneau, triée par heure et sans doublon (±2 s) : une position d'AVT, souvent en retard de ~30 s sur Shiptrail,
    n'est plus perdue quand la source de secours a déjà fourni une position plus récente."""
    ring = anneau if ring is None else ring
    with verrou:
        if any(abs(x[0] - s[0]) <= 2000 for x in ring):
            return
        ring.append(s)
        ring.sort(key=lambda x: x[0])
        limite = time.time() * 1000 - FENETRE_S * 1000
        while ring and ring[0][0] < limite:
            ring.pop(0)
    if ring is anneau:
        nouveau.set()


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
            if time.time() - etat.get("ais_dernier", 0) > AIS_FRAIS_S:
                interroger()
        except Exception as e:
            etat["erreur"] = str(e)[:200]
        time.sleep(PAS)


def charge_utile(ring=None, source=None):
    ring = anneau if ring is None else ring
    with verrou:
        limite = time.time() * 1000 - FENETRE_S * 1000
        return {"maj": int(time.time() * 1000), "fenetre_min": FENETRE_S // 60, "n": len(ring), "source": source or etat["source"],
                "samples": [x for x in ring if x[0] >= limite]}


def publier(dernier):
    """Pousse positions.json dans le dépôt public, sans historique : dépôt neuf, un seul commit, push forcé."""
    cle = os.path.join(os.environ.get("CREDENTIALS_DIRECTORY", ""), "deploy_key")
    if not REPO or not os.path.exists(cle):
        return dernier
    d = charge_utile()
    if not d["samples"] or tuple(d["samples"][-1][1:3]) == dernier:   # on ne publie que si la position a changé
        return dernier
    rep = os.path.join(RUN, "pub")
    shutil.rmtree(rep, ignore_errors=True)
    os.makedirs(rep)
    with open(os.path.join(rep, "positions.json"), "w") as f:
        json.dump(d, f, separators=(",", ":"))
    with open(os.path.join(rep, "README.md"), "w") as f:
        f.write("# lola-relais\n\nPositions AIS du bac Lola des %d dernières minutes (aisstream.io, repli AISVesselTracker puis Shiptrail), mises à jour à chaque changement de position (au plus toutes les %d s).\n"
                "Un seul commit, jamais d'historique. Lu par la page bac-lola (HTML-tools).\n" % (FENETRE_S // 60, PUBLIER_MIN_S))
    env = dict(os.environ, HOME=RUN, GIT_SSH_COMMAND="ssh -i %s -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=%s/known_hosts" % (cle, RUN))
    for cmd in (["git", "init", "-q", "-b", "main"], ["git", "add", "-A"],
                ["git", "-c", "user.name=lola-relais", "-c", "user.email=lola-relais@users.noreply.github.com", "commit", "-q", "-m", "positions"],
                ["git", "push", "-q", "-f", REPO, "main"]):
        subprocess.run(cmd, cwd=rep, env=env, check=True, capture_output=True, timeout=60)
    shutil.rmtree(rep, ignore_errors=True)
    return tuple(d["samples"][-1][1:3])


# --- aisstream.io : websocket tenu ouvert (client minimal RFC 6455, sans dépendance) -----------
GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"


class WS:
    """Client websocket minimal : trames texte, trames client masquées, ping/pong, fragmentation."""

    def __init__(self, url, timeout=30):
        u = urlparse(url)
        tls = u.scheme == "wss"
        s = socket.create_connection((u.hostname, u.port or (443 if tls else 80)), timeout=10)
        if tls:
            s = ssl.create_default_context().wrap_socket(s, server_hostname=u.hostname)
        s.settimeout(timeout)
        self.s, self.buf = s, b""
        cle = base64.b64encode(os.urandom(16)).decode()
        chemin = (u.path or "/") + ("?" + u.query if u.query else "")
        s.sendall(("GET %s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                   "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (chemin, u.netloc, cle)).encode())
        while b"\r\n\r\n" not in self.buf:
            self.buf += self._lire()
        tete, self.buf = self.buf.split(b"\r\n\r\n", 1)
        tete = tete.decode("latin-1")
        attendu = base64.b64encode(hashlib.sha1((cle + GUID).encode()).digest()).decode()
        if " 101" not in tete.split("\r\n")[0] or attendu not in tete:
            raise ConnectionError("poignée de main refusée : " + tete[:120].replace("\r\n", " | "))
        self.dernier_rx = time.time()

    def _lire(self):
        d = self.s.recv(65536)
        if not d:
            raise ConnectionError("connexion fermée par le serveur")
        return d

    def _exact(self, n):
        while len(self.buf) < n:
            self.buf += self._lire()
        sortie, self.buf = self.buf[:n], self.buf[n:]
        return sortie

    def attendre(self, t):
        """True si des octets sont disponibles (évite un délai d'attente au milieu d'une trame)."""
        if self.buf or (hasattr(self.s, "pending") and self.s.pending()):
            return True
        return bool(select.select([self.s], [], [], t)[0])

    def envoyer(self, op, data=b""):
        n = len(data)
        tete = bytes([0x80 | op]) + (bytes([0x80 | n]) if n < 126 else bytes([0x80 | 126]) + struct.pack(">H", n) if n < 65536
                                     else bytes([0x80 | 127]) + struct.pack(">Q", n))
        masque = os.urandom(4)
        self.s.sendall(tete + masque + bytes(b ^ masque[i % 4] for i, b in enumerate(data)))

    def recevoir(self):
        """Prochain message texte complet (les pings reçoivent un pong, les pongs sont ignorés)."""
        msg = b""
        while True:
            b0, b1 = self._exact(2)
            n = b1 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._exact(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._exact(8))[0]
            masque = self._exact(4) if b1 & 0x80 else None
            data = self._exact(n)
            if masque:
                data = bytes(b ^ masque[i % 4] for i, b in enumerate(data))
            self.dernier_rx = time.time()
            op = b0 & 0x0F
            if op == 8:
                raise ConnectionError("fermeture demandée par le serveur")
            if op == 9:
                self.envoyer(10, data)
            elif op != 10:
                msg += data
                if b0 & 0x80:
                    return msg.decode("utf-8", "replace")

    def fermer(self):
        try:
            self.s.close()
        except OSError:
            pass


def releve_aisstream(msg):
    """Message aisstream (texte JSON) -> [ts_ms, lat, lon, vitesse|None, cap|None] pour Lola, sinon None ; ValueError si aisstream signale une erreur."""
    d = json.loads(msg)
    if d.get("error"):
        raise ValueError("aisstream : %s" % d["error"])
    type_ = d.get("MessageType")
    if type_ not in ("PositionReport", "StandardClassBPositionReport"):
        return None
    m = (d.get("Message") or {}).get(type_) or {}
    meta = d.get("MetaData") or {}
    if str(m.get("UserID") or meta.get("MMSI") or "") != str(MMSI):
        return None
    lat, lon = flottant(m.get("Latitude")), flottant(m.get("Longitude"))
    if lat is None or lon is None or abs(lat) > 90 or abs(lon) > 180:   # 91 / 181 = « non disponible »
        return None
    vit, cap = flottant(m.get("Sog")), flottant(m.get("Cog"))
    if vit is not None and vit >= 102.3:
        vit = None
    if cap is not None and cap >= 360:
        cap = None
    t = re.match(r"(\d{4}-\d\d-\d\d)[ T](\d\d:\d\d:\d\d)(\.\d+)?", meta.get("time_utc") or "")
    ts = vers_ms("%sT%s%s" % (t.group(1), t.group(2), (t.group(3) or "")[:4])) if t else None
    return [ts or int(time.time() * 1000), lat, lon, vit, cap]


def boucle_aisstream():
    """Garde la connexion ouverte (reconnexion avec attente croissante) ; sans clé, ne fait rien."""
    try:
        with open(os.path.join(os.environ.get("CREDENTIALS_DIRECTORY", ""), "aisstream_key")) as f:
            cle = f.read().strip()
    except OSError:
        etat["ais"] = "désactivé : identifiant systemd aisstream_key absent"
        return
    attente = 5
    while True:
        ws = None
        try:
            ws = WS(AIS_URL)
            ws.envoyer(1, json.dumps({"APIKey": cle, "BoundingBoxes": [[[46.9, -2.5], [47.4, -1.4]]],
                                      "FiltersShipMMSI": [str(MMSI)],
                                      "FilterMessageTypes": ["PositionReport", "StandardClassBPositionReport"]}).encode())
            etat["ais"] = "connecté, en attente d'une position"
            while True:
                if not ws.attendre(45):
                    ws.envoyer(9)   # ping : le silence est normal à quai (une position toutes les ~3 min)
                    if time.time() - ws.dernier_rx > 180:
                        raise TimeoutError("aucune réponse (pas même un pong) depuis 3 min")
                    continue
                s = releve_aisstream(ws.recevoir())
                if s:
                    etat["ais_dernier"], etat["source"], etat["ais"] = time.time(), "aisstream", "ok"
                    ajouter(s, anneau_ais)
                    ajouter(s)
                    attente = 5
        except Exception as e:
            etat["ais"] = "échec : %s" % str(e)[:150]
        finally:
            if ws:
                ws.fermer()
        time.sleep(attente)
        attente = min(attente * 2, 120)


def boucle_publication():
    dernier, dernier_t = None, 0
    while True:
        nouveau.wait()
        attente = PUBLIER_MIN_S - (time.time() - dernier_t)
        if attente > 0:
            time.sleep(attente)     # les positions qui arrivent pendant l'attente partent dans la même publication
        nouveau.clear()
        dernier_t = time.time()
        try:
            dernier = publier(dernier)
            etat["publication"] = "ok %d" % int(time.time())
        except subprocess.CalledProcessError as e:
            etat["publication"] = "échec : " + (e.stderr or b"").decode("utf8", "replace")[-200:]
        except Exception as e:
            etat["publication"] = "échec : %s" % str(e)[:200]


class H(BaseHTTPRequestHandler):
    def do_GET(self):
        chemin = self.path.split("?")[0]
        if chemin == "/aisstream":
            d = dict(charge_utile(anneau_ais, "aisstream"), ais=etat.get("ais"))
        elif chemin in ("/positions", "/positions.json", "/"):
            d = dict(charge_utile(), publication=etat.get("publication"), ais=etat.get("ais"), avt=etat.get("avt"), erreur=etat.get("erreur"))
        else:
            self.send_error(404); return
        corps = json.dumps(d).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(corps)))
        self.end_headers()
        self.wfile.write(corps)

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    threading.Thread(target=boucle_aisstream, daemon=True).start()
    threading.Thread(target=boucle, daemon=True).start()
    threading.Thread(target=boucle_publication, daemon=True).start()
    ThreadingHTTPServer(("127.0.0.1", 18791), H).serve_forever()
