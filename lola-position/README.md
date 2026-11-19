# Lola — position AIS en direct (aisstream.io)

Page autonome (un seul `index.html`) qui affiche la position du bac de Loire **Lola** (MMSI 227158520, Indret ⇄ Basse-Indre) à partir des **seules données d'aisstream.io** :
latitude, longitude, vitesse, cap, heure et âge du relevé, carte du chenal avec le bac.

## Où mettre la clé d'API
**Dans un secret du worker Cloudflare `lola-ais`, nom exact `AISSTREAM_KEY`. Jamais dans `index.html` ni dans ce dépôt (public).**
aisstream.io refuse les connexions directes depuis un navigateur (la clé serait lisible par tous les visiteurs de la page) : la page lit le worker, et le worker lit aisstream.io avec la clé.

- Ligne de commande, depuis `worker/` : `npx wrangler secret put AISSTREAM_KEY`, puis coller la clé quand elle est demandée.
- Tableau de bord Cloudflare : *Workers & Pages* → `lola-ais` → *Settings* → *Variables and Secrets* → *Add* → type **Secret**, nom `AISSTREAM_KEY`, valeur = la clé → *Deploy*.

## Déploiement du worker (`worker/`)
1. `npx wrangler login` puis `npx wrangler deploy` (crée le worker `lola-ais`).
2. Ajouter le secret `AISSTREAM_KEY` (voir ci-dessus).
3. Contrôle : ouvrir `https://lola-ais.<compte>.workers.dev/?format=json` ; au premier appel la connexion s'ouvre, recharger après une minute. Si l'adresse diffère de `URL_WORKER` dans `index.html`, la corriger.

Le worker (Durable Object) garde une connexion websocket vers aisstream.io filtrée sur le MMSI, dans une boîte autour de l'estuaire (Nantes → Saint-Nazaire), mémorise le dernier relevé et le sert en JSON (`?format=json`) ou en texte `lat lon vitesse cap HH:MM:SS`. La connexion se ferme après 10 min sans interrogation.
Non testé contre aisstream.io au moment de l'écriture.

## Méthode (page)
1. Interroge le worker toutes les 5 s et affiche son dernier relevé (heure AIS) ; un relevé plus ancien que celui affiché est ignoré.
2. Entre deux relevés : estimation en ligne droite d'après la vitesse et le cap (60 s au plus), lissée sur 0,7 s à l'arrivée du relevé suivant.
3. Fraîcheur : « En direct » sous 2 min, avertissement jusqu'à 10 min, alerte rouge au-delà ; « Worker AIS injoignable » après deux échecs de suite (les dernières valeurs restent affichées). Après 3 échecs, les essais sont espacés.
4. Tracé : aller = GTFS officiel « Bacs de Loire en Loire-Atlantique » ; retour = symétrique par rapport à l'axe nord-sud du chenal.

Pas de bouton « Télécharger la page » : l'outil n'a de sens qu'avec le worker.

## Limites
- Rien ne s'affiche tant que le worker n'est pas déployé et qu'un récepteur d'aisstream.io (réseau de bénévoles) ne capte pas l'estuaire : couverture à vérifier sur `aisstream.io/coverage`.
- Un bac à quai n'émet qu'un relevé toutes les ~3 min ; la page ne peut pas être plus fraîche que la source.
- L'estimation est rectiligne (fausse dans les virages et à l'accostage). L'âge se calcule avec l'horloge de l'appareil.

## Tests
`node tests/test_page.js` : relevé, erreurs du worker, estimation, alertes de fraîcheur (faux DOM, aucun réseau).
