# Alertes « perturbation » du bac Lola

- **GitHub Actions** (`.github/workflows/alerte-bac-lola.yml`, toutes les 10 min environ) lit les perturbations de l'API du Département et envoie les notifications (`envoyer.py`).
- **Serveur OVH** (`serveur_abonnements.py`) : garde seulement la liste des abonnés.
- **Page** (`../notifs.js`, `../push-sw.js`) : le bouton n'apparaît que si le serveur répond.

## Mise en service
1. Générer les clés, sur une machine de confiance : `npx web-push generate-vapid-keys`, et un mot de passe : `openssl rand -base64 32`.
2. Serveur : créer `/etc/abonnements-bac-lola.env` (droits 600) avec `ABO_CLE_PUBLIQUE=` et `ABO_JETON=`. Ne pas y mettre la clé privée : le serveur n'en a pas besoin.
3. Installer `abonnements-bac-lola.service` (adapter le chemin), puis `systemctl enable --now abonnements-bac-lola`.
4. nginx, dans le bloc HTTPS de `peeksoumi.com` :
   ```nginx
   location /abonnements/ {
       proxy_pass http://127.0.0.1:18795;
       proxy_set_header X-Real-IP $remote_addr;
       client_max_body_size 8k;
   }
   ```
5. GitHub, *Settings → Secrets and variables → Actions* : `VAPID_PRIVATE_KEY` (clé privée) et `ABO_JETON` (même mot de passe).
6. Ouvrir la page, toucher « M'alerter des perturbations », puis *Actions → Alerte bac Lola → Run workflow* en cochant l'essai.

## Données et limites
- Gardé sur le serveur : l'adresse d'abonnement donnée par le navigateur et ses deux clés. nginx peut journaliser les adresses IP.
- Un abonnement est par appareil, navigateur et site (GitHub Pages et peeksoumi.com sont distincts : s'abonner sur un seul).
- GitHub peut retarder ou sauter une exécution planifiée, et la désactive après 60 jours sans activité du dépôt.
- La liste des perturbations déjà signalées est dans le cache GitHub Actions ; s'il est perdu, une perturbation en cours est signalée à nouveau.
- Le format réel d'une perturbation n'a pas encore été observé.

Test : `python3 test_notifications.py`.
