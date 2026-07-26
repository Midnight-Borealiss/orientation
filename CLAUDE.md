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
| Calcul de distinctivité | **fait** — trois mesures, 3 paires par domaine, fiches de comparaison |
| Familles au-dessus des domaines | **fait** — 6 familles, pour le parcours seul |
| Fusion à la ré-extraction | **faite** — le travail humain survit, `npm test` le vérifie |
| Lexiques des 5 axes | **calibrés** — 4 ancrages testés, distribution centrée sur 2,4 |
| Métrique de score | **tranchée** — corrélation de forme, l'euclidienne est écartée |
| Attributs d'UE (bloc type, concentration) | **faits** — mais 28 fiches sur 84 seulement, licences et bachelors |
| Proportions brutes des axes | **faites** — `axes_parts`, plus aucune égalité exacte à r = 1,00 |
| Programmes non notables | **marqués** — 15 fiches `axes_fiables: false` |
| Axes de disposition (2 × 28 domaines) | à collecter auprès des responsables |
| Questions du quiz | **v0** — `config/questions.json`, formulations à remplacer par celles des entretiens |
| Moteur de scoring | **écrit** — `src/engine/`, 96 tests |
| Calibration des seuils par simulation | **faite** — seuils mesurés, les 3 objectifs atteints |
| Cascade de départage | **faite** — 98 % des égalités tranchées sans les entretiens |
| Aiguillage à deux étages | **fait** — `entreprise-management` passe de 17,8 à 8,6 filières en lice |
| Écran de résultat | **fait** — `web/index.html`, six états, rendu pur et testé sans navigateur |
| UE perdues à l'extraction | **corrigées** — +19 modules sur 4 fiches, contrôle des lignes non reprises |
| Candidat unique | **traité à part** — affiché sans être noté, 28 combinaisons de filtres |
| Hébergement Netlify | **fait** — `netlify.toml`, aucun build, `git push` déploie |
| Collecte des validations étudiantes | **faite** — Netlify Forms, formulaire statique, `?validation=1` |
| Bouton « parler à un conseiller » | **fait** — `config/contact.json`, canal email par défaut |
| Thème ISM | **fait** — `web/theme.css`, contrastes calculés dans les deux modes |
| Charte officielle | à demander au service communication — les couleurs sont mesurées |
| Logo | à récupérer en SVG — les variables du thème l'attendent |
| Adresse d'admission par école | à demander — 3 documentées sur 8, aucun routage inventé |
| Signalements des testeurs | **faits** — `?test=1`, deux niveaux, parcours joint |
| Quota Netlify Forms | à vérifier dans le tableau de bord avant la cohorte étudiante |

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

### Un retour à la ligne se reconnaît au mot qui n'y tenait plus

Un intitulé d'UE tient parfois sur deux lignes (« UE. Maitrise des comportements » /
« professionnels »). Le recoller est nécessaire — mais **la règle qui décide de recoller ne
peut se fonder ni sur la taille de police ni sur la puce**, parce que les trois catalogues
distinguent leurs UE de trois façons différentes :

| Catalogue | Ce qui marque l'UE | Modules |
|---|---|---|
| Bachelor, cas général | police plus grande (8 pt contre 6 pt) | sans puce |
| Online | préfixe `*UE:` | puce `•`, **même taille** |
| Bachelor, page du Bachelor Professionnel | rien — « UE semestre 1 », « UE semestre 2 » | **même taille**, sans puce |

Le critère retenu est le **mécanisme réel d'un retour à la ligne : le premier mot de la ligne
suivante ne tenait plus avant la marge du bloc.** La largeur d'un glyphe se déduit de la ligne
elle-même — sa longueur en points divisée par son nombre de caractères —, donc sans connaître
la police. Mesuré : `*UE: Outils et techniques de` finit à 522 dans un bloc qui va jusqu'à 559,
et c'est bien « gestion » (35 pts) qui n'y tenait pas ; `UE semestre 2` finit à 91 dans un bloc
large de 157, donc rien ne l'a coupé.

Trois précisions, chacune tirée d'un faux résultat observé :

- **la marge se mesure sur le BLOC, pas sur la section** — les lignes qui partagent le même
  alignement à gauche. Une section porte parfois une ligne étrangère bien plus large (un reste
  de colonne voisine), et prendre le maximum de la section faisait passer la marge de 558 à
  768 : plus aucun intitulé n'était jugé coupé ;
- **« atteindre la marge » ne suffit pas** — un intitulé s'arrête là où le mot suivant cesse de
  tenir, souvent plusieurs dizaines de points avant la marge ;
- **un `:` final n'est pas une phrase coupée, il annonce une liste.** La règle générale
  « précédente terminée par un tiret ou deux-points » ne vaut donc pas pour un intitulé, sinon
  « UE. Maitrise des comportements professionnels : » avale son premier module.

**Conséquence mesurée, et c'est elle qui justifie tout ce détail.** `bachelor-professionnel-en-gestion`
sortait avec **4 modules au lieu de 8** : ses deux UE étant composées à la taille de leurs
modules, la seconde absorbait les siens dans son intitulé, finissait vide, et était écartée.
4 modules, c'est sous le seuil de 6 : la fiche était `axes_fiables: false`, donc **jamais
classée** — un défaut de mise en page produisait une conséquence visible par le prospect.
La correction ramène 19 modules sur 4 fiches et rend cette fiche classable.

**Limite connue, à ne pas « corriger » à l'aveugle :** quand l'intitulé est lui-même la ligne
la plus large de son bloc, on ne peut pas savoir s'il a été coupé. Un intitulé garde alors un
fragment de trop (`licence-de-gestion-option-comptabilite-finance`). C'est cosmétique — aucun
module n'est perdu — et deux tentatives de garde supplémentaire ont chacune cassé ailleurs :
un critère de police régressait sur tout le catalogue Online, et interdire à la taille seule
d'ouvrir une UE fabriquait quatre UE fantômes sur `licence-en-informatique`. **Mesurer l'effet
sur les 84 fiches avant de toucher à cette fonction.**

### Le contrôle qui rend une UE perdue visible

Une UE perdue ne laisse **aucune trace** dans la fiche : elle a simplement moins de modules, et
rien ne dit combien elle aurait dû en avoir. Le seul témoin est géométrique — les lignes de
contenu qu'aucune UE n'a reprises se trouvent **en bas** de la section.

`extract.mjs` compare donc les lignes de la section au contenu retenu et remonte
`ALERTE UE` pour celles qui manquent sous la dernière UE. Deux détails sans lesquels il ne
mesure rien :

- la comparaison se fait sur une **clé insensible à la ponctuation et aux puces** — l'intitulé
  retenu est nettoyé (`UE.` → `UE`), et une puce numérotée (`1. comptabilité pour la finance`)
  n'est pas dans le libellé stocké. Sans cela, 20 alertes dont 17 fausses ;
- il reste **lisible** : 3 alertes sur 84 fiches, et `npm test` refuse qu'il en remonte plus de
  8. Trente alertes ne seraient pas lues, zéro voudrait dire qu'il a cessé de mesurer.

Les 3 alertes actuelles sont des faits, pas des bogues à corriger : deux UE que la brochure
tronque en fin de colonne, et une note sur une certification CISCO qui n'est pas un module.

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

### Calcul du score — corrélation de forme, jamais une distance

**Une distance euclidienne sur les axes bruts est écartée.** Décision changée après mesure ;
la formule précédente (`score = 100 × (1 − d / sqrt(5×4²))`) était fausse et ne doit pas être
réintroduite.

Raison, à conserver parce qu'elle n'est pas évidente. La normalisation des axes est
`note = 1 + floor(part_des_modules / 0.1)`, plafonnée à 5 : un 5 exige 40 % des modules sur un
seul axe, et 74 % des modules sont reconnus par au moins un lexique. Un programme dispose donc
d'une masse d'environ 1,0 à répartir sur cinq axes — **au plus deux axes peuvent atteindre 4
simultanément**, et la plupart des programmes n'ont qu'un axe dominant. Les histogrammes le
confirment : 46 fiches sur 84 à 1 sur `technique`, 57 à 1 sur `creatif`.

Les vecteurs de filière sont **pointus par construction**. Une distance euclidienne favorise
alors les programmes tièdes, parce qu'un vecteur plat est proche de tout :

| Vecteur | quant | tech | rel | créa | cadre | euclidienne | corrélation |
|---|---|---|---|---|---|---|---|
| Prospect, pic sur technique | 4 | 5 | 4 | 3 | 4 | — | — |
| A — type Génie logiciel | 1 | 5 | 1 | 1 | 2 | 43 % | **0,82** |
| B — type management généraliste | 3 | 3 | 4 | 3 | 2 | **66 %** | 0,00 |

L'euclidienne couronne B, un programme de management, pour un prospect technique. C'est le
comportement à éliminer.

**La métrique est une corrélation de forme** — cosinus sur vecteurs centrés, soit un Pearson —
sur les **5 axes comptés**, dans leur version `axes_parts` (proportions brutes) et **jamais** sur
les notes 1..5, dont l'arrondi produit des ex æquo parfaits :

```
p̄ = moyenne(profil)        f̄ = moyenne(filiere.axes)
num = Σ (profil[i] - p̄) × (filiere.axes[i] - f̄)
den = sqrt(Σ (profil[i] - p̄)²) × sqrt(Σ (filiere.axes[i] - f̄)²)
r   = num / den            // dans [-1, 1]
```

Le centrage est ce qui compte : il compare **la forme du profil**, pas son niveau. C'est aussi
ce qui neutralise la distribution centrée sur 2,4 des filières (voir « Normalisation des cinq
axes ») sans avoir à retoucher les notes.

**Cas limite, à gérer sans planter.** Si `den == 0`, le vecteur est plat et n'a pas de forme.

- Côté filière, cela ne devrait pas arriver : **vérifier et lever une alerte**, ne pas masquer.
- Côté prospect, c'est possible s'il répond de façon très équilibrée : se replier sur les
  **parts de budget** — convertir les deux vecteurs en proportions de leur somme, puis
  euclidienne — et **signaler le repli dans la sortie**. Un repli silencieux ferait passer un
  classement dégradé pour un classement normal.

