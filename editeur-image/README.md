# editeur-image

Éditeur d'image dans le navigateur : page autonome `index.html`, avec bouton « Télécharger la page » (connexion requise pour les modèles et services).

1. **Détourer** : fond transparent via `@imgly/background-removal` (ONNX/WASM, local). Résultat en PNG.
2. **Modifier une zone** : on peint un masque, on écrit une phrase (anglais conseillé) ; inpainting Stable Diffusion via [AI Horde](https://aihorde.net)
   (gratuit, anonyme ou avec clé). L'image part réduite à ~512 px avec la zone en transparence ; le résultat n'est recopié que dans la zone peinte.
3. **Images similaires** : légende automatique (ViT-GPT2, Transformers.js) ou mots saisis → Openverse + Wikimedia Commons, classement par similarité CLIP (local).
   Liens de recherche inversée (Google Lens, TinEye, Yandex, Bing) avec bouton « Copier l'image ».

« Annuler » revient en arrière ; « Télécharger PNG » exporte le résultat.

## Test
`python3 editeur-image/tests/smoke.py` (Playwright + Chrome) : charge la page, simule détourage, AI Horde, Openverse et Wikimedia, et vérifie
que seule la zone peinte est remplacée. Les vrais services ne sont pas appelés ; leur comportement réel (CORS, format du masque, noms de modèles) est à vérifier en usage.
