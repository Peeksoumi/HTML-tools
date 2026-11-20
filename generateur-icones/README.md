# Générateur d'icônes

Outil 100 % navigateur (un seul `index.html`, aucune dépendance) : créer une icône à partir d'une image (import, glisser-déposer, Ctrl+V) ou d'un texte / emoji,
puis la modifier en direct par une demande en français (« fond dégradé bleu vert, cercle, texte blanc gras, ajoute une ombre »).

- Demandes : analyse par règles intégrées (couleurs, forme, arrondi, texte, taille, marge, ombre, reflet, bordure, rotation, police, « annule », « réinitialise »). Réglages manuels en complément.
- Option IA : avec une clé API Anthropic saisie par l'utilisateur, Claude (`claude-haiku-5-5`) traduit une demande libre en changements de réglages (validés par la page). Seuls la demande et les réglages partent vers `api.anthropic.com`, jamais l'image.
- Exports : PNG (16 à 512 px), `favicon.ico` multi-tailles, SVG, ZIP (tous les PNG + ICO + SVG), balise `<link rel="icon">` à coller.
- Test : `python3 tests/smoke.py` (Playwright + Chrome) ; exécuté aussi par GitHub Actions.