**`r` ne s'affiche jamais.** Trois niveaux seulement, seuils dans `config/departages.json >
_seuils`, aujourd'hui **provisoires** :

| Niveau affiché | Condition |
|---|---|
| correspondance forte | r ≥ 0,60 |
| bonne correspondance | 0,30 ≤ r < 0,60 |
| correspondance possible | r < 0,30 |

Raison de l'affichage en trois niveaux : l'écart entre 0,78 et 0,74 est du bruit de calcul, mais
un prospect le lit comme une différence réelle. La valeur exacte reste interne, pour le
classement seul.

### Égalité — un régime normal, pas un cas rare

Quand les deux premières filières sont à moins de `ecart_declenchant_departage` (0,05), le
moteur ne tranche pas de lui-même. **Sur cinq dimensions seulement, la corrélation est bruitée :
les ex æquo sont fréquents** — 27 % des profils. Le mécanisme de départage fonctionne donc en
régime normal ; le traiter comme une branche exceptionnelle serait une erreur de conception.

### La cascade de départage — cinq étages

Ordre d'essai, on s'arrête au premier étage qui produit quelque chose :

| Étage | Source | Disponible | Résout (mesuré) |
|---|---|---|---|
| 1. question **rédigée** | `config/departages.json` | après les entretiens | 0 % |
| — deux **options sœurs** | le nom de l'option | maintenant | 12 % |
| 2. question **générée** depuis les métiers exclusifs | `distinctivite.metiers_exclusifs` | **maintenant** | **60 %** |
| 3. question **générée** depuis les modules exclusifs | `distinctivite.modules_exclusifs` | **maintenant** | **26 %** |
| 4. distance de **disposition** | `config/domaines_axes.json` | quand ce sera collecté | 0 % |
| 5. afficher **à égalité** | — | toujours | 2 % |

**Les étages 2 et 3 sont le mécanisme central du principe directeur** — le catalogue porte la
précision, les responsables portent l'orientation. Ils ne dépendent d'**aucune collecte** : la
distinctivité a déjà produit modules et métiers exclusifs pour 76 des 84 programmes. Sans eux,
100 % des ex æquo restaient en attente des entretiens ; avec eux, **98 % sont tranchés tout de
suite**. La dépendance aux entretiens s'effondre, et c'était le résultat recherché.

**Pourquoi une question posée au prospect passe avant la disposition.** Une réponse sur deux
métiers réels est une observation directe ; la disposition est une moyenne de classements de
domaines faits par des responsables. La mesure la plus directe d'abord.

**L'étage 5 n'est pas un échec.** « Deux voies te correspondent également » est une réponse
honnête, et elle vaut mieux qu'un gagnant arbitraire. C'est ce qui avait été décidé.

Le moteur remonte, dans `departage.essais`, ce que **chaque étage franchi** a répondu et pourquoi
il n'a rien produit. Un étage inerte ne se tait jamais.

### Forme des questions générées

**Jamais une liste de métiers affichée telle quelle.** Deux gabarits situationnels, comme les
questions de profil :

```
métiers  →  Un mardi ordinaire, tu te vois plutôt {A} ou {B} ?
modules  →  Tu préfères passer un semestre sur « {A} » ou sur « {B} » ?
```

**On ne reformule jamais un libellé** : le catalogue écrit « Concepteur de systèmes embarqués »,
le réécrire serait inventer de la donnée. En revanche les tableaux d'exclusivités contiennent des
artefacts d'extraction, écartés sur des critères **génériques** — aucune liste de mots interdits :

| Critère | Ce qu'il attrape |
|---|---|
| contient un `:` | « … peut occuper les fonctions suivantes : » — introduit une liste |
| contient `…` | « Aministrations… École de Droit » — la brochure a elle-même abrégé |
| plus de 8 mots | plusieurs intitulés recollés par une puce mal détectée |
| ne commence pas par une capitale | un fragment, pas un intitulé |
| hors de 5 à 60 caractères | trop court pour dire quelque chose, trop long pour être un poste |

86 % des libellés passent ; **4 fiches sur 84** n'ont ni métier ni module utilisable, et tombent
à l'étage 5. On retient ensuite **le meilleur** libellé, pas le premier : l'ordre du tableau est
celui de la brochure, qui n'a aucune raison de placer le plus parlant en tête.

Si plus de deux filières sont à égalité, la question porte sur les **deux premières**, puis on
réévalue : une question à quatre branches serait illisible.

**Deux options du même programme ne reçoivent pas de question générée.** Ce qui les sépare est le
nom de l'option, déjà imprimé — la Licence de Gestion option Comptabilité-Finance et l'option RH
ont 49 modules identiques sur 54. On affiche les deux intitulés et on laisse choisir. `sontSoeurs()` vit
dans `src/engine/parente.mjs`, **unique implémentation**, réexportée par `distinctivite.mjs` :
deux copies feraient qu'une paire serait « sœur » d'un côté et « ambiguë » de l'autre.

Cas réel : `licence-en-droit-des-affaires` et `licence-en-administration-publique` ont des axes
identiques — elles partagent l'essentiel de leurs UE. Les 5 axes ne peuvent pas les séparer, et
c'est attendu ; ce sont leurs métiers exclusifs qui les séparent.

Les questions **rédigées** vivent dans `config/departages.json`, **indexées par paire**. Ne
jamais les stocker dans les fiches : une question appartient à un couple de filières, la
dupliquer des deux côtés garantit qu'elles divergeront. Le champ `voisines` d'une fiche ne
contient donc que des `id`.

### Comment les 2 axes de disposition entrent dans le score

**Ne pas les mélanger aux 5 axes comptés dans la corrélation.** Les 5 axes comptés sont
*compositionnels* : ils se partagent un budget de modules, et c'est précisément ce qui rend leur
forme interprétable. Les 2 axes de disposition sont des *notations indépendantes*, recueillies
auprès des responsables. Les réunir dans un même vecteur centré mêle deux natures de mesure et
rend `r` ininterprétable.

| Rôle | Mécanisme | Sur quoi |
|---|---|---|
| Classement principal | corrélation de forme | les **5 axes comptés** |
| Départage des proches, **étage 4** | distance | les **2 axes de disposition** |

C'est cohérent avec leur niveau de collecte : les ex æquo surviennent majoritairement entre
domaines voisins d'une même famille, et c'est exactement là que les axes de disposition varient.

**Leur rôle a reculé, et c'est mesuré.** Ils étaient le premier étage du départage ; ils sont
maintenant le quatrième, après les questions générées depuis le catalogue. Raison : une réponse
du prospect sur deux métiers réels est une observation directe, la disposition est une moyenne de
classements faits par des responsables. Conséquence à assumer : les questions générées résolvent
**98 %** des égalités, donc les axes de disposition n'auront presque jamais l'occasion de
trancher. **À reconsidérer une fois collectés** — s'ils ne départagent rien, leur coût de collecte
n'est peut-être pas justifié par ce seul usage.

### Programmes aux axes non fiables — accessibles, jamais classés

`axes_fiables: false` marque un programme dont les 5 axes **ne décrivent pas son contenu**.
Calculé par `distinctivite.mjs`, trois causes possibles, une seule conséquence :

| Cause | Exemple réel |
|---|---|
| aucun module | `licence-en-gestion`, `bachelor-en-gestion-full-time` — annoncées au sommaire sans page dédiée, leurs axes valent le défaut `3-3-3-3-3`, une valeur inventée |
| moins de 6 modules | `bachelor-professionnel-en-gestion`, 4 modules — un seul module y vaut 25 % et fait basculer deux points de note |
| couverture lexicale insuffisante | `mba-paix-et-securite`, `mba-management-aeronautique-et-aeroportuaire`, `doctorate-in-business-administration-dba` (77 % de modules non reconnus, des intitulés « Séminaire n°1 ») |

**Ce que le moteur doit en faire, et c'est une règle, pas une préférence :**

- il **ne les classe pas par le score**. Les faire concourir donnerait un rang à un vecteur qui
  ne mesure rien, et rien à l'écran ne distinguerait ce rang d'un vrai ;
- il les rend **accessibles par les filtres et par l'aiguillage** : `niveau_acces`, `modalites`,
  `domaines` sont exacts pour ces fiches, seuls les axes ne le sont pas. Les masquer priverait un
  prospect de 16 programmes réels — dont tout le pôle Paix, Sécurité et Diplomatie de Madiba ;
- il les affiche **avec mention**, dans une zone distincte du classement, du genre « d'autres
  programmes de ce domaine que nous ne pouvons pas comparer à ton profil ». Le prospect doit
  savoir que ces filières n'ont pas été notées, et pourquoi.

**`axes_fiables` absent se lit comme `false`**, pas comme `true` : cela signifie que la
distinctivité n'a pas tourné depuis la dernière extraction, donc que rien n'a été évalué.

15 fiches sur 84 sont concernées. C'est un signalement, pas une fatalité : élargir les lexiques
sur la science politique, la diplomatie, la logistique et l'aéronautique ferait repasser une
partie de ces programmes au classement. La liste est produite par `npm run distinctivite`.

### Calibration des seuils — mesurée, plus provisoire

`npm run simuler` remplace l'intuition par la distribution réelle. Les seuils de départ
(0,60 / 0,30 / 0,10) avaient été posés avant toute observation ; la simulation les corrige.

**Méthode, et c'est le point qui compte.** Le tirage porte sur les **réponses possibles aux
questions de profil**, jamais uniformément sur les axes : un tirage sur les axes produirait des
profils que le quiz ne peut pas générer — aucune combinaison de réponses ne donne
`quantitatif: 14, creatif: 0` — et on calibrerait sur des prospects imaginaires.

Le tirage est **exhaustif, pas aléatoire** : 4⁷ = 16 384 combinaisons de réponses, énumérables.
Elles se réduisent à **1942 vecteurs distincts**, regroupés avec leur multiplicité, et les
quantiles sont **pondérés** par elle — sinon un vecteur atteignable par quarante chemins pèserait
autant qu'un vecteur atteignable par un seul. Croisé avec 6 familles et 4 niveaux d'accès :
46 608 classements, 4 secondes.

Les bornes sont **déduites des objectifs**, pas choisies : chaque objectif de la spec fixe une
proportion cible, donc un quantile de la distribution observée.

| Seuil | Cible | Quantile | Avant | Après |
|---|---|---|---|---|
| `correspondance_forte` | forte minoritaire → 25 % des profils | 0,75 des scores de tête | 0,60 | **0,76** |
| `correspondance_bonne` | possible non majoritaire → 35 % | 0,35 des scores de tête | 0,30 | **0,28** |
| `ecart_declenchant_departage` | départage ≤ 1/3 → 30 % | 0,30 des écarts | 0,10 | **0,05** |

Après l'ajout du second étage d'aiguillage, les seuils en place descendent le départage à
**27 %** — sous la cible. La proposition du script viserait 30 % et le ferait donc *remonter* :
`simuler.mjs` détecte ce cas et recommande de **ne rien changer**. Sans ce garde-fou, chaque
exécution ramènerait les seuils à la cible, indéfiniment.

Effet mesuré sur ce que voit un prospect :

| | seuils posés à l'intuition | seuils calibrés |
|---|---|---|
| correspondance forte | 40 % | **25 %** |
| bonne correspondance | 23 % | **40 %** |
| correspondance possible | 37 % | **35 %** |
| départage déclenché | **50 %** | **27 %** |

Les valeurs posées à l'intuition déclenchaient le départage sur **un profil sur deux** et
distribuaient 40 % de « correspondance forte » — une mention forte perd son sens quand deux
prospects sur cinq la reçoivent. Les trois objectifs de la spec sont atteints avec les seuils
calibrés, et `npm run simuler` sort en code d'erreur s'ils cessent de l'être.

**Le script n'écrit pas dans `config/`** : il imprime le bloc à recopier. Les scripts n'écrivent
jamais hors de `data/`, et remplacer un seuil de production est une décision humaine. Le rapport
complet va dans `data/_calibration.json`.

Distribution du score de tête, pour mémoire : minimum −0,97, médiane 0,48, maximum 1,00. Un score
négatif est normal — le prospect a la forme opposée à celle du programme.

### Mesure par famille — l'engorgement n'est pas là où on le croyait

Le taux de départage global masquait deux choses opposées. **Un chiffre global ne dit jamais où
corriger** ; la mesure par famille, elle, le dit :

| Famille | Fiches | Classées | Départage | Ex æquo |
|---|---|---|---|---|
| `entreprise-management` | 32 (38 %) | **8,6** (17,8 avant) | 22 % | 2,2 |
| `droit-action-publique` | 21 (25 %) | 10,5 | **61 %** ⚠ | 2,9 |
| `chiffres-finance` | 16 (19 %) | 9,3 | 26 % | 2,3 |
| `numerique` | 13 (15 %) | 9,0 | 33 % | 2,6 |
| `commerce-communication` | 12 (14 %) | 8,0 | 36 % | 2,3 |
| `ingenierie-industrie` | 8 (10 %) | 4,0 | 12 % | 2,0 |

**Deux problèmes distincts, pas un seul :**

- **la largeur de l'entonnoir** — `entreprise-management` laissait 17,8 filières en lice, contre
  4,0 pour la plus petite famille. C'est un problème d'aiguillage, réglé par un second étage
  conditionnel : 17,8 → **8,6**, en ligne avec les autres familles ;
- **le pouvoir de discrimination du score** — c'est `droit-action-publique` qui départage le plus,
  **61 %** des profils, loin devant tout le reste. Ce n'était PAS `entreprise-management`, qui est
  à 22 %, en dessous de la moyenne. Explication déjà connue par ailleurs : l'École de Droit partage
  son tronc commun, et les formes d'axes de ses programmes sont quasi identiques. Ce problème-là ne
  se règle pas par l'aiguillage mais par la cascade de départage — les métiers exclusifs séparent
  ce que les axes ne séparent pas.

L'alerte d'engorgement porte donc sur les **filières restant en lice**, pas sur le nombre de fiches
de la famille : une famille peut porter 39 % du catalogue et aiguiller correctement si elle a un
second étage. Une seconde alerte signale une famille où le score départage plus d'un profil sur
deux. `chargeParFamille()` est exposé pour que tout cela reste mesuré et jamais estimé.

### Ce que la simulation a appris d'autre

**Le repli sur les parts ne se déclenche jamais** (0 % des profils) et aucun profil ne se retrouve
sans filière à classer. Les options à deux axes rendent effectivement un vecteur parfaitement plat
inatteignable — mais le repli reste implémenté et testé, parce qu'une refonte des questions
pourrait le rendre atteignable sans que personne y pense.

**Il ne reste que 1 % des profils dont l'égalité n'est tranchée par rien** (étage 5). C'est cela,
et non les 57 paires de la distinctivité, l'ordre du jour réel des entretiens.

### Limite connue du scoring

Un profil plat ne produit aucune forme, donc aucun classement — c'est le cas limite `den == 0`
ci-dessus. Deux parades, toutes deux à implémenter : questions à choix tranchés plutôt
qu'échelles continues, et refus d'afficher un gagnant quand l'écart est sous le seuil.

### Familles — le niveau que le prospect choisit

Trois étages, du plus grossier au plus fin : **famille → domaine → programme.**

| Étage | Combien | Qui s'en sert |
|---|---|---|
| famille | 6 | la question d'aiguillage `A1` |
| domaine | 30 (28 utilisés) | l'aiguillage fin `A2`, la distinctivité, et **les 2 axes de disposition** |
| programme | 84 | le résultat |

Les 6 familles, dans `config/taxonomy.json > familles` :

| id | Domaines regroupés | Fiches |
|---|---|---|
| `entreprise-management` | gestion, management-projet, entrepreneuriat, rh, qualite, rse | 32 |
| `droit-action-publique` | droit, science-politique, administration-publique | 21 |
| `chiffres-finance` | finance, marches-financiers, comptabilite, fiscalite, assurance, mathematiques | 16 |
| `numerique` | informatique, reseaux, cybersecurite, data, design-web | 13 |
| `commerce-communication` | marketing, commerce-international, communication, journalisme, culture-evenementiel | 12 |
| `ingenierie-industrie` | ingenierie, electronique, energie, agrobusiness, logistique | 8 |

**Pourquoi ce niveau existe.** On ne peut pas demander à un prospect de choisir parmi 30 domaines.
La famille sert **au parcours, et à lui seul** : c'est l'unité de la question d'aiguillage. Elle ne
porte aucune donnée de scoring. Une famille trop large reçoit une seconde question qui descend au
domaine — voir « L'aiguillage a deux étages ».

Invariant vérifié par `validate.mjs` : **un domaine appartient à une famille et une seule**, et
aucun domaine n'est orphelin. Un domaine hors famille sortirait du parcours sans prévenir. La
liste des domaines d'une famille est l'unique source de vérité — les fiches ne portent pas de
champ `famille`, il se déduit de la taxonomie. 18 fiches sur 84 relèvent de deux familles, par
leurs deux domaines : c'est voulu, une licence Droit-Gestion appartient bien aux deux.

### Les axes de disposition se collectent par DOMAINE, jamais par famille

Décision changée. La spec a un temps placé `ancrage` et `abstraction` au niveau de la famille,
pour économiser des séances de collecte. **C'est faux, et la raison n'est pas budgétaire.**

Le scoring intervient **après** l'aiguillage, donc à l'intérieur d'une famille. Au niveau
famille, `ancrage` et `abstraction` seraient identiques pour tous les programmes candidats : deux
constantes s'ajoutant à l'identique à chaque comparaison, donc **aucun pouvoir discriminant là
où on en a précisément besoin**. Au niveau domaine, ils varient à l'intérieur d'une famille —
environ 5 domaines par famille.

`config/domaines_axes.json` porte donc une entrée par domaine réellement utilisé, **28**, triées
du plus porté au moins porté (`gestion` 22 fiches, `droit` 15, … `rse` 1). `config/familles_axes.json`
n'existe plus. Deux règles y sont écrites, parce qu'elles se posent dès la première séance :

- **domaine partagé entre écoles.** `gestion` est porté par 6 écoles, `finance` par 4. Tranché :
  **moyenne des réponses**, pas de propriétaire unique — un propriétaire unique effacerait le
  fait que `gestion` ne désigne pas la même chose à l'École d'Ingénieurs et à Madiba. Les
  réponses individuelles se consignent, et un écart de 2 points ou plus entre deux responsables
  est un signal à examiner, **jamais à lisser** ;
- **fiche à deux domaines.** Les 19 fiches concernées prennent la **moyenne simple** de leurs
  deux domaines. Aucune pondération : rien ne dit que le premier domaine pèse plus que le second.

**Méthode de collecte** — elle a changé, elle ne repose plus sur un tri de portraits fictifs.
Chaque responsable **classe ses domaines**, deux fois : du plus « bureau et dossiers » au plus
« terrain et déplacement », puis du plus « concret, résultat visible vite » au plus « abstrait,
plusieurs réponses défendables ». Un classement de domaines réels est plus rapide et plus fiable
qu'un tri de portraits inventés.

Deux domaines repères — `logistique` et `droit` — sont insérés dans **chaque** classement, y
compris hors de l'école concernée. Sans eux les cinq classements ne sont pas comparables entre
eux : un 3 chez Madiba et un 3 chez Ingénieurs ne voudraient rien dire ensemble.

`validate.mjs` vérifie que **tout domaine utilisé par une fiche existe dans
`domaines_axes.json`** — sinon deux axes seraient scorés à vide sans que rien ne le signale.

### L'aiguillage a deux étages, le second est conditionnel

Le prospect choisit une **famille** (`A1`). Une famille qui porte 39 % du catalogue ne réduit
cependant rien à elle seule : la simulation mesurait **17,8 filières encore en lice** pour
`entreprise-management`, contre 4,0 pour la plus petite famille, là où l'entonnoir visait ~10.

D'où `A2`, une **seconde question posée à cette seule famille**. Les cinq autres n'en ont pas
besoin et **ne doivent pas la subir** : une question sans effet sur le jeu candidat est du temps
volé au prospect. La garde s'écrit dans la donnée, `si: { famille: "…" }`, jamais dans le code.

Principe du découpage : **ce que le prospect se voit gérer**. La table est **dérivée de
l'appartenance réelle des domaines** dans `config/taxonomy.json`, pas écrite à la main :

| Réponse | Domaines |
|---|---|
| Des personnes, des équipes | `rh` |
| Des projets, du début à la fin | `management-projet` |
| Des opérations, de la qualité, des normes | `qualite`, `rse` |
| Ma propre activité, que je crée | `entrepreneuriat` |
| Je ne veux pas me limiter à un seul de ces registres | `gestion` |

**Aucun domaine de la famille ne doit rester inatteignable** — `validate.mjs` et `npm test` le
refusent, parce qu'un domaine inatteignable retirerait ses fiches du parcours quelle que soit la
réponse, sans que rien ne le dise. La dernière option est indispensable : `gestion` porte 22 fiches
légitimement généralistes, et un prospect qui hésite entre plusieurs registres ne doit pas être
forcé.

Résultat mesuré : **17,8 → 8,6** filières en lice, et le taux de départage de la branche passe de
31 % à 22 %.

Deux cas que la donnée réelle a imposés :

- **`entrepreneuriat` porte 0 fiche** dans le catalogue 2024. L'option doit exister — sinon le
  domaine serait inatteignable — mais elle ne désigne aujourd'hui aucun programme ;
- **une option peut vider le jeu candidat** sur une combinaison parfaitement légitime : un bachelier
  qui choisit un registre dont la famille ne propose que des masters. Le moteur **revient alors à la
  famille et le dit** dans ses alertes. Un élargissement silencieux serait pire qu'un cul-de-sac :
  le prospect croirait avoir été entendu.

### Aiguillage — 2 domaines maximum, et jamais depuis les seuls modules

Un domaine n'est retenu que si son vocabulaire apparaît dans le **titre** ou dans l'**objectif**.
Les modules ne servent qu'à ordonner les candidats déjà légitimés.

Raison mesurée : toute filière ISM enseigne de la gestion, du droit et de la comptabilité en tronc
commun. En comptant les modules, `gestion` se collait à **48 fiches sur 84** et l'aiguillage
n'aiguillait plus rien. Avec la règle titre-ou-objectif et un plafond de 2 domaines : 22 fiches
pour `gestion`, 57 fiches à un seul domaine.

**Le plafond de 2 déplace un domaine quand un troisième se corrobore mieux, et c'est un effet à
surveiller après toute correction d'extraction.** Huit modules retrouvés sur
`licence-de-gestion-option-comptabilite-finance` ont fait passer sa paire de domaines de
`comptabilite + gestion` à `finance + comptabilite` : la fiche a **changé de famille** et n'est
plus comparée aux autres options de son propre programme. Voir « Options sœurs ». `npm test` refuse qu'un domaine dépasse le tiers du
catalogue.

Deux garde-fous appris sur les données :

- un domaine tiré du **seul objectif** doit être corroboré par au moins 2 modules. L'objectif est
  de la prose marketing : un mot y passe sans rien engager ;
- le mot `management` seul est **exclu** du lexique de `gestion` — il colle à tout. Les programmes
  de management général sont attrapés par leurs formules propres (`business administration`,
  `executive mba`, `cadres dirigeants`).

Piège inverse à connaître : `développement durable` et `développement personnel` ne sont pas de
l'informatique. Un lexique de domaine se teste sur les 84 titres avant d'être élargi.

### Titres — petites capitales mal encodées

Les catalogues composent leurs titres en petites capitales. La police n'a pas de glyphe minuscule
pour les lettres accentuées : InDesign retombe sur la capitale pleine, et l'extraction lit
`MÉtiers`, `MÉdias`, `ÉvÉnements`. La réparation se fait **mot par mot** : une capitale accentuée
qui n'ouvre pas le mot redevient minuscule, mais un mot entièrement en capitales est laissé tel
quel — sinon `MASTÈRE` deviendrait `MAStère`.

Les titres tout en capitales ou tout en minuscules sont remis en casse (sigles préservés via une
liste : MBA, DBA, QHSE, RSE, UX…). Un titre déjà composé en casse mixte par la brochure n'est
jamais retouché. Les `id` ne changent pas : `slug()` est insensible à la casse.

### Inférence des axes — depuis les UE, pas depuis la prose

Les axes doivent être inférés depuis `unites_enseignement`, pas depuis la description
marketing. Vérifié : l'inférence lexicale sur la prose donnait `rigueur: 1` à une licence
Finance enseignant l'audit et le droit fiscal. Les listes de modules décrivent le contenu
réel et produisent un classement nettement plus juste.

Même source pour `exigence_quantitative` : compter les modules de mathématiques,
statistiques, économétrie et probabilités dans les UE. Repère observé — 9 modules pour
Mathématiques appliquées, 0 pour Journalisme.

### Normalisation des cinq axes — proportion des modules du programme

Question tranchée, à ne plus reposer :

> **La note est la part des modules du programme que le lexique de l'axe capte.**
> Le dénominateur est le nombre de modules **de ce programme** — ni le maximum du
> catalogue, ni la somme des autres axes. Les seuils sont ensuite **absolus sur cette
> proportion** : 10 % de modules par point, 40 % suffisent pour un 5.

```
note = 1 + floor( (modules captés / modules du programme) / 0.1 ),  borné à 1..5
```

Ce n'est donc ni une normalisation relative aux autres axes, ni une normalisation au
maximum du catalogue. Deux conséquences qu'il faut avoir en tête :

- **le comptage absolu est écarté**, et c'est volontaire : Journalisme aligne 41 modules,
  UX Design 11. En valeur absolue, un programme court ne pourrait jamais être marqué sur
  quoi que ce soit ;
- **le tronc commun dilue.** 23 % des 1937 modules du catalogue ne relèvent d'aucun axe
  (anglais, langues, méthodologie, actions de recherche encadrées, projet d'entreprise,
  philosophie). Ils restent au dénominateur, ce qui tire toute la distribution vers le bas :
  la moyenne des cinq axes est **2,4 et non 3**. Un profil de prospect centré sur 3
  favoriserait donc mécaniquement les filières les moins marquées — à traiter dans le moteur
  de scoring, par centrage ou par comparaison rang à rang, pas en gonflant les lexiques.

### Deux sorties pour une seule mesure : `axes` et `axes_parts`

Le comptage écrit **les deux**, au même moment, depuis le même passage. Ne jamais recalculer
l'un depuis l'autre.

| Champ | Contenu | Sert à |
|---|---|---|
| `axes` | notes entières 1..5 | l'**affichage**, la discussion avec un responsable, les tests d'ancrage |
| `axes_parts` | la proportion brute, 4 décimales | le **calcul** de corrélation, et lui seul |

Raison mesurée, et c'est le genre de détail qu'une session future supprimerait par
simplification : `noter()` écrase 10 points de proportion dans un seul entier. Sur 5
dimensions, cet arrondi fabriquait des **égalités exactes à r = 1,00** entre programmes de
formes différentes — 10 paires intra-domaine sur 410. Un ex æquo parfait n'est pas classable :
le moteur n'a plus rien pour trancher, et l'ordre devient celui du système de fichiers.

Sur les proportions : **0 égalité exacte**, et 83 vecteurs distincts sur 84 fiches contre 70
avec les notes. Les quasi-égalités, elles, augmentent — 38 paires à `r ≥ 0,97` contre 14 — parce
qu'une mesure plus fine rapproche ce que l'arrondi séparait arbitrairement. C'est cohérent avec
le régime de départage : les proches restent proches, mais ils sont désormais **ordonnables**.

`npm test` vérifie les deux faits : chaque note est cohérente avec sa proportion, et les
égalités exactes présentes sur les notes ont disparu sur les proportions.

**Les cinq axes sont indépendants.** Un module compté par `technique` ne retire rien à
`creatif` : il peut nourrir les deux, et `axesDunModule()` renvoie bien une liste. Il n'y a
aucune attribution exclusive, aucun ordre de priorité entre lexiques. Mesuré sur
`mastere-ux-design` : « Technologies UX » comptait déjà pour `technique` **et** `creatif`,
alors que `creatif` valait 1. La cause n'était donc pas une concurrence entre axes mais un
trou lexical — **6 modules sur 11 captés par aucun axe**, dont « Maîtrise de l'interface » et
« Connaissance de l'utilisateur ».

Corollaire de diagnostic : **un axe bas ne veut jamais dire « un autre axe l'a pris »**. Il
veut dire « le lexique n'a pas reconnu les modules », ou « le tronc commun dilue ».
`node scripts/axes-modules.mjs <id>` rend les deux lisibles en une commande — il affiche,
module par module, quels axes le captent, et compte les orphelins.

### Faire évoluer un lexique d'axe

Un lexique est de la donnée déguisée en code : il se dégrade en silence dès qu'un module
change de libellé. Trois règles apprises sur les données :

- **élargir depuis les modules réels** d'un programme emblématique, jamais depuis une liste
  de mots plausibles ;
- **relire le lexique élargi sur les programmes des autres axes**, là où il fabrique des faux
  positifs. Ceux qui ont été attrapés ainsi : `developp` marquait « Développement personnel »
  en technique, `redaction` marquait « Rédaction d'actes » en créatif, `api` non borné
  marquait « Marchés des cap**ita**ux », `patrimoine` non qualifié marquait le Master Gestion
  du Patrimoine en créatif. D'où les gardes `developp(?!ement (durable|personnel|…))`,
  `redaction (web|editorial|…)`, `\bapi\b`, `patrimoine (immateriel|culturel|…)` ;
- **ancrer par un test.** `npm test` vérifie quatre programmes dont personne ne discute la
  note — UX Design ≥ 4 en créatif, Mathématiques appliquées ≥ 4 en quantitatif, Génie
  logiciel ≥ 4 en technique, Droit des Affaires ≥ 4 en cadre — plus la liste des faux
  positifs ci-dessus et le fait que chaque axe prend au moins 3 valeurs distinctes sur le
  catalogue. Un axe qui ne distingue plus personne ne pèse rien dans une distance euclidienne.

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

## Les 7 axes — deux natures, deux rôles

| Axe | Nature | Source | Niveau | Rôle dans le score |
|---|---|---|---|---|
| quantitatif, technique, relationnel, creatif, cadre | compositionnels : ils se partagent un budget de modules | comptage des UE | filière | **classement**, par corrélation de forme |
| ancrage (bureau ↔ terrain) | notation indépendante | classement des domaines par les responsables | domaine | **départage** des proches, par distance |
| abstraction (concret ↔ abstrait) | notation indépendante | classement des domaines par les responsables | domaine | **départage** des proches, par distance |

Les deux natures ne se mélangent pas dans un même vecteur — voir « Comment les 2 axes de
disposition entrent dans le score ».

`cadre` absorbe l'ancien axe `rythme`, `abstraction` absorbe `ambiguite` : ils étaient corrélés,
et deux axes corrélés pèsent double dans toute comparaison de vecteurs.

## Distinctivité — le calcul central

`scripts/distinctivite.mjs` calcule, pour chaque programme, ce qui le distingue des autres de son
domaine : modules exclusifs, métiers exclusifs, plus proche voisin par chacune des mesures.

Ce calcul sert trois fois :
1. il fournit le contenu des questions de fin de parcours, dans les mots de la brochure ;
2. il fournit la justification traçable du résultat ;
3. il produit **la liste des paires à soumettre aux responsables**, et les fiches de comparaison
   qui servent de document de travail en entretien.

Exemple vérifié : Master Marché Financier & Trading et MBA Banque-Assurance n'ont **aucun** module
commun (stratégie de trading, produits dérivés, BRVM-FOREX contre techniques d'assurance, droit
bancaire, comptabilité des compagnies d'assurances). Le catalogue les sépare seul. `npm test` le
vérifie : c'est le contrôle qui dit si le calcul mesure encore quelque chose.

### Trois mesures, qui ne disent pas la même chose

| Mesure | Ce qu'elle dit | Ce qu'elle ne dit pas |
|---|---|---|
| recouvrement de **modules** | ce que le catalogue partage | qui produira un ex æquo |
| corrélation d'**axes** | qui produira un ex æquo au scoring | ce que les deux enseignent |
| recouvrement d'**UE** | où le comptage est aveugle | rien, si le catalogue ne publie pas d'UE |

**Le seuil de 80 % ne suffit pas comme critère de sélection**, pour deux raisons distinctes.

D'abord, l'appariement exact **sous-estime** le recouvrement. C'est un choix délibéré et correct
— un appariement flou rendrait le taux ininterprétable — mais il faut en assumer la conséquence :
entre Génie logiciel–Réseaux et Électronique-Télécoms, « Technologies JAVA-.NET & Python » et
« Programmation Python » comptent pour deux modules distincts alors qu'ils partagent Python. Le
taux mesuré est une **borne inférieure**.

Ensuite, le moteur doit départager **tous** les programmes d'un domaine, pas seulement les
quasi-jumeaux. Les paires à 60-79 % sont celles où le catalogue distingue un peu mais où le
scoring produira quand même des ex æquo.

**Et le recouvrement de modules ne prédit pas l'ex æquo.** C'est la corrélation d'axes qui le
prédit. Vérifié :

| | quant | tech | rel | créa | cadre |
|---|---|---|---|---|---|
| Génie logiciel – Réseaux et Systèmes | 2 | 5 | 2 | 1 | 2 |
| Électronique, Télécoms et Systèmes embarqués | 2 | 5 | 1 | 1 | 1 |

`r = 0,94` pour **26 %** de modules communs seulement. Quel que soit le profil du prospect, ces
deux programmes obtiendront des scores voisins et le départage se déclenchera — alors qu'un seuil
à 80 % sur les modules les aurait laissés passer. `npm test` vérifie exactement ce cas.

**Sélection retenue : les 3 paires les plus proches PAR DOMAINE, selon chacune des deux premières
mesures.** Sur le catalogue 2024 : **57 paires**, dont 32 par les modules, 44 par les axes, 19 par
les deux. Seules 4 dépassent l'ancien seuil unique de 80 % — l'écart mesure exactement ce que ce
seuil manquait. Chaque paire porte ses deux valeurs et le motif de sa sélection (`retenue_par`).

Fait à connaître avant de toucher au calcul : **la corrélation sature.** 19 des 57 paires retenues
sont à `r ≥ 0,97` — Pearson est invariant d'échelle, donc deux formes proportionnelles corrèlent à 1
sans avoir le même vecteur. Les quasi-ex æquo sont le régime normal.

Les **égalités exactes**, en revanche, ont disparu depuis que le calcul porte sur `axes_parts` et
non sur les notes arrondies : elles étaient 10 sur 410 paires intra-domaine, elles sont 0. Un
`slice(0, 3)` sur des égalités choisirait arbitrairement ; les quasi-égalités se départagent par le
recouvrement de modules, puis par l'`id` pour rester déterministe.

### Comment le recouvrement est mesuré

Jaccard sur les **modules**, comparé aux seuls programmes partageant un domaine — on ne se
distingue que de ce avec quoi on peut être confondu. À défaut de modules (les 2 fiches annoncées
au sommaire sans page dédiée), sur les métiers.

**Aucun rapprochement flou.** Deux libellés différents sont deux modules différents : « Marchés
des capitaux » et « Introduction au marché des capitaux » ne sont pas comptés comme communs. Un
appariement approximatif ferait du recouvrement une opinion au lieu d'une mesure. La conséquence
assumée : le recouvrement est plutôt sous-estimé, d'où la sélection par domaine plutôt que par
seuil.

### Contrôle de couverture des lexiques

Même script, même passage : la part des modules qu'**aucun** lexique d'axe ne reconnaît, par
programme, comparée à la moyenne du catalogue (**23 %**). Tout programme au-delà de 1,6 fois cette
moyenne est signalé — ses axes ne décrivent pas son contenu.

C'est ce contrôle, et lui seul, qui aurait détecté le bug d'UX Design : **55 %** de modules non
reconnus quand la moyenne était à 26 %. Il signale aujourd'hui 13 programmes, dont le DBA (des
intitulés « Séminaire n°1 » qui ne portent aucune information) et toute la science politique,
la diplomatie, la logistique et l'aéronautique — dont le vocabulaire est absent des cinq lexiques.
Les fiches sous 6 modules sont exclues du contrôle : un seul orphelin y ferait déjà 20 %.

### Options sœurs — un recouvrement élevé qui n'est pas un problème

Deux options d'un même programme partagent forcément leur tronc commun. La Licence de Gestion
option Comptabilité-Finance et l'option RH ont **49 modules identiques sur 54**, soit 91 % : c'est
attendu, pas un défaut du catalogue, et ça ne se soumet pas à un responsable — ce qui les sépare
est déjà écrit dans la brochure, à savoir le nom de l'option et les quelques modules exclusifs de
chacune. La question de départage s'y **génère**, elle ne se demande pas.

**Angle mort à connaître, découvert en recalculant l'aval :** cette paire ne figure plus dans
`_paires.csv`. La distinctivité ne compare que des programmes **partageant un domaine**, et les
deux options n'en partagent plus aucun — l'option Comptabilité-Finance est passée de
`comptabilite + gestion` à `finance + comptabilite` quand une UE retrouvée à l'extraction (huit
modules, dont « Mathématiques Financières » et « Décisions financières ») a corroboré `finance`,
qui a déplacé `gestion` sous le plafond de 2 domaines.

**Sans conséquence pour le moteur, et il faut savoir pourquoi** : les deux options relèvent
désormais de deux familles différentes, donc l'aiguillage ne les met jamais en concurrence — il
n'y a jamais de départage à produire entre elles. L'angle mort est celui de la *mesure*, pas du
parcours : une paire à 91 % n'est plus visible dans les sorties de la distinctivité. Si un jour
elle doit l'être, la comparaison doit inclure les **fiches sœurs** indépendamment du domaine,
`sontSoeurs()` étant déjà là pour les reconnaître.

`_paires.csv` porte donc une colonne `type` (`ambigue` / `option-soeurs`) et une colonne
`destinataire` (`responsable` / `code`), les vraies ambiguïtés d'abord : le CSV s'envoie tel quel,
personne n'a à trier les lignes qui ne le concernent pas. `report.mjs` applique la même règle et
ne pose jamais la question de départage entre deux sœurs.

Deux fiches sont sœurs si elles partagent un `programme_parent`, si l'une est le parent de
l'autre, ou si toutes deux portent une `option` et le même titre-racine. Ce dernier cas est
nécessaire : le catalogue Master décline « Fiscalité-Droit des Affaires » en 4 options sans jamais
publier de page pour le programme lui-même, donc sans `programme_parent` à quoi se raccrocher.

### Résultat sur le catalogue 2024

**57 paires retenues**, dont 6 d'options sœurs traitées par le code. **51 vont aux responsables.**
Les 3 paires au-delà de 80 % de modules communs, toutes explicables :

| Recouvrement | Type | Paire | Lecture |
|---|---|---|---|
| 92 % | option sœur | Fiscalité-Droit des Affaires, options *Droit des Affaires* / *Fiscalité* | 11 modules communs, 1 propre — l'option nomme la différence |
| 85 % | **ambiguë** | Licence Génie logiciel – Réseaux et Systèmes / Licence Informatique | 33 modules communs, la seconde est le diplôme délocalisé INU : rien n'indique au prospect comment choisir |
| 85 % | **ambiguë** | Master Droit Notarial et Gestion du Patrimoine / Fiscalité-Droit des Affaires | tronc commun de l'École de Droit |

76 programmes sur 84 gardent au moins un module exclusif dans leur domaine : le catalogue fait
donc l'essentiel du travail de discrimination. Les 51 paires restantes ne sont pas 51 fiches à
relire — ce sont **51 comparaisons ciblées**, réparties entre cinq personnes (23 documents pour
Management, 22 pour ISM Online, 14 pour Ingénieurs, 10 pour Madiba, 8 pour Droit, 3 pour Digital
Campus). Le volume se règle par `--par-domaine`, aujourd'hui à 3.

Sorties : `distinctivite`, `structure_ue` et `voisines` écrits dans chaque fiche, plus
`data/_paires.csv` (colonnes `question_de_departage`, `reponse_a`, `reponse_b` à remplir en
entretien, puis à reporter dans `config/departages.json`).

### Fiches de comparaison — le document de travail de l'entretien

`npm run comparaisons` écrit, dans `data/_comparaisons/`, une fiche imprimable par paire retenue
(options sœurs exclues, plus un `SOMMAIRE.md` filtrable par école). Chacune porte, dans cet ordre :
l'en-tête comparatif et **ce que le catalogue mesure déjà**, le **socle partagé** présenté comme ne
distinguant rien, les modules et débouchés propres à chaque programme, les trois questions, et un
bloc JSON prêt à reporter dans `config/departages.json`.

Les **trois questions sont fixes** :

1. Pour vous, qu'est-ce qui les distingue réellement ?
2. Vers quoi mène l'une que l'autre ne mène pas ?
3. Un étudiant qui réussit dans l'une pourrait-il être en difficulté dans l'autre ? À quoi le
   verriez-vous ?

**Aucune ne demande au responsable de formuler quelque chose pour un prospect.** C'est la règle qui
justifie leur formulation : les responsables enseignent, ils ne sont presque jamais en contact avec
les candidats. Leur demander de rédiger une question d'orientation produirait une réponse inventée
qui aurait l'apparence d'une donnée. La rédaction des questions du quiz est un travail de
conception, fait ensuite, à partir de leur substance et du vocabulaire recueilli aux admissions.

**Paires à cheval sur deux écoles** — 29 sur 51, par exemple Master Audit à ISM Online et MBA Audit
à Management : le script produit alors **deux demi-fiches**, chacune portant trois questions sur le
seul programme que ce responsable connaît. Le contraste est reconstruit ensuite, par nous. Demander
à un responsable de comparer son programme à un autre qu'il n'a jamais vu produirait une réponse
polie et fausse. D'où 80 documents pour 51 paires.

## La structure en UE porte des distinctions que les axes ne voient pas

Le comptage des axes traite les 1937 modules comme un **sac de mots** et jette la structure en
unités d'enseignement. Or c'est elle qui porte la distinction que ni les modules ni les axes ne
voient : une **direction** — qu'est-ce qui sert à quoi — et une **étendue**.

| Paire | L'un | L'autre |
|---|---|---|
| Génie logiciel · Électronique-Télécoms | large sur soft, hard et réseau | profond sur le matériel, la programmation au service du matériel |
| Maths appliquées-Économétrie · Modélisation statistique | large : ML, big data, actuariat | profond : risque crédit, scoring, séries temporelles, R/STATA/GRETL |

**Le marqueur est détectable sans aucun lexique.** Génie logiciel porte une UE *Management &
Organisations* (management des processus, management de projet, droit du numérique, obligations
juridiques et fiscales, droit du travail). Maths appliquées porte **la même UE, aux mêmes modules**.
Électronique-Télécoms ne l'a pas. Modélisation statistique ne l'a pas. Ce bloc est la signature d'un
programme tourné vers l'entreprise plutôt que vers l'approfondissement technique, et il sépare les
deux paires **dans le même sens**. `npm test` le vérifie sur les quatre fiches.

Trois exploitations, par ordre de simplicité. Les deux premières sont faites :

1. **UE type, attribut booléen** — `structure_ue.blocs_types`. Les UE que le catalogue répète sont
   détectées par similarité d'intitulé (**23 blocs** portés par au moins 3 programmes), jamais par
   une liste écrite à la main qui se périmerait à la prochaine édition ;
2. **concentration** — `structure_ue.concentration`, part des modules portée par la plus grosse UE.
   Médiane 0,35, de 0,21 à 0,55. **Mesure brute, sans seuil et sans libellé dérivé** : rien ne dit
   encore où placer la frontière entre spécialisé et généraliste, et inventer un seuil ici referait
   l'erreur des seuils 85/70. Candidate à devenir un attribut affiché, et peut-être un axe, après
   test ;
3. **UE d'appartenance comme qualificateur** — « Programmation Python » dans une UE « Électronique
   et Systèmes Embarqués » ne joue pas le même rôle que dans une UE « Développement web ». Même mot,
   deux fonctions. **Non engagé** : c'est une refonte du comptage, à ne pas lancer avant d'avoir
   mesuré ce que 1 et 2 apportent.

### La structure en UE ne couvre que les licences et bachelors — 28 fiches sur 84

**Limite structurelle, à connaître avant de s'appuyer sur `structure_ue`.** Le découpage en unités
d'enseignement n'existe que dans la brochure Bachelor. Répartition exacte :

| Niveau délivré | Avec découpage d'UE | Sans |
|---|---|---|
| licence | 22 | 0 |
| bachelor | 6 | 2 |
| master | 0 | **25** |
| mba | 0 | **28** |
| dba | 0 | 1 |

**Masters, MBA, mastères et le DBA en sont intégralement dépourvus.** Ce n'est pas un défaut
d'extraction : vérifié sur le PDF, pages 25 et 49 du catalogue Master, il n'y a **rien à
récupérer**. Le bloc `CONTENUS PÉDAGOGIQUES` est une liste plate de puces, sans le moindre
sous-titre :

```
CONTENUS PÉDAGOGIQUES
• Introduction aux marchés des capitaux
• Elaboration, lecture et diagnostic des états financiers
• Initiation au Trading
…
```

Le catalogue Online n'en a pas davantage : ses `Enseignements M1` / `Enseignements M2` sont un
découpage **temporel** — première puis deuxième année —, pas thématique. Ils ne disent rien de la
direction du programme.

Les deux libellés sont donc traités comme des **conteneurs génériques**, pas comme des UE : les
compter donnerait une concentration de 100 % à 56 fiches. D'où `structure_ue.publiee` et
`concentration: null` quand il est faux.

**Ce qui existe à la place, à un grain beaucoup plus grossier :** le catalogue Master imprime
au-dessus de chaque titre un bandeau `Parcours <thème>`, capturé dans le champ `parcours`. Il donne
**4 thèmes pour 22 fiches** :

| Fiches | Parcours |
|---|---|
| 9 | Responsabilité, organisation et management |
| 6 | Innovation entreprenariat et technologies |
| 5 | Investissement et gouvernance d'entreprise |
| 2 | Communication, créativité et marketing |

C'est un regroupement de **portefeuille**, pas une structure de contenu : il ne dira jamais quel
module sert à quel autre. Utilisable comme grouping de secours, jamais comme substitut aux UE.

Piège d'extraction sur ce champ : le bandeau est composé en petites capitales et la brochure en
**inverse parfois les mots** — « Parcours créativité, communication et marketing » et « Parcours
Communication, Créativité et Marketing » désignent le même parcours. Le rapprochement se fait en
fin d'extraction, par ensemble de mots, en retenant le libellé le plus fréquent — pas par une liste
écrite à la main, qui se périmerait à la prochaine édition. `npm test` refuse deux libellés portant
les mêmes mots.

**Conséquence pour le moteur** : tout usage de `structure_ue` (bloc type, concentration) doit
supposer le champ absent pour deux programmes sur trois, et ne jamais faire de `publiee: false` un
signal négatif — c'est une propriété de la brochure, pas du programme.

Le script signale enfin les paires où **les modules se recouvrent nettement plus que les UE** — le
cas où le comptage est aveugle et où une vraie distinction existe. Sur le catalogue : Contentieux et
Recouvrement / Droit des Affaires (56 % de modules, 32 % d'UE) et Génie logiciel / Informatique
(85 % / 63 %).

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

1. les 2 axes de disposition, **par domaine** — chacun classe ses domaines deux fois, avec
   `logistique` et `droit` comme repères communs. 28 domaines dans `config/domaines_axes.json`,
   du plus porté au moins porté ;
2. les **paires proches** que la distinctivité n'a pas séparées — liste produite par le code,
   options sœurs exclues, une fiche de comparaison imprimée par paire
   (`npm run comparaisons`) ;
3. « à qui déconseillez-vous cette filière ? » — leurs mots servent aux options du quiz ;
4. une validation de bon sens sur quelques recommandations ;
5. les corrections au catalogue 2024 (programmes fermés, renommés).

**On ne leur demande jamais de formuler une question pour un prospect.** Les responsables
enseignent, ils ne sont presque jamais en contact avec les candidats : leur demander de rédiger
une question d'orientation produirait une réponse inventée qui aurait l'apparence d'une donnée.
Les trois questions des fiches de comparaison portent donc sur ce qu'ils savent — la distinction
réelle, les débouchés, les cas d'échec. La rédaction des questions du quiz est un travail de
conception, fait ensuite, à partir de leur substance et du vocabulaire recueilli aux admissions.

**L'ordre du jour des entretiens est un résultat du code, pas un préalable.** Ne pas lancer les
entretiens avant que `distinctivite.mjs` ait tourné : sinon on consomme la ressource la plus rare
du projet sur des questions que le catalogue aurait répondues.

### Ce qu'on ne leur demande plus

`report.mjs` a été purgé de deux familles de questions, et il ne faut pas les y remettre :

- **les séries de bac** : aucune brochure n'en porte et ISM n'en exige pas. Une question sans
  réponse possible n'est pas une question, c'est du bruit dans le CSV ;
- **les 5 axes de contenu** : ils sont comptés depuis `unites_enseignement`. Demander de
  « confirmer » un comptage revient à demander de le refaire à la main. `eligibilite.niveau_maths`
  tombe avec eux : `exigence_quantitative` porte la même information, mesurée.

Reste demandé par fiche : `deconseille_si`, `profil_ideal`, `vitrine.accroche`, la validation de
l'aiguillage (`domaines`), le `niveau_acces` quand il est déduit (68 fiches, aux admissions), et le
départage des voisines retenues par la distinctivité.

Effet mesuré : **5,5 questions par fiche au lieu de 7**, et plus aucune question à laquelle personne
ne peut répondre. Le chiffre est remonté de 4,9 à 5,5 en passant du seuil unique à la sélection par
domaine : c'est le prix assumé de paires qu'un seuil à 80 % laissait passer et qui auraient fait
trébucher le moteur en production.

## Validation par les étudiants actuels

Avec une seule personne par école, aucune vérification croisée institutionnelle n'est possible.
La cohorte étudiante devient le seul garde-fou et n'est pas optionnelle : 20 à 30 étudiants de
2e/3e année passent le quiz. S'il recommande la finance à un étudiant de finance satisfait, le
modèle tient. Sinon, on sait quelle école est mal calibrée.

Coût : une matinée, aucun responsable mobilisé.

## Le moteur — `src/engine/`

| Fichier | Responsabilité |
|---|---|
| `score.mjs` | corrélation de forme, repli sur les parts, les 3 niveaux affichés, classement |
| `filtres.mjs` | `niveau_acces` et `modalites` : ils excluent, ils ne notent jamais |
| `aiguillage.mjs` | famille → domaines → candidates, et la mesure de charge par famille |
| `departage.mjs` | la cascade à 5 étages, dont les questions générées depuis le catalogue |
| `parente.mjs` | reconnaître deux options d'un même programme — unique implémentation |
| `texte.mjs` | normalisation de chaînes — unique implémentation du dépôt |
| `reformulation.mjs` | « Si je comprends bien… » depuis les axes marqués, fragments pré-écrits |
| `moteur.mjs` | le parcours, l'arrêt anticipé, le résultat |
| `charger.mjs` | la **seule** porte vers le disque, plus les contrôles de cohérence |

**Le moteur est pur.** `charger.mjs` excepté, aucun module ne lit un fichier : ils reçoivent un
`contexte = { taxonomie, questions, departages, domainesAxes, fiches }` en argument. Ce n'est pas
cosmétique — c'est ce qui permet d'utiliser le moteur tel quel dans un navigateur, où il n'y a pas
de `fs`, en lui passant un contexte chargé par un `fetch`.

**Le parcours est une machine à états sans effet de bord.** `demarrer()` rend un état,
`repondre(etat, id, indice)` rend un **nouvel** état — l'ancien n'est jamais modifié. L'état est un
objet nu, sérialisable : il tient dans une URL ou un `localStorage`, et le parcours reprend où il
s'était arrêté. L'interface affiche `etat.question` et renvoie un indice d'option ; elle ne calcule
rien, ne connaît ni les axes ni les seuils.

### Ce que le moteur refuse de faire

Ces refus sont des tests, pas des intentions — `npm run test:moteur` les exécute :

- **aucun nom de filière dans `src/engine/`.** Le test cherche les 84 `id` et les 84 intitulés
  normalisés dans le code, plus les écoles, domaines et familles de la taxonomie. Deux exclusions
  assumées : `charger.mjs`, seul module qui connaît le disque, et les identifiants de moins de
  6 caractères — `rh` ou `data` se retrouvent dans n'importe quel mot ;
- **aucun score numérique sous une clé publique du résultat.** Le test parcourt récursivement la
  recommandation et les alternatives : toute valeur numérique dont la clé évoque un score doit
  commencer par `_`. Sans cela, une interface finirait par l'afficher ;
- **un indice d'option hors bornes lève une erreur**, il n'est jamais remplacé par un défaut.
  Choisir à la place du prospect serait pire que refuser ;
- **rien n'est perdu.** `retenues + exclues` égale le catalogue, `classees + ecartees` égale les
  candidates. Une fiche qui disparaît en silence est un bug qu'on ne verrait jamais ;
- **le résultat rend compte de l'entonnoir** — 84 → après filtres → après aiguillage → classées.
  Un écran qui montre 3 filières sans dire qu'il en a écarté 81 cache sa propre décision.

### Arrêt anticipé

Le plafond est de 12 questions, ce n'est pas une longueur. Deux causes d'arrêt avant :

- une seule filière survit aux filtres : plus rien à classer ;
- **la tête est franchement détachée** — l'écart dépasse trois fois le seuil de départage. Les
  questions restantes ne changeraient pas l'ordre.

Le second cas exige au préalable la moitié des questions de profil. Sous ce seuil, un écart
apparent n'est que le hasard des premières réponses, et on couperait le parcours sur du bruit.

### Ce qui reste inactif, et le dit

Deux étages de la cascade sont implémentés, testés, et sans effet aujourd'hui. Ils **remontent leur
motif** dans `departage.essais` au lieu de se taire — un étage silencieusement inerte finirait par
être oublié, puis réécrit :

| Étage | Pourquoi inactif | Ce qu'il faut pour l'activer |
|---|---|---|
| 1. question rédigée | `config/departages.json` ne contient qu'un exemple | les entretiens, via `npm run comparaisons` |
| 4. disposition | les 28 domaines sont à `null` dans `config/domaines_axes.json`, **et** aucune question ne porte de `poids_disposition` | la collecte, plus une question de disposition |

Ce n'est plus bloquant : les étages 2 et 3, générés depuis le catalogue, tranchent **98 %** des
égalités sans eux.

La question de disposition ne demande **aucun code** : une entrée de plus dans
`questions.json > profil`, avec `poids_disposition: { ancrage: 2 }` sur ses options. Le moteur
l'agrège déjà.

### Ce que le prospect voit du repli et de l'incertain

Trois situations où le moteur sait qu'il est moins sûr, et où il le dit plutôt que de lisser :

- **`repli_parts: true`** — profil sans forme, classement calculé sur les parts de budget. Mesuré à
  0 % des profils atteignables, mais conservé : une refonte des questions pourrait le rendre
  atteignable sans que personne y pense ;
- **`sans_classement`** — les programmes à `axes_fiables: false`, avec une mention rédigée pour un
  prospect, pas un code d'erreur ;
- **`parcours.niveau_incertain`** — les filières retenues sur un `niveau_acces` absent. On ne les
  exclut pas : exclure sur une donnée manquante ferait payer au prospect notre trou de données.

## L'écran de résultat — `web/index.html`

Un seul fichier HTML, aucun framework, aucune dépendance, aucune étape de build : `git push`
suffit à déployer. Polices système, une colonne, calibré sur ~380 px — les prospects sont sur
téléphone, parfois en données limitées.

| Fichier | Responsabilité |
|---|---|
| `web/index.html` | le câblage, et lui seul : `fetch`, fragment d'URL, écouteurs de clic, structure CSS |
| `web/theme.css` | l'identité visuelle, et elle seule — aucune couleur ailleurs |
| `src/ui/rendu.mjs` | **tout** le rendu, en fonctions pures qui rendent des chaînes |
| `src/ui/etat-url.mjs` | le parcours dans `location.hash` — sérialisation et relecture |
| `src/ui/contact.mjs` | la destination du bouton conseiller, depuis `config/contact.json` |
| `src/ui/collecte.mjs` | le contrat Netlify Forms de la validation : champs, corps, cible d'envoi |
| `src/ui/avis.mjs` | les signalements des testeurs : deux niveaux, un envoi par écran |
| `netlify.toml` | hébergement : racine publiée, types MIME, redirection |
| `scripts/contexte-web.mjs` | `data/_contexte.json`, le contexte du moteur en un seul fichier |
| `scripts/servir.mjs` | serveur local, `node:http` seul — `file://` interdit les modules ES |

