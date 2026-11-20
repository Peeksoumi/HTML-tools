# relais-retour

Où rapporter un colis ? Une page qui **liste les liens vers la carte des points relais et lockers de chaque réseau**, sur le site
officiel de ce réseau : Mondial Relay, Relais Colis, Pickup / Chronopost, La Poste / Colissimo, UPS Access Point, DPD, Vinted Go.
Page autonome (aucune donnée ni bibliothèque externe, rien n'est envoyé avant un clic) : `index.html`, avec bouton « Télécharger la page ».

- **Liens** : un bouton par carte officielle, ouvert dans un nouvel onglet.
- **Affichage dans la page** : les liens marqués `"embed": true` (Relais Colis, Pickup, La Poste) s'ouvrent dans un cadre intégré (« Afficher ici »). Les autres sites
  (Mondial Relay, Chronopost, UPS, DPD, Vinted Go) envoient un en-tête anti-iframe et s'ouvrent dans un onglet.
- **Lieu pré-rempli (facultatif)** : une ville ou un code postal saisi est ajouté en paramètre d'URL pour Mondial Relay (`codePostal`, `ville`)
  et Pickup (`pudo_keyword`). Ces paramètres ne sont pas documentés par les réseaux : à vérifier en usage.
- **Source unique des liens** : le bloc `<script type="application/json" id="liens">` de `index.html`. Pour ajouter ou corriger un lien,
  modifier ce bloc : la page et le contrôleur du serveur le relisent.

## Contrôle des liens (serveur)
Le dossier `relais_liens/` du dépôt privé (déployé sur le VPS OVH) lit ce bloc JSON dans le dépôt public, toutes les 6 h, et teste chaque lien
(HTTP, redirections suivies). Un lien en panne deux passages de suite déclenche une alerte push (ntfy + Web Push) ; un retour à la normale
aussi. Les sites qui refusent les robots (403, 429, page de défi) sont marqués « non vérifiable » sans alerte. Voir `relais_liens/README.md`.

## Pourquoi des liens plutôt qu'une carte maison
Mondial Relay ne publie pas la liste de son réseau (son API répond à une recherche à la fois, avec identifiants client) et OpenStreetMap
n'en contient qu'une partie : une carte maison serait incomplète. Chaque réseau tient sa propre carte à jour.

## Tests
```
node relais-retour/tests/test_liens.js    # structure du bloc de liens, pré-remplissage du lieu, règles du dépôt
```
