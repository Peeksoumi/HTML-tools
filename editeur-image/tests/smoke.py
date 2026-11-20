"""Test de fumée : page chargée dans Chrome, services externes simulés (aucun accès réseau)."""
import base64, io, json, sys, pathlib
from playwright.sync_api import sync_playwright
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1] / "index.html"

def png(color, size=(300, 200)):
    b = io.BytesIO(); Image.new("RGB", size, color).save(b, "PNG"); return b.getvalue()

errors, ok = [], []
def check(name, cond):
    (ok if cond else errors).append(name); print(("OK  " if cond else "FAIL"), name)

with sync_playwright() as p:
    br = p.chromium.launch(executable_path="/usr/bin/google-chrome", args=["--no-sandbox"])
    pg = br.new_page(); js_err = []
    pg.on("pageerror", lambda e: js_err.append(str(e)))

    sent = {}
    def horde(route):
        u, m = route.request.url, route.request.method
        hdr = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*"}
        if m == "OPTIONS": return route.fulfill(status=204, headers=hdr)
        if u.endswith("/generate/async"):
            sent["body"] = json.loads(route.request.post_data); return route.fulfill(json={"id": "abc"}, headers=hdr)
        if "/generate/check/" in u: return route.fulfill(json={"done": True}, headers=hdr)
        gen = base64.b64encode(png((0, 0, 255), (sent["body"]["params"]["width"], sent["body"]["params"]["height"]))).decode()
        route.fulfill(json={"generations": [{"img": gen}]}, headers=hdr)
    pg.route("https://aihorde.net/**", horde)
    pg.route("https://cdn.jsdelivr.net/npm/@imgly/**", lambda r: r.fulfill(content_type="text/javascript", headers={"access-control-allow-origin": "*"},
        body="export async function removeBackground(b){const i=await createImageBitmap(b);const c=new OffscreenCanvas(i.width,i.height);const x=c.getContext('2d');x.drawImage(i,0,0);x.clearRect(0,0,i.width/2,i.height);return await c.convertToBlob({type:'image/png'})}"))
    pg.route("https://api.openverse.org/**", lambda r: r.fulfill(headers={"access-control-allow-origin": "*"},
        json={"results": [{"title": "Chien", "thumbnail": "https://x.test/a.png", "foreign_landing_url": "https://x.test/a", "license": "by"}]}))
    pg.route("https://commons.wikimedia.org/**", lambda r: r.fulfill(headers={"access-control-allow-origin": "*"}, json={"query": {"pages": {}}}))

    pg.goto(ROOT.as_uri())
    check("zone de travail masquée au départ", pg.is_hidden("#work"))
    pg.set_input_files("#file", files=[{"name": "t.png", "mimeType": "image/png", "buffer": png((255, 0, 0))}])
    pg.wait_for_selector("#work", state="visible")
    px = lambda sel, x, y: pg.evaluate("([s,x,y])=>Array.from(document.querySelector(s).getContext('2d').getImageData(x,y,1,1).data)", [sel, x, y])
    check("image chargée 300x200", pg.evaluate("[view.width,view.height]") == [300, 200])

    # 1) détourage (module simulé : efface la moitié gauche)
    pg.click("#goBg"); pg.wait_for_function("document.querySelector('#status').textContent.includes('Fond retiré')")
    check("détourage : gauche transparente, droite intacte", px("#view", 10, 100)[3] == 0 and px("#view", 290, 100)[3] == 255)
    pg.click("#undo"); check("annuler restaure l'image", px("#view", 10, 100)[3] == 255)

    # 2) modification d'une zone : peindre un trait à droite, générer (résultat simulé = bleu)
    pg.click("[data-tab=edit]"); pg.click("#goEdit")
    check("refus sans phrase", "phrase" in pg.inner_text("#status") or "ce que la zone" in pg.inner_text("#status"))
    pg.fill("#prompt", "a blue door")
    pg.click("#goEdit"); check("refus sans zone", "zone" in pg.inner_text("#status"))
    pg.locator("#maskView").scroll_into_view_if_needed(); box = pg.locator("#maskView").bounding_box()
    pg.mouse.move(box["x"] + box["width"] * .8, box["y"] + box["height"] * .5); pg.mouse.down()
    pg.mouse.move(box["x"] + box["width"] * .9, box["y"] + box["height"] * .5, steps=5); pg.mouse.up()
    pg.click("#goEdit")
    try: pg.wait_for_function("document.querySelector('#status').textContent.includes('Zone modifiée')", timeout=15000)
    except Exception: print("STATUS:", pg.inner_text("#status")); raise
    body = sent["body"]
    check("requête inpainting envoyée (modèle, dimensions multiples de 64)", body["source_processing"] == "inpainting" and body["params"]["width"] % 64 == 0 and body["params"]["height"] % 64 == 0)
    check("zone peinte remplacée par le bleu", px("#view", int(300 * .85), 100)[2] > 200 and px("#view", int(300 * .85), 100)[0] < 60)
    check("reste de l'image inchangé (rouge)", px("#view", 20, 20)[:3] == [255, 0, 0])

    # 3) images similaires (sans CLIP)
    pg.click("[data-tab=sim]"); pg.uncheck("#rank"); pg.fill("#query", "dog"); pg.click("#goSim")
    pg.wait_for_selector(".res"); check("résultat Openverse affiché avec lien", pg.locator(".res a").first.get_attribute("href") == "https://x.test/a")

    check("aucune erreur JavaScript", not js_err)
    br.close()
sys.exit(1 if errors or js_err else 0)
