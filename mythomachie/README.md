# Mythomachie

Jeu de stratégie en temps réel mythologique, 100 % navigateur (un seul `index.html`, aucune dépendance) :
bâtir une cité, récolter nourriture, bois et or, former une armée et invoquer son dieu contre 1 à 3 adversaires.
Seul, le jeu fonctionne hors ligne ; en ligne, jusqu'à 4 camps (joueurs et ordinateurs) s'affrontent via le serveur de jeu du site.

- Dieux : Zeus (Cyclope ; Foudre, Égide), Odin (Valkyrie ; Fimbulvetr, Einherjar), Râ (Phénix ; Soleil ardent, Bénédiction).
- Unités : citoyen, hoplite, archer, cavalier, bélier, créature du dieu. Cycle : hoplite › cavalier › archer › hoplite.
- Trois âges (Fondations, Cités, Prodiges) : le passage se recherche à la Cité et débloque Temple, Tour, Cavalier, Bélier, second pouvoir divin et recherches.
- Réglages : 1 à 3 adversaires, 3 difficultés, 3 tailles de carte. Sauvegarde automatique dans le navigateur.
- En ligne : salon à code de 4 lettres ou lien d'invitation (`…/mythomachie/#CODE`, partagé par la feuille de partage du téléphone), mode « chacun pour soi » ou « ensemble contre l'IA », discussion, reprise après rechargement ou coupure (l'ordinateur prend le relais au-delà de 45 s). Un salon garde 30 min la place d'un joueur déconnecté (le temps d'envoyer le lien) ; l'hôte absent plus de 5 min cède sa place.
- Contrôles au doigt (toucher, glisser, pincer, appui long) et à la souris / clavier.
- Graphismes, cartes et sons générés par le code ; jeu original inspiré des mythologies grecque, nordique et égyptienne (domaine public).

## Sources et construction

`index.html` est généré : ne pas le modifier directement. Modifier les fichiers de `src/`, puis lancer `python3 build.py`.

- `src/style.css`, `src/body.html` : interface (menu, HUD, aide, section « Fonctionnement et sources »).
- `src/js/00-util.js` à `06-ai.js` : moteur sans DOM (données, carte, chemins A*, simulation, IA).
- `src/js/06-net.js` : partage du jeu en ligne (ordres validés, états filtrés par la vision d'équipe, application des états reçus).
- `src/js/07-sprites.js` à `11-net.js` : dessins, rendu, interface, sons, sauvegarde, boucle principale, écran « Jouer en ligne ».

## Serveur de jeu en ligne

`server/server.js` : Node.js seul, sans dépendance. Chaque partie charge le même moteur (`src/js/00-util.js` à `06-net.js`)
dans un contexte isolé (`vm`) et fait autorité : 20 pas de simulation par seconde, ordres des joueurs vérifiés,
envoi 10 fois par seconde à chaque joueur de ce que voit son équipe (WebSocket compressé).

- Points d'accès : WebSocket `/mythomachie/ws`, état `GET /mythomachie/api/status` ; écoute sur `127.0.0.1:8093` (variable `PORT`), derrière nginx.
- Sur le VPS : service systemd `mythomachie` (utilisateur dynamique, non root) ; il redémarre seul quand son code change et qu'aucune partie n'est en cours.
- En local : `node server/server.js`, puis dans la console du navigateur `localStorage.setItem('mythomachie.serveur', 'ws://127.0.0.1:8093/mythomachie/ws')`.

## Tests

- `node tests/sim_test.js` : partie IA contre IA de 20 minutes sans navigateur (cohérence, vagues d'attaque, récolte, passages d'âge).
- `python3 tests/smoke.py` : Playwright + Chrome (règles du dépôt, sélection et désélection, clic sur un bâtiment, âges verrouillés puis débloqués, partie accélérée, sauvegarde, téléchargement).
- `node server/test_server.js` : serveur local + clients WebSocket (salon, lancement, ordres, brouillard, discussion, reprise, salon gardé quand l'hôte se déconnecte).
- `python3 tests/online_test.py` : partie en ligne de bout en bout dans trois navigateurs (ordinateur, téléphone, onglet déjà ouvert) : invitation, connexion muette, désélection et sélection au doigt, rechargement, salon disparu.
