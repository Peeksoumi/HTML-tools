#!/usr/bin/env python3
"""Batterie de tests de bout en bout (Playwright + Chrome) pilotée par tests/cases.json.
Usage : python3 tests/run_all.py [URL_OU_FICHIER_HTML]
Chaque cas : charge la carte, vérifie la détection automatique (couleur, barre d'échelle), pose le point de calage,
exporte le GPX et contrôle longueur, nombre de points et fermeture de la boucle."""
import asyncio, json, math, os, pathlib, re, sys
from playwright.async_api import async_playwright
here = pathlib.Path(__file__).resolve().parent
page_url = sys.argv[1] if len(sys.argv) > 1 else (here.parent / "index.html").as_uri()
if "://" not in page_url: page_url = pathlib.Path(page_url).resolve().as_uri()
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)

def hav(a, b):
    r = 6371008.8; t = math.pi / 180
    s = math.sin((b[0]-a[0])*t/2)**2 + math.cos(a[0]*t)*math.cos(b[0]*t)*math.sin((b[1]-a[1])*t/2)**2
    return 2*r*math.asin(math.sqrt(s))

async def run_case(b, c):
    f = here / c["file"]
    if c["file"].endswith("spitzmeilen.pdf") and os.environ.get("CARTE_SPITZ_PDF"): f = pathlib.Path(os.environ["CARTE_SPITZ_PDF"])
    if not f.exists():
        if c.get("optional"): print("  ignoré (fichier absent) :", c.get("note", "")); return True
        raise AssertionError(f"fichier manquant {f}")
    pg = await b.new_page(viewport={"width": 1300, "height": 850}); errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    await pg.goto(page_url)
    await pg.set_input_files("#file", str(f))
    await pg.wait_for_function("document.querySelector('#routeInfo').textContent.length>0", timeout=120000)
    e = c["expect"]
    route = await pg.inner_text("#routeInfo"); assert "Tracé" in route and "Aucun" not in route, route
    col = await pg.input_value("#color"); r, g, bl = (int(col[i:i+2], 16) for i in (1, 3, 5))
    hint = e.get("colorHint")
    if hint == "red": assert r > 180 and g < 90 and bl < 90, f"couleur auto inattendue {col}"
    if hint == "blue": assert bl > r + 60, f"couleur auto inattendue {col}"
    print("  couleur auto :", col)
    sc = await pg.inner_text("#scaleInfo")
    if e.get("scaleBarAuto"): assert "détectée automatiquement" in sc, sc
    if c.get("scaleKm"): await pg.fill("#scaleKm", c["scaleKm"])
    # point de calage
    W, H = map(int, re.findall(r"(\d+)×(\d+) px", await pg.inner_text("#loadInfo"))[-1])
    await pg.click("#modeBar button[data-m=cp]")
    x, y = c["calage"]["px"]
    pos = await pg.evaluate("""([x,y,W,H])=>{const r=document.getElementById('cv').getBoundingClientRect();
      const s=Math.min(r.width/W,r.height/H);return [r.left+(r.width-W*s)/2+x*s, r.top+(r.height-H*s)/2+y*s]}""", [x, y, W, H])
    await pg.mouse.click(*pos)
    await pg.fill("#cpCoord", c["calage"]["coord"]); await pg.click("#cpOk")
    if c["calage"].get("spacing"): await pg.select_option("#spacing", c["calage"]["spacing"])
    geo = await pg.inner_text("#geoInfo"); assert "calée" in geo, geo; print("  ", geo.splitlines()[0])
    async with pg.expect_download() as d: await pg.click("#dl")
    dl = await d.value; path = pathlib.Path("/tmp") / dl.suggested_filename; await dl.save_as(path)
    pts = [(float(a), float(b_)) for a, b_ in re.findall(r'<trkpt lat="([\d.\-]+)" lon="([\d.\-]+)"', path.read_text())]
    km = sum(hav(pts[i-1], pts[i]) for i in range(1, len(pts))) / 1000
    closed = hav(pts[0], pts[-1]) < 30
    print(f"   GPX : {len(pts)} points, {km:.1f} km, boucle fermée : {closed}")
    assert len(pts) >= e["minPoints"], "trop peu de points"
    assert e["km"][0] <= km <= e["km"][1], f"longueur {km:.1f} km hors de {e['km']}"
    assert closed == e["closed"], "fermeture de boucle inattendue"
    assert not errs, errs
    await pg.close(); return True

async def main():
    cases = json.loads((here / "cases.json").read_text()); ok = True
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"]) if chrome else await p.chromium.launch()
        for c in cases:
            print("•", c["name"])
            try: await run_case(b, c); print("  OK")
            except Exception as ex: ok = False; print("  ÉCHEC :", ex)
        await b.close()
    sys.exit(0 if ok else 1)
asyncio.run(main())
