# meteo-radar — nuages et pluie des 10 prochaines minutes

Page autonome (un seul `index.html`, Leaflet chargé depuis unpkg) qui anime sur une carte, au choix, les **nuages** (satellite) ou la **pluie** (radar)
pendant l'heure écoulée, puis une **estimation** de leur position maintenant et dans 10 minutes. Couche choisie par les boutons ☁️ / 🌧️ (ou `#pluie` dans l'adresse).

## Méthode
1. **Images observées** : Meteosat-12 (MTG-I1), canal infrarouge 10,5 µm, une image toutes les 10 min, via le WMS public EUMETView
   (`https://view.eumetsat.int/geoserver/wms`, couche `mtg_fd:ir105_hrfi`). La page sonde les 7 derniers créneaux de 10 min pour trouver la dernière image disponible
   (latence habituelle 10 à 20 min) et affiche les 6 dernières.
2. **Estimation** : la dernière image est déplacée du vent × durée écoulée (image → maintenant, puis → +10 min). Le vent vient d'Open-Meteo (modèles Météo-France),
   niveau au choix 850 / 700 / 500 hPa, interpolé à l'heure courante au centre de la carte. Le décalage est appliqué en demandant au WMS la même image avec une emprise (EPSG:3857) décalée.
3. Rendu : un filtre SVG (`feColorMatrix`) transforme la luminosité de l'infrarouge en opacité d'un blanc (sol chaud transparent, nuages froids opaques), posé sur l'imagerie Esri (World Imagery), avec les noms de lieux Esri au-dessus des nuages. Repli sur OpenStreetMap si Esri ne répond pas.

## Pluie (radar)
- Source : API publique gratuite de RainViewer (`https://api.rainviewer.com/public/weather-maps.json` : liste des images des 2 dernières heures, pas de 10 min ; tuiles 512 px, zoom natif max 7, palette « Universal Blue » ; limite 100 requêtes/IP/min). Le service n'offre plus de prévision ni de satellite en gratuit depuis le 1er janvier 2026.
- Les 6 dernières images sont affichées ; « maintenant » et « +10 min » = dernière image radar décalée du vent (même méthode que les nuages), en décalant en pixels le conteneur de la couche de tuiles.

## Limites
- Aucun service public gratuit ne publie de prévision de nuages à 10 min : RainViewer a supprimé son satellite et ses prévisions gratuits au 1er janvier 2026.
  L'estimation est donc une simple advection : pas de formation, de disparition ni de cisaillement (vent uniforme sur la zone affichée).
- L'infrarouge montre surtout les nuages hauts et épais ; les nuages bas sont peu contrastés (choisir 850 hPa pour les déplacer).
- Le nom de couche WMS et la prise en charge d'EPSG:3857 n'ont pas pu être testés en direct à la création (pas d'accès réseau) ; le message d'erreur de la page l'indiquera si besoin.

## Développement
Test des fonctions pures (bloc `==CORE==` de la page) : `node tests/test_core.js`.

## Sources
- EUMETSAT, EUMETView (images MTG). - Open-Meteo (CC BY 4.0). - Esri (World Imagery, Reference/World_Boundaries_and_Places) ; repli © OpenStreetMap contributors.
