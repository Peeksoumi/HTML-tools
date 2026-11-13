# HTML-tools — règles pour Claude

Dépôt public d'outils web (une page HTML autonome par dossier). Publié automatiquement sur le VPS OVH
(`http://141.227.151.70:8080/<dossier>/`) : toute modification poussée dans `main` est en ligne en ~2 min.

## Règle obligatoire : lien vers les issues sur CHAQUE page
Toute page HTML créée ou modifiée dans ce dépôt doit afficher, de façon visible, un lien pour proposer des améliorations :

- lien principal (en-tête ou en haut de page), libellé « 💡 Proposer une amélioration », **pré-rempli avec le nom de l'outil** (titre `[<dossier>] ` + corps indiquant l'outil et son URL),
  pour que l'issue créée précise toujours de quelle page il s'agit : `https://github.com/Peeksoumi/HTML-tools/issues/new?title=%5B<dossier>%5D%20&body=...` (paramètres encodés ; `&` écrit `&amp;` dans le HTML) ;
- un seul lien par page : pas de doublon en pied de page (ni pour les issues, ni pour le téléchargement).

Toujours avec `target="_blank" rel="noopener"`. Exemple minimal :

```html
<a href="https://github.com/Peeksoumi/HTML-tools/issues/new?title=%5Bmon-outil%5D%20&amp;body=Outil%20concern%C3%A9%20%3A%20mon-outil%0A%0A" target="_blank" rel="noopener">💡 Proposer une amélioration</a>
```

À vérifier avant chaque commit, pour chaque page créée ou modifiée : `grep -c "HTML-tools/issues" <dossier>/index.html` doit donner au moins 1.
Pages antérieures à cette règle (ex. `fusion-pdf`) : ajouter le lien dès qu'on les modifie.
Références : `carte-vers-gpx/src/template.html`.

## Règle : bouton « Télécharger la page » si l'outil est utilisable seul
Quand un outil fonctionne de façon autonome (tout le traitement se fait dans le navigateur, sans serveur ni API maison), la page doit proposer
un bouton pour télécharger le fichier HTML et l'utiliser hors du site, à côté du lien « Proposer une amélioration » :

```html
<a href="index.html" download="<dossier>.html">⬇️ Télécharger la page</a>
```

- Le fichier téléchargé doit rester fonctionnel : CSS/JS inlinés ; si des bibliothèques viennent d'un CDN, le dire (connexion requise), par ex. dans l'infobulle `title` du bouton.
- Ne pas mettre ce bouton si l'outil dépend d'un serveur ou d'un service distant.
- À vérifier avant chaque commit : `grep -c "download=" <dossier>/index.html` doit donner au moins 1 pour les outils autonomes.

## Conventions
- Un dossier par outil, avec `index.html` autonome (CSS/JS inlinés), un `README.md`, et un test si possible.
- Ne pas ajouter de dépendance externe sans nécessité ; rien n'est envoyé à un serveur tiers sans le dire dans la page.
- Tout nouvel outil doit avoir sa carte (Ouvrir + Télécharger la page) dans `index.html` à la racine, la page d'accueil du site.
- Après modification : tester, puis fusionner dans `main` (le serveur se met à jour seul).

---

# Principes généraux de comportement

Source : <https://github.com/multica-ai/andrej-karpathy-skills> (CLAUDE.md, d'après les observations d'Andrej Karpathy), repris tel quel ci-dessous.
En cas de conflit, les règles propres à ce dépôt (ci-dessus) priment.

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