### Le rendu ne touche pas au DOM, et c'est ce qui le rend testable

Décision structurante, à ne pas défaire par simplification. `rendu.mjs` ne contient ni
`document`, ni `innerHTML`, ni `window` : chaque bloc est une fonction qui prend une part du
résultat et **rend une chaîne**. Le HTML est assemblé, puis posé une seule fois par le
câblage.

Sans cela, « aucun nombre de score dans le DOM produit » exigerait une bibliothèque de DOM,
donc une dépendance, donc une étape de build — et la contrainte n°1 tombe. Le test parcourt
la chaîne. `npm test` refuse un `document.` dans `rendu.mjs`.

Conséquence assumée : l'interface tient dans **trois** fichiers et non un seul. Le HTML reste
unique ; le rendu et l'URL sont des modules ES, comme le moteur lui-même — aucun n'ajoute de
dépendance ni de build.

### Ce que le moteur a dû exposer en plus

L'écran ne recalcule rien. Six informations lui manquaient, ajoutées au **résultat** plutôt
que reconstruites côté interface — reconstruites, deux interfaces les reconstruiraient
différemment et aucun test ne le verrait :

| Champ | Pourquoi le moteur et pas l'écran |
|---|---|
| `niveau` | l'état de l'écran en un mot, dérivé de trois champs ; c'est lui qui commande la posture |
| `profil` | le vecteur du prospect, pour la reformulation |
| `chaine` | famille et sous-famille **en libellé**, candidats après filtres, étage résolveur, `element_tranchant` |
| `recommandation.metiers`, `.modules_distinctifs`, `.vitrine`, `.deconseille_si`, `.exigence_quantitative.modules_comptes` | de quoi dégrader le bloc contenu sans jamais laisser un cadre vide |
| `alternatives[].differenciateur` | **généré** depuis un module ou un métier exclusif, jamais rédigé |
| `parcours.retour_famille` | un **drapeau**, pas une chaîne d'alerte à reconnaître |

