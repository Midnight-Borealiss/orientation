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
| Rapport des manques | fait |
| Validation CI | fait |
| Logique de fonctionnement | **validée** — voir ci-dessous |
| Extraction révisée (3 profils) | **faite** — 84 fiches, `npm test` vert |
| Calcul de distinctivité | **à faire — point de contrôle** |
| Moteur de scoring | à faire, après le point de contrôle |
| Interface quiz | à faire |

---

## Ce que sont les sources réelles

Trois **catalogues** ISM, pas des brochures par filière :

| Fichier | Format | Contenu | Mise en page | Fiches produites |
|---|---|---|---|---|
| `Brochure Master - MAJ2 2024 - Groupe ISM.pdf` | 76 p. portrait 595×842 | Master/MBA/DBA | **2 colonnes**, 2 programmes par page, gouttière à x≈300 | **44** |
| `ISM_bachelor_brochure.pdf` | 48 p. **paysage 842×595** | licences/bachelors (sommaire p.13) | 3 zones : prose à gauche, **2 colonnes d'UE** à droite | **26** |
| `ISM_ONLINE_ISF_BROCHURE.pdf` | 43 p. portrait 595×842 | ISM Online (p.8-21) puis ISF (p.24-28) | 2 colonnes : prose à gauche, contenu à droite | **14** |

Les trois sont des PDF texte (InDesign / Illustrator), pas des scans. Extraction fiable.

Volume réel : **84 fiches**. C'est ce qui impose l'architecture en entonnoir :
un scoring à plat sur 84 filières ne discrimine rien.

**Aucun catalogue n'est sur une seule colonne.** La brochure Bachelor est en
paysage et ses pages programme portent trois zones distinctes. Un regroupement
par Y seul recolle les colonnes et verse la moitié des modules dans les métiers.

**L'ISF n'est pas extrait.** Les pages 24 à 28 du catalogue Online sont un
*tableau* (« Filières | Certificat de compétences | Contenus de la formation »)
de certificats courts de 1 à 3 mois, sans bloc `Objectif` : ils ne relèvent
d'aucun des trois profils. À trancher : ces certificats entrent-ils dans le quiz ?

### Conséquence n°1 — découper, pas mapper

Un PDF contient des dizaines de filières. Le pipeline doit **segmenter le catalogue
en programmes** avant de construire les fiches. Ne pas supposer « 1 fichier = 1 filière ».

Frontière d'un programme : un titre suivi d'un bloc `OBJECTIF`. Le pied de page
(`p.24 - Groupe ISM - Programmes Master/MBA (BAC+5) et DBA`) donne la page et sert
de repère de fin.

### Conséquence n°2 — trois profils de parsing

Les trois catalogues utilisent des en-têtes différents : des profils nommés,
sélectionnés par nom de fichier, jamais une liste unique de motifs. Ils vivent
dans `scripts/lib/profils.mjs`.

| Profil | Objectif | Débouchés | Contenu | Segmentation |
|---|---|---|---|---|
| `master-2024` | `OBJECTIF DE LA FORMATION` | `FUTURS MÉTIERS`, sép. ` \| ` | `CONTENUS PÉDAGOGIQUES` **ou** `CONTENUS DES ENSEIGNEMENTS`, puces `•` | 1 programme **par colonne** |
| `bachelor-2024` | `OBJECTIFS :` | `DéBOUCHéS :`, sép. retour ligne | `CONTENU DE LA FORMATION (3 ANS)`, blocs `UE.` | 1 programme **par page** |
| `online-2425` | `Objectif` | `Métiers et débouchés`, sép. ` ; ` ou puces | `Contenu de la formation`, sous-colonnes M1/M2 | 1 programme **par page** |

Les en-têtes ne suffisent pas à isoler un programme : les pages d'accroche du
Bachelor (« 3 ANS pour révéler son talent ») portent aussi un `OBJECTIFS :`.
Les profils « par page » exigent donc **objectif ET contenu** — pas de liste noire
de pages, qui se périmerait à la prochaine édition.

