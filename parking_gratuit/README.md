# parking_gratuit

Trouve les **places de parking gratuites** autour d'une position (ville, adresse ou coordonnées GPS), avec
**géolocalisation** (bouton « 📍 Ma position »), le **nombre de places restantes** et les **rues connues pour
avoir beaucoup de places**. Page publiée sur le VPS sous `/parking/` (port 8080, et HTTPS peeksoumi.com).
Dépôt public HTML-tools ; dépend d'un serveur (pas de bouton « Télécharger la page »).

## Sources fusionnées (`sources.py`)
| Source | Apporte | Limite |
|---|---|---|
| OpenStreetMap (Overpass) – parkings | position, capacité, gratuité (`fee=no` = sûr ; non renseigné = « probable ») | pas de temps réel ; parkings en ouvrage/souterrains exclus sauf `fee=no` |
| OpenStreetMap – rues (`parking:lane:*`) | rues avec stationnement le long de la voirie ; places estimées = longueur × côtés × 85 % ÷ 5,5 m (parallèle) / 3 m (épi) / 2,5 m (perpendiculaire) | estimation ; dépend de la saisie OSM ; zone bleue (`disc`) signalée |
| Open data temps réel (`sources.json`) | places **libres** par parking (Opendatasoft : Nantes, Strasbourg) | seulement les villes configurées ; la gratuité vient de `gratuit` / `gratuit_si_nom` |

Fusion : un même parking vu par plusieurs sources est regroupé (< 25 m, ou < 300 m avec un nom ressemblant).
Le temps réel de l'opérateur l'emporte sur la capacité OSM ; si deux sources se contredisent sur la gratuité,
le tarif passe à « inconnu ». Les parkings payants sont écartés.
Tri de la liste : gratuit confirmé, puis gratuit probable, puis tarif inconnu ; à gratuité égale, du plus proche au plus éloigné.

**Lecture des chiffres** : « places libres » = somme du temps réel (parkings gratuits) ; « places au total sans temps
réel » = capacité des autres parkings gratuits ; « places de rue » = estimation. Ne jamais les additionner comme si
c'étaient des places libres.

## Parkings sans nom
Nom déduit de la position, dans l'ordre : adresse OSM (`addr:street`) → lieu nommé à < 50 m (magasin, loisir, tourisme) →
rue nommée à < 40 m → géocodage inverse Nominatim (6 par recherche maximum, 1 req/s) → « Parking de surface / en bord de rue ».
La liste affiche un badge « nom déduit : … ». Les mini parkings anonymes (< 5 places déclarées) sont masqués.
Le serveur se relance seul quand `server.py`, `sources.py` ou `sources.json` changent (après le `git pull` du VPS).

## Ajouter une ville
Ajouter un objet dans `sources.json` (`id`, `nom`, `centre`, `rayon_km`, `url` de l'API Opendatasoft `…/records?limit=100`,
`champs` = noms de colonnes possibles, `gratuit`/`gratuit_si_nom`). `positions_url` sert quand le jeu temps réel n'a pas de
coordonnées (jointure par nom). Les colonnes Nantes/Strasbourg sont des hypothèses : le job 061 affiche les colonnes
réelles dans son journal (branche `server-logs`) pour les ajuster.

## Essai local
`python3 server.py` puis http://127.0.0.1:8092/ — tests hors ligne : `python3 -B -I test_parking.py`.

## API
`/api/recherche?lat=&lon=&rayon=` (rayon 100–4000 m, cache 10 min OSM / 2 min temps réel) · `/api/geocode?q=` · `/api/status`.

## Déploiement
`server/jobs/061_parking_gratuit.sh` (dépôt private ; unité systemd `server/parking-gratuit.service` dans private) (une fois, relancé si modifié) : service `parking-gratuit` + bloc nginx `/parking/` + tests réels.
La géolocalisation du navigateur exige HTTPS : utiliser l'adresse https://peeksoumi.com/parking/.
