# Fusion de PDF

Outil 100 % navigateur (un seul `index.html`) : charger plusieurs PDF, réordonner les pages par glisser-déposer,
supprimer des pages, puis exporter un PDF fusionné.

- Aucun CDN : pdf-lib 1.17.1 et pdf.js 6.2.108 (build `legacy`) sont dans `vendor/` (avec leurs licences) et intégrés à `index.html`, qui fonctionne hors ligne.
- Une CSP interdit les connexions réseau des scripts.
- Modifier `src/template.html` puis lancer `python3 build.py` (ne pas éditer `index.html` à la main).
- Export : chaque page est rendue en image PNG (échelle 4, ≈ 288 dpi) puis réinsérée → **le texte n'est plus sélectionnable** et le fichier est plus lourd.
- Test : `python3 tests/make_pdfs.py && python3 tests/smoke.py` (Playwright + Chrome) ; exécuté aussi par GitHub Actions.
