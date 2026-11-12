# HTML-tools — règles pour Claude

Dépôt public d'outils web (une page HTML autonome par dossier). Publié automatiquement sur le VPS OVH
(`http://141.227.151.70:8080/<dossier>/`) : toute modification poussée dans `main` est en ligne en ~2 min.

## Règle obligatoire : lien vers les issues sur CHAQUE page
Toute page HTML créée ou modifiée dans ce dépôt doit afficher, de façon visible, un lien pour proposer des améliorations :

- lien principal (en-tête ou en haut de page) : `https://github.com/Peeksoumi/HTML-tools/issues/new`, libellé « 💡 Proposer une amélioration » ;
- lien secondaire (pied de page ou notes) : `https://github.com/Peeksoumi/HTML-tools/issues`.

Toujours avec `target="_blank" rel="noopener"`. Exemple minimal :

```html
<a href="https://github.com/Peeksoumi/HTML-tools/issues/new" target="_blank" rel="noopener">💡 Proposer une amélioration</a>
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

- Le fichier téléchargé doit rester fonctionnel : CSS/JS inlinés ; si des bibliothèques viennent d'un CDN, le dire dans la page (connexion requise).
- Ne pas mettre ce bouton si l'outil dépend d'un serveur ou d'un service distant.
- À vérifier avant chaque commit : `grep -c "download=" <dossier>/index.html` doit donner au moins 1 pour les outils autonomes.

## Conventions
- Un dossier par outil, avec `index.html` autonome (CSS/JS inlinés), un `README.md`, et un test si possible.
- Ne pas ajouter de dépendance externe sans nécessité ; rien n'est envoyé à un serveur tiers sans le dire dans la page.
- Après modification : tester, puis fusionner dans `main` (le serveur se met à jour seul).
