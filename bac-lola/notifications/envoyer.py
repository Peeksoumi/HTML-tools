#!/usr/bin/env python3
"""Lancé par GitHub Actions : envoie une notification pour chaque nouvelle perturbation du bac Lola.

Variables : VAPID_PRIVATE_KEY, ABO_JETON (secrets), ABO_URL, ETAT (fichier des perturbations déjà signalées),
TEST=1 pour une notification d'essai. Les journaux sont publics : ne jamais y écrire d'adresse d'abonnement.
Dépendance pour l'envoi : pywebpush.
"""
import hashlib, json, os, pathlib, urllib.parse, urllib.request

URL_EV = ("https://api.loire-atlantique.fr/opendata/1.0/traficevents?filter="
          + urllib.parse.quote("Bac de Loire Basse-Indre - Indret"))
ABO_URL = os.environ.get("ABO_URL", "https://peeksoumi.com/abonnements/bac-lola")


def lire_json(url, methode="GET", corps=None, jeton=None):
    entetes = {"User-Agent": "HTML-tools alerte bac Lola", "Content-Type": "application/json"}
    if jeton:
        entetes["Authorization"] = "Bearer " + jeton
    req = urllib.request.Request(url, method=methode, headers=entetes,
                                 data=None if corps is None else json.dumps(corps).encode())
    with urllib.request.urlopen(req, timeout=20) as r:
        data = r.read()
    return json.loads(data) if data else None


def message(ev):
    lignes = [str(ev.get(f"ligne{i}") or "").strip() for i in range(1, 7)]
    texte = " ".join(x for x in lignes if x)
    statut = str(ev.get("statut") or "")
    # Un passage de « prévisionnel » à « en cours » change l'identifiant : nouvelle alerte.
    ident = hashlib.sha256(json.dumps([statut, lignes]).encode()).hexdigest()[:16]
    titre = "Bac Lola : " + str(ev.get("type") or "perturbation") + (f" ({statut})" if statut else "")
    return ident, {"title": titre[:120], "body": texte[:600], "tag": ident}


def envoi_webpush(abo, contenu):
    """Renvoie le code HTTP du service de notification (201 si accepté, 0 sans réponse)."""
    from pywebpush import WebPushException, webpush
    try:
        r = webpush(abo, json.dumps(contenu), vapid_private_key=os.environ["VAPID_PRIVATE_KEY"],
                    vapid_claims={"sub": "https://github.com/Peeksoumi/HTML-tools"}, ttl=3600, timeout=20)
        return r.status_code
    except WebPushException as e:
        return e.response.status_code if e.response is not None else 0
    except Exception as e:  # le texte de l'erreur peut contenir l'adresse : seul son type est journalisé
        print("erreur d'envoi :", type(e).__name__)
        return 0


def diffuser(contenu, jeton, envoi, http):
    abonnes = http(ABO_URL + "/liste", jeton=jeton)
    codes = []
    for abo in abonnes:
        code = envoi(abo, contenu)
        codes.append(code)
        if code in (404, 410):
            http(ABO_URL, "DELETE", {"endpoint": abo["endpoint"]})
    reussis = sum(200 <= c < 300 for c in codes)
    print(f"{len(abonnes)} abonné(s), {reussis} envoi(s) réussi(s), codes : {sorted(set(codes))}")
    # Échec seulement si personne n'a été joint alors qu'il restait des abonnés valables.
    if not reussis and any(c not in (404, 410) for c in codes):
        raise SystemExit("aucun envoi réussi : nouvel essai au prochain passage")


def passer(etat, jeton, envoi=envoi_webpush, http=lire_json):
    """etat : fichier JSON des identifiants déjà signalés."""
    evenements = http(URL_EV)
    if not isinstance(evenements, list):
        raise SystemExit("API du Département : format inattendu")
    etat = pathlib.Path(etat)
    deja = set(json.loads(etat.read_text())) if etat.exists() else set()
    actuels = dict(message(e) for e in evenements if isinstance(e, dict))
    print(f"{len(actuels)} perturbation(s) annoncée(s), {len(set(actuels) - deja)} nouvelle(s)")
    signales = deja & set(actuels)  # une perturbation disparue est oubliée
    try:
        for ident, contenu in actuels.items():
            if ident not in signales:
                diffuser(contenu, jeton, envoi, http)
                signales.add(ident)
    finally:
        etat.write_text(json.dumps(sorted(signales)))


if __name__ == "__main__":
    if os.environ.get("TEST") == "1":
        diffuser({"title": "Bac Lola : essai", "body": "Les alertes fonctionnent.", "tag": "essai"},
                 os.environ["ABO_JETON"], envoi_webpush, lire_json)
    else:
        passer(os.environ.get("ETAT", "etat.json"), os.environ["ABO_JETON"])
