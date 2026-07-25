# CLAUDE.md — orientation-engine

Contexte et conventions du dépôt. À lire avant toute modification.

## Le projet

Moteur d'orientation réutilisable. Un prospect répond à un quiz guidé, le moteur
recommande une filière. Le moteur ne connaît aucune filière en dur : il consomme
des fiches JSON validées contre `schema/filiere.schema.json`.

Règle structurante : **toute la logique métier est générique, tout le contenu est
de la donnée.** Changer de contexte d'orientation = changer `config/` et `data/`,
jamais `src/engine/`.

## État

| Étape | Statut |
|---|---|
| Schéma de données | fait |
| Taxonomie ISM réelle | fait |
| Extraction PDF | à réviser — voir « Parsing » ci-dessous |
| Rapport des manques | fait |
| Validation CI | fait |
| Logique de fonctionnement | **validée** — voir ci-dessous |
| Extraction révisée (3 profils) | **à faire — chemin critique** |
| Calcul de distinctivité | **à faire — point de contrôle** |
| Moteur de scoring | à faire, après le point de contrôle |
| Interface quiz | à faire |

---

## Ce que sont les sources réelles

Trois **catalogues** ISM, pas des brochures par filière :

| Fichier | Pages | Contenu | Mise en page |
|---|---|---|---|
| `Brochure_Master__MAJ2_2024__Groupe_ISM.pdf` | 76 | ~43 programmes Master/MBA/DBA | **2 colonnes**, 2 programmes par page |
| `ISM_bachelor_brochure.pdf` | 48 | **26 licences/bachelors** (sommaire explicite p.13) | 1 colonne |
| `ISM_ONLINE_ISF_BROCHURE.pdf` | 43 | Programmes ISM Online et ISF | 1 colonne |

Les trois sont des PDF texte (InDesign / Illustrator), pas des scans. Extraction fiable.

Volume total attendu : **75 à 80 programmes**. C'est ce qui impose l'architecture en
entonnoir : un scoring à plat sur 80 filières ne discrimine rien.

### Conséquence n°1 — découper, pas mapper

Un PDF contient des dizaines de filières. Le pipeline doit **segmenter le catalogue
en programmes** avant de construire les fiches. Ne pas supposer « 1 fichier = 1 filière ».

Frontière d'un programme : un titre suivi d'un bloc `OBJECTIF`. Le pied de page
(`p.24 - Groupe ISM - Programmes Master/MBA (BAC+5) et DBA`) donne la page et sert
de repère de fin.

### Conséquence n°2 — trois profils de parsing

Les trois catalogues utilisent des en-têtes différents. Prévoir des profils nommés,
sélectionnés par fichier, pas une liste unique de motifs.

| Profil | Objectif | Débouchés | Contenu | Colonnes |
|---|---|---|---|---|
| `master-2024` | `OBJECTIF DE LA FORMATION` | `FUTURS MÉTIERS`, sép. ` \| ` | `CONTENUS PÉDAGOGIQUES`, puces `•` | **2** |
| `bachelor-2024` | `OBJECTIFS :` | `DéBOUCHéS :`, sép. retour ligne | `CONTENU DE LA FORMATION (3 ANS)`, blocs `UE.` | 1 |
| `online-2425` | `Objectif` | `Métiers et débouchés`, sép. ` ; ` | `Contenu de la formation`, sous-colonnes M1/M2 | 1 |

**Piège d'encodage.** La brochure Bachelor écrit `DéBOUCHéS` — des `é` minuscules
accentués au milieu d'un mot en capitales, artefact InDesign. Un motif `/DÉBOUCHÉS/`
échoue. Toujours comparer en insensible à la casse, et normaliser (`NFD`) avant test.

**Validation de la segmentation.** La brochure Bachelor contient page 13 un sommaire
listant ses 26 programmes (« 4 écoles, 26 possibilités »). L'utiliser comme référence :
si le script en extrait 24 ou 28, la segmentation est fausse. Écrire un test là-dessus.

