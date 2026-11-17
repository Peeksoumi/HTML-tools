# Bac Lola — situation à chaque quai

Page autonome (un seul `index.html`) : deux colonnes côte à côte, une par quai (Basse-Indre, Indret), avec en grand l'heure du **prochain départ**
prévu depuis ce quai et la situation du bac (à quai ici → en traversée vers l'autre quai → à l'autre quai → en traversée vers ici). En dessous, une seule
liste de l'enchaînement prévu des changements (horaire officiel et écart Δ en information secondaire) et les derniers changements réellement mesurés. Un bandeau indique le mode du service :
**normal**, **rotation continue**, **retard / perturbation** ou **arrêt** (nuit, panne).

## Méthode (modèle hybride)
1. **Nominal** : GTFS « Bacs de Loire en Loire-Atlantique » 2026 (ligne Basse-Indre <> Indret), 1 départ / 20 min / quai. Semaine : BI 05:30→22:10,
   Indret 05:40→22:20 ; week-end et fériés : BI 06:30→21:30, Indret 06:40→21:20. Arrivée nominale = départ nominal + 3 min.
2. **Détection** : positions AIS de Lola (AISVesselTracker, repli Shiptrail) collectées toutes les 10 s par le serveur du site et publiées en JSON
   (`/lola-live/positions.json`, 12 dernières heures, heure = heure de la position AIS). À l'ouverture la page rejoue ces 12 h dans le détecteur
   (projection sur le chenal ; arrivée / départ confirmés par 2 positions), puis suit les nouvelles positions toutes les 10 s.
3. **Modes** : rotation continue si les départs consécutifs sont espacés de ≤ 8,5 min ; perturbation si l'écart médian à la grille > 4,5 min ;
   arrêt hors service ou sans mouvement depuis 30 min.
4. **Prévision** : simulation du cycle. Grille : créneau + décalage appris (BI +2,3 min, Indret +2,0 min, réajusté sur les 5 derniers départs),
   avec rattrapage immédiat si le bac a moins de 6 min de retard. Rotation : arrivée + 3,6 min. Fenêtres de pointe de semaine (06:55–09:30, 16:10–19:45)
   pour anticiper l'entrée / la sortie de rotation.

## Calibrage et validation
Relevés enregistrés par le serveur du 13 au 17/11/2026 (≈ 7 000 positions, 700 événements, 98 départs évaluables). Rejeu : à chaque arrivée on prévoit
le départ suivant.

| Modèle | Erreur médiane | ≤ 2 min | Rotation (erreur moyenne) |
|---|---|---|---|
| Grille officielle seule | 2,4 min | 23 % | 7,7 min |
| Grille + décalage | 0,5 min | 69 % | 8,7 min |
| **Hybride (cette page)** | **0,5 min** | **92 %** | **1,1 min** |

Les paramètres (décalages, séjours, fenêtres) sont appris sur les mêmes données que le test : c'est une première estimation, à refaire quand
il y aura plus de jours de semaine, de vendredis et de vacances.

## Limites
Un bandeau rouge « Connexion perdue » apparaît dès que le serveur de positions ne répond plus (avec l'ancienneté de la dernière mise à jour), et un autre après 3 min sans nouvelle position. La page suspend ses prévisions après 10 min sans nouvelle position AIS. Les causes d'un retard (autre bateau, changement de sens de la marée, vent) ne sont pas détectées en direct ; le serveur les enregistre
(navires voisins, marée, météo) pour une version ultérieure. Heures mesurées à ± 1 min. Calibrage sur 5 jours.

## Développement
Moteur, géométrie du chenal et interface sont inlinés dans `index.html` (blocs de script successifs).
Tests : `node tests/test_moteur.js` (grille, modes, prévision), `node tests/test_page.js` (page avec faux DOM, événements détectés en direct).
