# HTML-tools — règles pour Claude

Dépôt public d'outils web (une page HTML autonome par dossier). Publié automatiquement sur le VPS OVH
(`http://141.227.151.70:8080/<dossier>/`) : toute modification poussée dans `main` est en ligne en ~2 min.

## Règle obligatoire : lien vers les issues sur CHAQUE page
Toute page HTML créée ou modifiée dans ce dépôt doit afficher, de façon visible, un lien pour proposer des améliorations :

- lien principal (en-tête ou en haut de page), libellé « 💡 Proposer une amélioration », **pré-rempli avec le nom de l'outil** (titre `[<dossier>] ` + corps indiquant l'outil, sans adresse de site),
  pour que l'issue créée précise toujours de quelle page il s'agit : `https://github.com/Peeksoumi/HTML-tools/issues/new?title=%5B<dossier>%5D%20&body=...` (paramètres encodés ; `&` écrit `&amp;` dans le HTML) ;
- un seul lien par page : pas de doublon en pied de page (ni pour les issues, ni pour le téléchargement).

Toujours avec `target="_blank" rel="noopener"`. Exemple minimal :

```html
<a href="https://github.com/Peeksoumi/HTML-tools/issues/new?title=%5Bmon-outil%5D%20&amp;body=Outil%20concern%C3%A9%20%3A%20mon-outil%0A%0A" target="_blank" rel="noopener">💡 Proposer une amélioration</a>
```

À vérifier avant chaque commit, pour chaque page créée ou modifiée : `grep -c "HTML-tools/issues" <dossier>/index.html` doit donner au moins 1.
Pages antérieures à cette règle (ex. `fusion-pdf`) : ajouter le lien dès qu'on les modifie.
Références : `carte-vers-gpx/src/template.html`.

## Règle obligatoire : icône (favicon) sur CHAQUE page
Toute page HTML (accueil comprise) déclare une icône dans son `<head>`, juste après `<title>`, en SVG inliné (data URI : pas de fichier externe, la page téléchargée garde son icône) :
emoji sur une pastille colorée aux coins arrondis. Utiliser la même icône et la même couleur pour le raccourci de l'outil sur la page d'accueil.

```html
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='22' fill='%234f46e5'/%3E%3Ctext x='50' y='70' font-size='60' text-anchor='middle'%3E🧰%3C/text%3E%3C/svg%3E">
```