### Conséquence n°2 bis — l'école se lit dans le PDF, pas dans le dossier

Chaque catalogue couvre plusieurs écoles. Le catalogue Master contient Management,
Droit, Ingénieurs et Madiba ; le Bachelor en contient cinq. L'école doit donc être
déduite des **titres de section** rencontrés dans le flux de texte
(`ÉCOLE DE MANAGEMENT`, `MADIBA LEADERSHIP INSTITUTE`, `ISM DIGITAL CAMPUS`...) :
le parser tient l'école courante et l'attribue aux programmes qui suivent, jusqu'au
titre de section suivant.

Ne pas se fier au nom du dossier — cette convention ne vaut que pour une brochure
mono-école. Les catalogues se déposent à plat dans `data/brochures/`.

### Conséquence n°3 — découper les colonnes par coordonnée X

Sur le catalogue Master, une extraction ligne à ligne colle les deux programmes :

```
Master en Marché              MBA en Banque
Financier & Trading           Assurance
```

`scripts/extract.mjs` groupe déjà les items par coordonnée Y. Il faut ajouter une
séparation par X : détecter le creux central (page A4 = 595 pts, césure vers x≈300),
constituer deux flux de texte, les traiter séparément. Ne pas se fier à
`pdftotext -layout`, qui fusionne les colonnes.

### Conséquence n°4 — aucune condition d'admission dans les brochures

Vérifié sur les **trois** fichiers : **aucune série de bac, aucun prérequis par programme.**
Uniquement des niveaux (`BAC+3`, `BAC+4/+5`) et des voies d'accès (« accessible après un bac+2 »).

Donc `eligibilite.series_bac` et `eligibilite.niveau_maths` ne sont **jamais**
extractibles. Ils viennent des admissions, sans exception. `report.mjs` doit les
signaler comme manquants pour 100 % des fiches — c'est attendu, pas un bug.

C'est le point bloquant du projet : sans ces filtres, le quiz peut recommander une
filière inaccessible. À obtenir tôt.

---

## Taxonomie réelle (remplace les noms provisoires)

D'après les sommaires des catalogues Master et Bachelor :

| id | Nom |
|---|---|
| `ism-management` | École de Management |
| `ism-droit` | École de Droit |
| `ism-ingenieurs` | École d'Ingénieurs |
| `ism-digital-campus` | ISM Digital Campus |
| `madiba` | Madiba Leadership Institute |
| `ism-executive` | Programmes Executive |
| `ism-online` | ISM Online |
| `isf` | ISF |

**ISM Digital Campus est une école distincte**, pas un département de l'École
d'Ingénieurs — le sommaire Bachelor les liste séparément.

L'École d'Ingénieurs a deux départements, affichés en bandeau sur les pages programme
et à conserver dans le champ `departement` :

- Management et Technologies
- Sciences et Technologies appliquées

ISM Online et ISF restent à trancher : écoles à part entière, ou modalités d'une école
existante ? Le schéma gère les deux via `ecole` + `modalites`.

## Options d'un programme — décision de modélisation

La Licence en Gestion se décline en 5 options (Comptabilité-Finance, Ressources
humaines, Management international, Agrobusiness, Commerce international et Marketing),
chacune avec sa page, ses objectifs et ses débouchés propres.

**Choix retenu : une fiche par option**, reliée au parent via `programme_parent`.
Un profil orienté agrobusiness et un profil orienté RH n'ont rien en commun ; les
regrouper détruirait précisément la discrimination que le quiz doit produire.

## Partenariats

Présents dans les brochures, à capturer dans `partenariats` :