Deux écarts de nommage avec la spec de l'écran, volontaires : `recommandation` et
`sans_classement` gardent leurs noms français d'origine plutôt que `recommande` et
`non_classes`. Deux alias du même contenu divergeraient — le contrat porte sur l'information,
pas sur l'orthographe des clés.

`ecole_label`, `niveau_label`, `modalites_labels` et `niveau_acces_label` sortent aussi du
moteur : les identifiants (`presentiel`, `mba`) sont des slugs, et leurs libellés vivent dans
`config/taxonomy.json > *_libelles`. **Aucune table de traduction dans l'interface** — elle
vivrait en double et divergerait au premier renommage. Un identifiant sans libellé s'affiche
tel quel : c'est laid, donc visible, donc corrigé.

### Le filtre de modalité désigne PLUSIEURS étiquettes

Défaut trouvé par balayage, pas par relecture. Les deux catalogues n'emploient pas le même mot
pour la même chose : le catalogue Master écrit « cours du soir » cinq fois et **jamais**
« week-end » ; le catalogue Bachelor écrit « week-end » et « full time » et **jamais** « cours
du soir ». L'option « le week-end ou le soir » filtrait sur `week-end` seul — soit **une fiche
sur 84**, et un candidat à bac+3 tombait en impasse alors que sept MBA du soir lui sont ouverts.

