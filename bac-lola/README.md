# Bac Lola — situation à chaque quai

Page autonome (un seul `index.html`) : deux colonnes côte à côte, une par quai (Basse-Indre, Indret), avec en grand l'heure du **prochain départ**
prévu depuis ce quai et la situation du bac (à quai ici → en traversée vers l'autre quai → à l'autre quai → en traversée vers ici). En dessous, une seule
liste de l'enchaînement prévu des changements (une ligne par traversée, départ et arrivée ensemble, Basse-Indre à gauche et Indret à droite ; l'horaire officiel et l'écart Δ restent sur les cartes de quai) et les derniers changements réellement mesurés. Un bandeau indique le mode du service :
**normal**, **rotation continue**, **retard / perturbation** ou **arrêt** (nuit, panne).

## Méthode (modèle hybride)
1. **Nominal** : GTFS « Bacs de Loire en Loire-Atlantique » 2026 (ligne Basse-Indre <> Indret), 1 départ / 20 min / quai. Semaine : BI 05:30→22:10,
   Indret 05:40→22:20 ; week-end et fériés : BI 06:30→21:30, Indret 06:40→21:20. Arrivée nominale = départ nominal + 3 min.
2. **Détection** : positions AIS de Lola (aisstream.io en continu ; repli AISVesselTracker puis Shiptrail après 20 s de silence en mouvement, 75 s à quai) reçues par le script [`relais/relais_live.py`](relais/relais_live.py),
   exécuté sur le VPS (1 h en RAM, aucune base). Les sources AIS refusant les navigateurs, ce script publie la dernière heure de positions dans la copie publique **GitHub**
   [Peeksoumi/lola-relais](https://github.com/Peeksoumi/lola-relais) à chaque nouvelle position (au plus toutes les 15 s, un seul commit sans historique) et au moins une fois par minute (battement de cœur : le champ `maj` prouve que le relais tourne ; la page affiche un avertissement et repasse en hypothèse s'il n'a rien publié depuis 4 min), et la page **ne lit que cette copie**, par l'API GitHub toutes les 75 s (limite de 60 requêtes/h par IP) ; si l'API refuse, repli 10 min sur `raw.githubusercontent.com` dont le cache retarde de ~5 min (alors seuil « relais muet » à 8 min).
   Entre deux positions, le modèle estime la situation (événements « estimés »). À l'ouverture la page rejoue la dernière heure de positions dans le détecteur (projection sur le chenal ; arrivée / départ confirmés par 2 positions ; en traversée, une seule position à l'arrêt (< 0,3 nd) près du quai d'en face suffit pour l'arrivée, car les positions sont espacées de 30 à 130 s).
   Position fraîche (< 2 min en mouvement, < 4 min à quai) = situation **mesurée** ; au-delà = **hypothèse** du modèle, affichée en gris pointillé ; alerte rouge à 3 min (mouvement) / 5 min (quai) ; prévisions suspendues à 10 min en service. La page ne lit jamais les relevés d'entraînement.
3. **Modes** : rotation continue si les départs consécutifs sont espacés de ≤ 8,5 min ; perturbation si l'écart médian à la grille > 4,5 min ;
   arrêt hors service ou sans mouvement depuis 30 min.
