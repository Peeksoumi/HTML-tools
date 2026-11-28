#!/usr/bin/env python3
"""python3 test_notifications.py : serveur d'abonnements réel (local) et logique d'envoi avec un faux service push."""
import json, pathlib, tempfile, threading, urllib.error, urllib.request
import envoyer, serveur_abonnements as srv

JETON = "j" * 32
d = pathlib.Path(tempfile.mkdtemp())
s = srv.creer_serveur(0, d / "abo.json", "CLEPUBLIQUE", JETON)
threading.Thread(target=s.serve_forever, daemon=True).start()
base = f"http://127.0.0.1:{s.server_port}{srv.BASE}"


def appel(url, methode="GET", corps=None, **entetes):
    req = urllib.request.Request(url, method=methode, headers=entetes,
                                 data=None if corps is None else json.dumps(corps).encode())
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, r.headers, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers, b""


abo = lambda url, ip="1.1.1.1": appel(base, "POST", {"endpoint": url, "keys": {"p256dh": "A" * 87, "auth": "B" * 22}}, **{"X-Real-IP": ip})[0]
assert json.loads(appel(base + "/cle")[2]) == {"cle": "CLEPUBLIQUE"}
assert abo("https://fcm.googleapis.com/fcm/send/a") == 201
assert abo("https://updates.push.services.mozilla.com/b") == 201
for mauvais in ["http://fcm.googleapis.com/x", "https://exemple.com/x", "https://fcm.googleapis.com.exemple.com/x",
                "https://127.0.0.1/x", "https://a@fcm.googleapis.com/x", "https://exemple.com\\@fcm.googleapis.com/x",
                "https://fcm.googleapis.com:8443/x", None]:
    assert abo(mauvais, "2.2.2.2") == 400, mauvais
assert [abo("https://web.push.apple.com/c", "3.3.3.3") for _ in range(11)][-2:] == [201, 429]
assert appel(base + "/liste")[0] == 401
assert appel(base + "/liste", Authorization="Bearer faux")[0] == 401
code, entetes, corps = appel(base + "/liste", Authorization="Bearer " + JETON, Origin="https://peeksoumi.github.io")
assert code == 200 and len(json.loads(corps)) == 3 and not entetes["Access-Control-Allow-Origin"]
assert appel(base, "OPTIONS", Origin="https://peeksoumi.github.io")[1]["Access-Control-Allow-Origin"] == "https://peeksoumi.github.io"
assert not appel(base, "OPTIONS", Origin="https://exemple.com")[1]["Access-Control-Allow-Origin"]
assert appel(base, "DELETE", {"endpoint": "https://web.push.apple.com/c"})[0] == 204
assert len(srv.Liste(d / "abo.json").tous()) == 2 and (d / "abo.json").stat().st_mode & 0o777 == 0o600

# Envoi : une alerte par nouvelle perturbation, abonnement mort supprimé, nouvel essai après une panne
envoyer.ABO_URL = base
evenements, envois, codes = [], [], {}


def http(url, methode="GET", corps=None, jeton=None):
    if url == envoyer.URL_EV:
        return evenements
    st, _, data = appel(url, methode, corps, **({"Authorization": "Bearer " + jeton} if jeton else {}))
    assert st in (200, 204), st
    return json.loads(data) if data else None


def faux_envoi(a, contenu):
    envois.append((a["endpoint"], contenu["title"]))
    return codes.get(a["endpoint"], 201)


passe = lambda: envoyer.passer(d / "etat.json", JETON, faux_envoi, http)
passe(); assert envois == []
evenements = [{"type": "Interruption", "statut": "prévisionnel", "ligne1": "Arrêt demain"}]
codes = {"https://updates.push.services.mozilla.com/b": 410}
passe(); assert len(envois) == 2 and len(json.loads(appel(base + "/liste", Authorization="Bearer " + JETON)[2])) == 1
passe(); assert len(envois) == 2
evenements[0]["statut"] = "en cours"
codes = {"https://fcm.googleapis.com/fcm/send/a": 500}
try:
    passe(); raise AssertionError("échec attendu")
except SystemExit:
    pass
codes = {}
passe(); assert envois[-1][1] == "Bac Lola : Interruption (en cours)" and len(envois) == 4
passe(); assert len(envois) == 4
s.shutdown()
print("Tous les tests passent")
