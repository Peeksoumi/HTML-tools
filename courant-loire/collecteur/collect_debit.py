#!/usr/bin/env python3
"""Enregistre le débit de la Loire à Montjean-sur-Loire (Vigicrues via Hub'Eau) dans un CSV.

Usage : python3 collect_debit.py [--out data/montjean_debit.csv] [--n 12]
À lancer par cron toutes les 30 min : chaque appel relit les n dernières mesures et n'ajoute que les nouvelles.
Colonnes : date_obs_utc, station, debit_m3s. Aucune dépendance (bibliothèque standard).
"""
import argparse
import csv
import json
import os
import urllib.request

STATION = "M530001010"  # La Loire à Montjean-sur-Loire
URL = ("https://hubeau.eaufrance.fr/api/v1/hydrometrie/observations_tr"
       "?code_entite={st}&grandeur_hydro=Q&size={n}&sort=desc&fields=date_obs,resultat_obs")


def fetch(n):
    with urllib.request.urlopen(URL.format(st=STATION, n=n), timeout=30) as r:
        return json.load(r)


def rows_from(payload):
    """[(date_obs, débit en m³/s)] ; Hub'Eau donne le débit en l/s."""
    out = []
    for o in payload.get("data", []):
        if o.get("resultat_obs") is None or not o.get("date_obs"):
            continue
        out.append((o["date_obs"], round(o["resultat_obs"] / 1000, 3)))
    return out


def append_new(path, rows):
    deja = set()
    if os.path.exists(path):
        with open(path, newline="", encoding="utf8") as f:
            deja = {r["date_obs_utc"] for r in csv.DictReader(f)}
    nouveaux = sorted((r for r in rows if r[0] not in deja), key=lambda r: r[0])
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    nouveau_fichier = not os.path.exists(path)
    with open(path, "a", newline="", encoding="utf8") as f:
        w = csv.writer(f)
        if nouveau_fichier:
            w.writerow(["date_obs_utc", "station", "debit_m3s"])
        for d, q in nouveaux:
            w.writerow([d, STATION, q])
    return len(nouveaux)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="data/montjean_debit.csv")
    ap.add_argument("--n", type=int, default=12)
    a = ap.parse_args()
    print(append_new(a.out, rows_from(fetch(a.n))), "mesure(s) ajoutée(s) dans", a.out)
