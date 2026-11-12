#!/usr/bin/env python3
"""Assemble src/template.html + src/core.js en un seul fichier autonome index.html."""
import pathlib
d = pathlib.Path(__file__).parent
html = (d / "src/template.html").read_text(encoding="utf-8").replace("/*__CORE__*/", (d / "src/core.js").read_text(encoding="utf-8"))
(d / "index.html").write_text(html, encoding="utf-8")
print("index.html :", len(html), "octets")
