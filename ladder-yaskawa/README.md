# ladder-yaskawa

Visualiseur et éditeur du **ladder E/S concurrentes** des robots Yaskawa (DX100, DX200, YRC1000, FS100) : le fichier `CIOPRG.LST`
sauvegardé depuis le pupitre (EX. MEMORY → SAVE → I/O DATA → C.IO PGM). Page autonome (`index.html`, aucune bibliothèque, aucune
donnée envoyée), avec bouton « Télécharger la page » pour l'utiliser hors ligne, par exemple sur un PC d'atelier sans Internet.

- **Ouvrir** : chemin par défaut (mémorisé), « Parcourir… », « 📁 Dossier… » (dossier de sauvegarde complet) ou glisser-déposer.
- **Afficher** : chaque rung dessiné en ladder (contacts NO/NF, branches parallèles, bobines, TMR, CNT, GSTR/GOUT, BMOV, calculs) ;
  les instructions non dessinées (CMP…) restent en texte. PART 1 (système) verrouillée par défaut.
- **Modifier** : panneau latéral (adresse, NOT, insertion en série / parallèle, sorties), glisser un contact (Ctrl = copier),
  édition en texte, nouveau rung, dupliquer, couper / copier / coller (entre onglets ou depuis un éditeur), annuler / rétablir.
- **Trier** la sélection : n° de sortie, type de sortie, 1re entrée, nom, taille, ordre d'origine, dépendances (écriture avant lecture).
- **Rechercher un signal** (adresse, IN12, OUT3, M479 ou nom) : rungs qui l'écrivent ou le lisent, et utilisations hors ladder (jobs, IF panel, historique d'alarmes).
- **Comparer** avec un autre CIOPRG.LST : rungs modifiés / ajoutés / supprimés côte à côte, reprise d'un écart en un clic.
- **Sauvegarde** : noms d'E/S (IONAME.DAT, EXIONAME.DAT, IOMNAME.DAT, CSV `#70017;Nom`), historique d'alarmes (ALMHIST.DAT),
  alarmes / messages utilisateur pilotés par le ladder (#79700–#79777, #79810–#79887), textes //ALARM et //MESSAGE (modifiables),
  panneau d'interface (fichier contenant `//IFPANEL`), jobs *.JBI, SYSTEM.SYS.
- **Exporter** : récapitulatif des modifications, contrôles (sortie écrite deux fois, adresse douteuse), puis fichier `.LST`.
  Un fichier rouvert sans modification est réécrit à l'identique, octet par octet (« relecture fidèle »).

Méthode, sources et limites : section « Fonctionnement et sources » en bas de la page.

## Tests
```
python3 ladder-yaskawa/tests/smoke.py    # Chrome + Playwright : relecture fidèle, équivalence logique, tri, édition, comparaison, sauvegarde, règles du dépôt
```
