#!/usr/bin/env python3
"""Test de la recherche de lieu avec des services simulés (aucun accès réseau requis).
Cas : ville française trouvée par OpenStreetMap/Open-Meteo alors que swisstopo ne répond rien ou échoue ; tous les services en panne."""
import asyncio, json, os, pathlib, sys
from playwright.async_api import async_playwright
here = pathlib.Path(__file__).resolve().parent
url = (here.parent / "index.html").as_uri()
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)
CORS = {"access-control-allow-origin": "*", "content-type": "application/json"}
async def scenario(b, name, handler, expect):
    pg = await b.new_page(); await pg.route("**/*", handler)
    await pg.goto(url); await pg.set_input_files("#file", str(here / "examples/capture-mapbox.jpg"))
    await pg.wait_for_function("document.querySelector('#routeInfo').textContent.length>0", timeout=60000)
    await pg.click("#modeBar button[data-m=cp]"); await pg.mouse.click(400, 400)
    await pg.fill("#q", "Annecy"); await pg.click("#qBtn")
    await pg.wait_for_function("document.querySelector('#searchRes').textContent.trim() !== 'Recherche…'")
    txt = await pg.inner_text("#searchRes"); print(f"• {name} → {txt[:110]!r}")
    assert expect in txt, (name, txt)
    if "(" in txt and expect.startswith("Annecy"):
        await pg.click("#searchRes div >> nth=0"); v = await pg.input_value("#cpCoord"); print("  coordonnées :", v)
        assert v.startswith("45.8"), v
    await pg.close()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"]) if chrome else await p.chromium.launch()
        async def fr_ok(route):
            u = route.request.url
            if "nominatim" in u: return await route.fulfill(status=200, headers=CORS, body=json.dumps([{"display_name": "Annecy, Haute-Savoie, France", "lat": "45.8992", "lon": "6.1294"}]))
            if "open-meteo" in u: return await route.fulfill(status=200, headers=CORS, body=json.dumps({"results": [{"name": "Annecy", "admin1": "Auvergne-Rhône-Alpes", "country": "France", "latitude": 45.89923, "longitude": 6.12885}]}))
            if "geo.admin.ch" in u: return await route.fulfill(status=200, headers=CORS, body=json.dumps({"results": []}))
            return await route.continue_() if u.startswith("file") else await route.abort()
        await scenario(b, "ville française, swisstopo vide", fr_ok, "Annecy, Haute-Savoie, France")
        async def swiss_fails(route):
            u = route.request.url
            if "geo.admin.ch" in u: return await route.abort()
            return await fr_ok(route)
        await scenario(b, "ville française, swisstopo en panne", swiss_fails, "Annecy")
        async def all_down(route):
            return await route.continue_() if route.request.url.startswith("file") else await route.abort()
        await scenario(b, "tous les services en panne", all_down, "ne répondent pas")
        await b.close(); print("OK")
asyncio.run(main())
