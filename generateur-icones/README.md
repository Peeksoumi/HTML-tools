# Générateur d'icônes

Quelques mots → une icône au style des tuiles de l'accueil (emoji sur pastille colorée), propositions au choix, puis « 🔍 Chercher des similaires » (symboles proches, couleurs, formes) et modification par demande (« plutôt un camion »).
Recherche hors ligne dans le dictionnaire français Unicode CLDR intégré (licence Unicode v3), complété par le lexique `ALIAS`. Régénération du dictionnaire : `python3 -I tools/emoji_data.py <annotations.json>`.

Outil 100 % navigateur (un seul `index.html`, aucune dépendance) : créer une icône à partir d'une image (import, glisser-déposer, Ctrl+V) ou d'un texte / emoji,
puis la modifier en direct par une demande en français (« fond dégradé bleu vert, cercle, texte blanc gras, ajoute une ombre »).

- Demandes : analyse par règles intégrées (couleurs, forme, arrondi, texte, taille, marge, ombre, reflet, bordure, rotation, police, « annule », « réinitialise »). Réglages manuels en complément.
- Option IA : avec une clé API Anthropic saisie par l'utilisateur, Claude (`claude-haiku-5-5`) traduit une demande libre en changements de réglages (validés par la page). Seuls la demande et les réglages partent vers `api.anthropic.com`, jamais l'image.
- Exports : PNG (16 à 512 px), `favicon.ico` multi-tailles, SVG, ZIP (tous les PNG + ICO + SVG), balise `<link rel="icon">` à coller.
- Test : `python3 tests/smoke.py` (Playwright + Chrome) ; exécuté aussi par GitHub Actions.
