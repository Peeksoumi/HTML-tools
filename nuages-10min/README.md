# nuages-10min — nuages des 10 prochaines minutes

Page autonome (un seul `index.html`, Leaflet chargé depuis unpkg) qui anime sur une carte les nuages vus par satellite
pendant l'heure écoulée, puis une **estimation** de leur position maintenant et dans 10 minutes.

## Méthode
1. **Images observées** : Meteosat-12 (MTG-I1), canal infrarouge 10,5 µm, une image toutes les 10 min, via le WMS public EUMETView
   (`https://view.eumetsat.int/geoserver/wms`, couche `mtg_fd:ir105_hrfi`). La page sonde les 7 derniers créneaux de 10 min pour trouver la dernière image disponible
   (latence habituelle 10 à 20 min) et affiche les 6 dernières.
2. **Estimation** : la dernière image est déplacée du vent × durée écoulée (image → maintenant, puis → +10 min). Le vent vient d'Open-Meteo (modèles Météo-France),
   niveau au choix 850 / 700 / 500 hPa, interpolé à l'heure courante au centre de la carte. Le décalage est appliqué en demandant au WMS la même image avec une emprise (EPSG:3857) décalée.
3. Fond de carte OpenStreetMap assombri par un filtre CSS (sans clé d'API ; CARTO en exige désormais une) : le mélange « screen » fait ressortir les nuages blancs de l'infrarouge.

## Limites
- Aucun service public gratuit ne publie de prévision de nuages à 10 min : RainViewer a supprimé son satellite et ses prévisions gratuits au 1er janvier 2026.
  L'estimation est donc une simple advection : pas de formation, de disparition ni de cisaillement (vent uniforme sur la zone affichée).
- L'infrarouge montre surtout les nuages hauts et épais ; les nuages bas sont peu contrastés (choisir 850 hPa pour les déplacer).
- Le nom de couche WMS et la prise en charge d'EPSG:3857 n'ont pas pu être testés en direct à la création (pas d'accès réseau) ; le message d'erreur de la page l'indiquera si besoin.

## Développement
Test des fonctions pures (bloc `==CORE==` de la page) : `node tests/test_core.js`.

## Sources
- EUMETSAT, EUMETView (images MTG). - Open-Meteo (CC BY 4.0). - © OpenStreetMap contributors.