Deux programmes du catalogue Master s'étalent sur deux pages (Executive MBA p.66-67,
DBA p.68-69) : titre seul sur la page paire, blocs sur l'impaire. Le segmenteur
garde un « titre en attente » pour ce cas.

**Piège d'encodage.** La brochure Bachelor écrit `DéBOUCHéS` — des `é` minuscules
accentués au milieu d'un mot en capitales, artefact InDesign. Un motif `/DÉBOUCHÉS/`
échoue. Toujours comparer en insensible à la casse, et normaliser (`NFD`) avant test.

**Validation de la segmentation.** La brochure Bachelor contient page 13 un sommaire
listant ses 26 programmes (« 4 écoles, 26 possibilités »). C'est la référence, et
`scripts/test-extract.mjs` (`npm test`) la vérifie : 24 ou 28 signifie que la
segmentation est fausse.

Détail vérifié, à ne pas « corriger » par erreur : les 26 = 21 intitulés + les
5 options de la Licence en Gestion, et **seulement 24 ont une page dédiée**.
Deux entrées du sommaire n'existent nulle part ailleurs dans la brochure —
`Licence en Gestion` (le parent des 5 options) et `Bachelor en Gestion full time`.
Elles produisent des fiches squelettes : nom, école, niveau et modalité lus au
sommaire, le reste vide et signalé par `report.mjs`. Le compte de 26 est donc
`24 pages + 2 entrées de sommaire`, jamais 24.

Le sommaire est aussi la **meilleure source d'école** de ce catalogue : il donne
l'école ET le département de chaque programme, là où les pages de séparation
mélangent « École d'ingénieurs & ISM Digital Campus ». L'appariement page↔sommaire
se fait sur le titre normalisé (égalité, puis inclusion, puis recouvrement lexical) ;
un programme de page qui n'apparaît pas au sommaire déclenche une `ALERTE` et fait
échouer le test — jamais un silence.

### Conséquence n°2 bis — l'école se lit dans le PDF, pas dans le dossier

Chaque catalogue couvre plusieurs écoles. Le catalogue Master en contient six, le
Bachelor cinq. Trois sources, par ordre de fiabilité décroissante :

1. **le sommaire** (Bachelor) — donne école + département par programme ;
2. **le pied de page des pages impaires** (Master) — `École de Management p.25`,
   `Madiba Leadearship Institute p.59` (coquille de la brochure, conservée dans le
   motif). Les pages paires portent un pied générique : l'école se lit sur la page
   suivante, d'où une recherche avant puis arrière ;
3. **les titres de section** (`REJOIGNEZ L'ÉCOLE DE MANAGEMENT`, `Decouvrez ISM Online`).

Ne pas se fier au nom du dossier — cette convention ne vaut que pour une brochure
mono-école. Les catalogues se déposent à plat dans `data/brochures/`.

### Conséquence n°3 — découper les colonnes par coordonnée X

Sur le catalogue Master, une extraction ligne à ligne colle les deux programmes :

```
Master en Marché              MBA en Banque
Financier & Trading           Assurance
```

`scripts/lib/pdf-layout.mjs` découpe donc par X **avant** de grouper par Y, en deux
passages. Ne pas se fier à `pdftotext -layout`, qui fusionne les colonnes.

1. **Projection sur l'axe X.** Seuls les items étroits comptent : un paragraphe
   pleine largeur enjambe les colonnes et bouche la gouttière. Le ratio de largeur
   est essayé de 0.4 à 0.25, les passes de repli exigeant un creux plus large.
2. **Modes d'abscisse de début.** Certaines listes de modules sur deux colonnes
   *se touchent* — aucun blanc vertical à trouver (Bachelor p.29, 35, 40 ;
   Master p.67, 69). Les abscisses de début, elles, forment deux modes nets à plus
   de 40 pts d'écart. Sans ce second passage, un module sort en
   « Théorie de l'information et de la communication Introduction à l'économie ».

