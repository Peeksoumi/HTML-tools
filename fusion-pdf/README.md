# Fusion de PDF

Outil 100 % navigateur (un seul `index.html`) : charger plusieurs PDF, réordonner les pages par glisser-déposer,
supprimer des pages, puis exporter un PDF fusionné.

- Dépendances via CDN : pdf-lib 1.17.1 (assemblage) et pdf.js 3.4.120 (miniatures / rendu).
- Export : chaque page est rendue en image PNG (échelle 4, ≈ 288 dpi) puis réinsérée → **le texte n'est plus sélectionnable** et le fichier est plus lourd.
- Test : `python3 tests/make_pdfs.py && python3 tests/smoke.py` (Playwright + Chrome) ; exécuté aussi par GitHub Actions.
