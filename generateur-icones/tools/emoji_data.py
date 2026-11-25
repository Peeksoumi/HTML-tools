#!/usr/bin/env python3
"""Réinjecte dans index.html le dictionnaire d'emojis français (Unicode CLDR).
Usage : python3 -I tools/emoji_data.py chemin/vers/annotations/fr/annotations.json
Source : https://github.com/unicode-org/cldr-json (cldr-annotations-full), licence Unicode v3."""
import json, pathlib, re, sys
src = json.load(open(sys.argv[1], encoding="utf-8"))["annotations"]["annotations"]
lines = []
for e, a in src.items():
    c = ord(e[0])
    if not (c >= 0x1F000 or 0x2300 <= c <= 0x2BFF) or 0x1F3FB <= c <= 0x1F3FF:
        continue                      # ponctuation, symboles typographiques, teintes de peau
    if 0x2300 <= c <= 0x2BFF and not re.match(r"[⌚⌛⌨⏏-⏺Ⓜ▪-◾☀-➿⤴⤵⬅-⭕]", e[0]):
        continue
    name = a.get("tts", [""])[0]
    kws = [k for k in a.get("default", []) if k != name]
    line = "\t".join([e, name, ",".join(kws)])
    assert "`" not in line and "${" not in line and "\\" not in line and "</" not in line
    lines.append(line)
page = pathlib.Path(__file__).resolve().parent.parent / "index.html"
html = page.read_text(encoding="utf-8")
block = "<script id=\"emoji-data\">\n/* Unicode CLDR, annotations françaises. © Unicode, Inc. Licence Unicode v3 : https://www.unicode.org/license.txt */\nconst EMOJI_DATA = `" + "\n".join(lines) + "`;\n</script>\n"
if 'id="emoji-data"' in html:
    html = re.sub(r'<script id="emoji-data">.*?</script>\n', lambda m: block, html, flags=re.S)
else:
    html = html.replace("<script>\n'use strict';", block + "<script>\n'use strict';", 1)
page.write_text(html, encoding="utf-8")
print(len(lines), "emojis", len(block.encode()), "octets")