La valeur d'une option de filtre est donc une **liste**, et une seule correspondance suffit :

```json
{ "label": "Le week-end ou le soir, je travaille", "valeur": ["week-end", "cours-du-soir"] }
{ "label": "Sur le campus, en journée",            "valeur": ["presentiel", "full-time"] }
```

`validate.mjs` refuse désormais qu'une modalité de la taxonomie ne soit désignée par aucune
option : une modalité inatteignable rend ses programmes invisibles quelle que soit la réponse.

Effet mesuré sur le balayage complet : **31 combinaisons sans issue sur 160 → 25**. Les 25
restantes sont des faits du catalogue — aucun programme d'ingénierie en ligne, aucun programme
de droit du soir — et non des bugs.

### Le sommaire annonce aussi la modalité et le niveau d'accès

Le sommaire du catalogue Bachelor est régulier : `Bachelor en Gestion (accessible après bac+2)
full time`. Niveau d'accès entre parenthèses, modalité en suffixe. L'extraction s'en servait
déjà pour l'école et le département ; elle en lit désormais **explicitement** ces deux champs.

**Pourquoi, alors que les valeurs ne changent pas.** Elles étaient captées **par accident** : le
titre brut de l'entrée était concaténé dans le texte servi aux détecteurs, qui y retrouvaient
« bac+2 » et « full time » par expression régulière. Deux conséquences qu'on ne voit qu'en
regardant le mécanisme :

- une édition qui poserait la mention sur une ligne séparée du titre, ou l'écrirait autrement,
  ferait **disparaître la modalité sans aucune alerte** — la fiche sortirait en `presentiel` ;
- on ne peut rien **croiser** avec la page du programme si la donnée n'existe pas comme champ.

Le croisement est maintenant fait, et c'est lui qui a de la valeur :

| Champ | Règle | Désaccord |
|---|---|---|
| `modalites` | **union** du sommaire et de la page | remonté au journal |
| `niveau_acces` | le sommaire vaut `brochure` ; il ne l'emporte que sur une **inférence** | la page l'emporte, et c'est journalisé |

**Une modalité n'est jamais exclusive.** « Accessible après un bac+2, en semaine ou en WEEK-END »
veut dire **les deux** — `presentiel` ET `week-end` —, pas l'un ou l'autre. Choisir retirerait un
programme réel du parcours de quelqu'un qui travaille. `en semaine` est d'ailleurs la façon dont
la brochure Bachelor dit « présentiel », et le motif a été ajouté.

### L'affichage se dissocie de l'identité

Tranché : **l'`id` reste calculé sur le titre tel que lu**, annotations comprises. Le changer
créerait une fiche orpheline et n'emporterait pas le travail humain déjà saisi.

**Le `nom`, lui, prend le titre nettoyé de ces annotations.** Une seule fiche était concernée —
`bachelor-en-gestion-full-time`, dont le nom passe de « Bachelor en Gestion full time » à
« Bachelor en Gestion ». Deux raisons, la seconde étant la vraie :

- la modalité est déjà affichée à côté du nom, l'avoir dans le titre est redondant ;
- surtout, « Bachelor en Gestion full time » et « Bachelor Professionnel en Gestion » se
  ressemblent assez pour qu'un candidat croie à **deux programmes sans lien**, alors que leur
  vraie différence est la modalité. C'est le doublon présentiel / en ligne sous une autre
  forme, et il se règle de la même façon : **le nom nomme le programme, la modalité se lit à
  côté.**

La page reste la source du titre quand elle existe ; le nettoyage s'applique au titre retenu,
d'où qu'il vienne. `npm test` refuse qu'un `nom` porte sa propre modalité, vérifie que l'`id`
survit au nettoyage, et exige que deux homonymes se distinguent **toujours** par leur modalité —
`Bachelor Chef de Projet Digital` existe deux fois, en présentiel et en ligne, et c'est
précisément pour ce cas que la modalité est toujours affichée.

### Toute modalité de la taxonomie doit être portée par une fiche

`validate.mjs` et `npm test` le refusent. **C'est ce contrôle qui aurait attrapé seul un défaut
d'extraction sur les modalités** : une modalité à zéro fiche est soit une extraction manquée — la
brochure la déclare et personne ne la lit —, soit une entrée de taxonomie à retirer. Rien d'autre
ne le signale, parce que le filtre du quiz se contente de ne rien trouver.

Il est **complémentaire** du contrôle sur les questions, et les deux sont nécessaires : une
modalité peut être *atteignable* par une option sans désigner aucun programme, ou être portée par
des fiches qu'aucune réponse ne permet d'atteindre.

État actuel : `presentiel` 70 · `en-ligne` 20 · `cours-du-soir` 7 · `week-end` 1 · `full-time` 1.
Les deux dernières ne tiennent qu'à une fiche chacune — c'est fragile, et c'est précisément
pourquoi le contrôle existe.

### Le balayage F1 × F2 × A1 — le test qui ne suppose rien

Il parcourt **toutes** les combinaisons de niveau, de modalité et d'univers, et vérifie que
chaque écran offre au moins une action. C'est le seul test qui pouvait trouver le défaut
ci-dessus, puisque la spec elle-même se trompait : un test écrit depuis une spec fausse
reproduit l'erreur.

**Une impasse est acceptable. Une impasse sans retour en arrière ne l'est pas.** Le nombre
d'impasses est imprimé et non contraint à une cible : passer de 25 à 50 signalerait un filtre
cassé, comme celui du soir.

Le balayage a trouvé un second défaut que personne n'avait rapporté : **28 combinaisons où des
programmes existent mais où aucun n'est comparable à un profil** — tous à `axes_fiables: false`.
L'écran affichait « aucune formation » en cachant des programmes réels. C'est la faute
symétrique de celle de l'impasse bavarde : **ne jamais annoncer un contenu absent, ne jamais
taire un contenu présent.**

Ces 28 combinaisons sont depuis retombées à **0** : dans chacune, un seul programme survivait aux
filtres, et le candidat unique se traite désormais à part. Le total des combinaisons sans résultat
passe ainsi de **48 à 20 sur 160**, toutes des questions d'offre. Le balayage vérifie en plus que
**toute combinaison ne laissant qu'un programme l'affiche en recommandation.**

### Les six états, et l'ordre des blocs

Un même gabarit pour tous serait malhonnête. `ORDRE_BLOCS` est écrit en **listes
ordonnées** et non en numéros : la table de la spec porte deux fois le rang 4 sur l'état
`bonne`, où les alternatives passent « avant le contenu ».

| État | Part des profils | Posture |
|---|---|---|
| `forte` | 25 % | recommandation affirmée |
| `bonne` | 40 % | recommandation, alternatives remontées avant le contenu |
| `possible` | 35 % | **le conseiller passe en deuxième position** — quand le moteur est moins sûr, un humain vaut mieux qu'un écran |
| `egalite` | 2 % | deux cartes de même poids, **aucune titrée « recommandation »** |
| `unique` | 28 combinaisons de filtres | un seul programme a survécu : **aucun score, aucune comparaison** ; le bouton rouvre **les filtres** |
| `impasse` | rare | rien à recommander ; le bouton rouvre alors **les filtres**, pas le profil |

**`impasse` a deux visages, et les confondre a produit deux défauts opposés :**

| Situation | Ce qui existe | Ce que l'écran fait |
|---|---|---|
| aucun candidat | rien | dit qu'aucun programme ne réunit ces réponses, et rouvre F1/F2 |
| des candidats, **aucun comparable** | 0 combinaison aujourd'hui | les **affiche sans les classer**, manque attribué à la brochure |

Le second visage était mesuré à 28 combinaisons ; il est tombé à **0** depuis que le candidat
unique est traité à part — voir ci-dessous. Le cas reste implémenté et testé : il redeviendra
atteignable dès qu'un prospect aura **plusieurs** programmes dont aucun n'est classable.

