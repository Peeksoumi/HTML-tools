# Relais AIS de Lola

`relais_live.py` : script autonome (Python 3, bibliothèque standard) exécuté en service systemd sur le VPS.

- garde ouverte une connexion websocket vers **aisstream.io** (source principale, clé = identifiant systemd `aisstream_key`) ; AISVesselTracker puis Shiptrail ne sont interrogés (toutes les 15 s) que si aisstream est muet depuis 20 s quand le bac est en mouvement, 3 min quand il est à quai ; chaque changement d'état (aisstream, source, publication) est écrit dans le journal (`journalctl -u lola-relais`) ; garde **1 h maximum** de positions en mémoire vive (rien n'est écrit sur disque) ;
- sert aussi les positions aisstream brutes (sans fusion avec les secours, 1 h) sur `127.0.0.1:18791/aisstream`, lues par le collecteur du dépôt privé pour comparer les sources ;
- sert ces positions sur `127.0.0.1:18791/positions` (publié par nginx sous `/lola-direct/`, avec CORS) : c'est le « direct » lu par la page (lu aussi par la page `lola-position`) ;
- publie `positions.json` dans le dépôt public [Peeksoumi/lola-relais](https://github.com/Peeksoumi/lola-relais) dès qu'une nouvelle position arrive, au plus toutes les 15 s (GitHub recommande ≤ 6 pushes/min/dépôt), et au moins chaque minute même sans nouvelle position (battement de cœur, champ `maj`) : dépôt neuf, un seul commit, push forcé (aucun historique) ;
- la clé d'écriture du dépôt (`deploy_key`) et la clé aisstream (`aisstream_key`) ne sont jamais dans ce dépôt : elles sont fournies par systemd (`LoadCredential`).

Test : `python3 test_relais_live.py` (client websocket contre un faux serveur, lecture des messages, anneaux, points d'accès).

L'unité systemd (`lola-relais.service`) est maintenue côté serveur et pointe sur ce fichier.

## Sources de secours : vitesse et doublons
- AIS Vessel Tracker : vitesse (« Speed: X knots ») et cap (« Course: Y° ») lus sur la page ; heure = `temporalCoverage`, à défaut « Position last updated » (précision à la minute).
- Une même position relevée par deux sources (≤ 2 m, ≤ 45 s d'écart) n'est gardée qu'une fois : on conserve l'heure la plus ancienne et on complète vitesse et cap manquants.

## Choix de la source affichée
`positions.json` indique dans `source` celle qui détient la dernière position connue, choisie avec la latence médiane stable de chaque source (`LATENCE_S` : aisstream 9 s, avt 45 s, shiptrail 50 s, mesurées le 23/11/2026) :
aisstream tant que sa position a moins de 45 s (avt ne peut pas en avoir de plus récente), puis avt dès que sa position est plus récente que celle d'aisstream, puis shiptrail. Une source qui ne donne pas l'heure de sa position est datée de l'heure de réception moins sa latence.
