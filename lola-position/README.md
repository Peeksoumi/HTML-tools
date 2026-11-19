# Lola — position AIS en direct

Page autonome (un seul `index.html`) qui affiche la position du bac de Loire **Lola** (MMSI 227158520, Indret ⇄ Basse-Indre) le plus près possible du temps réel :
latitude, longitude, vitesse, cap, heure et âge du relevé, carte du chenal avec le bac, et la source utilisée.

## Méthode
1. **Trois sources en parallèle**, la page garde le relevé à l'heure AIS la plus récente (égalité : worker, puis relais, puis GitHub) :
   - **worker AIS** (toutes les 5 s) : flux temps réel d'[aisstream.io](https://aisstream.io) filtré sur le MMSI, voir [`worker/`](worker/) ;
   - **relais du site** `peeksoumi.com/lola-direct/positions` (toutes les 15 s) : AISVesselTracker, Shiptrail en secours, voir [`../bac-lola/relais`](../bac-lola/relais/) ;
   - **copie GitHub** [Peeksoumi/lola-relais](https://github.com/Peeksoumi/lola-relais) (toutes les 60 s, seulement si les deux autres n'ont rien de récent).
2. **Entre deux relevés** : estimation en ligne droite d'après la vitesse et le cap (60 s au plus), lissée sur 0,7 s à l'arrivée du relevé suivant.
3. **Fraîcheur** : « En direct » sous 2 min, avertissement jusqu'à 10 min, alerte rouge au-delà ; « Connexion perdue » si les trois sources échouent (les dernières valeurs restent affichées).
   Une source qui échoue 3 fois de suite n'est plus interrogée qu'une fois par ~6 périodes.
4. **Tracé** : aller = GTFS officiel « Bacs de Loire en Loire-Atlantique » ; retour = symétrique par rapport à l'axe nord-sud du chenal.

Pas de bouton « Télécharger la page » : l'outil n'a de sens qu'avec ses sources distantes.

## Worker AIS (`worker/`)
Worker Cloudflare + Durable Object qui garde une connexion websocket vers aisstream.io (les navigateurs n'y ont pas accès : la clé d'API serait exposée), mémorise le dernier relevé et le sert en JSON (`?format=json`) ou en texte `lat lon vitesse cap HH:MM:SS`.
La connexion se ferme après 10 min sans interrogation. **La clé d'API n'est jamais dans le dépôt** : secret `AISSTREAM_KEY`.

Déploiement (depuis le dossier `worker/`) :
1. `npx wrangler deploy`
2. `npx wrangler secret put AISSTREAM_KEY` (clé gratuite sur aisstream.io)
3. contrôle : ouvrir `https://lola-ais.<compte>.workers.dev/?format=json` ; si l'adresse diffère de `URL_WORKER` dans `index.html`, la corriger.

Non testé contre aisstream.io au moment de l'écriture. La couverture de l'estuaire de la Loire par les récepteurs d'aisstream.io est à vérifier (`aisstream.io/coverage`) ; sans récepteur, la page vit sur le relais.

## Limites
- Un bac à quai n'émet qu'un relevé toutes les ~3 min ; la page ne peut pas être plus fraîche que ses sources.
- Le relais a environ 1 min de retard, la copie GitHub jusqu'à ~6 min.
- L'estimation est rectiligne (fausse dans les virages et à l'accostage). L'âge se calcule avec l'horloge de l'appareil.

## Tests
`node tests/test_page.js` : choix du relevé, repli entre sources, erreurs, estimation, alertes (faux DOM, aucun réseau).