### Un seul candidat : le classement n'a plus d'objet

Quand les filtres ne laissent qu'un programme, il n'y a **rien à comparer et rien à départager**.
Le noter est au mieux inutile ; sur un `axes_fiables: false` c'est nuisible — il partait en zone
non classée, et le prospect lisait qu'on ne sait pas comparer ce programme à son profil **alors
que c'est sa seule option**. C'est la faute la plus difficile à voir, parce que l'écran paraît
fonctionner.

Le moteur court-circuite donc le score : `classees` porte l'unique fiche avec `score: null` —
jamais `0`, qui se lirait comme une correspondance nulle —, `code: "unique"`, aucune
alternative, aucun départage, `parcours.candidat_unique: true`. **Quels que soient ses axes.**

| | Ce que l'écran dit |
|---|---|
| badge | « La seule qui réunit tes réponses » — ni « correspondance », ni « piste » : rien n'a été comparé |
| posture | la justification vient des **filtres** : niveau, façon de suivre les cours, univers |
| conseiller | **en haut**, comme en `possible` : le prospect n'a qu'une option et le moteur ne l'a pas choisie pour lui |
| Reprendre | rouvre **les filtres** — le profil n'a joué aucun rôle, le rouvrir ne changerait rien |

Le contenu et les débouchés s'affichent normalement : ils sont réels, seuls les axes ne
l'étaient pas.

Le cas n'est pas théorique — **7 combinaisons de filtres, 28 en comptant l'aiguillage fin** —, et
`npm run test:interface` vérifie au balayage que **toute combinaison ne laissant qu'un programme
l'affiche en recommandation, jamais en zone non classée**. `npm run test:moteur` vérifie en plus
qu'un `axes_fiables: false` y est bien recommandé, **et que ce cas existe dans le catalogue** :
sans ce second contrôle, le premier passerait en ne vérifiant rien.

**L'élargissement n'est PAS une impasse.** Quand l'aiguillage fin vide le jeu, le moteur revient
à la famille : il a donc une liste. Le traiter comme une impasse faisait afficher « voici
l'ensemble de l'univers que tu as retenu » sans que rien ne suive. Il se signale par une
**mention visible** (`parcours.retour_famille`) au-dessus d'un classement bien réel, et son
bouton rouvre le profil — ce ne sont pas les filtres qui ont réduit.

En `possible`, le badge est **« une piste à explorer »**, jamais « correspondance faible » :
un prospect sur trois le reçoit, et un verdict d'échec y serait faux autant que décourageant.

`egalite` ne concerne que 2 % des profils : une grille de recherche étroite ne le rencontre
pas, et en conclure « inatteignable » serait faux. Le test balaie donc largement l'espace des
**réponses possibles** — jamais des vecteurs d'axes fabriqués, qui testeraient un écran
qu'aucun prospect ne verra.

### Ce que l'écran refuse de faire

Ce sont des tests, pas des intentions — `npm run test:interface`, 218 contrôles :

- **aucune valeur de score, sous aucune forme.** Le test extrait les scores réels du
  résultat, puis cherche dans la page toutes leurs écritures plausibles : brut, arrondi à une
  et deux décimales, multiplié par cent. Il refuse aussi tout décimal, tout `%`, tout `/5`,
  tout commentaire HTML et tout attribut `data-score` ;
- **aucun identifiant ni intitulé du catalogue dans le code** — mêmes exclusions que pour le
  moteur, et sur le code **privé de ses commentaires** : un commentaire qui explique pourquoi
  la modalité doit être visible cite forcément les deux écoles concernées, et c'est
  exactement l'explication qu'une session future aura besoin de lire ;
- **l'échappement se prouve, il ne se relit pas.** Une charge hostile est injectée dans
  **chaque** champ de chaîne d'un résultat complet, sur les cinq états, et aucune balise n'en
  ressort. Une relecture d'expression régulière laisserait passer le champ ajouté demain ;
- **aucun cadre vide.** Une fiche sans accroche, sans module et sans métier ne rend
  strictement rien, et l'ordre des autres blocs ne bouge pas ;
- **aucune alternative ne reprend un libellé déjà cité** par la recommandation. Le cas est
  réel : deux fiches aux domaines différents n'ont pas le même ensemble de comparaison, donc
  un module peut être exclusif dans l'une **et** dans l'autre. L'écran se contredirait sous
  les yeux du prospect ;
- **aucun `localStorage`, aucun cookie, aucun script tiers, aucune police à télécharger,
  aucun import hors du dépôt** ;
- **l'état survit à l'aller-retour par l'URL**, et rejouer les réponses relues rend
  exactement le même résultat.

### Le fragment d'URL porte les RÉPONSES, jamais l'état

`#r=F1:2,A1:0,P1:1&d=…`. Aucun stockage, aucun serveur, et le fragment ne quitte même pas le
navigateur — il n'est pas envoyé dans la requête HTTP. Un prospect peut reprendre plus tard,
ou envoyer le lien à un parent.

Sérialiser l'état complet allongerait l'URL et, surtout, **permettrait de forger un profil
qu'aucune combinaison de réponses ne peut produire**. Les réponses sont la seule vérité ; le
profil se recalcule en les rejouant. Les clés sont triées pour qu'un même parcours donne
toujours la même URL, et `replaceState` évite une entrée d'historique par question — sinon le
bouton Retour du téléphone devient inutilisable.

Une entrée illisible est **ignorée et signalée**, jamais remplacée par un défaut : choisir à
la place du prospect serait pire que perdre sa réponse.

### Le bouton Reprendre — sa cible dépend de l'état

| État | Reprendre rouvre | Fonction |
|---|---|---|
| forte · bonne · possible · egalite | les 7 questions de profil, filtres et aiguillage conservés | `reprendreProfil` |
| **impasse** · **unique** | **F1 et F2**, aiguillage et profil conservés | `reprendreFiltres` |

`unique` rejoint `impasse` pour la même raison : le profil n'a joué aucun rôle dans le résultat,
donc le rouvrir ne changerait rien. Ce sont les filtres qui ont réduit le jeu à un programme.

Hors ces deux cas, la reformulation porte sur le profil et refaire les filtres serait punir le
prospect d'avoir corrigé. **En impasse c'est l'inverse** : ce sont les filtres qui ont vidé le
jeu, rouvrir le profil ne corrigerait rien, et l'écran était un cul-de-sac — le seul défaut
vraiment inacceptable ici. `ECRAN-RESULTAT.md` § 5 prescrivait le profil dans tous les cas ; la
section est corrigée.

Le moteur tranche la cible (`resultat.reprise`, via `cibleReprise`) : l'interface ne la déduit
pas. Dans les deux cas, les réponses précédentes sont **pré-sélectionnées, pas réappliquées** —
rien n'avance tant que le prospect n'a pas cliqué.

### Le contexte servi au navigateur est une liste blanche

`data/_contexte.json` — 175 ko, 38 ko compressés, contre 339 ko pour le catalogue complet.
Les `unites_enseignement` n'y sont pas : le moteur ne les lit jamais, les axes en ont été
comptés à l'extraction, et les embarquer ferait payer au prospect une donnée qui ne change
rien à ce qu'il voit.

La liste des champs est **explicite et commentée**, jamais un `delete` de ce qui est gros : un
`delete` laisserait passer tout nouveau champ, alors qu'une liste blanche échoue bruyamment le
jour où le moteur lit autre chose. `verifierContexte()` tourne sur le contexte **allégé** et
le script refuse d'écrire s'il n'est plus servable — sinon on livrerait au navigateur un
contexte qui classe mal, invisible puisque la version Node reste complète.

Le fichier **se commite** : `git push` doit suffire à déployer. La CI le régénère et refuse un
`git diff` non vide.

Contrainte de poids, honnêtement : l'HTML fait **10,5 ko** et les trois fichiers d'interface
12 ko compressés, sous les 50 ko demandés. Le contexte, lui, ne peut pas y tenir en portant
84 programmes — 38 ko compressés est le plancher réel.

### La reformulation est de la donnée

`config/reformulation.json` porte les fragments, un par axe compté et par sens. Le moteur n'en
contient **aucun en dur** : un fragment codé finirait par contredire le fichier sans que
personne sache lequel s'affiche. `verifierContexte()` refuse un axe dont un sens manque — la
phrase serait amputée en silence.

### Le bouton « parler à un conseiller » — `config/contact.json`

`canal` décide de la destination : `email` construit un `mailto:`, `whatsapp` un lien
`wa.me`. **Basculer de l'un à l'autre ne demande aucun changement de code**, et `npm test` le
vérifie en construisant les deux liens depuis la même fonction.

`src/ui/contact.mjs` fait la substitution de `{programme}`, `{ecole}`, `{modalite}` et
l'encodage. Trois règles apprises en l'écrivant :

- **`email` est le défaut**, parce que c'est la seule adresse d'admission documentée dans les
  brochures. Les deux WhatsApp qu'on y trouve sont ceux du Career Center et d'Executive
  Education, pas des admissions : le numéro reste marqué prototype, et `verifierContexte()`
  avertit si on active ce canal sans l'avoir confirmé ;
- **sans destination valide, aucun bouton.** Un bouton qui ne mène nulle part est pire qu'un
  bouton absent : le prospect clique, rien ne se passe, il en conclut que le site est cassé.
  Le motif remonte dans les avertissements du contexte ;
- **un jeton sans valeur est laissé vide**, jamais rendu tel quel. Écrire « undefined » dans
  un courriel adressé à une vraie école serait pire que la phrase incomplète.

L'encodage n'est pas cosmétique : le corps du courriel contient des retours à la ligne et des
accents, et les deux cassent un `mailto:` mal échappé. Le test vérifie la présence de `%0A` et
l'absence de tout `\n` dans le lien.

**Question ouverte, à ne pas trancher par déduction :** un programme d'ISM Online ou d'ISF
recommandé par le moteur envoie aujourd'hui son message à l'adresse des admissions en
présentiel. La brochure donne `online@ism.edu.sn` pour ISM Online — trois écoles sur huit ont
une adresse documentée, cinq n'en ont pas. Un routage par école est justifié mais demande de
les connaître toutes : c'est une question aux admissions, consignée dans
`config/contact.json > _question_admissions`. **Ne jamais déduire une adresse d'un nom
d'école.**

## Validation par les étudiants — Netlify Forms

Le bloc de collecte sert la validation par la cohorte étudiante, seul garde-fou du modèle
puisqu'aucune vérification croisée institutionnelle n'est possible avec une personne par école.

### La contrainte à connaître avant de toucher à ce code

**Netlify détecte les formulaires en analysant le HTML déployé, pas à l'exécution.** Un
formulaire créé par JavaScript n'est jamais enregistré, et les envois retournent 404 sans
message clair — l'échec est donc parfaitement silencieux.

Conséquences, toutes vérifiées par `npm run test:interface` :

| Règle | Pourquoi |
|---|---|
| le formulaire est écrit **littéralement** dans `web/index.html`, masqué par `hidden` | c'est le seul HTML que Netlify voit |
| les champs déclarés dans le HTML et ceux envoyés par `collecte.mjs` sont **exactement** les mêmes | un champ ajouté d'un seul côté serait perdu sans bruit |
| le corps de l'envoi porte **`form-name=validation`** | sans lui Netlify ignore l'envoi |
| l'envoi va vers **`/web/`**, pas vers `/` | `netlify.toml` redirige `/` en 302, POST compris |

Ce dernier point est un piège réel : la spec demandait un POST vers `/`, mais la redirection
de la section 1 l'intercepte. On poste donc vers le chemin de la page qui porte le formulaire,
ce qui est de toute façon l'usage documenté.

### Ce que le répondant voit, et ce qu'il ne voit pas

Trois questions, **aucune donnée personnelle** — ni nom, ni adresse, ni téléphone. Rien à
déclarer, rien à protéger, et un répondant nettement plus franc sur la troisième. Le test
refuse l'ajout d'un champ dont le nom évoque une identité.

`etat`, `recommande` et `niveau_correspondance` sont remplis depuis le résultat : le répondant
n'a rien à recopier. `niveau_correspondance` est le **libellé** du palier — une valeur
numérique n'a pas plus sa place dans un formulaire que sur l'écran.

**La question « es-tu content de ton choix ? » est indispensable.** Sans elle, on confondrait
un modèle qui se trompe avec un étudiant mal orienté : celui qui regrette sa filière ne peut
pas servir de vérité terrain.

La liste des programmes porte **la modalité dans son libellé**. Deux écoles publient le même
intitulé : sans elle, la liste affiche deux fois la même ligne et le répondant tranche au
hasard, ce qui fausse silencieusement la seule vérité terrain dont on dispose.

Quatre règles de conduite, chacune testée :

- le bloc est **absent en usage normal**, visible seulement via `?validation=1`. Un prospect
  ordinaire ne doit pas voir un formulaire de recherche — ça le ferait douter de ce qu'on lui
  montre ;
- il est **après** le résultat, jamais avant : il ne doit pas influencer la lecture ;
- après envoi, un accusé sobre et plus aucun bouton : **pas de renvoi en double** ;
- **un échec d'envoi n'efface jamais le résultat affiché.** Les réponses vivent hors du DOM,
  et seul le bloc de validation est retouché.

## Signalements des testeurs — `?test=1`

Un retour donné **au moment où la personne bute** vaut beaucoup plus qu'un retour reconstitué
après coup. Et **un bouton à taper rapporte bien plus qu'un champ à remplir** : sur mobile,
écrire trois phrases est un effort que peu font, toucher un bouton n'en est pas un.

Deux niveaux, sur **tous les écrans** — chaque question et le résultat —, en bas du contenu et
jamais en travers du parcours :

1. **un bouton unique**, dont le libellé dit quoi signaler : « cette question n'est pas claire »
   sur une question, « ce résultat me surprend » sur le résultat. C'est ce geste qui produira le
   volume ;
2. **après** ce geste, un champ libre **facultatif** — le retour est déjà enregistré si la
   personne n'écrit rien.

Contexte joint sans que le testeur le décrive : `ecran`, `etat`, `niveau`, `commentaire`,
`agent`. **`etat` est le fragment d'URL du parcours** : c'est lui qui permet de rejouer
exactement ce qui a produit la gêne, et donc ce qui rend un retour exploitable plutôt
qu'anecdotique. Aucune donnée personnelle ; `agent` sert à reproduire un défaut d'affichage,
ce n'est pas une identité.

Mêmes deux pièges Netlify que la validation, et ils se paieraient deux fois : le formulaire
d'avis est lui aussi **écrit littéralement** dans `web/index.html`, avec **son propre champ
piège** (`bot-field-avis`, distinct de celui de la validation), et le POST va vers `/web/`.

### Le quota d'envois n'est pas une abstraction

L'offre gratuite de Netlify plafonne les envois de formulaires par mois — de l'ordre de la
centaine, et ces limites changent, donc **à vérifier dans le tableau de bord avant de lancer la
cohorte étudiante**. Entre les signalements des testeurs et les trente réponses de validation,
la marge est mince.

Deux conséquences : la règle **un envoi par écran et par session** n'est pas cosmétique — un
double clic qui compte deux fois se paie en réponses perdues à la fin du mois —, et la chaîne
du navigateur est tronquée à 200 caractères. L'état des envois vit en mémoire, dans un `Set` :
aucun stockage, rien qui survive à la session.

Garde-fous, tous testés : visible **seulement avec `?test=1`** — un vrai candidat ne doit jamais
voir un bouton de signalement, ça donne l'impression d'un site en travaux —, l'échec ne bloque
jamais le parcours et n'efface rien, et le bloc se referme au changement d'écran pour que le
champ libre ne suive pas le testeur de question en question.

