"""Tests du relais : client websocket (contre un faux serveur local), lecture des messages aisstream, anneau et publication.
Lancer : python3 test_relais_live.py"""
import base64, hashlib, json, socket, struct, threading, time, unittest, urllib.request

import relais_live as R


def trame(op, data=b"", fin=True):
    n = len(data)
    t = bytes([(0x80 if fin else 0) | op])
    t += bytes([n]) if n < 126 else bytes([126]) + struct.pack(">H", n)
    return t + data


def faux_serveur(scenario):
    """Serveur websocket de test : poignée de main, lit la souscription (masquée), puis joue `scenario(conn, souscription)`."""
    srv = socket.socket()
    srv.bind(("127.0.0.1", 0))
    srv.listen(1)

    def run():
        c, _ = srv.accept()
        tete = b""
        while b"\r\n\r\n" not in tete:
            tete += c.recv(4096)
        cle = [l.split(b": ")[1] for l in tete.split(b"\r\n") if l.lower().startswith(b"sec-websocket-key")][0].decode()
        acc = base64.b64encode(hashlib.sha1((cle + R.GUID).encode()).digest()).decode()
        c.sendall(("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: %s\r\n\r\n" % acc).encode())
        b0, b1 = c.recv(2)
        n = b1 & 0x7F
        if n == 126:
            n = struct.unpack(">H", c.recv(2))[0]
        m = c.recv(4)
        data = b""
        while len(data) < n:
            data += c.recv(n - len(data))
        assert b1 & 0x80, "trame client non masquée"
        sub = json.loads(bytes(b ^ m[i % 4] for i, b in enumerate(data)))
        scenario(c, sub)
        time.sleep(0.2)
        c.close()
        srv.close()

    threading.Thread(target=run, daemon=True).start()
    return "ws://127.0.0.1:%d/v0/stream" % srv.getsockname()[1]


def msg_ais(lat=47.2, lon=-1.7, sog=5.2, cog=123.0, mmsi=227158520, type_="PositionReport", t="2026-11-19 08:39:12.123456789 +0000 UTC"):
    return json.dumps({"MessageType": type_, "Message": {type_: {"Latitude": lat, "Longitude": lon, "Sog": sog, "Cog": cog, "UserID": mmsi}},
                       "MetaData": {"MMSI": mmsi, "time_utc": t}})


class TestWS(unittest.TestCase):
    def test_souscription_ping_fragmentation(self):
        recu = {}

        def scenario(c, sub):
            recu["sub"] = sub
            c.sendall(trame(9, b"coucou"))                                   # ping -> le client doit répondre pong
            c.sendall(trame(1, b"par", fin=False) + trame(0, b"tie"))        # message fragmenté
            c.sendall(trame(1, b"x" * 300))                                  # longueur sur 2 octets
            time.sleep(0.2)
            c.settimeout(1)
            recu["pong"] = c.recv(64)

        ws = R.WS(faux_serveur(scenario))
        ws.envoyer(1, json.dumps({"APIKey": "k", "FiltersShipMMSI": ["227158520"]}).encode())
        messages = []
        while len(messages) < 2:
            m = ws.recevoir()
            if m is not None:
                messages.append(m)
        self.assertEqual(messages, ["partie", "x" * 300])
        time.sleep(0.4)
        self.assertEqual(recu["sub"]["FiltersShipMMSI"], ["227158520"])
        self.assertEqual(recu["pong"][0], 0x8A)   # opcode pong, fin
        ws.fermer()

    def test_ping_puis_silence_ne_bloque_pas(self):
        """Régression : après un ping/pong, recevoir() doit rendre la main tout de suite (connexion silencieuse), pas attendre la trame suivante."""
        def scenario(c, sub):
            c.sendall(trame(10))     # pong isolé
            time.sleep(2.5)          # puis silence plus long que le délai de lecture du client
            c.sendall(trame(1, b"enfin"))
        ws = R.WS(faux_serveur(scenario), timeout=1)
        ws.envoyer(1, b"{}")
        t0 = time.time()
        self.assertTrue(ws.attendre(5))
        self.assertIsNone(ws.recevoir())
        self.assertLess(time.time() - t0, 1.0)
        self.assertFalse(ws.attendre(1))                 # silence : on attend sans lever d'erreur
        self.assertTrue(ws.attendre(5))
        self.assertEqual(ws.recevoir(), "enfin")
        ws.fermer()

    def test_fermeture(self):
        ws = R.WS(faux_serveur(lambda c, s: c.sendall(trame(8))))
        ws.envoyer(1, b"{}")
        with self.assertRaises(ConnectionError):
            ws.recevoir()

    def test_poignee_refusee(self):
        srv = socket.socket(); srv.bind(("127.0.0.1", 0)); srv.listen(1)
        threading.Thread(target=lambda: (lambda c: (c.recv(4096), c.sendall(b"HTTP/1.1 403 Forbidden\r\n\r\n"), c.close()))(srv.accept()[0]), daemon=True).start()
        with self.assertRaises(ConnectionError):
            R.WS("ws://127.0.0.1:%d/" % srv.getsockname()[1])


