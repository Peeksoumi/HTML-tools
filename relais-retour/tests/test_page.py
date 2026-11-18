"""Test de la page relais-retour avec réseau simulé (Overpass, Nominatim, Leaflet).
Lancer : python3 relais-retour/tests/test_page.py"""
import json, os, sys
from playwright.sync_api import sync_playwright

PAGE = "file://" + os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "index.html"))
LEAFLET_STUB = """
window.L = (function(){
  const chain = () => new Proxy(function(){}, { get:(t,k)=> k==='getLatLng' ? ()=>({lat:0,lng:0}) : k==='getCenter' ? ()=>({lat:47.2,lng:-1.55}) : k==='getZoom' ? ()=>14 : ()=>chain() });
  return { map:chain, tileLayer:chain, layerGroup:chain, circleMarker:chain };
})();
"""
ELEMENTS = {"osm3s": {"timestamp_osm_base": "2026-11-18T17:00:00Z"}, "elements": [
  {"type":"node","id":1,"lat":47.2190,"lon":-1.5540,"tags":{"brand":"Mondial Relay","name":"Tabac <img src=x onerror=window.__xss=1>","addr:street":"rue X","opening_hours":"Mo-Su 00:00-24:00"}},
  {"type":"node","id":2,"lat":47.2200,"lon":-1.5500,"tags":{"amenity":"parcel_locker","brand":"Mondial Relay"}},
  {"type":"node","id":3,"lat":47.2210,"lon":-1.5560,"tags":{"brand":"Relais Colis","name":"Epicerie"}},
  {"type":"node","id":4,"lat":47.3000,"lon":-1.5500,"tags":{"brand":"Mondial Relay","name":"Trop loin"}},
]}

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = b.new_context(geolocation={"latitude":47.2184,"longitude":-1.5536}, permissions=["geolocation"], locale="fr-FR")
        ctx.route("**/unpkg.com/**/leaflet.js", lambda r: r.fulfill(body=LEAFLET_STUB, content_type="application/javascript"))
        ctx.route("**/unpkg.com/**/leaflet.css", lambda r: r.fulfill(body="", content_type="text/css"))
        ctx.route("**/overpass**", lambda r: r.fulfill(body=json.dumps(ELEMENTS), content_type="application/json"))
        ctx.route("**/nominatim.openstreetmap.org/**", lambda r: r.fulfill(body=json.dumps([{"lat":"47.2184","lon":"-1.5536"}]), content_type="application/json"))
        page = b.new_page() if False else ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(PAGE)
        assert "download=" in page.content() and "HTML-tools/issues" in page.content() and 'id="fonctionnement"' in page.content()

        page.click("#geo"); page.wait_for_selector(".liste li[data-id]")
        items = page.query_selector_all(".liste li[data-id]")
        assert len(items) == 2, len(items)               # Mondial seul : commerce + locker, « Trop loin » (> 3 km) exclu
        assert page.evaluate("window.__xss") is None      # nom OSM échappé
        assert "Tabac <img" in page.inner_text(".liste li[data-id]")
        href = page.get_attribute(".actions a.go", "href")
        assert href.startswith("https://www.google.com/maps/dir/?api=1&destination=47.219000,-1.554000&travelmode=walking") and "origin=" not in href, href
        assert "Ouvert" in page.inner_text(".liste li[data-id]")
        assert "Base OpenStreetMap" in page.inner_text("#fraicheur")

        page.check('[data-res="relaiscolis"]'); assert len(page.query_selector_all(".liste li[data-id]")) == 3
        page.uncheck('[data-type="locker"]'); assert len(page.query_selector_all(".liste li[data-id]")) == 2
        page.check("#fouvert"); assert len(page.query_selector_all(".liste li[data-id]")) == 1
        page.select_option("#mode", "driving"); assert "travelmode=driving" in page.get_attribute(".actions a.go", "href")

        page.uncheck("#fouvert")
        page.fill("#q", "Nantes"); page.click("button[type=submit]"); page.wait_for_function("document.querySelector('.liste li[data-id] .actions a.go').href.includes('origin=')")
        assert "origin=47.218400,-1.553600" in page.get_attribute(".actions a.go", "href")
        page.click("#refresh"); page.wait_for_timeout(300)
        assert not errs, errs
        b.close()
    print("OK : test de page relais-retour")

main()
