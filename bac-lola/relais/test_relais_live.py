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
        self.assertEqual(ws.recevoir(), "partie")
        self.assertEqual(ws.recevoir(), "x" * 300)
        time.sleep(0.4)
        self.assertEqual(recu["sub"]["FiltersShipMMSI"], ["227158520"])
        self.assertEqual(recu["pong"][0], 0x8A)   # opcode pong, fin
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

    def test_secours_selon_mouvement(self):
        now = int(time.time() * 1000)
        R.etat["ais_dernier"] = time.time() - 30      # aisstream muet depuis 30 s
        self.assertTrue(R.secours_necessaires())      # aucune position connue : on ne sait pas, on interroge
        R.ajouter([now, 47.2, -1.7, 5.0, 90])
        self.assertTrue(R.secours_necessaires())      # en mouvement : seuil de 20 s dépassé
        R.anneau.clear(); R.ajouter([now, 47.2, -1.7, 0.1, 90])
        self.assertFalse(R.secours_necessaires())     # à quai : seuil de 4 min
        R.etat["ais_dernier"] = time.time() - 300
        self.assertTrue(R.secours_necessaires())
        R.anneau.clear(); R.ajouter([now, 47.2, -1.7, 5.0, 90]); R.etat["ais_dernier"] = time.time() - 5
        self.assertFalse(R.secours_necessaires())     # aisstream récent : pas de secours

    def test_endpoint_positions(self):
        now = int(time.time() * 1000)
        R.ajouter([now, 47.3, -1.8, None, None])
        srv = R.ThreadingHTTPServer(("127.0.0.1", 0), R.H)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        base = "http://127.0.0.1:%d" % srv.server_address[1]
        p = json.load(urllib.request.urlopen(base + "/positions"))
        self.assertEqual(p["n"], 1)
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


if __name__ == "__main__":
    unittest.main()