- `#` écrit `%23` dans la couleur. Pages générées : modifier le gabarit (`src/template.html`) puis relancer `build.py`.
- À vérifier avant chaque commit : `grep -c 'rel="icon"' <dossier>/index.html` doit donner 1.
- Tout nouvel outil ajoute aussi sa tuile (icône + nom court) dans la grille de raccourcis `.launcher` en haut de `index.html` (style écran d'accueil Android).

## Règle obligatoire : page installable (PWA) sur CHAQUE page
Chrome Android ne propose « Installer » que si la page ouverte déclare le manifeste ET que le service worker est enregistré. Un utilisateur qui arrive
directement sur un outil (sans passer par l'accueil) obtient sinon « Impossible d'installer cette appli ». Toute page HTML (accueil comprise) contient donc,
dans son `<head>`, juste après `<link rel="icon" …>` :

```html
<link rel="manifest" href="manifest.json">
<script>if('serviceWorker' in navigator)navigator.serviceWorker.register('../sw.js').catch(function(){});</script>
```

- **Proposition d'installation** : juste après ces deux lignes, `<script src="../install.js" defer></script>` (`install.js` sur l'accueil). Il affiche le bandeau « Installer » ; dans `mythomachie/build.py`, sans `data-m`.
  À vérifier : `grep -c 'install.js' <dossier>/index.html` doit donner 1.
- **Bouton « 📲 Installer l’appli » sur CHAQUE page**, à côté de « ⬇️ Télécharger la page » (à défaut, à côté de « 💡 Proposer une amélioration »). `install.js` l'ajoute seul :
  ne pas l'écrire en dur. Il copie le style du lien voisin et repère le bouton de téléchargement par `download="<dossier>.html"` (garder ce nom exact).
  Il est absent de la page téléchargée (`file:`) et de l'appli installée. À vérifier dans un navigateur : un seul `.bouton-installer` par page, bien placé sur écran de téléphone.
- **Chaque application a son propre manifeste** (`<dossier>/manifest.json`) avec ses propres icônes (`<dossier>/icons/`) : c'est le manifeste, pas le favicon,
  qui fixe l'icône de l'appli installée. Ne jamais pointer une page d'outil vers `../manifest.json` (elle prendrait l'icône de l'accueil).
- Ne pas écrire ces fichiers à la main : après tout nouvel outil ou tout changement de favicon, de `<title>` ou de nom de tuile, lancer `python3 tools/gen_manifests.py`
  et committer le résultat (il génère aussi les icônes de l'accueil ; seul le `manifest.json` racine est tenu à la main).
- Chemins relatifs uniquement (`manifest.json`, `../sw.js` ; `sw.js` sur l'accueil ; dans le manifeste, `start_url` et `scope` = `./`, icônes en `icons/…`) :
  l'icône est ainsi la même quel que soit le site d'installation (VPS, `peeksoumi.com`, GitHub Pages). Le service worker reste unique, à la racine.
- Pages générées : modifier le gabarit (`src/template.html` ou `build.py`) puis relancer `build.py`. Dans `mythomachie/build.py` (f-string), écrire `{{}}` pour `{}`, et ne pas marquer ces deux lignes `data-m` (elles ne doivent pas être dans la page téléchargée).
- À vérifier avant chaque commit : `grep -c 'rel="manifest" href="manifest.json"' <dossier>/index.html` doit donner 1, et `<dossier>/manifest.json` + `<dossier>/icons/` existent.

## Règle obligatoire : mention GitHub en bas de CHAQUE page
Toute page HTML (accueil comprise) se termine par la mention ci-dessous, tout en bas du contenu (après « Fonctionnement et sources » et tout pied de page).
Elle ne s'affiche **que sur github.io** : masquée par défaut, le script qui la suit la révèle (rien sur le VPS, `peeksoumi.com` ni la page téléchargée). Copier les deux lignes ensemble :

```html
<p class="depot-github" hidden style="grid-column:1/-1;margin:16px 0 0;padding:0 8px;text-align:center;font-size:13px;opacity:.75">Cette page est stockée sur GitHub : <a href="https://github.com/Peeksoumi/HTML-tools" target="_blank" rel="noopener" style="color:inherit">Peeksoumi/HTML-tools</a></p>
<script>if(location.hostname.endsWith('.github.io'))document.currentScript.previousElementSibling.hidden=false</script>
```

- Pages générées : la placer dans `src/template.html` (ou `mythomachie/src/body.html`, dans le menu) puis relancer `build.py`.
- À vérifier avant chaque commit : `grep -c 'class="depot-github"' <dossier>/index.html` doit donner 1.

## Règle : bouton « Télécharger la page » si l'outil est utilisable seul
Quand un outil fonctionne de façon autonome (tout le traitement se fait dans le navigateur, sans serveur ni API maison), la page doit proposer
un bouton pour télécharger le fichier HTML et l'utiliser hors du site, à côté du lien « Proposer une amélioration » :

```html
<a href="index.html" download="<dossier>.html">⬇️ Télécharger la page</a>
```

- Le fichier téléchargé doit rester fonctionnel : CSS/JS inlinés ; si des bibliothèques viennent d'un CDN, le dire (connexion requise), par ex. dans l'infobulle `title` du bouton.
- Ne pas mettre ce bouton si l'outil dépend d'un serveur ou d'un service distant.
- À vérifier avant chaque commit : `grep -c "download=" <dossier>/index.html` doit donner au moins 1 pour les outils autonomes.

## Règle obligatoire : section « Fonctionnement et sources » en bas de CHAQUE page d'outil
Toute page d'outil (un dossier = une page ; la page d'accueil en est exemptée) se termine (avant la seule mention GitHub) par une section visible, synthétique et structurée,
qui explique comment l'outil produit son résultat et d'où viennent les données. Format fixe, trois sous-titres, quelques puces courtes (≤ 2 lignes chacune) :

```html
<div class="fonct" id="fonctionnement">
  <h2>Fonctionnement et sources</h2>
  <h3>Fonctionnement</h3><ul><li><b>Étape</b> : méthode, formule ou modèle utilisé…</li></ul>
  <h3>Sources de données</h3><ul><li><b>Source</b> : ce qu'elle apporte (licence si connue)…</li></ul>
  <h3>Limites</h3><ul><li>Précision, hypothèses, cas non gérés…</li></ul>
</div>
```

- Fonctionnement : la méthode de calcul / le modèle, les hypothèses, et ce qui reste dans le navigateur ou part vers un serveur.
- Sources de données : chaque service ou jeu de données interrogé (nom, usage, licence) ; pour un outil sans donnée externe, écrire « Aucune donnée externe » et citer les bibliothèques chargées.
- Limites : précision réaliste et cas où l'outil se trompe.
- La section doit rester vraie : la mettre à jour dès que la méthode ou une source change (ne pas la laisser dériver du `README.md`).
- Pages générées (`src/template.html` + `build.py`) : modifier le gabarit puis relancer `build.py`, jamais `index.html` seul.
- Un seul bloc par page : pas de second « méthode / sources » (ex. `<details>`) qui ferait doublon.
- À vérifier avant chaque commit, pour chaque page créée ou modifiée : `grep -c 'id="fonctionnement"' <dossier>/index.html` doit donner 1.

## GitHub Pages : branche `gh-pages`
- `gh-pages` (publiée par GitHub Pages, dossier racine) est une copie de `main`, mise à jour par `.github/workflows/gh-pages.yml` à chaque push sur `main`.
- Ne jamais committer ni fusionner dans `gh-pages` : la synchronisation force la branche et efface ces changements. Tout passe par `main`.
- La publication sur le VPS, depuis `main`, est indépendante.
- Le site doit fonctionner à la fois à la racine d'un domaine (`peeksoumi.com`, VPS) et dans un sous-dossier (`…github.io/HTML-tools/`) : jamais de chemin commençant par `/` dans les pages, le manifeste ou le service worker.
- Les deux sites sont indépendants : aucune redirection, aucun lien ni appel d'une page vers l'autre site (`peeksoumi.com`, IP du VPS, `github.io`). Un serveur s'appelle par un chemin relatif au site consulté.
- GitHub Pages ne sert que des fichiers : une fonction qui dépend du serveur doit y afficher qu'elle est indisponible, ou utiliser une source publique tierce.
- Exceptions (les seules) :
  - la page Mythomachie téléchargée (`file:`) utilise le serveur de jeu de `peeksoumi.com` ;
  - **abonnements aux notifications** (décision du 28/11/2026) : les pages, y compris sur GitHub Pages, peuvent appeler le serveur OVH (`https://peeksoumi.com`, HTTPS obligatoire) pour enregistrer ou supprimer un abonnement Web Push (et lire la clé publique nécessaire à l'inscription). Rien d'autre ne passe par cet appel.
- Garder `.nojekyll` à la racine (fichiers publiés tels quels).
- Après fusion, vérifier l'exécution du workflow dans l'onglet Actions.

## Notifications : GitHub Actions déclenche et envoie
- GitHub Actions déclenche et envoie les notifications ; le serveur OVH ne fait que garder la liste des destinataires.
- Clé privée VAPID et accès à la liste : dans les secrets GitHub (et côté serveur), jamais dans le dépôt ni dans une page. La liste ne se lit qu'avec authentification.
- Serveur : n'accepter que les adresses des services de notification connus, limiter les inscriptions abusives ; supprimer les abonnements dont l'envoi répond 404 ou 410.
- Page : abonnement seulement après un clic, bouton « Désactiver », information sur les données conservées (à dire aussi dans « Fonctionnement et sources » et l'encart `.deps`).
- Un service worker propre à chaque alerte (portée `<dossier>/alertes/`) : ne jamais toucher à l'abonnement du service worker du site. Référence : `bac-lola/notifications/README.md`.
- Les tâches planifiées de GitHub peuvent être retardées ou sautées : ne pas les utiliser pour une alerte à la minute près.

## Conventions
- Un dossier par outil, avec `index.html` autonome (CSS/JS inlinés), un `README.md`, et un test si possible.
- Ne pas ajouter de dépendance externe sans nécessité ; rien n'est envoyé à un serveur tiers sans le dire dans la page.
- Tout nouvel outil doit avoir sa carte (Ouvrir + Télécharger la page) et sa tuile de raccourci (`.launcher`) dans `index.html` à la racine, la page d'accueil du site.
- Chaque carte de l'accueil a un encart `.deps` (dépendances de la page téléchargée et données envoyées, à tenir à jour avec la page) et un bouton « Installer l’appli » (`<dossier>/?installer`).
- Après modification : tester, puis fusionner dans `main` soi-même (procédure ci-dessus ; le serveur se met à jour seul).

## Fusionner dans `main` : procédure qui marche du premier coup
L'utilisateur autorise Claude à fusionner lui-même ses propres PR dans `main`, sans validation préalable (décision du 24/11/2026) : ne pas s'arrêter à « PR ouverte, à fusionner par vous ».
Depuis une session Claude Code, `gh pr create` et `gh pr merge` échouent (GraphQL indisponible, HTTP 403) : utiliser l'API REST.

```bash
git checkout -b <branche> && git add -A && git commit -m "…"            # message terminé par les lignes d'attribution demandées par la session
git -c push.negotiate=true push -u origin <branche>                       # dépôt cloné en --depth 1 : toujours ce push
gh api repos/Peeksoumi/HTML-tools/pulls -f title='…' -f head='<branche>' -f base='main' -f body='…' --jq '.number'
gh api -X PUT repos/Peeksoumi/HTML-tools/pulls/<numéro>/merge -f merge_method=squash --jq '.merged,.message'   # doit afficher « true »
```

- Une commande par appel (ne pas enchaîner création de PR, fusion et suppression de branche avec `&&`) : le contrôle d'autorisation de la session juge la commande entière, et un seul refus bloque tout.
- Ne pas utiliser `gh pr merge` ni `--delete-branch` ; laisser la branche en place (la supprimer seulement si l'utilisateur le demande).
- Si la fusion est refusée par le contrôle d'autorisation, ne pas la contourner : dire à l'utilisateur que la PR est prête et qu'il peut répondre « tu peux fusionner », puis relancer seulement la commande de fusion.
- Après fusion, la mise en ligne sur le VPS prend ~2 min ; un service systemd (ex. `lola-relais`) doit être redémarré côté serveur pour charger un script Python modifié.

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