## Le thème — `web/theme.css`

Un seul fichier, en propriétés personnalisées CSS. **Aucun composant ne porte de couleur en
dur** : `npm test` refuse un `#hex` ou un `rgb()` dans `web/index.html` comme dans
`src/ui/`. Changer d'identité est une modification de ce fichier seul.

**Les valeurs sont mesurées, pas officielles** — relevées sur les couvertures des catalogues
2024, et elles diffèrent d'une brochure à l'autre : ce sont des couleurs d'impression, pas une
charte écran. À demander au service communication et à remplacer.

| Rôle | Valeur | Provenance |
|---|---|---|
| Orange de marque | `#F38416` | couverture Bachelor |
| Orange, variante | `#FCA41F` | couverture Master |
| Bleu profond | `#0F274D` | couverture Bachelor |
| Bleu, variante | `#084E8B` | couverture Master |

### La lisibilité commande la palette, pas l'inverse

`#F38416` sur blanc donne **2,6:1**, très en dessous du minimum de 4,5:1 exigé pour du texte.
Il est donc réservé aux fonds, bordures et à la barre de progression ; le texte est en bleu
profond, et l'orange assombri quand il faut vraiment de l'orange.

**Le test calcule les contrastes, il ne les croit pas sur parole.** Il résout chaque variable
du thème jusqu'à son hexadécimal, puis vérifie onze couples texte/fond réellement employés,
**dans les deux modes**. C'est ce qui a attrapé une erreur : `#B35A00`, la valeur retenue pour
du texte sur blanc (4,8:1 mesuré), retombe à **4,47:1** sur le fond crème de l'avertissement
quantitatif — un fond que la spec ne considérait pas. Assombri à `#A85400`, il passe partout :
5,3:1 sur blanc, 5,0:1 sur le crème.

Le mode sombre est conservé, avec ses contrastes **recalculés** et non recopiés : sur fond
sombre le bleu profond tombe à 1,4:1 et ne peut plus servir de texte, c'est l'orange clair qui
devient lisible (9,1:1). Reprendre la palette claire telle quelle donnerait un écran illisible
tout en paraissant « thémé ».

La barre de progression emploie une **fraction unitaire** (`--avance: 0.583`) et non un
pourcentage, pour que « aucun pourcentage nulle part » reste vérifiable au caractère près sur
la page entière, sans exception à écrire dans le test.

### Le logo

Les variables existent (`--logo-source`, `--logo-hauteur`, `--logo-marge`), **le fichier
non** : à récupérer auprès du service communication, en SVG. Un PNG basse résolution extrait
d'un PDF serait flou sur mobile, et un logo flou dit quelque chose de l'institution. Tant que
`--logo-source` vaut `none`, aucune image n'est demandée — pas de 404 en production.

## Hébergement — `netlify.toml`

`publish = "."`, pas `web/` : `data/_contexte.json` vit en dehors. Aucune commande de build.
La racine redirige vers `/web/`, sinon un prospect qui tape l'adresse sans le chemin tombe sur
une liste de fichiers.

Le `Content-Type` des `.mjs` est déclaré explicitement. Combiné à `nosniff`, un type MIME
erroné ferait **refuser** les modules ES au lieu de les exécuter au hasard : l'écran resterait
sur « Chargement… » sans rien dire de plus.

## Fraîcheur des artefacts générés — `scripts/lib/fraicheur.mjs`

Quatre des cinq sorties du dépôt sont **ignorées par git** : une correction d'extraction les
périme toutes, et `git status` reste vide. Ce n'est pas théorique — les 80 fiches de comparaison
sont parties d'une exécution périmée, en citant des modules exclusifs d'avant une correction, et
ce sont précisément les documents qui vont aux responsables. **Une consigne ne suffisait pas.**

`npm run validate` échoue désormais, en nommant la commande à relancer :

| Artefact | Sources déclarées | Commande |
|---|---|---|
| `data/_paires.csv` | fiches + taxonomie | `npm run distinctivite` |
| `data/_comparaisons/` | fiches + taxonomie + départages | `npm run comparaisons` |
| `data/_manques.csv` | fiches + taxonomie + axes de domaine + départages | `npm run report -- --csv` |
| `data/_impasses.md` | fiches + taxonomie + questions + départages | `npm run impasses` |
| `data/_contexte.json` | fiches + tout `config/` | `npm run contexte:web` |

**La péremption se mesure par le CONTENU, jamais par l'horodatage.** Une date de modification
serait ininterprétable ici : `git clone` les réécrit toutes à la même seconde, et un script qui
écrit ses fiches *puis* son CSV rendrait son propre CSV « plus vieux » que ses entrées. Chaque
générateur enregistre donc l'empreinte SHA-256 de ses sources dans `data/_fraicheur.json`, **après
avoir tout écrit** — noter avant se déclarerait périmé dès la fin de sa propre exécution.

Quatre décisions à ne pas défaire :

- **`data/_fraicheur.json` se commite**, et ne contient aucune date. C'est ce qui rend la
  péremption visible dans `git diff` alors que les artefacts, eux, ne le sont pas. Une date le
  ferait changer à chaque exécution, et il ne dirait plus rien ;
- **un artefact ABSENT n'est pas une erreur.** Quatre le sont dans un clone neuf : il n'y a rien
  de périmé dans ce qui n'existe pas. Sans cette distinction, la CI échouerait toujours ;
- **aucun artefact n'est source d'un autre.** Une cascade d'empreintes ferait qu'une seule
  péremption en signalerait cinq, sans dire laquelle relancer. Les fichiers générés commencent
  tous par `_`, et le calcul les écarte ;
- **le test porte sur le mécanisme, pas sur l'état.** Le mode de défaillance à couvrir n'est pas
  un artefact périmé — `validate` s'en charge — mais un artefact **ajouté sans être surveillé** :
  `npm test` vérifie que chaque artefact déclaré est bien noté par un script.

## Toute fiche doit être atteignable par l'aiguillage

Invariant **distinct** de celui des domaines orphelins, et les deux sont nécessaires :

| Contrôle | Porte sur | Attrape |
|---|---|---|
| `domainesInatteignables` | la **question** | un domaine de famille qu'aucune option ne désigne |
| `fichesInatteignables` | les **fiches** | une fiche qu'aucune famille ne revendique |

Une fiche peut porter deux domaines tous deux atteignables et se retrouver pourtant hors de
portée : il suffit qu'un domaine n'ait pas de famille, ou qu'une fiche n'ait aucun domaine.

**Pourquoi ce second contrôle a dû être ajouté.** L'appartenance à une famille se *déduit* des
domaines, qui se déduisent eux-mêmes du titre, de l'objectif et des modules. Une correction
d'extraction peut donc déplacer une fiche d'une famille à l'autre sans que personne l'ait
demandé — huit modules retrouvés ont fait passer une licence d'`entreprise-management` à
`chiffres-finance`. Rien ne garantissait que la nouvelle famille soit atteignable, et **une fiche
hors de portée ne se signale jamais** : elle se contente de ne jamais apparaître à l'écran.

L'énumération suit A1 × A2 comme le prospect les rencontre, garde `si` comprise — **10
combinaisons**, et les 84 fiches sont couvertes. `npm run test:moteur` porte en plus un **contrôle
négatif** : sans lui, le test passerait même si la fonction rendait toujours une liste vide.

## Fragilité du plafond de 2 domaines — mesurée, pas corrigée

`npm run plafond` (`scripts/plafond-domaines.mjs`) mesure ce qu'on risque. **Aucune décision n'est
prise : le plafond reste à 2.**

| Mesure | Catalogue 2024 |
|---|---|
| fiches ayant un 3e domaine corroboré, écarté par le plafond | **5** sur 84 |
| dont celles qui **gagneraient une famille** à un plafond de 3 | **3** |
| fiches **fragiles** — 2e et 3e domaines dans des familles différentes | **4** |

Les trois qui gagneraient une famille :

| Fiche | Domaines retenus | 3e écarté | Famille ajoutée |
|---|---|---|---|
| Licence de Gestion option Comptabilité-Finance | `finance + comptabilite` | `gestion` | entreprise-management |
| Licence Électronique, Télécoms et Systèmes embarqués | `reseaux + electronique` | `communication` | commerce-communication |
| Master Droit Notarial et Gestion du Patrimoine | `gestion + droit` | `culture-evenementiel` | commerce-communication |

**Le compte des fragiles est le vrai indicateur, et il peut dépasser celui des gains** : une fiche
est fragile quand son 2e et son 3e domaine ne relèvent pas de la même famille — un module de plus
suffit alors à la déplacer dans le parcours. Elle ne « gagne » pourtant rien si la famille de son
3e domaine est déjà apportée par son 1er.

Deux faits à garder en tête avant de trancher :

- **à score égal, `inferDomaines` départage sur l'`id`, en ordre alphabétique.** Deux domaines ex
  æquo sont donc séparés par une convention et non par une mesure. C'est ce qui rend ces fiches
  fragiles, et c'est aussi ce qui rend le basculement silencieux ;
- **la contrepartie d'un plafond à 3 est mécanique** : chaque domaine supplémentaire élargit
  l'aiguillage, et l'aiguillage doit RÉDUIRE le jeu candidat. C'est le compromis à peser avec ces
  chiffres, pas avec une intuition. Le troisième domaine de la troisième ligne
  (`culture-evenementiel` pour un master de droit notarial) suggère d'ailleurs qu'un plafond plus
  haut laisserait passer du bruit lexical.

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

### L'extraction fusionne, elle n'écrase pas

`extract.mjs` est rejoué à chaque correction de parsing. S'il écrasait les fiches, il effacerait
ce que les responsables et les admissions ont mis des semaines à fournir — et plus personne
n'oserait le relancer. La traçabilité n'est donc pas décorative : **c'est elle qui décide de ce
qui survit.**

| Source du champ | À la ré-extraction |
|---|---|
| `brochure`, `inference` | rafraîchi depuis le PDF |
| `responsable`, `admissions`, `manuel` | **intouchable**, valeur ET source conservées |

Trois règles complètent le tri, apprises en écrivant le test :

- **les champs que l'extraction ne produit jamais** (`profil_ideal`, `deconseille_si`,
  `vitrine.accroche`, `eligibilite.*`, `debouches.secteurs`…) sont conservés dès qu'ils portent
  quelque chose, même si personne n'a pensé à déclarer leur source. Une fusion ne doit pas punir
  un oubli de traçabilité ;
- **`meta.statut`, `meta.valide_par`, `meta.valide_le`** sont conservés : un état du cycle de
  validation n'est pas une donnée de brochure ;
- **`distinctivite` et `voisines` sont retirés** — ils dépendent de l'ensemble des fiches et sont
  périmés dès qu'une fiche change. Le script le dit et renvoie vers `npm run distinctivite`. Sauf
  si un humain les a validés : là ils survivent comme le reste.

Une fiche présente sur le disque et plus produite par le catalogue n'est **jamais supprimée** :
elle peut porter du travail humain. Elle est signalée comme orpheline (programme fermé ou
renommé). Corollaire : un `id` qui change à cause d'un titre corrigé crée une orpheline et
n'emporte pas les apports humains — vérifier les alertes après un changement de parsing.

`npm test` vérifie tout cela sur une vraie fiche, dans `data/_test-fusion/` : édition à la main,
ré-extraction, contrôle que les champs humains sont intacts, que les champs d'inférence ont bien
été recalculés, et que les 25 autres fiches n'ont pas bougé.

## Ne pas faire

