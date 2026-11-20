# Courant de la Loire — changements de sens

Page autonome (un seul `index.html`, aucune dépendance) qui annonce l'heure où le courant de la Loire passe du jusant au flot,
et inversement, au **bac Lola** (Indret / Basse-Indre) et à **l'île de Nantes**, d'après la marée, son coefficient et le débit du fleuve.

## Méthode
1. **Marée** : analyse harmonique avec les constantes mesurées REFMAR (TICON-4) de Saint-Nazaire, Le Pellerin, Nantes Usine Brûlée et Salorges
   (`src/stations-data.js`, généré par `tools/gen_stations.py`). Lola = interpolation Usine Brûlée → Le Pellerin (31 %).
2. **Calage** : heure d'étale à Nantes = étale harmonique de Saint-Nazaire + retard `a + b·coef + c·tendance`,
   ajusté sur 58 marées de septembre 2027 publiées par le SHOM (Saint-Nazaire et Nantes-Chantenay). Erreur résiduelle : ≈ 3 min (PM), ≈ 7 min (BM)
   pour les coefficients ≥ 45 ; ces horaires ne sont pas redistribués ici. Lola = Nantes + écart harmonique entre les deux stations.
3. **Coefficient** : 100 × marnage calculé à Brest / 6,10 m.
4. **Renverse** : étale + Δt lu dans la table 5 « Corrections relatives aux renverses de courant » du Port de Nantes Saint-Nazaire
   (Nantes Usine Brûlée et Cordemais ; coefficients 45/70/95 ; débits à Montjean 200/1 000/3 000 m³/s), interpolé en coefficient, débit
   et position (Lola ≈ 15 % du trajet Nantes → Cordemais). Courant de flot < 0,3 nœud : pas de renverse annoncée.
5. **Correction à Lola** : + 20 min sur les renverses (médiane de l'écart à 12 renverses mesurées par la trajectoire du bac, 13→19/11/2026, mortes-eaux ; erreur moyenne ≈ 15 min après correction). Pas de correction à l'île de Nantes. Même valeur que `bac-lola`.
6. **Débit** : lu à Montjean-sur-Loire (station M530001010) via l'API Hub'Eau, ou saisi à la main.

## Affichage
- **Graphique** (un par site) : niveau d'eau du jour, PM/BM avec heure, marnage et coefficient, renverses avec heure et incertitude (barre au pied du trait), bandes flot/jusant avec vitesse maximale, trait « maintenant ».
- **Carte** (Leaflet + OpenStreetMap, connexion requise) : les deux sites, flèches jusant (aval, ouest) et flot (amont, est) aux caps approximatifs du chenal ; la flèche pleine indique le sens actuel ; un clic sur un repère ouvre l'état et les prochains changements.

## Précision
Réaliste : **± 10 à 20 min**. Les tables du Port donnent des fourchettes de 10 à 30 min et l'étale est calée à ± 3 / ± 7 min ; vent, pression,
affluents et morte-eau (coefficient < 45, étale de 1 à 3 h) ajoutent de l'incertitude. Pour descendre vers ± 5 min il faudrait caler le modèle
sur des relevés réels de renverse (ex. AIS du bac, ADCP) à Lola et à Nantes.

## Développement
- `src/core.js` : moteur ; `src/template.html` : interface ; `python3 build.py` régénère `index.html`.
- Tests : `node tests/test_core.js` (marées, coefficient, tables, cohérence), `node tests/test_page.js` (page avec faux DOM, après `build.py`).
- Limites connues : table 5 hors 45–95 → valeur du bord ; corrections de débit sur les étales (table 2 du Port) non appliquées ; positions approximatives.

## Sources et licences
- Constantes harmoniques : Hart-Davis, M., Dettmering, D., Seitz, F. (2025), TICON-4, SEANOE, <https://doi.org/10.17882/109129> (CC BY 4.0) ; relayées par le projet [neaps/tide-database](https://github.com/neaps/tide-database).
- Grand Port Maritime de Nantes Saint-Nazaire, « Horaires des marées – Tables de corrections » (table 5).
- SHOM (prédictions de marée) pour le calage ; Vigicrues / Hub'Eau pour le débit.

## Collecte de données réelles (pour affiner le modèle)
`collecteur/collect_debit.py` enregistre le débit de la Loire à Montjean (Hub'Eau, station M530001010) dans un CSV. À lancer depuis un serveur
qui a accès à Internet, par exemple en cron toutes les 30 min :

```
*/30 * * * * cd /chemin/courant-loire/collecteur && python3 collect_debit.py --out /chemin/donnees/montjean_debit.csv
```

Test : `python3 collecteur/test_collect_debit.py` (Hub'Eau simulé). Le script n'a pas pu être essayé en réel depuis l'environnement de développement (accès à Hub'Eau refusé).
Piste suivante : niveaux d'eau observés à Le Pellerin et Nantes Salorges (REFMAR/SHOM) et relevés AIS, pour mesurer les vraies heures d'étale et de renverse selon le débit.