- doubles diplômes (ex. ESG Paris, entre programmes ISM)
- diplômes délocalisés (INU Champollion d'Albi/Toulouse)
- accréditations (Cames)

## Modalités

Dimension présente dans les brochures et décisive pour un prospect :

- `presentiel`
- `en-ligne` (ISM Online, ISF)
- `cours-du-soir` (mention « également disponible en cours du soir »)
- `week-end` (Bachelor Professionnel en Gestion)
- `full-time`

C'est un **filtre**, pas un axe de score.

---

---

## Logique de fonctionnement — validée

Six questions maximum. Le parcours enchaîne quatre étapes, sur **trois mécanismes
distincts** qu'il ne faut jamais confondre.

| Mécanisme | Agit sur | Effet | Champs |
|---|---|---|---|
| **Filtre** | niveau visé, modalité | exclut du jeu, sans noter | `niveau`, `modalites` |
| **Aiguillage** | domaine d'intérêt | réduit l'ensemble candidat | `domaines` |
| **Score** | 5 axes de profil | classe les survivants | `axes` |
| **Avertissement** | exigence quantitative | informe, n'exclut ni ne note | `exigence_quantitative` |

### Étapes

1. **Filtres durs** — niveau et modalité. ~85 fiches → ~40.
2. **Aiguillage** — 2 questions de domaine. → ~10.
3. **Départage** — 4 questions sur les 5 axes. → classement.
4. **Résultat** — 1 recommandation + 2 alternatives.

### Calcul du score

Distance euclidienne entre le profil du prospect et les 5 axes de la filière,
normalisée puis inversée :

```
d     = sqrt( Σ (profil[axe] - filiere.axes[axe])² )
score = 100 × (1 - d / sqrt(5 × 4²))
```

**Le score ne s'affiche jamais en pourcentage.** Décision validée : trois niveaux
seulement, seuils dans `config/departages.json > _seuils` :

| Niveau affiché | Score interne |
|---|---|
| correspondance forte | ≥ 85 |
| bonne correspondance | 70 – 84 |
| correspondance possible | < 70 |

Raison : l'écart entre 78 % et 74 % est du bruit de calcul, mais un prospect le lit
comme une différence réelle. Le score exact reste interne, pour le classement seul.

### Égalité — étape conditionnelle

Quand les deux premières filières sont à moins de `ecart_declenchant_departage`
points (défaut : 5), le moteur **pose une question de départage** au lieu de trancher.

Cas réel : `licence-droit-des-affaires` et `licence-administration-publique` ont des
axes identiques (`2-1-3-2-5`) — elles partagent l'essentiel de leurs UE. Les 5 axes ne
peuvent pas les séparer, et c'est attendu.

Les questions de départage vivent dans `config/departages.json`, **indexées par paire**.
Ne jamais les stocker dans les fiches : une question appartient à un couple de filières,
la dupliquer des deux côtés garantit qu'elles divergeront. Le champ `voisines` d'une
fiche ne contient donc que des `id`.

### Limite connue du scoring

Un profil plat (tous les axes à 3) donne un classement resserré et sans signification.
Deux parades, toutes deux à implémenter : questions à choix tranchés plutôt qu'échelles
continues, et refus d'afficher un gagnant quand l'écart est sous le seuil.

### Inférence des axes — depuis les UE, pas depuis la prose

Les axes doivent être inférés depuis `unites_enseignement`, pas depuis la description
marketing. Vérifié : l'inférence lexicale sur la prose donnait `rigueur: 1` à une licence
Finance enseignant l'audit et le droit fiscal. Les listes de modules décrivent le contenu
réel et produisent un classement nettement plus juste.

Même source pour `exigence_quantitative` : compter les modules de mathématiques,
statistiques, économétrie et probabilités dans les UE. Repère observé — 9 modules pour
Mathématiques appliquées, 0 pour Journalisme.

### Contrainte d'affichage

ISM Online et ISF étant des écoles distinctes, un même intitulé peut apparaître deux fois
(présentiel et en ligne). Le résultat doit afficher la modalité de façon visible, sinon le
prospect voit un doublon inexpliqué.


---

## Principe directeur — le catalogue porte la précision

**Le catalogue est la source de la précision. Les responsables sont la source de l'orientation.**

Un conseiller n'est pas précis parce qu'il évalue le caractère : il l'est parce qu'il connaît le
catalogue. Cette connaissance, on l'a intégralement — 85 programmes avec leurs modules et leurs
métiers. C'est elle qui doit produire le choix final.

| Étage | Ce qui décide | Source | Précision |
|---|---|---|---|
| Éligibilité | `niveau_acces`, `modalites` | brochures | exacte |
| Domaine | 7 axes de profil | brochures + responsables | grossière, suffisante |
| **Programme** | modules et métiers distinctifs | **brochures** | **exacte** |

Conséquence : les 5 axes de contenu sont **comptés** depuis `unites_enseignement`, jamais notés à
la main. Le quantitatif d'un programme est le nombre de ses modules de maths, statistiques et
calcul — un fait, pas une opinion. Seuls les 2 axes de disposition viennent des responsables, et
au niveau du **domaine** (`config/domaines_axes.json`), pas de la filière.

## Les 7 axes

| Axe | Source | Niveau |
|---|---|---|
| quantitatif, technique, relationnel, creatif, cadre | comptage des UE | filière |
| ancrage (bureau ↔ terrain) | tri de portraits | domaine |
| abstraction (concret ↔ abstrait) | tri de portraits | domaine |

`cadre` absorbe l'ancien axe `rythme`, `abstraction` absorbe `ambiguite` : ils étaient corrélés,
et deux axes corrélés pèsent double dans une distance euclidienne.

## Distinctivité — le calcul central

`scripts/distinctivite.mjs` calcule, pour chaque programme, ce qui le distingue des autres de son
domaine : modules exclusifs, métiers exclusifs, taux de recouvrement maximal, plus proche voisin.

Ce calcul sert trois fois :
1. il fournit le contenu des questions de fin de parcours, dans les mots de la brochure ;
2. il fournit la justification traçable du résultat ;
3. il produit **la liste des paires à soumettre aux responsables** — recouvrement > 80 %.

Exemple vérifié : Master Marché Financier & Trading et MBA Banque-Assurance n'ont presque aucun
module commun (stratégie de trading, produits dérivés, BRVM-FOREX contre techniques d'assurance,
droit bancaire, comptabilité des compagnies d'assurances). Le catalogue les sépare seul.

## Le parcours — 10 à 12 questions

| # | Bloc | Nature | Effet |
|---|---|---|---|
| 1 | Diplôme actuel | factuelle | filtre `niveau_acces` |
| 2 | Modalité souhaitée | factuelle | filtre `modalites` |
| 3 | Domaine qui attire | situationnelle | aiguillage |
| 4–10 | Profil, 7 questions | situationnelles | score sur les 7 axes |
| 11 | Métiers/modules distinctifs | situationnelle, générée | choix du programme |
| 12 | Départage | conditionnelle | si recouvrement élevé |

**Sept questions de profil, pas moins.** 7 axes × 2 lectures = 14 lectures ; à 2 axes par question,
7 questions. En dessous, des axes restent non mesurés et le score devient de la fausse précision.

### Règles de rédaction des questions

- **Situationnelle, jamais déclarative.** « Es-tu rigoureux ? » ne mesure que la désirabilité
  sociale. Présenter une situation, laisser déduire.
- **Aucune option valorisée.** Les quatre réponses doivent être également honorables.
- **Une question au moins porte « ça dépend ».** Sans elle, l'ensemble prend un ton
  d'interrogatoire et les gens répondent ce qu'ils croient attendu.
- **Le vocabulaire vient des responsables.** Les options doivent reprendre leurs phrases
  récoltées sur « à qui déconseillez-vous cette filière », pas des formulations inventées.
- **Les questions de catalogue sont générées puis habillées.** Ne pas afficher une liste de
  métiers : formuler la distinction en situation. « Devant six écrans à suivre les cours, ou en
  rendez-vous avec un client qui monte un dossier de crédit ? » — même information, forme d'entretien.

### Arrêt anticipé

10 questions est un plafond, pas une longueur fixe. Le moteur s'arrête dès qu'un seul programme
survit aux filtres, ou dès que l'écart de tête dépasse largement le seuil. Un profil tranché se
résout en 7 questions, un profil ambigu en consomme 12.

### Reformulation avant résultat

Obligatoire. Construite depuis les 2-3 axes les plus marqués, avec des fragments pré-écrits par
axe — pas d'appel réseau, le site reste statique.

> « Si je comprends bien : tu es à l'aise avec les chiffres, tu as besoin de voir concrètement à
> quoi ça sert, et tu préfères un cadre clair. »

Accompagnée d'un bouton « Ce n'est pas ça ? Reprendre ». Ce bouton compte autant que la phrase :
il transforme un verdict en proposition.

## Ce qui reste aux responsables

Cinq personnes, une par école. On ne leur demande que ce que le catalogue ne contient pas :

1. les 2 axes de disposition, **par domaine** — via un tri de 12 portraits en 3 paquets
   (s'épanouirait / ni l'un ni l'autre / se tromperait) ;
2. les paires que la distinctivité n'a pas séparées — liste courte, produite par le code ;
3. une validation de bon sens sur quelques recommandations ;
4. les corrections au catalogue 2024 (programmes fermés, renommés).

**L'ordre du jour des entretiens est un résultat du code, pas un préalable.** Ne pas lancer les
entretiens avant que `distinctivite.mjs` ait tourné : sinon on consomme la ressource la plus rare
du projet sur des questions que le catalogue aurait répondues.

## Validation par les étudiants actuels

Avec une seule personne par école, aucune vérification croisée institutionnelle n'est possible.
La cohorte étudiante devient le seul garde-fou et n'est pas optionnelle : 20 à 30 étudiants de
2e/3e année passent le quiz. S'il recommande la finance à un étudiant de finance satisfait, le
modèle tient. Sinon, on sait quelle école est mal calibrée.

Coût : une matinée, aucun responsable mobilisé.

## Conventions de code

- Node 18+, modules ES (`.mjs`), aucune transpilation sur les scripts.
- Pas de dépendance ajoutée sans nécessité. Actuelles : `pdfjs-dist`, `ajv`, `ajv-formats`.
- Les scripts n'écrivent jamais en dehors de `data/`.
- Français pour les messages console, les noms de champs et les commentaires.
- Identifiants en kebab-case, stables une fois publiés.

## Traçabilité — non négociable

Chaque champ renseigné porte sa source dans `meta.sources` :

`brochure` · `inference` · `responsable` · `admissions` · `manuel`

Les notes d'axes et les domaines sortent **toujours** en `inference`. `report.mjs`
les traite comme manquants tant qu'un humain n'a pas validé. Un brouillon ne doit
jamais pouvoir se faire passer pour une donnée confirmée.

Cycle : `meta.statut` = `brouillon` → `a_valider` → `valide`.

## Ne pas faire

- Deviner une série de bac ou un prérequis. Absent de la source = `null`, point.
- Noter l'éligibilité. C'est un filtre binaire qui exclut, jamais un score.
- Écrire un nom de filière dans le code du moteur.
- Afficher un score en pourcentage. Trois niveaux, jamais un chiffre.
- Dupliquer une question de départage dans les fiches. Elle vit dans `config/departages.json`.
- Inférer les axes depuis la prose marketing. Toujours depuis les UE.
- Noter un axe de contenu à la main. Ils se comptent depuis les modules.
- Poser une question déclarative (« es-tu rigoureux ? »). Toujours situationnelle.
- Lancer les entretiens avant que la distinctivité ait tourné.
- Descendre sous 7 questions de profil. Des axes resteraient non mesurés.
- Faire confiance aux frais, dates et effectifs : sources 2024, à revérifier.

## Commandes

```bash
npm run extract -- --dump   # PDF → fiches + texte brut dans data/_raw/
npm run report -- --csv     # manques par filière → data/_manques.csv
npm run validate            # schéma + taxonomie (tourne aussi en CI)
```

`--dump` puis lecture de `data/_raw/*.txt` est la façon la plus rapide de diagnostiquer
un parsing qui dérape.
