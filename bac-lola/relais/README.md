# Relais AIS de Lola

`relais_live.py` : script autonome (Python 3, bibliothèque standard) exécuté en service systemd sur le VPS.

- garde ouverte une connexion websocket vers **aisstream.io** (source principale, clé = identifiant systemd `aisstream_key`) ; AISVesselTracker puis Shiptrail ne sont interrogés (toutes les 15 s) que si aisstream est muet depuis 3 min ; garde **1 h maximum** de positions en mémoire vive (rien n'est écrit sur disque) ;
- sert ces positions sur `127.0.0.1:18791/positions` (publié par nginx sous `/lola-direct/`, avec CORS) : c'est le « direct » lu par la page (lu aussi par la page `lola-position`) ;
- publie `positions.json` dans le dépôt public [Peeksoumi/lola-relais](https://github.com/Peeksoumi/lola-relais) dès qu'une nouvelle position arrive, au plus toutes les 15 s (GitHub recommande ≤ 6 pushes/min/dépôt) : dépôt neuf, un seul commit, push forcé (aucun historique) ;
- la clé d'écriture du dépôt (`deploy_key`) et la clé aisstream (`aisstream_key`) ne sont jamais dans ce dépôt : elles sont fournies par systemd (`LoadCredential`).

Test : `python3 test_relais_live.py` (client websocket contre un faux serveur, lecture des messages, anneaux, points d'accès).

L'unité systemd (`lola-relais.service`) est maintenue côté serveur et pointe sur ce fichier.
