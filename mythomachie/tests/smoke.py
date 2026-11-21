#!/usr/bin/env python3
"""Test de bout en bout (Chrome headless) : règles du dépôt, partie accélérée IA contre IA,
sélection, sauvegarde/chargement, téléchargement de la page.
Usage : python3 tests/smoke.py"""
import asyncio, os, pathlib, re
from playwright.async_api import async_playwright
here = pathlib.Path(__file__).resolve().parent
page = here.parent / "index.html"
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)

def check_rules(html):
    assert "HTML-tools/issues/new?title=%5Bmythomachie%5D" in html, "lien issues pré-rempli"
    assert len(re.findall(r'rel="icon"', html)) == 1, "une seule icône"
    assert 'download="mythomachie.html"' in html, "lien de téléchargement"
    assert html.count('id="fonctionnement"') == 1, "section Fonctionnement et sources"

async def main():
    check_rules(page.read_text(encoding="utf-8"))
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"]) if chrome else await p.chromium.launch()
        ctx = await b.new_context(accept_downloads=True, viewport={"width": 1280, "height": 800})
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(page.as_uri())
        await pg.click("#b-play")
        await pg.wait_for_timeout(500)
        # un clic sur un citoyen le sélectionne
        pos = await pg.evaluate("(() => { const u = MYTH.G.units.find(u => u.o === 0 && u.t === 'villager'); const s = w2s(u.x, u.y - 10); return [s.x, s.y, u.id]; })()")
        await pg.mouse.click(pos[0], pos[1])
        assert await pg.evaluate("MYTH.G.sel.slice()") == [pos[2]], "sélection au clic"
        # partie accélérée : l'IA joue aussi pour le joueur
        state = await pg.evaluate("""(() => { MYTH.autoplay(); MYTH.fast(480); const G = MYTH.G;
            return { t: G.time, units: G.units.length, bad: G.units.filter(u => !isFinite(u.x) || !isFinite(u.y) || !isFinite(u.hp)).length,
                     barracks: G.blds.filter(b => b.t === 'barracks').length, gathered: G.pl.map(p => p.stats.gathered) }; })()""")
        assert state["t"] > 400 or await pg.evaluate("MYTH.G.over"), state
        assert state["bad"] == 0 and state["units"] > 10 and state["barracks"] >= 1, state
        assert all(g > 1000 for g in state["gathered"]), state
        # sauvegarde puis rechargement
        r = await pg.evaluate("(() => { const n = MYTH.G.units.length; const s = saveGame(); const ok = loadGame(); return [s, ok, n, MYTH.G.units.length]; })()")
        assert r[0] and r[1] and r[2] == r[3], r
        await pg.evaluate("MYTH.fast(20)")
        # téléchargement : depuis une copie locale, la page s'enregistre elle-même
        await pg.evaluate("quitToMenu()")
        async with pg.expect_download() as d:
            await pg.click("#b-download")
        dl = await d.value
        out = here / "copie.html"
        await dl.save_as(str(out))
        txt = out.read_text(encoding="utf-8")
        assert dl.suggested_filename == "mythomachie.html" and len(txt) > 200000 and "<title" in txt, dl.suggested_filename
        check_rules(txt)
        out.unlink()
        assert not errs, errs
        await b.close()
    print("OK")

asyncio.run(main())
