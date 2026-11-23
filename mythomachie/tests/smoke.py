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
        # menu : ciel en image fixe (aucun canevas redessiné en continu derrière le menu)
        sky = await pg.evaluate("[getComputedStyle(document.getElementById('menu')).backgroundImage.startsWith('url(\"data:image/svg+xml'), !!document.getElementById('sky')]")
        assert sky == [True, False], ("ciel du menu", sky)
        await pg.click("#b-play")
        await pg.wait_for_timeout(500)
        # un clic sur un citoyen le sélectionne
        pos = await pg.evaluate("(() => { const u = MYTH.G.units.find(u => u.o === 0 && u.t === 'villager'); const s = w2s(u.x, u.y - 10); return [s.x, s.y, u.id]; })()")
        await pg.mouse.click(pos[0], pos[1])
        assert await pg.evaluate("MYTH.G.sel.slice()") == [pos[2]], "sélection au clic"
        # désélection : bouton ✕ du panneau de sélection
        await pg.click("#selp .desel")
        assert await pg.evaluate("MYTH.G.sel.length") == 0, "désélection par le bouton ✕"
        # bâtiment : un clic sur le toit de la cité la sélectionne, un citoyen posé devant sa façade ne la masque pas
        r = await pg.evaluate("""(() => { const G = MYTH.G, c = G.blds.find(b => b.o === 0 && b.t === 'city');
            let s = w2s(c.x, c.ty * T - BLD_H.city * 0.8); const roof = pick(s2w(s.x, s.y).x, s2w(s.x, s.y).y);
            const v = G.units.find(u => u.o === 0 && u.t === 'villager'); v.x = c.x + 20; v.y = (c.ty + c.size) * T + 4; v.nx = v.x; v.ny = v.y;
            const near = pick(v.x, v.y - U.villager.h * 0.45 - 14), body = pick(v.x, v.y - U.villager.h * 0.45);
            return [roof && roof.id, near && near.id, body && body.id, c.id, v.id]; })()""")
        assert r[0] == r[3] and r[1] == r[3] and r[2] == r[4], ("sélection des bâtiments", r)
        # âges : temple verrouillé, passage à l'Âge des Cités à la cité, puis temple débloqué
        await pg.evaluate("(() => { const v = MYTH.G.units.find(u => u.o === 0 && u.t === 'villager'); setSel([v.id]); })()")
        lock = await pg.evaluate("(() => { const b = document.querySelector('#cmdp [data-a=\"build:temple\"]'); return [b.classList.contains('lock'), b.querySelector('.ab') && b.querySelector('.ab').textContent, document.querySelector('#age-badge b').textContent]; })()")
        assert lock == [True, "II", "I"], ("temple verrouillé à l'âge I", lock)
        await pg.click('#cmdp [data-a="build:temple"]')
        assert await pg.evaluate("[...document.querySelectorAll('#toasts .toast')].some(t => t.textContent.includes('Âge des Cités'))"), "message : âge requis"
        cmds = await pg.evaluate("""(() => { const G = MYTH.G, c = G.blds.find(b => b.o === 0 && b.t === 'city'); setSel([c.id]);
            window.__res = Object.assign({}, G.pl[0].res); Object.assign(G.pl[0].res, { food: 3000, wood: 3000, gold: 3000 });
            return [...document.querySelectorAll('#cmdp .cmd')].map(b => b.dataset.a + (b.classList.contains('lock') ? '!' : '')); })()""")
        assert "res:age1" in cmds and "res:age2" not in cmds and "res:age2!" not in cmds and "res:walls!" in cmds and "res:tools2!" in cmds, cmds
        await pg.click('#cmdp [data-a="res:age1"]')
        await pg.evaluate("MYTH.fast(50)")
        aged = await pg.evaluate("""(() => { const G = MYTH.G; hudUpdate(); const v = G.units.find(u => u.o === 0 && u.t === 'villager'); setSel([v.id]);
            const t = document.querySelector('#cmdp [data-a="build:temple"]'); const c = G.blds.find(b => b.o === 0 && b.t === 'city'); setSel([c.id]);
            return [ageOf(G.pl[0]), document.querySelector('#age-badge b').textContent, t.classList.contains('lock'), !!document.querySelector('#cmdp [data-a="res:age2"]'), !!document.querySelector('#cmdp [data-a="res:walls"]:not(.lock)')]; })()""")
        assert aged == [1, "II", False, True, True], ("passage à l'Âge des Cités", aged)
        await pg.evaluate("Object.assign(MYTH.G.pl[0].res, window.__res)")  # la suite du test repart avec des ressources normales
        await pg.screenshot(path=str(here / "captures" / "ages-cite.png"))
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
