#!/usr/bin/env python3
"""Génère pour chaque application son manifest.json et ses icônes PNG, à partir du favicon de sa page.

Nom court : tuile .launcher de l'accueil. Nom : <title> de la page. Emoji et couleur : favicon de index.html.
Usage : python3 tools/gen_manifests.py   (dépendance : playwright + Chromium, police emoji couleur)
"""
import base64, html, json, pathlib, re, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
# nom de fichier : (taille, coins arrondis ?, taille de l'emoji sur 100)
ICONS = {"icon-192.png": (192, True, 60), "icon-512.png": (512, True, 60),
         "icon-maskable-512.png": (512, False, 48)}  # maskable : fond plein, emoji dans la zone sûre

DRAW = """([size, rounded, font, color, emoji]) => {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.scale(size / 100, size / 100);
  g.fillStyle = color; g.beginPath(); g.roundRect(0, 0, 100, 100, rounded ? 22 : 0); g.fill();
  g.font = font + 'px "Noto Color Emoji", sans-serif'; g.textAlign = 'center'; g.fillStyle = '#000';
  const m = g.measureText(emoji);  // centrage sur le dessin réel de l'emoji
  g.fillText(emoji, 50, 50 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  return c.toDataURL('image/png').split(',')[1];
}"""

home = (ROOT / "index.html").read_text(encoding="utf-8")
names = dict(re.findall(r'<a class="app" href="([^"/]+)/".*?<span>([^<]+)</span></a>', home))
apps = [ROOT] + sorted(p.parent for p in ROOT.glob("*/index.html"))

with sync_playwright() as pw:
    browser = pw.chromium.launch()
    page = browser.new_page()
    page.set_content("<p style='font-family:Noto Color Emoji'>🧰</p>")
    for app in apps:
        src = (app / "index.html").read_text(encoding="utf-8")
        svg = urllib.parse.unquote(re.search(r'rel="icon" href="data:image/svg\+xml,([^"]+)"', src).group(1))
        color = re.search(r"fill='(#[0-9a-fA-F]+)'", svg).group(1)
        emoji = re.search(r">([^<>]+)</text>", svg).group(1)
        (app / "icons").mkdir(exist_ok=True)
        for fname, (size, rounded, font) in ICONS.items():
            data = page.evaluate(DRAW, [size, rounded, font, color, emoji])
            (app / "icons" / fname).write_bytes(base64.b64decode(data))
        if app == ROOT:
            continue  # le manifeste de l'accueil est tenu à la main
        short = html.unescape(names[app.name])
        manifest = {
            "name": html.unescape(re.search(r"<title[^>]*>([^<]+)</title>", src).group(1)),
            "short_name": short, "start_url": "./", "scope": "./", "display": "standalone", "lang": "fr",
            "background_color": "#f3f4f6", "theme_color": color,
            "icons": [{"src": f"icons/{f}", "sizes": f"{s}x{s}", "type": "image/png",
                       "purpose": "any" if r else "maskable"} for f, (s, r, _) in ICONS.items()],
        }
        (app / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(app.name, emoji, color, short)
    browser.close()
