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

API_POINTS = [
  {"id":"MR-A","lat":47.2200,"lon":-1.5500,"nom":"Locker officiel","reseau":"mondial","type":"locker","horaires":"Mo-Su 00:00-24:00","adresse":"Quai 1"},
  {"id":"MR-B","lat":47.2150,"lon":-1.5500,"nom":"Pressing officiel","reseau":"mondial","type":"commerce","horaires":"Mo-Su 00:00-24:00"},
]

def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
        ctx = b.new_context(geolocation={"latitude":47.2184,"longitude":-1.5536}, permissions=["geolocation"], locale="fr-FR")
        ctx.route("**/unpkg.com/**/leaflet.js", lambda r: r.fulfill(body=LEAFLET_STUB, content_type="application/javascript"))
        ctx.route("**/unpkg.com/**/leaflet.css", lambda r: r.fulfill(body="", content_type="text/css"))
        reqs, api = [], {"mode": "ok", "auth": None}
        def vu(r, body, status=200):
            reqs.append(r.request.url); r.fulfill(status=status, body=json.dumps(body), content_type="application/json")
        ctx.route("**/overpass**", lambda r: vu(r, ELEMENTS))
        ctx.route("**/nominatim.openstreetmap.org/**", lambda r: vu(r, {"address":{"postcode":"44000","city":"Nantes"}} if "/reverse" in r.request.url else [{"lat":"47.2184","lon":"-1.5536"}]))
        def api_route(r):
            api["auth"] = r.request.headers.get("authorization")
            if api["mode"] == "ok": vu(r, {"points": API_POINTS})
            else: vu(r, {"erreur": "x"}, 500)
        ctx.route("https://api.test/**", api_route)
        page = b.new_page() if False else ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append(str(e)))
        page.goto(PAGE)
        assert "download=" in page.content() and "HTML-tools/issues" in page.content() and 'id="fonctionnement"' in page.content()

        # Position inconnue : aucune requête, boutons dépendant de la position désactivés
        page.wait_for_timeout(300)
        assert reqs == [], reqs
        assert page.is_disabled("#ici") and page.is_disabled("#refresh")
        assert "aucune requête" in page.inner_text("#msg")

        page.click("#geo"); page.wait_for_selector(".liste li[data-id]")
        assert not page.is_disabled("#ici") and not page.is_disabled("#refresh")
        assert all("overpass" in u or "nominatim" in u for u in reqs), reqs   # l'API est désactivée par défaut
        page.wait_for_selector("#officiels a")
        hs = page.eval_on_selector_all("#officiels a", "e => e.map(x => x.href)")
        assert "mondialrelay.fr" in hs[0] and "codePostal=44000" in hs[0] and "ville=Nantes" in hs[0], hs
        assert hs[1] == "https://map.pickup.fr/?pudo_keyword=44000%20Nantes&lang=fr", hs
        items = page.query_selector_all(".liste li[data-id]")
        assert len(items) == 2, len(items)               # Mondial seul : commerce + locker, « Trop loin » (> 3 km) exclu
        assert page.evaluate("window.__xss") is None      # nom OSM échappé
        assert "Tabac <img" in page.inner_text(".liste li[data-id]")
        href = page.get_attribute(".actions a.go", "href")
        assert href.startswith("https://www.google.com/maps/dir/?api=1&destination=47.219000,-1.554000&travelmode=walking") and "origin=" not in href, href
        assert "Ouvert" in page.inner_text(".liste li[data-id]")
        assert "base OpenStreetMap du" in page.inner_text("#fraicheur") and "OpenStreetMap ✓ 4" in page.inner_text("#fraicheur")

        page.check('[data-res="relaiscolis"]'); assert len(page.query_selector_all(".liste li[data-id]")) == 3
        page.uncheck('[data-type="locker"]'); assert len(page.query_selector_all(".liste li[data-id]")) == 2
        page.check("#fouvert"); assert len(page.query_selector_all(".liste li[data-id]")) == 1
        page.select_option("#mode", "driving"); assert "travelmode=driving" in page.get_attribute(".actions a.go", "href")

        page.uncheck("#fouvert")
        page.fill("#q", "Nantes"); page.click("button[type=submit]"); page.wait_for_function("document.querySelector('.liste li[data-id] .actions a.go').href.includes('origin=')")
        assert "origin=47.218400,-1.553600" in page.get_attribute(".actions a.go", "href")
        page.click("#refresh"); page.wait_for_timeout(300)

        # Source API relais : fusion avec OSM, jeton transmis, panne tolérée
        page.check('[data-type="locker"]')
        page.click("#sources summary")
        page.check("#s-api"); page.fill("#s-url", "https://api.test/relais"); page.fill("#s-token", "tok")
        page.dispatch_event("#s-token", "change")
        page.wait_for_function("document.querySelector('#fraicheur').textContent.includes('API relais ✓ 2')")
        assert api["auth"] == "Bearer tok", api["auth"]
        noms = page.inner_text(".liste")
        assert "Locker officiel" in noms and "Pressing officiel" in noms and "API relais + OSM" in noms, noms
        assert len(page.query_selector_all(".liste li[data-id]")) == 4
        api["mode"] = "ko"; page.click("#refresh")
        page.wait_for_function("document.querySelector('#msg').textContent.includes('API relais')")
        assert "HTTP 500" in page.inner_text("#msg") and len(page.query_selector_all(".liste li[data-id]")) == 3
        page.uncheck("#s-osm"); page.wait_for_timeout(300)
        assert "Erreur" in page.inner_text("#msg")
        page.uncheck("#s-api"); page.wait_for_timeout(200)
        assert "au moins une source" in page.inner_text("#msg")
        assert not errs, errs
        b.close()
    print("OK : test de page relais-retour")

main()
