# Bac Lola — situation à chaque quai

Page autonome (un seul `index.html`) : deux colonnes côte à côte, une par quai (Basse-Indre, Indret), avec en grand l'heure du **prochain départ**
prévu depuis ce quai et la situation du bac (à quai ici → en traversée vers l'autre quai → à l'autre quai → en traversée vers ici). En dessous, une seule
liste de l'enchaînement prévu des changements (une ligne par traversée, départ et arrivée ensemble, Indret à gauche et Basse-Indre à droite ; l'horaire officiel et l'écart Δ restent sur les cartes de quai) et les derniers changements réellement mesurés. Un bandeau indique le mode du service :
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
4. **Prévision** : simulation du cycle. Grille : créneau + décalage appris (semaine +1,3 min, week-end +1,7 min, réajusté sur les 5 derniers départs),
   avec rattrapage immédiat si le bac a moins de 6 min de retard. Rotation : arrivée + 3,6 min. Fenêtres de pointe de semaine (06:55–09:30, 16:00–19:15)
   pour anticiper l'entrée / la sortie de rotation.

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

## Météo
Petit pictogramme en en-tête : température, ciel et vent actuels aux bacs, lus sur Open-Meteo (coordonnées fixes, rafraîchi toutes les 10 min ; masqué si indisponible).

## Surbrillance
Un seul quai est mis en évidence, partout à la fois (schéma, carte, première ligne de l'enchaînement) : en vert le quai où se trouve le bac, en orange le quai vers lequel il navigue. Rien n'est surligné si la position est trop ancienne.

## Visuel
Un bateau se déplace entre Indret et Basse-Indre selon la dernière position AIS (progression le long du chenal) ; la situation (4 cas : à quai Indret, à quai Basse-Indre, en route vers l'un ou l'autre) vient du dernier changement détecté, comme les cartes de quai, avec une flèche de direction.

## Limites
Un bandeau rouge « Connexion perdue » apparaît dès que le serveur de positions ne répond plus (avec l'ancienneté de la dernière mise à jour), et un autre après 3 min sans nouvelle position. La page suspend ses prévisions après 10 min sans nouvelle position AIS. Les causes d'un retard (autre bateau, changement de sens de la marée, vent) ne sont pas détectées en direct ; le serveur les enregistre
(navires voisins, marée, météo) pour une version ultérieure. Heures mesurées à ± 1 min. Calibrage sur 6 jours.

## Développement
Moteur, géométrie du chenal et interface sont inlinés dans `index.html` (blocs de script successifs).
Tests : `node tests/test_moteur.js` (grille, modes, prévision), `node tests/test_page.js` (page avec faux DOM, événements détectés en direct).
