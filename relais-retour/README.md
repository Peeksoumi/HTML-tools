# relais-retour

Où rapporter un colis ? Liste et carte des **points Mondial Relay** (commerces et lockers) et des **autres réseaux**
(Relais Colis, Pickup/Chronopost, La Poste/Colissimo, UPS Access Point, DPD, Vinted Go) autour d'une position.
Page autonome (aucun serveur du site) : `index.html`, avec bouton « Télécharger la page ».

- **Position** : ville/adresse (Nominatim), coordonnées « lat, lon », ou bouton 📍 Ma position ; « Chercher au centre de la carte ».
- **Filtres** : réseau du bordereau de retour (Mondial Relay coché par défaut), type (commerce / locker / bureau de poste), « ouvert maintenant ».
- **Horaires** : balise OSM `opening_hours` (sous-ensemble courant, heure de Paris) + lien vers la fiche Google Maps pour recouper.
- **Itinéraire** : bouton Google Maps (à pied, voiture, transports, vélo) ; départ = position actuelle de l'appareil, ou l'adresse saisie.
- **Actualisation** : requête Overpass à chaque nouvelle zone, cache navigateur 24 h, bouton 🔄 pour forcer ; la date de la base OSM est affichée.

## Pourquoi OpenStreetMap
L'API officielle Mondial Relay ne permet pas de lister le réseau (une recherche par appel, identifiants client requis) :
seuls les points saisis dans OSM sont visibles, donc la liste est **incomplète**. Si un jour des identifiants sont disponibles,
il faudra un petit serveur pour les cacher (comme `parking_gratuit`).

## Tests
```
node relais-retour/tests/test_core.js     # réseaux, types, horaires, liens
python3 relais-retour/tests/test_page.py  # page complète avec réseau simulé (Playwright + Chrome)
```
