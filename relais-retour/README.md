# relais-retour

Où rapporter un colis ? Liste et carte des **points Mondial Relay** (commerces et lockers) et des **autres réseaux**
(Relais Colis, Pickup/Chronopost, La Poste/Colissimo, UPS Access Point, DPD, Vinted Go) autour d'une position.
Page autonome (aucun serveur du site) : `index.html`, avec bouton « Télécharger la page ».

- **Position** : ville/adresse (Nominatim), coordonnées « lat, lon », ou bouton 📍 Ma position ; « Chercher au centre de la carte ».
- **Filtres** : réseau du bordereau de retour (Mondial Relay coché par défaut), type (commerce / locker / bureau de poste), « ouvert maintenant ».
- **Horaires** : balise OSM `opening_hours` (sous-ensemble courant, heure de Paris) + lien vers la fiche Google Maps pour recouper.
- **Itinéraire** : bouton Google Maps (à pied, voiture, transports, vélo) ; départ = position actuelle de l'appareil, ou l'adresse saisie.
- **Sites officiels** : liens Mondial Relay et Pickup / Chronopost ouverts avec le code postal et la ville du départ pré-remplis (Nominatim inverse). Paramètres Mondial Relay (`codePostal`, `ville`) non documentés : à vérifier en usage.
- **Actualisation** : requête Overpass à chaque nouvelle zone, cache navigateur 24 h, bouton 🔄 pour forcer ; la date de la base OSM est affichée.

## Sources de données (⚙️ « Sources de données » dans la page)
Aucune requête n'est envoyée tant que la **position de départ** n'est pas connue (adresse ou 📍). Ensuite chaque source activée est
interrogée en parallèle, puis les résultats sont fusionnés (même réseau + même type à moins de 40 m ; l'API l'emporte, OSM complète).
Une source en panne n'empêche pas d'afficher les autres.

| Source | Clé | Remarque |
|---|---|---|
| OpenStreetMap (Overpass) | non | par défaut ; incomplète pour Mondial Relay |
| API relais (URL au choix) | selon l'API, **côté serveur** | contrat ci-dessous ; jeton Bearer facultatif, gardé dans le navigateur |

### Contrat de l'API relais
`GET <url>?lat=47.218400&lon=-1.553600&rayon=3000` (rayon en mètres) → JSON : une liste, ou `{ "points": [...] }`, de
```json
{ "id": "012345", "lat": 47.2, "lon": -1.5, "nom": "Tabac du Port", "adresse": "4 rue X, 44000 Nantes",
  "reseau": "mondial", "type": "commerce", "horaires": "Mo-Fr 09:00-12:30,14:00-19:00; Sa 09:00-12:30" }
```
- `reseau` : `mondial`, `relaiscolis`, `pickup`, `colissimo`, `ups`, `dpd`, `vinted` ou `autre` (toute autre valeur → `autre`).
- `type` : `commerce`, `locker` ou `poste` (sinon `commerce`). `horaires` : syntaxe OSM `opening_hours`, ou vide.
- `lat`/`lon` obligatoires ; les points invalides sont ignorés. Réponse en CORS (`Access-Control-Allow-Origin`) si l'API est sur un autre domaine.
- **Les clés des transporteurs (Mondial Relay, DPD, Sendcloud…) restent sur ce serveur**, jamais dans la page : le serveur appelle l'API du transporteur
  (Mondial Relay : une recherche par appel, 30 points max, identifiants fournis par leur contrat) et convertit la réponse vers ce format.

## Pourquoi OpenStreetMap
L'API officielle Mondial Relay ne permet pas de lister le réseau (une recherche par appel, identifiants client requis) :
seuls les points saisis dans OSM sont visibles, donc la liste est **incomplète**. Si un jour des identifiants sont disponibles,
il faudra un petit serveur pour les cacher (comme `parking_gratuit`).

## Tests
```
node relais-retour/tests/test_core.js     # réseaux, types, horaires, liens
python3 relais-retour/tests/test_page.py  # page complète avec réseau simulé (Playwright + Chrome)
```
