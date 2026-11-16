#!/usr/bin/env python3
"""Assemble index.html (page autonome) : constantes + moteur de calcul inlinés dans src/template.html."""
from pathlib import Path

ici = Path(__file__).parent
src = ici / "src"
core = (src / "stations-data.js").read_text(encoding="utf8") + "\n" + (src / "core.js").read_text(encoding="utf8")
page = (src / "template.html").read_text(encoding="utf8").replace("/*CORE*/", core)
(ici / "index.html").write_text(page, encoding="utf8")
print("index.html :", len(page), "octets")