Deux conséquences du même ordre :

- **L'espace ne s'insère pas entre deux items voisins**, il se déduit de l'écart
  horizontal. Ces PDF livrent chaque lettre accentuée comme un item distinct :
  joindre par `" "` rend « sp é cialistes », « cer tifi cation ».
- **Numéros de page et pieds de page se filtrent** avant tout rattachement, sinon
  une UE s'intitule « 19 UE. Langues – Civilisations ».

**Rattachement à une section.** L'en-tête le plus proche au-dessus **dans la même
colonne** ; si la colonne n'en a aucun (3e colonne d'UE du Bachelor), on emprunte
celui de la colonne la plus proche qui en a un. Une recherche « au-dessus, toutes
colonnes confondues » y verrait le `DéBOUCHéS` de la première colonne et verserait
la moitié des modules dans les métiers.

### Conséquence n°4 — aucune condition d'admission dans les brochures

Vérifié sur les **trois** fichiers : **aucune série de bac, aucun prérequis par programme.**
Uniquement des niveaux (`BAC+3`, `BAC+4/+5`) et des voies d'accès (« accessible après un bac+2 »).

Donc `eligibilite.series_bac` et `eligibilite.niveau_maths` ne sont **jamais**
extractibles. Ils viennent des admissions, sans exception. `report.mjs` doit les
signaler comme manquants pour 100 % des fiches — c'est attendu, pas un bug.

C'est le point bloquant du projet : sans ces filtres, le quiz peut recommander une
filière inaccessible. À obtenir tôt.

`niveau_acces`, en revanche, est renseigné pour les 84 fiches, avec sa source :

- `brochure` quand la voie d'accès est écrite (« accessible après un bac+2 »,
  « justifiant d'un niveau (Bac +2) », et les règles d'admission énoncées p.6-7
  du catalogue Online : L3 par un bac+2, M1 par un bac+3) — 16 fiches ;
- `inference` sinon, déduit du niveau délivré (master/MBA → bac+3, licence → bac).
  `report.mjs` les traite comme à confirmer.

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
- Regrouper les items d'une page par Y seul. Les colonnes d'abord, toujours.
- Supposer qu'un catalogue est mono-colonne parce qu'une page l'est.
- Noter un axe de contenu à la main. Ils se comptent depuis les modules.
- Poser une question déclarative (« es-tu rigoureux ? »). Toujours situationnelle.
- Lancer les entretiens avant que la distinctivité ait tourné.
- Descendre sous 7 questions de profil. Des axes resteraient non mesurés.
- Faire confiance aux frais, dates et effectifs : sources 2024, à revérifier.

## Commandes

```bash
npm run extract -- --dump   # catalogues → fiches + texte segmenté dans data/_raw/
npm test                    # 26 fiches Bachelor + conformité des 84 (tourne en CI)
npm run report -- --csv     # manques par filière → data/_manques.csv
npm run validate            # schéma + taxonomie (tourne aussi en CI)
```

`--dump` écrit, par catalogue : les lignes reconstruites **avec leur colonne, leur
abscisse et leur taille de police**, puis la liste des programmes segmentés, puis le
journal (appariements au sommaire, blocs rattachés, alertes). C'est la façon la plus
rapide de diagnostiquer un parsing qui dérape — lire `data/_raw/*.txt` avant de
toucher un motif.

`npm test` ne touche pas `data/filieres/` : l'extraction y tourne en mémoire.

Découpage du code d'extraction :

| Fichier | Responsabilité |
|---|---|
| `scripts/lib/pdf-layout.mjs` | géométrie seule : items → colonnes → lignes. Aucune connaissance d'ISM. |
| `scripts/lib/profils.mjs` | les trois profils : en-têtes, sommaire, écoles, segmentation. |
| `scripts/lib/fiche.mjs` | UE, métiers, niveaux, modalités, comptage des axes et du quantitatif. |
| `scripts/extract.mjs` | orchestration, appariement au sommaire, écriture, CLI. |
