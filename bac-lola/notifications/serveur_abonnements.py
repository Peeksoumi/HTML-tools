#!/usr/bin/env python3
"""Garde la liste des abonnés aux alertes (Web Push). N'envoie aucune notification : GitHub Actions s'en charge.

Écoute sur 127.0.0.1 derrière nginx (HTTPS). Variables d'environnement :
  ABO_CLE_PUBLIQUE  clé publique VAPID (donnée aux pages)
  ABO_JETON         mot de passe long exigé pour lire la liste
  ABO_FICHIER       fichier JSON de la liste (défaut : abonnements.json)
  ABO_PORT          défaut : 18795
"""
import hmac, json, os, pathlib, re, threading, time, urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

BASE = "/abonnements/bac-lola"
ORIGINES = {"https://peeksoumi.github.io", "https://peeksoumi.com"}
SERVICES = ("fcm.googleapis.com", ".push.services.mozilla.com", "web.push.apple.com", ".notify.windows.com")
MAX_ABONNES, MAX_PAR_HEURE, MAX_CORPS = 500, 10, 4096
B64 = re.compile(r"^[A-Za-z0-9_-]{16,200}={0,2}$")


def adresse_valide(url):
    if not isinstance(url, str) or len(url) > 1000 or not re.fullmatch(r"[!-~]+", url) or "\\" in url:
        return False
    try:
        u = urllib.parse.urlsplit(url)
        hote, port = u.hostname or "", u.port
    except ValueError:
        return False
    return (u.scheme == "https" and port in (None, 443) and "@" not in u.netloc
            and any(hote.endswith(s) if s.startswith(".") else hote == s for s in SERVICES))


class Liste:
    def __init__(self, fichier):
        self.fichier = pathlib.Path(fichier)
        self.verrou = threading.Lock()
        self.abonnes = json.loads(self.fichier.read_text()) if self.fichier.exists() else {}

    def _ecrire(self):
        tmp = self.fichier.with_suffix(".tmp")
        with open(os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600), "w") as f:
            json.dump(self.abonnes, f)
        tmp.replace(self.fichier)

    def ajouter(self, abo):
        with self.verrou:
            if abo["endpoint"] not in self.abonnes and len(self.abonnes) >= MAX_ABONNES:
                return False
            self.abonnes[abo["endpoint"]] = abo
            self._ecrire()
            return True

    def retirer(self, adresse):
        with self.verrou:
            if self.abonnes.pop(adresse, None) is not None:
                self._ecrire()

    def tous(self):
        with self.verrou:
            return list(self.abonnes.values())


def creer_serveur(port, fichier, cle, jeton):
    if len(jeton) < 24 or not cle:
        raise SystemExit("ABO_CLE_PUBLIQUE et ABO_JETON (24 caractères au moins) sont obligatoires")
    liste, essais, verrou_essais = Liste(fichier), {}, threading.Lock()

    def trop_d_inscriptions(ip):
        with verrou_essais:
            limite = time.time() - 3600
            for k in [k for k, v in essais.items() if v[-1] < limite]:
                del essais[k]
            recents = [t for t in essais.get(ip, []) if t >= limite]
            essais[ip] = (recents + [time.time()])[-MAX_PAR_HEURE - 1:]
            return len(recents) >= MAX_PAR_HEURE

    class Requete(BaseHTTPRequestHandler):
        timeout = 10

        def repondre(self, code, corps=None):
            data = b"" if corps is None else json.dumps(corps).encode()
            self.send_response(code)
            origine = self.headers.get("Origin")
            # La liste n'est jamais ouverte aux pages web : seuls /cle et l'inscription le sont.
            if origine in ORIGINES and self.path != BASE + "/liste":
                self.send_header("Access-Control-Allow-Origin", origine)
                self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE")
                self.send_header("Access-Control-Allow-Headers", "Content-Type")
                self.send_header("Vary", "Origin")
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def corps(self):
            try:
                n = int(self.headers.get("Content-Length", ""))
                if not 0 < n <= MAX_CORPS:
                    return None
                d = json.loads(self.rfile.read(n))
                return d if isinstance(d, dict) else None
            except ValueError:
                return None

        def do_OPTIONS(self):
            self.repondre(204)

        def do_GET(self):
            if self.path == BASE + "/cle":
                return self.repondre(200, {"cle": cle})
            if self.path == BASE + "/liste":
                recu = self.headers.get("Authorization", "").encode()
                if not hmac.compare_digest(recu, ("Bearer " + jeton).encode()):
                    return self.repondre(401)
                return self.repondre(200, liste.tous())
            self.repondre(404)

        def do_POST(self):
            if self.path != BASE:
                return self.repondre(404)
            if trop_d_inscriptions(self.headers.get("X-Real-IP", self.client_address[0])):
                return self.repondre(429)
            d = self.corps()
            cles = d.get("keys") if d else None
            if not (d and adresse_valide(d.get("endpoint")) and isinstance(cles, dict)
                    and all(isinstance(cles.get(k), str) and B64.match(cles[k]) for k in ("p256dh", "auth"))):
                return self.repondre(400)
            abo = {"endpoint": d["endpoint"], "keys": {k: cles[k] for k in ("p256dh", "auth")}}
            self.repondre(201 if liste.ajouter(abo) else 503)

        def do_DELETE(self):
            # Connaître l'adresse d'un abonnement (secrète) suffit pour le supprimer.
            d = self.corps() if self.path == BASE else None
            if not d or not isinstance(d.get("endpoint"), str):
                return self.repondre(400)
            liste.retirer(d["endpoint"])
            self.repondre(204)

        def log_message(self, *args):
            pass

    return ThreadingHTTPServer(("127.0.0.1", port), Requete)


if __name__ == "__main__":
    creer_serveur(int(os.environ.get("ABO_PORT", "18795")), os.environ.get("ABO_FICHIER", "abonnements.json"),
                  os.environ.get("ABO_CLE_PUBLIQUE", ""), os.environ.get("ABO_JETON", "")).serve_forever()
