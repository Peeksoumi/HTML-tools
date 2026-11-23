#!/usr/bin/env python3
"""Partie en ligne de bout en bout : serveur local + deux navigateurs (ordinateur et téléphone tactile).
Salon créé par Alice (bouton Inviter, connexion muette rétablie au retour au premier plan), rejoint par Bob via le lien #CODE,
Carla par un lien ouvert dans un onglet déjà affiché ; lancement, ordres, discussion, maison, désélection et sélection au doigt,
rechargement de Bob, puis salon disparu après relance du serveur.
Usage : python3 tests/online_test.py   (Node.js et Playwright requis)"""
import asyncio, functools, http.server, os, pathlib, random, subprocess, threading, time
from playwright.async_api import async_playwright
here = pathlib.Path(__file__).resolve().parent
root = here.parent
port = random.randint(19000, 19900)
# Page servie en HTTP comme sur le site (en file://, Chromium sans interface perd parfois le localStorage au rechargement)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
web = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
threading.Thread(target=web.serve_forever, daemon=True).start()
page_url = "http://127.0.0.1:%d/index.html" % web.server_address[1]
chrome = next((p for p in ("/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser") if os.path.exists(p)), None)
shots = here / "captures"
results = []

def ok(cond, msg):
    results.append(bool(cond)); print(("✔ " if cond else "✘ ") + msg)

async def until(pg, expr, ms=8000):
    t0 = time.time()
    while time.time() - t0 < ms / 1000:
        try:
            if await pg.evaluate(expr): return True
        except Exception: pass
        await asyncio.sleep(0.1)
    return False

