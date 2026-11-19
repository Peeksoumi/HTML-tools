#!/usr/bin/env python3
"""Réinjecte dans index.html le moteur de courant (courant-loire/src + src/courant-wrapper.js), entre les repères COURANT-DEBUT / COURANT-FIN.
Le moteur est enveloppé dans une fonction : ses noms (MIN, HOUR, nearest…) ne se mélangent pas à ceux de la page."""
from pathlib import Path
import re

ici = Path(__file__).parent
cl = ici.parent / "courant-loire" / "src"
bloc = ("/*COURANT-DEBUT (généré par inject_courant.py : ne pas modifier ici)*/\nconst COURANT=(function(){\n"
        + (cl / "stations-data.js").read_text(encoding="utf8") + "\n" + (cl / "core.js").read_text(encoding="utf8") + "\n"
        + (ici / "src" / "courant-wrapper.js").read_text(encoding="utf8") + "})();\n/*COURANT-FIN*/")
page = (ici / "index.html").read_text(encoding="utf8")
nouveau, n = re.subn(r"/\*COURANT-DEBUT.*?/\*COURANT-FIN\*/", lambda _: bloc, page, flags=re.S)
if n != 1:
    raise SystemExit("repères COURANT-DEBUT / COURANT-FIN introuvables dans index.html")
(ici / "index.html").write_text(nouveau, encoding="utf8")
print("index.html :", len(nouveau), "octets")
