# Carte → GPX

Outil 100 % navigateur (un seul fichier `index.html`, aucune dépendance) qui redessine un itinéraire tracé sur une carte
(PDF ou image, ex. export SuisseMobile) et le convertit en GPX.

1. Charger le PDF / l'image : la couleur du tracé est détectée automatiquement (🎯 pipette en secours, ⬛ zones à exclure, 🟢 départ). Une boucle dont les bouts se touchent est fermée.
2. Caler la carte : 📍 1 point sur une carte suisse avec grille km (LV95) ; ou 1 point + 📏 barre d'échelle pour une capture d'appli (barre détectée automatiquement, carte supposée orientée au nord) ; sinon 2 points ou plus.
3. ✂️ couper en étapes, altitudes swisstopo optionnelles, télécharger le GPX.

## Développement
- `src/core.js` : algorithmes (masque couleur, squelette, chaînage, grille, géodésie LV95, GPX) ;
  `src/template.html` : interface.
- `python3 build.py` régénère `index.html` (core.js inliné).
- Tests : `python3 tests/search_test.py` (recherche de lieu, services simulés) et `python3 tests/run_all.py [URL]` (Playwright + Chrome) ; les cas sont décrits dans `tests/cases.json`, les cartes d'exemple dans `tests/examples/`. Pour ajouter un exemple qui échoue : déposer l'image, ajouter une entrée dans `cases.json` (couleur attendue, longueur en km, boucle ou non).

Précision typique 10–50 m selon l'échelle de la carte. Recherche de lieu et altitudes : API swisstopo / OpenStreetMap.