4. **Prévision (modèle 3)** : simulation du cycle. Les heures d'événement sont **recalées sur les coordonnées** (profil trapézoïdal : démarrage 5 s, freinage 60 s, croisière ≈ 4,4 nœuds).
   Grille : créneau + décalage appris par type de jour et quai, sans effet de courant (semaine ≈ +0,8–0,9 min, week-end ≈ +1,2 min), avec rattrapage immédiat si le bac a moins de 6 min de retard.
   Rotation : arrivée + séjour appris par quai et par heure (≈ 4,1 min à Indret, 4,8 min à Basse-Indre). Traversée apprise par type de jour, quai et sens du courant.
   Chaque valeur est corrigée par les derniers événements (prior = 3 observations). Fenêtres de pointe de semaine (06:55–09:30, 16:00–18:55) pour anticiper l'entrée / la sortie de rotation ;
   retour au poste de nuit : arrivé à Indret avec le prochain départ nominal à plus de 3 h, le bac repart 2 min après vers Basse-Indre.
   Les constantes (`PARAM.m3`) sont apprises sur les 7 derniers jours par [`entrainement/entrainer_modele3.py`](entrainement/entrainer_modele3.py) (entrée : tableau des traversées recalées ; voir l'en-tête du script) et sont à réentraîner régulièrement.
   Rejeu : constantes 17→23/11, test 24/11 : erreur moyenne 1,53 min contre 1,67 min pour l'ancien modèle (−8 %).

## Changement de courant (situation de perturbation anticipée)
Le courant de la Loire s'inverse (flot ⇄ jusant) deux fois par marée. La page le calcule seule d'après la **date** : pleines et basses mers de **Nantes** et coefficient
(marée harmonique du moteur de `courant-loire`, inliné par `python3 inject_courant.py`, enveloppe dans `src/courant-wrapper.js`) et débit moyen mensuel Q de la Loire à Montjean.
Pleine mer → début du jusant, basse mer → début du flot. Minutes après l'étale de Nantes (+ 20 min de correction mesurée sur le bac incluses), C = coefficient de marée :

- **début du flot = basse mer Nantes + 30,2 − 0,0241·Q + 0,164·C**
- **début du jusant = pleine mer Nantes + 34,3 + 0,0136·Q − 0,096·C**
- valable pour Q de 200 à 1 600 m³/s (au-delà le retard du jusant explose : 57 min à 3 000). Fenêtre ± 20 min (Q ≤ 1 000), ± 30 min au-delà (non mesuré).
- Q par mois (Hydroportail M5300010, 1863-2026) : janv. 1 450, févr. 1 540, mars 1 360, avr. 1 090, mai 846, juin 583, juil. 356, août 246, sept. 260, oct. 412, nov. 775, déc. 1 160 m³/s.
- **Validation** : 12 renverses du 13 au 19/11/2026 (trajectoire du bac : ≈ 170 m à l'est de la droite entre les quais au flot, 40–80 m à l'ouest au jusant). Erreur moyenne ≈ 13 min (Q = 308) à ≈ 16 min (Q mensuel climatologique 775), pire cas 29–38 min. Le terme en coefficient n'améliore pas l'ajustement mesuré (coefficients mesurés 32–60) : il reprend l'effet des tables du Port.
- **Limite principale** : Q vient du mois, pas du débit réel (novembre 2026 : ≈ 310 contre 775 m³/s de moyenne). Gros débits et vives-eaux jamais mesurés.
- **Affichage** : ligne violette « retard possible » insérée à l'heure de la renverse dans l'enchaînement prévu (à venir jusqu'à 90 min avant, ou en cours dans la fenêtre) ; lignes de l'enchaînement surlignées si un horaire tombe dans la fenêtre.
- **Quais et courant** : sur 397 départs, aucun retard significatif près des renverses (22 % d'écarts > 4 min à ± 30 min, 19 % ailleurs). En revanche le **sens** du courant décale légèrement départs et traversées (Mann-Whitney p ≈ 0, ≈ 90 départs par cas, 6 jours, 07–20 h) : écart à la grille Basse-Indre flot +0,4 / jusant +1,8 min, Indret flot +2,5 / jusant +1,1 min ; traversée 144 s au flot contre 122 s au jusant. La prévision applique ± 0,7 min au départ et ± 0,18 min à la traversée (écart au moyen), selon le sens donné par l'équation (`PARAM.courantDepart`, `PARAM.courantTraversee`).
- **Suite** : valider gros débits et vives-eaux dès la première crue mesurée (`comparer_modeles.py` du dépôt privé, qui teste encore l'ancienne règle).

## Calibrage et validation
Relevés enregistrés par le serveur du 13 au 18/11/2026 (≈ 7 800 positions, ≈ 1 000 événements, 490 départs évaluables). Rejeu : à chaque arrivée on prévoit
le départ suivant. Ces données servent uniquement à fixer les paramètres hors ligne ; la page ne les lit jamais.

| Modèle | Erreur médiane | ≤ 2 min | Rotation (erreur moyenne) |
|---|---|---|---|
| Grille officielle seule | 1,8 min | 57 % | 8,4 min |
| Grille + décalage | 0,7 min | 74 % | 9,4 min |
| **Hybride (cette page)** | **0,6 min** | **93 %** | **1,5 min** |

Analyse du 18/11 : le seuil de trou entre deux positions passe de 60 s à 120 s (la source rafraîchit toutes les ~50 s, 61 % des changements étaient
à tort jugés « approximatifs » et écartés du calibrage) ; traversée et décalage dépendent du type de service ; fin de pointe du soir ramenée à 19:15.
Vent, marée, pluie, niveau de la mer et navires voisins n'expliquent ni la durée de traversée ni l'erreur de prévision (corrélations < 0,2) : non retenus.

Les paramètres (décalages, séjours, fenêtres) sont appris sur les mêmes données que le test : c'est une première estimation, à refaire quand
il y aura plus de jours de semaine, de vendredis et de vacances.

## Informations officielles du Département
Indépendamment du modèle, la page interroge directement, sans clé et depuis le navigateur (CORS ouvert, vérifié le 26/11/2026), les API qu'utilise l'appli « Bacs de Loire » (adresses relevées dans l'APK 2.2.11) :
`api.loire-atlantique.fr/opendata/1.0/traficevents?filter=Bac de Loire Basse-Indre - Indret` (toutes les 2 min : liste des perturbations, `statut` « en cours » ou « prévisionnel », texte sur `ligne1`..`ligne6` ; liste vide = aucune)
et `.../bacspsn_android/1.0/traficparameter?id=bacs_horaires` (toutes les 30 min : premier / dernier départ, intervalle, jours spéciaux, message).
Sous le bandeau : un bloc par perturbation annoncée (rouge si en cours, gris si prévisionnelle), sinon une ligne « aucune perturbation annoncée ». Sous l'enchaînement prévu : les horaires officiels, avec un avertissement rouge s'ils diffèrent de la grille GTFS du modèle (constatés identiques le 26/11/2026 : « jours spéciaux » = week-end et fériés). Ces informations ne modifient pas les prévisions.
Limites : API non documentée, format réel d'une perturbation encore jamais observé (liste vide depuis le 25/11/2026). Test : `node tests/test_officiel.js`.

## Alertes
Notification à chaque nouvelle perturbation annoncée (facultatif) : voir [`notifications/README.md`](notifications/README.md).

## Météo
Petit pictogramme en en-tête : température, ciel et vent actuels aux bacs, lus sur Open-Meteo (coordonnées fixes, rafraîchi toutes les 10 min ; masqué si indisponible).

## Surbrillance
Un seul quai est mis en évidence, partout à la fois (schéma, carte, première ligne de l'enchaînement) : en vert le quai où se trouve le bac, en orange le quai vers lequel il navigue. Rien n'est surligné si la position est trop ancienne.

## Visuel
Schéma vertical : Basse-Indre (nord) en haut, Indret (sud) en bas. Le bateau se déplace entre les deux selon la dernière position AIS (progression le long du chenal) ; la situation (4 cas : à quai Indret, à quai Basse-Indre, en route vers l'un ou l'autre) vient du dernier changement détecté, comme les cartes de quai, avec une flèche de direction.

## Limites
Un bandeau rouge « Connexion perdue » apparaît dès que le serveur de positions ne répond plus (avec l'ancienneté de la dernière mise à jour), et un autre après 3 min sans nouvelle position. La page suspend ses prévisions après 10 min sans nouvelle position AIS. Les causes d'un retard (autre bateau, vent) ne sont pas détectées en direct ; le changement de courant est anticipé par le calcul mais son effet n'est pas encore mesuré ; le serveur les enregistre
(navires voisins, marée, météo) pour une version ultérieure. Heures mesurées à ± 1 min. Calibrage sur 6 jours.

## Développement
Moteur, géométrie du chenal et interface sont inlinés dans `index.html` (un seul bloc `<script>`). Le calcul du courant est généré : modifier `src/courant-wrapper.js` ou `courant-loire/src`, puis `python3 inject_courant.py`. Test : `node tests/test_courant.js`.
Tests : `node tests/test_moteur.js` (grille, modes, prévision), `node tests/test_page.js` (page avec faux DOM, événements détectés en direct).

Mise à jour du 25/11 : modèle 3 (recalage sur coordonnées, séjour par quai et heure, traversée selon le courant, décalage sans effet de courant) appris sur 18→24/11, pointe du soir jusqu'à 18:55, retour au poste de nuit ; latences du relais corrigées (aisstream 8 s, avt 44 s, shiptrail 45 s).

Mise à jour du 26/11 : bandeau des perturbations officielles du Département et horaires officiels (API de l'appli Bacs de Loire), appelés directement par la page.
