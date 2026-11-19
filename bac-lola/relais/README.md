# Relais AIS de Lola

`relais_live.py` : script autonome (Python 3, bibliothèque standard) exécuté en service systemd sur le VPS.

- interroge AISVesselTracker puis Shiptrail (secours) toutes les 15 s, garde **30 min maximum** de positions en mémoire vive (rien n'est écrit sur disque) ;
- sert ces positions sur `127.0.0.1:18791/positions` (publié par nginx sous `/lola-direct/`, avec CORS) : c'est le « direct » lu par la page ;
- toutes les 5 min, publie `positions.json` dans le dépôt public [Peeksoumi/lola-relais](https://github.com/Peeksoumi/lola-relais) : dépôt neuf, un seul commit, push forcé (aucun historique) ;
- la clé d'écriture du dépôt (`deploy_key`) n'est jamais dans ce dépôt : elle est fournie par systemd (`LoadCredential`).

L'unité systemd (`lola-relais.service`) est maintenue côté serveur et pointe sur ce fichier.