- Deviner une série de bac ou un prérequis. Absent de la source = `null`, point.
- Noter l'éligibilité. C'est un filtre binaire qui exclut, jamais un score.
- Écrire un nom de filière dans le code du moteur.
- Afficher un score en pourcentage. Trois niveaux, jamais un chiffre.
- Comparer les **niveaux** des axes. Les vecteurs sont pointus par construction ; seules les **formes** se comparent.
- Calculer la corrélation sur les notes 1..5. C'est `axes_parts` qui sert au calcul ; l'arrondi fabrique des ex æquo parfaits.
- Classer par le score un programme à `axes_fiables: false`. Accessible par les filtres et l'aiguillage, avec mention — jamais noté.
- Traiter `axes_fiables` absent comme `true`. Absent = non évalué.
- Supposer que `structure_ue` existe partout. 28 fiches sur 84 : les licences et bachelors, aucun master ni MBA.
- Mélanger les 2 axes de disposition aux 5 axes comptés dans un même vecteur. Deux natures de mesure, deux rôles.
- Demander à un responsable de formuler une question pour un prospect. Il apporte la substance, pas la rédaction.
- Sélectionner les paires à départager par un seuil unique de recouvrement. Trois mesures, 3 paires par domaine.
- Dupliquer une question de départage dans les fiches. Elle vit dans `config/departages.json`.
- Inférer les axes depuis la prose marketing. Toujours depuis les UE.
- Déduire un domaine des seuls modules. Titre ou objectif, sinon tout est de la gestion.
- Dépasser 2 domaines par fiche. L'aiguillage doit réduire, pas décrire.
- Rapprocher deux modules aux libellés voisins dans le calcul de recouvrement.
- Redemander aux responsables ce que le catalogue compte déjà.
- Écraser une fiche à la ré-extraction. Les sources `responsable`, `admissions` et `manuel` sont intouchables.
- Supprimer une fiche que le catalogue ne produit plus. La signaler, elle porte peut-être du travail humain.
- Rattacher un domaine à deux familles, ou l'oublier. `validate.mjs` refuse les deux.
- Envoyer une paire d'options sœurs à un responsable. Le nom de l'option tranche déjà.
- S'arrêter à `npm run distinctivite` après une correction d'extraction. Les fiches de comparaison sont gitignorées : leur péremption ne fait aucun diff, et ce sont elles qui partent aux responsables. `npm run validate` le refuse désormais.
- Mesurer la péremption d'un artefact par sa date de modification. `git clone` les réécrit toutes à la même seconde ; c'est le contenu des sources qui compte.
- Traiter un artefact absent comme périmé. Quatre le sont dans un clone neuf, et rien n'est périmé dans ce qui n'existe pas.
- Déclarer un artefact source d'un autre. Une seule péremption en signalerait cinq, sans dire laquelle relancer.
- Ajouter un artefact généré sans le déclarer dans `lib/fraicheur.mjs`. Personne ne verrait jamais qu'il n'est pas suivi.
- Conclure de `domainesInatteignables` qu'aucune fiche n'est hors de portée. Deux invariants différents : la question, et les fiches.
- Déplacer le plafond de 2 domaines sans relire `npm run plafond`. 4 fiches sont fragiles, et l'aiguillage doit réduire, pas décrire.
- Supposer qu'un gain de modules ne touche que les modules. Il déplace les axes, les paires, et parfois les `domaines` — donc la famille.
- Classer un candidat unique. Il n'y a rien à comparer : on l'affiche, avec la justification des filtres.
- Laisser un `axes_fiables: false` en zone non classée quand il est la seule option. Ce serait la pire réponse possible.
- Décider qu'une ligne poursuit la précédente d'après sa taille de police ou sa puce. Les trois catalogues marquent leurs UE de trois façons ; seul le mot qui n'y tenait plus est un fait.
- Mesurer la marge d'un retour à la ligne sur la section. Sur le **bloc** — les lignes alignées à gauche —, sinon une ligne étrangère fait passer la marge de 558 à 768.
- Lire un `:` final comme une phrase coupée. Il annonce une liste : ce qui suit est un élément.
- Toucher à `construireUE` sans mesurer l'effet sur les 84 fiches. Deux gardes plausibles ont chacune cassé un autre catalogue.
- Regrouper les items d'une page par Y seul. Les colonnes d'abord, toujours.
- Supposer qu'un catalogue est mono-colonne parce qu'une page l'est.
- Noter un axe de contenu à la main. Ils se comptent depuis les modules.
- Expliquer un axe bas par une concurrence entre lexiques. Les cinq axes sont indépendants : un module peut en nourrir plusieurs.
- Élargir un lexique d'axe sans le relire sur les programmes des autres axes, et sans ancrer le résultat par un test.
- Poser une question déclarative (« es-tu rigoureux ? »). Toujours situationnelle.
- Lancer les entretiens avant que la distinctivité ait tourné.
- Descendre sous 7 questions de profil. Des axes resteraient non mesurés.
- Faire confiance aux frais, dates et effectifs : sources 2024, à revérifier.
- Lire un fichier depuis `src/engine/`. Seul `charger.mjs` connaît le disque ; le reste reçoit son contexte en argument.
- Muter un état de parcours. `repondre()` rend un nouvel état, toujours.
- Remplacer une réponse hors bornes par un défaut. On refuse, on ne choisit pas à la place du prospect.
- Laisser un étage inactif se taire. Disposition non collectée, question de paire absente : le motif remonte.
- Modifier `config/questions.json` sans rejouer `npm run simuler`. Les seuils dépendent de la distribution.
- Afficher une liste de métiers comme question de départage. Situationnelle, comme les questions de profil.
- Reformuler un libellé du catalogue pour l'insérer dans une question. On filtre les artefacts, on ne réécrit pas.
- Générer une question de départage entre deux options sœurs. Le nom de l'option tranche déjà.
- Poser une question conditionnelle aux familles qu'elle ne concerne pas. Une question sans effet est du temps volé.
- Laisser un domaine de famille inatteignable par l'aiguillage fin. `validate.mjs` le refuse.
- Élargir en silence quand l'aiguillage fin vide le jeu. On revient à la famille en le disant.
- Conclure d'un taux global. La mesure par famille disait l'inverse du taux global.
- Recalculer quoi que ce soit dans l'interface. Un champ qui manque s'ajoute au **résultat** ; deux interfaces le recalculeraient différemment.
- Écrire un libellé de modalité, de niveau ou d'école dans l'interface. Ils vivent dans `config/taxonomy.json > *_libelles`.
- Toucher au DOM depuis `src/ui/rendu.mjs`. Il rend des chaînes, et c'est ce qui le rend testable sans dépendance.
- Afficher « correspondance faible ». En `possible`, c'est « une piste à explorer » : un prospect sur trois le reçoit.
- Titrer « recommandation » une des deux cartes en `egalite`. Le moteur n'a rien trouvé pour les séparer.
- Sérialiser l'état du moteur dans l'URL. Seules les réponses, sinon on peut forger un profil inatteignable.
- Rejouer les réponses de profil au clic sur Reprendre. Pré-sélectionnées, pas appliquées.
- Laisser une alternative se présenter par un libellé déjà cité par la recommandation.
- Embarquer les `unites_enseignement` dans le contexte du navigateur. Liste blanche explicite, jamais un `delete`.
- Conclure qu'un état d'écran est inatteignable depuis une grille de recherche étroite. `egalite` ne fait que 2 %.
- Générer le formulaire de validation en JavaScript. Netlify analyse le HTML **déployé** : il ne serait jamais enregistré.
- Envoyer le formulaire sans `form-name`. Netlify ignore l'envoi, et l'échec est silencieux.
- Poster vers `/`. `netlify.toml` y redirige en 302, POST compris.
- Ajouter un champ personnel au formulaire de validation. Aucun nom, aucune adresse, aucun téléphone.
- Retirer la question sur la satisfaction. Sans elle, un étudiant mal orienté passe pour un modèle en erreur.
- Montrer le bloc de validation sans `?validation=1`. Un prospect n'a pas à voir un formulaire de recherche.
- Effacer le résultat affiché quand un envoi échoue.
- Lister des programmes sans leur modalité. Deux écoles publient le même intitulé.
- Écrire une couleur en dur hors de `web/theme.css`.
- Poser `#F38416` en texte. 2,6:1 sur blanc — c'est une couleur de fond.
- Recopier la palette claire en mode sombre. Les contrastes se recalculent.
- Croire un contraste annoncé. Le test le calcule ; `#B35A00` échouait sur un fond que la spec n'avait pas prévu.
- Déduire l'adresse d'admission d'une école. Trois sont documentées, cinq non : c'est une question aux admissions.
- Afficher un bouton de contact sans destination. Mieux vaut un bouton absent.
- Publier `web/` seul sur Netlify. `data/_contexte.json` vit en dehors.
- Laisser une modalité de la taxonomie à zéro fiche. Extraction manquée, ou entrée à retirer — jamais un silence.
- Lire une annotation du sommaire à travers le titre concaténé. Elle se parse en champ, sinon elle disparaît sans alerte.
- Choisir entre deux modalités qu'un programme déclare toutes les deux. « En semaine ou en week-end » veut dire les deux.
- Changer un `id` pour nettoyer un titre. Une orpheline n'emporte pas le travail humain.
- Traiter `data/_impasses.md` comme un rapport de bogues. C'est une question d'offre et de brochure, adressée aux admissions.
- Lire « 20 sur 160 » comme « 13 % des candidats ». Les combinaisons ne sont pas équiprobables, et le taux pondéré n'est pas connu.
- Laisser une règle systématique se déduire d'une liste. Une règle s'énonce en tête ; quatorze lignes ne se comprennent pas.
- Écrire à la main une règle du catalogue. Elle se calcule, sinon elle se périme en gardant l'air d'un fait.
- Mettre la modalité dans le `nom` d'une fiche. Le nom nomme le programme, la modalité se lit à côté.
- Écrire une option de filtre de modalité sur une seule étiquette. Les catalogues n'emploient pas le même mot.
- Laisser une modalité de la taxonomie hors de toute option de filtre. `validate.mjs` le refuse.
- Rouvrir le profil en impasse. Ce sont les filtres qui ont vidé le jeu ; le bouton doit rendre la main sur eux.
- Traiter un élargissement comme une impasse. Il y a un classement : c'est une mention, pas une absence.
- Afficher « aucune formation » quand des programmes non classables existent. Les montrer sans les classer.
- Reprocher des « réponses trop partagées » à un parcours arrêté avant les questions de profil.
- Afficher une alerte qui désigne un classement absent.
- Conclure d'un cas rapporté. Le balayage a trouvé 31 combinaisons sans issue là où une seule était signalée.
- Générer le formulaire d'avis en JavaScript, ou lui donner le même champ piège que la validation.
- Envoyer plus d'un signalement par écran et par session. Le quota Netlify est de l'ordre de la centaine par mois.
- Montrer un bouton de signalement sans `?test=1`. Un candidat croirait le site en travaux.
- Conditionner l'envoi d'un signalement à la saisie d'un texte. Le premier geste est ce qui produit le volume.

## Commandes

L'ordre compte : la distinctivité enrichit les fiches produites par l'extraction, et
le rapport des manques s'appuie sur les paires qu'elle a trouvées.

**La péremption est désormais détectée par `npm run validate`**, pas seulement écrite ici — voir
« Fraîcheur des artefacts générés ». Ce qui suit explique pourquoi ce contrôle a dû exister.

**La chaîne se relance en ENTIER, jamais partiellement, et `git status` ne le dira pas.**
`data/_paires.csv`, `data/_comparaisons/`, `data/_manques.csv` et `data/_impasses.md` sont
**ignorés par git** : une sortie périmée ne produit donc aucun diff et se voit uniquement à
l'horodatage des fichiers. C'est arrivé — les 80 fiches de comparaison ont continué de citer des
modules exclusifs d'avant une correction d'extraction, et ce sont précisément les documents qui
partent aux responsables. Après toute modification de `data/filieres/`, relancer jusqu'au bout :

```bash
npm run extract && npm run distinctivite && npm run comparaisons \
  && npm run validate && npm run report -- --csv && npm run impasses \
  && npm run contexte:web && npm test && npm run simuler
```

Une correction d'extraction ne s'arrête jamais aux fiches : elle déplace les `axes` et
`axes_parts` (le dénominateur est le nombre de modules **du programme**), donc les corrélations,
donc les paires retenues, donc les fiches de comparaison — et elle peut déplacer les `domaines`,
parce qu'un domaine tiré de l'objectif exige d'être corroboré par des modules.

```bash
npm run extract -- --dump   # catalogues → fiches + texte segmenté dans data/_raw/
npm test                    # 26 fiches Bachelor, conformité des 84, distinctivité (CI)
npm run distinctivite       # + distinctivite/structure_ue/voisines, data/_paires.csv
npm run comparaisons        # une fiche imprimable par paire → data/_comparaisons/
npm run validate            # schéma + taxonomie + axes de disposition (aussi en CI)
npm run report -- --csv     # manques par filière → data/_manques.csv
npm run impasses            # combinaisons sans résultat → data/_impasses.md (admissions)
```

Le moteur, une fois les données en place :

```bash
npm run contexte:web        # config/ + data/filieres/ → data/_contexte.json (à commiter)
npm run web                 # serveur local, puis http://localhost:8080/web/
                            # ?validation=1 ouvre le formulaire de collecte étudiante
                            # ?test=1 ouvre les boutons de signalement des testeurs
npm run quiz                # affiche les questions du parcours
npm run quiz -- --etat      # contrôles de cohérence du contexte (seuils, axes, familles)
npm run quiz -- --reponses F1=0,F2=3,A1=3,P1=1,P2=2,P3=0,P4=0,P5=1,P6=0,P7=0
npm run simuler             # calibration des seuils → data/_calibration.json
```

`npm test` lance les trois suites : `test:donnees` (extraction, distinctivité, structure d'UE),
`test:moteur` (interdits de cette spec, parcours, cas limites) et `test:interface` (cinq états,
aucun score dans le rendu, dégradation, reprise par l'URL).

**`npm run contexte:web` est à rejouer après toute modification de `config/` ou de
`data/filieres/`** : le navigateur lit `data/_contexte.json`, pas les fichiers d'origine. La CI
le régénère et refuse un `git diff` non vide — sans quoi l'écran servirait un catalogue périmé
que rien ne signalerait.

**`npm run simuler` est à rejouer après toute modification de `config/questions.json` ou des
lexiques d'axes** : les deux déplacent la distribution des scores, donc les seuils. Le script sort
en code d'erreur si les trois objectifs de la spec ne sont plus atteints.

Trois commandes de diagnostic, sans effet de bord :

```bash
node scripts/stats-axes.mjs                    # distribution des 5 axes sur le catalogue
node scripts/axes-modules.mjs mastere-ux-design # quel(s) axe(s) captent chaque module
npm run plafond                                # fragilité du plafond de 2 domaines
```

`axes-modules.mjs` est l'outil à sortir dès qu'un axe paraît faux : il montre les modules
orphelins (trou lexical) et ceux captés par plusieurs axes. Voir « Normalisation des cinq
axes ».

Pour une UE mal découpée, `UE_DEBUG=1` imprime chaque ligne de section avec son abscisse, sa
**borne droite**, sa taille de police et sa puce — les quatre grandeurs dont dépend le
recollement des retours à la ligne :

```bash
UE_DEBUG=1 npm run extract 2>&1 | grep -B2 -A6 "UE semestre 2"   # ou l'intitulé suspect
```

C'est ce qui a montré que « UE semestre 2 » s'arrêtait 65 pts avant la marge de son bloc, là
où les vrais retours à la ligne la touchent. Voir « Un retour à la ligne se reconnaît au mot
qui n'y tenait plus ».

`npm run extract` fusionne avec l'existant (voir « L'extraction fusionne ») mais retire
`distinctivite`, périmée dès qu'une fiche change : relancer
`npm run distinctivite` après chaque extraction.

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
| `scripts/lib/fiche.mjs` | titres, UE, métiers, niveaux, modalités, comptage des axes, aiguillage. |
| `scripts/extract.mjs` | orchestration, appariement au sommaire, écriture, CLI. |
| `scripts/distinctivite.mjs` | trois mesures de proximité, exclusivités, attributs d'UE, paires à départager, couverture des lexiques. |
| `scripts/fiches-comparaison.mjs` | un document de travail imprimable par paire, demi-fiches comprises. |
| `scripts/axes-modules.mjs` | diagnostic : quel(s) axe(s) captent chaque module d'un programme. |
| `scripts/stats-axes.mjs` | diagnostic : distribution des 5 axes sur le catalogue. |
| `scripts/quiz.mjs` | banc d'essai du moteur en ligne de commande. Le moteur ne le connaît pas. |
| `scripts/simuler.mjs` | calibration des seuils sur la distribution réelle des scores. |
| `scripts/contexte-web.mjs` | le contexte du moteur en un seul JSON, liste blanche de champs. |
| `scripts/servir.mjs` | serveur statique local, `node:http` seul. Aucune écriture. |
| `scripts/impasses.mjs` | les combinaisons sans résultat, en document lisible pour les admissions. |

## `data/_impasses.md` — ce que le catalogue ne couvre pas

Destiné aux **admissions**, pas au débogage. Deux règles de rédaction, toutes deux apprises en
relisant la première version :

**Les règles d'abord, la liste ensuite.** Une règle s'énonce et se comprend ; quatorze lignes
dont il faut déduire la règle ne se comprennent pas. Le document ouvre donc sur ce qui est
systématique, et les règles sont **calculées** sur les fiches — une règle recopiée à la main se
périmerait à la prochaine édition en gardant l'air d'un fait. Huit sont détectées aujourd'hui,
dont la plus actionnable :

> **Aucune formation hors journée n'est accessible avec le bac seul.** Les 7 programmes en cours
> du soir sont tous à `bac+3`, le week-end et le temps plein à `bac+2`. **Un bachelier qui
> travaille n'a donc aucune option, dans aucune famille** — à lui seul, ce fait produit 10 des
> combinaisons sans issue.

Les autres, du même type : `week-end` et `full-time` n'existent que dans
`entreprise-management` ; aucun cours du soir en `numerique` ni en `droit-action-publique` ;
aucun programme en ligne en `ingenierie-industrie` ; et trois familles n'ont aucune entrée à
`bac+2`.

**Le taux global ne se lit pas comme une proportion de candidats.** « 20 sur 160 » n'est **pas**
« 13 % des candidats » : les combinaisons comptent chacune pour une alors que la grande majorité
des candidats sont des bacheliers cherchant du présentiel — profil qui ne rencontre aucune
impasse. Le document le dit explicitement, parce que sans cette précision les admissions
liraient « un tiers des candidats ne trouve rien », ce qui est faux et alarmant à tort.

**Le taux pondéré n'est pas connu et le document le dit.** L'estimer demanderait la répartition
réelle des candidatures par diplôme, modalité et domaine — une donnée des admissions, pas du
catalogue. La simulation, elle, pondère les **réponses de profil**, pas les filtres : elle ne
peut donc pas y répondre. En attendant, la lecture honnête est le tableau **par profil** : 9 des
16 couples diplôme × modalité ne rencontrent aucune impasse ; un bachelier qui demande le soir ou
le week-end n'obtient rien dans les 10 cas.

**Une section à zéro ne s'affiche pas en tableau vide.** La section 2 — « des programmes existent
mais aucun n'est comparable » — vaut 0 depuis le traitement du candidat unique. Elle dit alors en
une phrase pourquoi elle vaut zéro et ce qui la ferait remonter, et la colonne correspondante
disparaît du tableau par profil : quatorze tirets d'affilée se lisent comme une donnée manquante,
alors que c'est un zéro mesuré.
