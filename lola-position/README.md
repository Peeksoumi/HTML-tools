# Lola — position AIS en direct (aisstream.io, AISVesselTracker, Shiptrail)

Page autonome (un seul `index.html`) qui affiche la position du bac de Loire **Lola** (MMSI 227158520, Indret ⇄ Basse-Indre) à partir du relais du VPS, qui collecte **dans l'ordre aisstream.io, AISVesselTracker puis Shiptrail** :
latitude, longitude, vitesse, cap, heure et âge du relevé, carte du chenal avec le bac.

## Où mettre la clé d'API
**Dans un fichier lisible par root seul sur le VPS, fourni au service systemd sous le nom `aisstream_key`. Jamais dans `index.html` ni dans ce dépôt (public).**
aisstream.io refuse les connexions directes depuis un navigateur (la clé serait lisible par tous les visiteurs) : la page lit le relais du VPS (`bac-lola/relais/relais_live.py`), et le relais lit aisstream.io.

```
sudo install -m 600 /dev/null /etc/lola-relais/aisstream_key
sudo nano /etc/lola-relais/aisstream_key          # coller la clé, rien d'autre
sudo systemctl edit lola-relais                   # ajouter :  [Service]
                                                  #            LoadCredential=aisstream_key:/etc/lola-relais/aisstream_key
sudo systemctl restart lola-relais
```
(Si le service charge déjà `deploy_key` par `LoadCredential=`, ajouter simplement une seconde ligne `LoadCredential=` pour `aisstream_key`.)

## Contrôle
- `curl -s http://127.0.0.1:18791/positions` : le champ `source` donne l'origine de la dernière position ; le champ `ais` indique `ok`, `connecté, en attente d'une position`, `échec : …` (ex. clé refusée) ou `désactivé` (identifiant absent).
- `https://peeksoumi.com/lola-direct/positions` doit renvoyer la même chose (nginx publie le préfixe `/lola-direct/`).

## Méthode (page)
1. Interroge `/lola-direct/positions` toutes les 5 s et affiche la dernière position (heure AIS, source indiquée) ; une position plus ancienne que celle affichée est ignorée.
Côté relais : aisstream en continu ; si aisstream est muet depuis 20 s en mouvement (3 min à quai), AISVesselTracker puis Shiptrail sont interrogés toutes les 15 s.
2. Entre deux relevés : estimation en ligne droite d'après la vitesse et le cap (60 s au plus), lissée sur 0,7 s à l'arrivée du relevé suivant.
3. Fraîcheur : « En direct » sous 2 min, avertissement jusqu'à 10 min, alerte rouge au-delà ; « Relais AIS injoignable » après deux échecs de suite (les dernières valeurs restent affichées). Après 3 échecs, les essais sont espacés.
4. Tracé : aller = GTFS officiel « Bacs de Loire en Loire-Atlantique » ; retour = symétrique par rapport à l'axe nord-sud du chenal.

Pas de bouton « Télécharger la page » : l'outil n'a de sens qu'avec le relais du serveur.

## Limites
- AISVesselTracker et Shiptrail rafraîchissent environ toutes les 30 à 80 s : les positions sont plus espacées si aisstream ne capte pas l'estuaire (couverture à vérifier sur `aisstream.io/coverage`). Non testé contre les vraies sources au moment de l'écriture.
- Un bac à quai n'émet qu'un relevé toutes les ~3 min ; la page ne peut pas être plus fraîche que la source.
- L'estimation est rectiligne (fausse dans les virages et à l'accostage). L'âge se calcule avec l'horloge de l'appareil.

## Tests
`node tests/test_page.js` : relevé, erreurs du relais, estimation, alertes de fraîcheur (faux DOM, aucun réseau). Le relais a le sien : `python3 bac-lola/relais/test_relais_live.py`.