class TestReleve(unittest.TestCase):
    def test_position_normale(self):
        ts, lat, lon, v, c = R.releve_aisstream(msg_ais())
        self.assertEqual((lat, lon, v, c), (47.2, -1.7, 5.2, 123.0))
        self.assertEqual(ts, R.vers_ms("2026-11-19T08:39:12.123+00:00"))

    def test_classe_b_et_non_disponible(self):
        s = R.releve_aisstream(msg_ais(sog=102.3, cog=360, type_="StandardClassBPositionReport"))
        self.assertEqual((s[3], s[4]), (None, None))

    def test_ignores(self):
        self.assertIsNone(R.releve_aisstream(msg_ais(mmsi=123456789)))            # autre navire
        self.assertIsNone(R.releve_aisstream(msg_ais(lat=91.0, lon=181.0)))       # position non disponible
        self.assertIsNone(R.releve_aisstream(json.dumps({"MessageType": "ShipStaticData"})))

    def test_erreur_cle(self):
        with self.assertRaises(ValueError):
            R.releve_aisstream('{"error": "Api Key Is Not Valid"}')


class TestRelais(unittest.TestCase):
    def setUp(self):
        R.anneau.clear(); R.nouveau.clear(); R.etat.update(source=None, erreur=None, ais_dernier=0)

    def test_anneau_et_signal(self):
        now = int(time.time() * 1000)
        R.ajouter([now, 47.2, -1.7, 5, 90])
        self.assertTrue(R.nouveau.is_set())
        R.ajouter([now + 1000, 47.2, -1.7, 5, 90])    # doublon (±2 s)
        self.assertEqual(len(R.anneau), 1)

    def test_lectures_brutes_par_source(self):
        R.brut.clear(); R.anneau.clear()
        now = int(time.time() * 1000)
        R.noter_brut([now, 47.2, -1.7, 1.0, 90.0], "avt")
        R.noter_brut([now, 47.2, -1.7, 1.0, 90.0], "avt")           # même source, même heure : une seule fois
        R.noter_brut([now, 47.2, -1.7, None, None], "shiptrail")    # autre source, même heure : gardée (pour comparer)
        self.assertEqual([x[5] for x in R.brut], ["avt", "shiptrail"])
        self.assertEqual(R.charge_brut()["n"], 2)

    def test_lire_source_garde_brut_et_ajoute_a_l_anneau(self):
        R.brut.clear(); R.anneau.clear()
        now = int(time.time() * 1000)
        vrai = R.lire_avt
        R.lire_avt = lambda: [now - 400000, 47.2, -1.7, 1.0, 90.0]     # AVT 400 s en retard
        try:
            R.lire_source("avt")
        finally:
            R.lire_avt = vrai
        self.assertEqual(len(R.brut), 1)       # gardée en brut
        self.assertEqual(len(R.anneau), 0)     # mais trop vieille pour la meilleure donnée

    def test_choix_source_selon_la_latence(self):
        now = 1_000_000_000
        ais = lambda age: {"aisstream": [now - age * 1000]}
        # aisstream fraîche (moins que la latence d'avt) : on s'arrête, même si avt annonce une position plus récente
        self.assertEqual(R.choisir_source(dict(ais(20), avt=[now - 5000]), now), "aisstream")
        # aisstream plus vieille que la latence d'avt : avt la remplace seulement si sa position est plus récente
        self.assertEqual(R.choisir_source(dict(ais(100), avt=[now - 60000]), now), "avt")
        self.assertEqual(R.choisir_source(dict(ais(100), avt=[now - 130000]), now), "aisstream")
        # ni aisstream ni avt récentes : shiptrail prend le relais si elle est plus récente
        self.assertEqual(R.choisir_source(dict(ais(100), avt=[now - 90000], shiptrail=[now - 70000]), now), "shiptrail")
        # sans aisstream, ou sans rien
        self.assertEqual(R.choisir_source({"avt": [now - 50000]}, now), "avt")
        self.assertIsNone(R.choisir_source({}, now))

    def test_heure_de_position_deduite_de_la_latence(self):
        avant = int(time.time() * 1000)
        s = R.lire("avt", lambda: ["47.2", "-1.7", "1.0", "90", ""])      # source sans heure de position
        apres = int(time.time() * 1000)
        self.assertTrue(avant - 44000 <= s[0] <= apres - 44000)
        s = R.lire("avt", lambda: ["47.2", "-1.7", "1.0", "90", "2026-11-23T10:00:00Z"])   # avec heure : inchangée
        self.assertEqual(s[0], R.vers_ms("2026-11-23T10:00:00Z"))

    def test_publication_a_chaque_nouvelle_position(self):
        import os, tempfile
        d = tempfile.mkdtemp()
        R.REPO = "git@exemple:x/y.git"; R.RUN = d
        os.environ["CREDENTIALS_DIRECTORY"] = d
        open(os.path.join(d, "deploy_key"), "w").write("x")
        appels = []
        vrai = R.subprocess.run
        R.subprocess.run = lambda cmd, **k: appels.append(cmd[:2])
        try:
            now = int(time.time() * 1000)
            R.ajouter([now, 47.2, -1.7, 0.1, None])
            dernier = R.publier(None)
            self.assertEqual(dernier, now)
            n = len(appels)
            self.assertEqual(R.publier(dernier), dernier)   # rien de nouveau : pas de push
            self.assertEqual(len(appels), n)
            R.ajouter([now + 60000, 47.2, -1.7, 0.1, None])  # même lieu, nouvelle heure : on publie
            self.assertEqual(R.publier(dernier), now + 60000)
            self.assertGreater(len(appels), n)
        finally:
            R.subprocess.run = vrai

    def test_endpoint_positions(self):
        now = int(time.time() * 1000)
        R.ajouter([now, 47.3, -1.8, None, None])
        srv = R.ThreadingHTTPServer(("127.0.0.1", 0), R.H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:%d" % srv.server_address[1]
        p = json.load(urllib.request.urlopen(base + "/positions"))
        self.assertEqual(p["n"], 1)
        self.assertIn("samples", json.load(urllib.request.urlopen(base + "/sources")))
        with self.assertRaises(Exception):
            urllib.request.urlopen(base + "/autre")
        srv.shutdown()

    def test_boucle_complete_depuis_faux_aisstream(self):
        def scenario(c, sub):
            maintenant = time.strftime("%Y-%m-%d %H:%M:%S.000000 +0000 UTC", time.gmtime())
            c.sendall(trame(1, msg_ais(lat=47.21, lon=-1.69, t=maintenant).encode()))
            time.sleep(0.3)
        R.AIS_URL = faux_serveur(scenario)
        import os, tempfile
        d = tempfile.mkdtemp()
        open(os.path.join(d, "aisstream_key"), "w").write("cle-de-test\n")
        os.environ["CREDENTIALS_DIRECTORY"] = d
        threading.Thread(target=R.boucle_aisstream, daemon=True).start()
        for _ in range(50):
            if R.anneau:
                break
            time.sleep(0.1)
        self.assertEqual(len(R.anneau), 1)
        self.assertEqual(R.anneau[0][1:3], [47.21, -1.69])
        self.assertEqual(R.etat["source"], "aisstream")
        self.assertTrue(R.nouveau.is_set())


    def test_cle_vide_desactive_aisstream(self):
        import os, tempfile
        d = tempfile.mkdtemp()
        open(os.path.join(d, "aisstream_key"), "w").write("\n")
        os.environ["CREDENTIALS_DIRECTORY"] = d
        R.boucle_aisstream()    # doit rendre la main tout de suite, sans se connecter
        self.assertIn("désactivé", R.etat["ais"])

    def test_avt_vitesse_cap_et_heure(self):
        page = ('<meta name="geo.position" content="47.19542;-1.67445">'
                '<p>Speed: 4.2 knots, Course: 233°</p>'
                '"temporalCoverage":"2026-11-19T10:58:09Z" "timestamp":"$D2026-11-19T10:55:09.000Z"')
        R.http = lambda url, *a, **k: (200, page)
        self.assertEqual(R.source_avt(), ["47.19542", "-1.67445", "4.2", "233", "2026-11-19T10:58:09Z"])
        page = '<meta name="geo.position" content="47.1;-1.6">Speed: 0 knots, Course: 175° Position last updated 19 Nov 2026, 10:58 UTC'
        self.assertEqual(R.source_avt()[2:], ["0", "175", "2026-11-19T10:58:00Z"])

    def test_doublon_meme_position_deux_sources(self):
        R.anneau.clear()
        t = int(time.time() * 1000)
        R.ajouter([t, 47.2, -1.68, None, None])
        R.ajouter([t + 6000, 47.200001, -1.680001, 3.0, 120.0])   # même position, 6 s plus tard, autre source
        self.assertEqual(len(R.anneau), 1)
        self.assertEqual(R.anneau[0], [t, 47.2, -1.68, 3.0, 120.0])
        R.ajouter([t + 20000, 47.201, -1.68, 3.0, 120.0])          # vraie nouvelle position
        self.assertEqual(len(R.anneau), 2)

    def test_battement_de_coeur_republie_sans_nouvelle_position(self):
        import tempfile, os
        d = tempfile.mkdtemp(); open(os.path.join(d, "deploy_key"), "w").write("x")
        os.environ["CREDENTIALS_DIRECTORY"] = d
        R.anneau.clear(); R.ajouter([int(time.time() * 1000), 47.2, -1.68, 0.0, 175.0])
        appels = []
        vrai_run, vrai_repo = R.subprocess.run, R.REPO
        R.subprocess.run = lambda *a, **k: appels.append(a[0]) or None
        R.REPO = "git@exemple:x/y.git"
        try:
            dernier = R.publier(None)
            n = len(appels)
            self.assertGreater(n, 0)
            self.assertEqual(R.publier(dernier), dernier); self.assertEqual(len(appels), n)   # rien de neuf : pas de publication
            R.publier(dernier, force=True); self.assertGreater(len(appels), n)                # battement : publie quand même
        finally:
            R.subprocess.run, R.REPO = vrai_run, vrai_repo


if __name__ == "__main__":
    unittest.main()
