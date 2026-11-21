# Mythomachie

Jeu de stratégie en temps réel mythologique, 100 % navigateur (un seul `index.html`, aucune dépendance, aucune connexion) :
bâtir une cité, récolter nourriture, bois et or, former une armée et invoquer son dieu contre 1 à 3 adversaires.

- Dieux : Zeus (Cyclope ; Foudre, Égide), Odin (Valkyrie ; Fimbulvetr, Einherjar), Râ (Phénix ; Soleil ardent, Bénédiction).
- Unités : citoyen, hoplite, archer, cavalier, bélier, créature du dieu. Cycle : hoplite › cavalier › archer › hoplite.
- Réglages : 1 à 3 adversaires, 3 difficultés, 3 tailles de carte. Sauvegarde automatique dans le navigateur.
- Contrôles au doigt (toucher, glisser, pincer, appui long) et à la souris / clavier.
- Graphismes, cartes et sons générés par le code ; jeu original inspiré des mythologies grecque, nordique et égyptienne (domaine public).

## Sources et construction

`index.html` est généré : ne pas le modifier directement. Modifier les fichiers de `src/`, puis lancer `python3 build.py`.

- `src/style.css`, `src/body.html` : interface (menu, HUD, aide, section « Fonctionnement et sources »).
- `src/js/00-util.js` à `06-ai.js` : moteur sans DOM (données, carte, chemins A*, simulation, IA).
- `src/js/07-sprites.js` à `10-main.js` : dessins, rendu, interface, sons, sauvegarde, boucle principale.

## Tests

- `node tests/sim_test.js` : partie IA contre IA de 20 minutes sans navigateur (cohérence, vagues d'attaque, récolte).
- `python3 tests/smoke.py` : Playwright + Chrome (règles du dépôt, sélection, partie accélérée, sauvegarde, téléchargement).