def start_server():
    s = subprocess.Popen(["node", str(root / "server" / "server.js")], env={**os.environ, "PORT": str(port)}, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    time.sleep(0.8)
    return s

async def main():
    srv = start_server()
    errs = []
    try:
        async with async_playwright() as p:
            b = await p.chromium.launch(executable_path=chrome, args=["--no-sandbox"]) if chrome else await p.chromium.launch()
            init = "localStorage.setItem('mythomachie.serveur', 'ws://127.0.0.1:%d/mythomachie/ws');" % port
            ca = await b.new_context(viewport={"width": 1280, "height": 800})
            await ca.grant_permissions(["clipboard-read", "clipboard-write"], origin=page_url.rsplit("/", 1)[0])
            cb = await b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            cc = await b.new_context(viewport={"width": 900, "height": 700})
            for c in (ca, cb, cc): await c.add_init_script(init)
            pa, pb, pc = await ca.new_page(), await cb.new_page(), await cc.new_page()
            for name, pg in (("A", pa), ("B", pb), ("C", pc)): pg.on("pageerror", lambda e, n=name: errs.append(n + ": " + str(e)))
            # Alice crée un salon avec une IA
            await pa.goto(page_url)
            await pa.click("#b-online")
            ok(await until(pa, "document.getElementById('net-state').textContent === 'Connecté'"), "Alice est connectée au serveur")
            await pa.fill("#mp-name", "Alice")
            await pa.click("#mp-opts [data-mpo=ais] [data-v='1']")
            await pa.click("#mp-create")
            ok(await until(pa, "/^[A-Z]{4}$/.test(document.getElementById('mp-roomcode').textContent)"), "salon créé")
            code = await pa.text_content("#mp-roomcode")
            # Inviter : le lien est affiché et copié
            await pa.click("#mp-copy")
            link = await pa.input_value("#mp-link")
            ok(link.endswith("#" + code) and await until(pa, "document.getElementById('mp-msg').textContent.includes('copié')", 3000)
               and await pa.evaluate("navigator.clipboard.readText()") == link, "bouton Inviter : lien affiché et copié (" + link + ")")
            # Connexion muette (téléphone sorti de veille) : au retour au premier plan, une nouvelle connexion reprend le salon
            await pa.evaluate("window.__oldWs = NET.ws; NET.ws.onmessage = null; document.dispatchEvent(new Event('visibilitychange'))")
            ok(await until(pa, "NET.ws && NET.ws !== window.__oldWs && NET.state === 'on' && NET.room && NET.room.code === '%s' && NET.host" % code, 9000),
               "connexion muette remplacée au retour au premier plan, Alice reste hôte du salon")
            # Bob rejoint par le lien d'invitation (#CODE) sur un téléphone
            await pb.goto(page_url + "#" + code)
            ok(await until(pb, "NET.room && NET.room.code === '%s'" % code), "Bob rejoint par le lien #" + code)
            await pb.fill("#mp-name", "Bob"); await pb.dispatch_event("#mp-name", "change")
            await pb.click("#mp-god [data-v='odin']")
            ok(await until(pa, "NET.room && NET.room.members.length === 2 && NET.room.members[1].name === 'Bob' && NET.room.members[1].patron === 'odin'"), "Alice voit Bob (Odin) dans le salon")
            ok(await until(pa, "document.getElementById('mp-msg').textContent.includes('a rejoint')", 3000), "Alice est prévenue de l’arrivée de Bob")
            # Carla a déjà le jeu ouvert : le lien d'invitation change seulement le #CODE de son onglet
            await pc.goto(page_url)
            await pc.evaluate("location.hash = '#%s'" % code)
            ok(await until(pc, "NET.room && NET.room.code === '%s' && !NET.host" % code), "Carla rejoint par un lien ouvert dans un onglet déjà affiché")
            await pc.click("#mp-leave")
            ok(await until(pa, "NET.room && NET.room.members.length === 2"), "Carla quitte le salon")
            await pa.screenshot(path=str(shots / "en-ligne-salon.png"))
            await pa.click("#mp-go")
            ok(await until(pa, "G && G.mp && G.me === 0 && G.units.length > 0") and await until(pb, "G && G.mp && G.me === 1 && G.units.length > 0"), "partie lancée chez les deux joueurs")
            await asyncio.sleep(1.5)
            # Alice envoie ses citoyens aux baies et forme un citoyen
            r = await pa.evaluate("""(() => { const vs = G.units.filter(u => u.o === G.me && u.t === 'villager');
                const bush = G.ress.filter(r => r.t === 'berry').sort((a, b) => Math.hypot(a.x - vs[0].x, a.y - vs[0].y) - Math.hypot(b.x - vs[0].x, b.y - vs[0].y))[0];
                setSel(vs.map(v => v.id)); const s = w2s(bush.x, bush.y); onTap(s.x, s.y);
                const city = G.blds.find(b => b.o === G.me && b.t === 'city'); setSel([city.id]); doAction('train:villager');
                return { n: vs.length, food: G.pl[G.me].res.food }; })()""")
            ok(await until(pa, "G.units.filter(u => u.o === G.me && u.t === 'villager' && u.st === 'gather').length >= 3", 6000), "les citoyens d’Alice récoltent (ordre transmis au serveur)")
            ok(await until(pa, "G.pl[G.me].res.food <= %d && G.blds.find(b => b.o === G.me && b.t === 'city').q.length === 1" % (r["food"] - 50), 4000), "citoyen en formation à la cité d’Alice")
            # Bob bâtit une maison au doigt
            okb = await pb.evaluate("""(() => { const v = G.units.find(u => u.o === G.me && u.t === 'villager'); setSel([v.id]); doAction('build:house');
                const city = G.blds.find(b => b.o === G.me && b.t === 'city'); let spot = null;
                for (let r = 3; r < 10 && !spot; r++) forRing(city.tx + 2, city.ty + 2, r, (x, y) => { if (!spot && canPlace('house', G.me, x, y, true)) spot = [x, y]; });
                setTarget((spot[0] + 1) * T, (spot[1] + 1) * T); confirmPlace(false); return !!spot; })()""")
            ok(okb and await until(pb, "G.blds.some(b => b.o === G.me && b.t === 'house')", 4000), "la maison de Bob apparaît (chantier)")
            # discussion
            await pa.evaluate("openChat()"); await pa.fill("#chat-in", "Salut Bob !"); await pa.press("#chat-in", "Enter")
            ok(await until(pb, "[...document.querySelectorAll('#toasts .toast.chat')].some(t => t.textContent.includes('Salut Bob'))", 4000), "Bob reçoit le message d’Alice")
            # au doigt : ✕ désélectionne ; toucher le toit de la cité la sélectionne
            await pb.evaluate("(() => { const v = G.units.find(u => u.o === G.me && u.t === 'villager'); setSel([v.id]); })()")
            await pb.tap("#selp .desel")
            ok(await pb.evaluate("G.sel.length === 0"), "Bob désélectionne au doigt (bouton ✕)")
            roof = await pb.evaluate("(() => { const c = G.blds.find(b => b.o === G.me && b.t === 'city'); centerOn(c.x, c.y); const s = w2s(c.x, c.ty * T - BLD_H.city * 0.8); const r = CV.getBoundingClientRect(); return [s.x + r.left, s.y + r.top, c.id]; })()")
            await pb.touchscreen.tap(roof[0], roof[1])
            ok(await until(pb, "G.sel.length === 1 && G.sel[0] === %d" % roof[2], 2000), "Bob touche le toit de sa cité : elle est sélectionnée")
            ok(await until(pb, "G.pl.every(p => p.netAge === 0) && document.querySelector('#age-badge b').textContent === 'I'", 2000), "âges reçus du serveur (tous à l’âge I)")
            # brouillard : Alice ne voit pas la cité de Bob
            ok(await pa.evaluate("!G.blds.some(b => b.o === 1 && b.t === 'city')"), "Alice ne voit pas la cité de Bob (brouillard)")
            await asyncio.sleep(1)
            await pa.screenshot(path=str(shots / "en-ligne-alice.png"))
            await pb.screenshot(path=str(shots / "en-ligne-bob.png"))
            # Bob recharge sa page : il revient dans la partie
            await pb.reload()
            back = await until(pb, "G && G.mp && G.me === 1 && G.blds.some(b => b.o === G.me && b.t === 'house')", 10000)
            if not back:
                print("diagnostic Bob :", await pb.evaluate("({ net: NET.state, room: NET.room && NET.room.code, flag: localStorage.getItem('mythomachie.enligne'), g: !!G, mp: G && G.mp, me: G && G.me, blds: G && G.blds.filter(b => b.o === G.me).map(b => b.t), online: !document.getElementById('online').hidden, msg: document.getElementById('mp-msg').textContent })"))
            ok(back, "après rechargement, Bob reprend sa partie")
            # Coupure réseau d'Alice : la reprise garde le terrain déjà dessiné (pas de reconstruction sur téléphone)
            await pa.evaluate("window.__ter = G.terCv; netDrop()")
            ok(await until(pa, "NET.state === 'on' && G && G.mp && G.netTime > 0 && G.terCv === window.__ter && !G.netFirst", 8000), "après une coupure, Alice reprend sa partie sans redessiner le terrain")
            n1 = await pa.evaluate("G.netTime"); await asyncio.sleep(2); n2 = await pa.evaluate("G.netTime")
            ok(await pa.evaluate("NET.state") == "on" and n2 - n1 > 1.5, "la partie continue chez Alice (horloge du serveur %.1f → %.1f s)" % (n1, n2))
            # Carla crée un salon, puis le serveur est relancé (salons perdus) : elle en est avertie
            await pc.click("#mp-create")
            ok(await until(pc, "NET.room && NET.host"), "Carla crée un salon")
            srv.terminate(); srv.wait(); old_log = srv.stdout.read().decode(errors="replace"); srv = start_server()
            ok(await until(pc, "!NET.room && NET.state === 'on' && document.getElementById('mp-msg').textContent.includes('existe plus')", 15000),
               "après relance du serveur, Carla apprend que son salon n’existe plus")
            ok(await until(pa, "!G && !document.getElementById('online').hidden && document.getElementById('mp-msg').textContent.includes('n’existe plus')", 15000),
               "Alice, en pleine partie perdue par le serveur, revient à l’écran en ligne au lieu de rester figée")
            ok(not errs, "aucune erreur dans les pages" + (" : " + " | ".join(errs) if errs else ""))
            await b.close()
    finally:
        srv.terminate()
        log = srv.stdout.read().decode(errors="replace") if srv.stdout else ""
        print("--- journal du serveur ---\n" + log.strip()[-1500:])
    print("OK" if all(results) else "ÉCHEC")
    if not all(results): raise SystemExit(1)

shots.mkdir(exist_ok=True)
asyncio.run(main())
