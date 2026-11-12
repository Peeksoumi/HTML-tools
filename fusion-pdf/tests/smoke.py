#!/usr/bin/env python3
"""Test de bout en bout (Chrome headless) : charge 2 PDF (2 + 3 pages), réordonne, supprime une page, exporte,
puis vérifie le PDF produit (4 pages). Usage : python3 tests/make_pdfs.py && python3 tests/smoke.py"""
import asyncio, os, pathlib, sys
from playwright.async_api import async_playwright
here = pathlib.Path(__file__).resolve().parent
page_url = (here.parent / "index.html").as_uri()
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"]) if chrome else await p.chromium.launch()
        ctx = await b.new_context(accept_downloads=True)
        pg = await ctx.new_page()
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        await pg.goto(page_url)
        await pg.set_input_files("#file-input", [str(here / "A.pdf"), str(here / "B.pdf")])
        await pg.wait_for_function("document.querySelectorAll('.page-card').length===5", timeout=90000)
        assert await pg.locator("#export-btn").is_enabled()
        cards = pg.locator(".page-card")
        await cards.nth(0).drag_to(cards.nth(4), target_position={"x": 120, "y": 50})
        order = await pg.evaluate("[...document.querySelectorAll('.page-card')].map(c=>c.dataset.fileId+':'+c.dataset.pageNum)")
        print("ordre après drag :", order)
        await pg.locator(".page-card .delete-btn").nth(1).click()
        assert await pg.locator(".page-card").count() == 4
        await pg.fill("#filename-input", "test_fusion")
        async with pg.expect_download(timeout=240000) as dl:
            await pg.click("#export-btn")
        d = await dl.value
        assert d.suggested_filename == "test_fusion.pdf", d.suggested_filename
        out = here / "out.pdf"; await d.save_as(str(out))
        from pypdf import PdfReader
        r = PdfReader(str(out)); n = len(r.pages)
        print("pages exportées :", n, "| taille :", out.stat().st_size // 1024, "Ko")
        assert n == 4, n
        assert not errs, errs
        await b.close()
    print("OK")
asyncio.run(main())
