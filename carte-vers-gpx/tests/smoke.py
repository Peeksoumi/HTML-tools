#!/usr/bin/env python3
"""Test de bout en bout dans Chrome headless.
Usage : python3 tests/smoke.py CARTE.pdf|.jpg [URL_OU_FICHIER_HTML]
Vérifie : chargement, détection du tracé, calage (1 point + grille LV95), coupure en étapes, export GPX.
Le point de calage est cherché automatiquement : Spitzmeilen (47.024028, 9.236390) à la position pixel donnée
par SPITZ_PX (x,y) ; à adapter si on teste une autre carte."""
import asyncio, os, sys, pathlib
from playwright.async_api import async_playwright
src = sys.argv[1]
page_url = sys.argv[2] if len(sys.argv) > 2 else (pathlib.Path(__file__).resolve().parent.parent / "index.html").as_uri()
if "://" not in page_url: page_url = pathlib.Path(page_url).resolve().as_uri()
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)
spx = tuple(int(v) for v in os.environ.get("SPITZ_PX", "2678,2910").split(","))
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"])
        pg = await b.new_page(viewport={"width": 1300, "height": 850})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(page_url)
        await pg.set_input_files("#file", src)
        await pg.wait_for_function("document.querySelector('#routeInfo').textContent.length>0", timeout=90000)
        route = await pg.inner_text("#routeInfo"); print(route); assert "Tracé" in route and "Aucun" not in route
        await pg.click("#modeBar button[data-m=cp]")
        dims = await pg.evaluate("document.getElementById('loadInfo').textContent")
        import re; W, H = map(int, re.findall(r"(\d+)×(\d+) px", dims)[-1])
        pos = await pg.evaluate("""([x,y,W,H])=>{const r=document.getElementById('cv').getBoundingClientRect();
          const s=Math.min(r.width/W,r.height/H);return [r.left+(r.width-W*s)/2+x*s, r.top+(r.height-H*s)/2+y*s]}""", [*spx, W, H])
        await pg.mouse.click(*pos)
        await pg.fill("#cpCoord", "47.024028, 9.236390"); await pg.click("#cpOk")
        await pg.select_option("#spacing", "5000")
        geo = await pg.inner_text("#geoInfo"); print(geo); assert "calée" in geo
        out = await pg.inner_text("#outInfo"); print(out)
        async with pg.expect_download() as d: await pg.click("#dl")
        dl = await d.value; path = pathlib.Path("/tmp") / dl.suggested_filename; await dl.save_as(path)
        gpx = path.read_text(); n = gpx.count("<trkpt"); print("GPX :", path, n, "points")
        assert n > 50 and "<gpx" in gpx
        assert not errs, errs
        await b.close(); print("OK")
asyncio.run(main())
