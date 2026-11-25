#!/usr/bin/env python3
"""Test de bout en bout (Chrome headless) : demandes en français, annulation, image, IA simulée, exports PNG/ICO/SVG/ZIP.
Usage : python3 tests/smoke.py"""
import asyncio, base64, io, json, os, pathlib, struct, zipfile
from playwright.async_api import async_playwright
here = pathlib.Path(__file__).resolve().parent
page_url = (here.parent / "index.html").as_uri()
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"]) if chrome else await p.chromium.launch()
        ctx = await b.new_context(accept_downloads=True)
        await ctx.grant_permissions(["clipboard-read", "clipboard-write"])
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(page_url)
        async def ask(t):
            await pg.fill("#ask", t); await pg.click("#ask-go"); await pg.wait_for_timeout(150)
        val = lambda k: pg.eval_on_selector("#k-" + k, "e => e.type==='checkbox' ? e.checked : e.value")
        await ask('fond rouge, cercle, texte "AB" blanc, ajoute une ombre')
        assert await val("bgType") == "solid" and await val("c1") == "#ef4444"
        assert await val("shape") == "circle" and await val("text") == "AB" and await val("shadow") is True
        await pg.wait_for_timeout(100)
        px = await pg.evaluate("(()=>{const d=document.querySelector('#preview').getContext('2d').getImageData(256,70,1,1).data;return [...d]})()")
        corner = await pg.evaluate("document.querySelector('#preview').getContext('2d').getImageData(2,2,1,1).data[3]")
        assert px[0] > 200 and px[1] < 100 and px[3] == 255, px
        assert corner == 0, corner
        await ask("fond dégradé bleu marine vert clair, vertical")
        assert await val("bgType") == "gradient" and await val("c1") == "#1e3a8a" and await val("angle") == "180"
        await ask("annule")
        assert await val("bgType") == "solid"
        await ask("carré, texte fin serif, incline de 15°, bordure jaune")
        assert await val("radius") == "0" and await val("weight") == "300" and await val("rotate") == "15" and await val("borderColor") == "#facc15"
        await ask("blabla incompréhensible")
        assert "pas compris" in await pg.inner_text("#log")
        # image
        data = await pg.evaluate("(()=>{const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='#0f0';x.fillRect(0,0,300,200);return c.toDataURL()})()")
        f = here / "img.png"; f.write_bytes(base64.b64decode(data.split(",")[1]))
        await pg.set_input_files("#file-input", str(f))
        await pg.wait_for_selector("#remove-img:not([hidden])")
        await ask("transparent, agrandis")
        await pg.click("#remove-img"); assert await pg.is_hidden("#remove-img")
        # quelques mots -> icône, modification par demande, similaires
        for q, emo, col in [("relais colis", "📦", "#d97706"), ("parking gratuit", "🅿️", "#2563eb"), ("bac lola", "⛴️", "#0e7490"), ("ladder yaskawa", None, "#0f766e")]:
            await pg.fill("#words", q); await pg.click("#make-form button"); await pg.wait_for_timeout(150)
            assert await val("c1") == col and (emo is None or await val("text") == emo), (q, await val("text"), await val("c1"))
        await ask("plutôt un camion"); assert await val("text") == "🚚" and await val("c1") == "#0f766e"
        await pg.click("#similar"); assert await pg.locator("#tiles button").count() >= 12
        await pg.locator("#tiles button").nth(2).click(); assert await val("text") != "🚚"
        await ask("annule"); assert await val("text") == "🚚"
        # IA simulée
        await pg.route("https://api.anthropic.com/**", lambda r: r.fulfill(status=200, content_type="application/json",
            body=json.dumps({"content": [{"type": "text", "text": '{"message":"Fait","text":"☀️","c1":"#00ff00","bgType":"solid","shape":"nimporte"}'}]})))
        await pg.evaluate("document.querySelectorAll('details').forEach(d=>d.open=true)"); await pg.check("#ai-on"); await pg.fill("#api-key", "sk-test")
        await ask("une icône pour une appli météo")
        assert await val("text") == "☀️" and await val("c1") == "#00ff00" and await val("shape") == "rounded"
        # exports
        async def dl(sel):
            async with pg.expect_download() as d: await pg.click(sel)
            dd = await d.value; path = here / ("out_" + dd.suggested_filename); await dd.save_as(str(path)); return dd.suggested_filename, path.read_bytes()
        n, d = await dl("#dl-png"); assert n == "icon-512.png" and d[:8] == b"\x89PNG\r\n\x1a\n" and struct.unpack(">II", d[16:24]) == (512, 512)
        n, d = await dl("#dl-ico"); assert n == "favicon.ico" and d[:6] == b"\0\0\1\0\6\0"
        n, d = await dl("#dl-svg"); assert n == "icon.svg" and d.startswith(b"<svg") and b"\xe2\x98\x80" in d
        n, d = await dl("#dl-zip"); z = zipfile.ZipFile(io.BytesIO(d)); assert z.testzip() is None
        assert {"icon-512.png", "favicon.ico", "icon.svg"} <= set(z.namelist()), z.namelist()
        await pg.click("#copy-tag")
        clip = await pg.evaluate("navigator.clipboard.readText()"); assert clip.startswith('<link rel="icon" href="data:image/svg+xml,'), clip[:60]
        assert not errs, errs
        for f in here.glob("out_*"): f.unlink()
        (here / "img.png").unlink()
        await b.close()
    print("OK")
asyncio.run(main())
