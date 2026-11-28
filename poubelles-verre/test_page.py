#!/usr/bin/env python3
"""Test de la page dans Chromium, avec des réponses simulées pour tous les services externes."""
import json, pathlib
from playwright.sync_api import sync_playwright

PAGE = pathlib.Path(__file__).with_name("index.html").resolve().as_uri()
REPONSES = {
    "nominatim": [{"lat": "47.2184", "lon": "-1.5536"}],
    "geo.api.gouv.fr": [{"nom": "Nantes", "code": "44109", "epci": {"code": "244400404", "nom": "Nantes Métropole"}}],
    "interpreter": {"elements": [
        {"type": "node", "id": 2, "lat": 47.23, "lon": -1.55, "tags": {"name": "=HYPERLINK(1)", "recycling:glass_bottles": "yes"}},
        {"type": "node", "id": 3, "lat": 47.22, "lon": -1.55, "tags": {"amenity": "waste_disposal", "waste": "organic"}},
        {"type": "way", "id": 1, "center": {"lat": 47.2185, "lon": -1.5536}, "tags": {"location": "underground", "recycling:glass": "yes", "recycling:food_waste": "yes", "name": "<img src=x onerror=alert(1)>"}}]},
}
MAIRIE = {"pivot": json.dumps([{"type_service_local": "mairie"}]), "site_internet": json.dumps([{"valeur": "https://mairie.example"}])}
EPCI = {"site_internet": json.dumps([{"valeur": "https://metropole.example"}])}


def lancer(annuaire_ok=True, overpass_ok=True):
    def route(r):
        u = r.request.url
        if u.startswith("file:"):
            return r.continue_()
        if "lannuaire" in u and annuaire_ok:
            return r.fulfill(json={"results": [EPCI if "siren" in u else MAIRIE]}, headers={"access-control-allow-origin": "*"})
        for cle, corps in REPONSES.items():
            if cle in u and (cle != "interpreter" or overpass_ok):
                return r.fulfill(json=corps, headers={"access-control-allow-origin": "*"})
        return r.abort()

    with sync_playwright() as pw:
        nav = pw.chromium.launch()
        page = nav.new_page(viewport={"width": 380, "height": 800}, accept_downloads=True)
        erreurs, alertes = [], []
        page.on("pageerror", lambda e: erreurs.append(str(e)))
        page.on("dialog", lambda d: (alertes.append(d.message), d.dismiss()))
        page.route("**/*", route)
        page.goto(PAGE)
        page.fill("#q", "Nantes")
        page.click("button[type=submit]")
        if overpass_ok:
            page.wait_for_selector("#liste li")
            assert "3 point(s)" in page.inner_text("#titre")
            assert page.inner_text("#nVerre") == "2" and page.inner_text("#nAlim") == "2"
            page.uncheck("#fVerre")                                          # alimentaire seul
            assert page.locator("#liste li").count() == 2
            assert "=HYPERLINK" not in page.inner_text("#liste")
            page.uncheck("#fAlim")
            assert page.locator("#liste li").count() == 0 and page.locator("#csv").is_hidden()
            page.check("#fVerre")
            assert page.locator("#liste li").count() == 2
            page.check("#fAlim")
            assert "enterré" in page.locator("#liste li").first.inner_text()  # le plus proche d'abord
            assert page.locator("#liste img").count() == 0                   # texte OSM échappé
            with page.expect_download() as d:
                page.click("#csv")
            assert "\"'=HYPERLINK(1)\"" in pathlib.Path(d.value.path()).read_text(encoding="utf-8-sig")
            with page.expect_download() as d:
                page.click("#geojson")
            assert len(json.loads(pathlib.Path(d.value.path()).read_text())["features"]) == 3
        else:
            page.wait_for_selector("#msg.err")
        sites = page.locator("#sites")
        if annuaire_ok:
            page.wait_for_selector("text=Site de la mairie")
            assert "intercommunalité" in sites.inner_text()
        assert "data.gouv.fr" in sites.inner_text()
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        assert not erreurs and not alertes, (erreurs, alertes)
        page.screenshot(path="/tmp/verre.png", full_page=True)
        nav.close()


lancer(annuaire_ok=False)
lancer(overpass_ok=False)
lancer()
print("OK")
