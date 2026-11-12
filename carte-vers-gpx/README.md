# Carte → GPX

Outil 100 % navigateur (un seul fichier `index.html`, aucune dépendance) qui redessine un itinéraire tracé sur une carte
(PDF ou image, ex. export SuisseMobile) et le convertit en GPX.

1. Charger le PDF / l'image : le tracé est détecté par sa couleur (🎯 pipette, ⬛ zones à exclure, 🟢 départ).
2. Caler la carte : 📍 un point sur une carte suisse avec grille km (LV95), 2 points ou plus sinon (Web Mercator).
3. ✂️ couper en étapes, altitudes swisstopo optionnelles, télécharger le GPX.

## Développement
- `src/core.js` : algorithmes (masque couleur, squelette, chaînage, grille, géodésie LV95, GPX) ;
  `src/template.html` : interface.
- `python3 build.py` régénère `index.html` (core.js inliné).
- Test : `python3 tests/smoke.py CARTE.pdf [URL]` (Playwright + Chrome).

Précision typique 10–50 m selon l'échelle de la carte. Recherche de lieu et altitudes : API swisstopo / OpenStreetMap.
