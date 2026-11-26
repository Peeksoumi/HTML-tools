#!/usr/bin/env python3
"""Assemble src/style.css + src/body.html + src/js/*.js en un seul fichier autonome index.html."""
import pathlib
d = pathlib.Path(__file__).parent
src = d / "src"
css = (src / "style.css").read_text(encoding="utf-8")
body = (src / "body.html").read_text(encoding="utf-8")
js = "\n".join(p.read_text(encoding="utf-8") for p in sorted((src / "js").glob("*.js")))
assert "</script" not in js.lower(), "balise </script> interdite dans le code"
# data-m : éléments repris tels quels par le bouton de téléchargement (copie intacte de la page)
html = f"""<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8" data-m="1">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no" data-m="1">
<meta name="theme-color" content="#0a0e24" data-m="1">
<meta name="description" content="Mythomachie : jeu de stratégie en temps réel mythologique, jouable hors ligne dans le navigateur." data-m="1">
<title data-m="1">Mythomachie</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%231e2766'/%3E%3Ctext x='50' y='70' font-size='60' text-anchor='middle'%3E⚡%3C/text%3E%3C/svg%3E" data-m="1">
<link rel="manifest" href="../manifest.json">
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(function(){{}});</script>
<style data-m="1">
{css}
</style>
</head>
<body>
{body}
<script data-m="1">
{js}
</script>
</body>
</html>
"""
(d / "index.html").write_text(html, encoding="utf-8")
print("index.html :", len(html.encode()), "octets")
