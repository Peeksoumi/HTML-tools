#!/usr/bin/env python3
"""parking_gratuit : serveur (bibliothèque standard) sur 127.0.0.1:8092.

  GET /                       la page
  GET /api/recherche?lat=&lon=&rayon=   parkings + rues fusionnés
  GET /api/geocode?q=         recherche d'une ville / adresse (Nominatim)
  GET /api/status             sources configurées

nginx le publie sous /parking/ (voir server/jobs/061_parking_gratuit.sh).
Essai local : python3 server.py  puis http://127.0.0.1:8092/
"""
import json
import os
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sources  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PARKING_PORT", "8092"))


class Handler(BaseHTTPRequestHandler):
    server_version = "parking-gratuit"

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        try:
            if u.path in ("/", "/index.html"):
                with open(os.path.join(HERE, "index.html"), "rb") as f:
                    body = f.read()
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif u.path == "/api/recherche":
                lat, lon = float(q["lat"][0]), float(q["lon"][0])
                if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                    return self._json(400, {"erreur": "coordonnées hors limites"})
                rayon = int(float(q.get("rayon", ["1000"])[0]))
                self._json(200, sources.rechercher(lat, lon, rayon))
            elif u.path == "/api/geocode":
                texte = (q.get("q", [""])[0]).strip()
                if len(texte) < 2:
                    return self._json(400, {"erreur": "recherche trop courte"})
                self._json(200, {"resultats": sources.geocoder(texte)})
            elif u.path == "/api/status":
                self._json(200, {"sources": [s["id"] for s in sources.charger_sources()]})
            else:
                self._json(404, {"erreur": "introuvable"})
        except (KeyError, ValueError):
            self._json(400, {"erreur": "paramètres invalides (lat, lon, rayon)"})
        except Exception as e:  # noqa: BLE001
            self._json(502, {"erreur": f"{type(e).__name__}: {e}"})

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))


def surveiller():
    """Se relance (systemd Restart=always / execv) quand un fichier du code change après un git pull."""
    import threading
    import time
    fichiers = [os.path.join(HERE, f) for f in ("server.py", "sources.py", "sources.json")]
    depart = [os.path.getmtime(f) for f in fichiers]

    def boucle():
        while True:
            time.sleep(10)
            try:
                if [os.path.getmtime(f) for f in fichiers] != depart:
                    os.execv(sys.executable, [sys.executable] + sys.argv)
            except OSError:
                pass
    threading.Thread(target=boucle, daemon=True).start()


if __name__ == "__main__":
    surveiller()
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
