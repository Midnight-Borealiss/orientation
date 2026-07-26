# orientation-engine

Moteur d'orientation réutilisable : un quiz guidé qui recommande une filière à partir du profil d'un prospect.

Le moteur ne connaît aucune filière. Il consomme des fiches de données validées contre un schéma. Changer de contexte d'orientation (autre établissement, orientation métier, choix de spécialisation) revient à écrire un nouveau jeu de données — sans toucher au code.

---

## État du projet

| Étape | Statut |
|---|---|
| Schéma de données | fait |
| Rapport des manques + export CSV | fait |
| Validation CI | fait |
| Extraction des catalogues (3 profils, segmentation) | fait — 84 fiches |
| Calcul de distinctivité | fait — 3 mesures, 59 paires, 82 documents de comparaison |
| Familles au-dessus des domaines | fait — 6 familles, pour le parcours |
| Fusion à la ré-extraction | faite |
| Métrique de score | tranchée — corrélation de forme, pas une distance |
| Attributs de structure d'UE | faits — mais 28 fiches sur 84, licences et bachelors seuls |
| Proportions brutes des axes | faites — `axes_parts`, plus d'ex æquo parfait |
| Programmes non notables | marqués — 16 fiches `axes_fiables: false` |
| Questions du quiz | v0 — formulations à remplacer par celles des entretiens |
| Moteur de scoring | fait — `src/engine/`, 88 tests |
| Cascade de départage | faite — 98 % des égalités tranchées sans les entretiens |
| Aiguillage à deux étages | fait — la famille la plus large passe de 17,8 à 8,8 filières en lice |
| Calibration des seuils | faite — seuils mesurés, les 3 objectifs de la spec atteints |
| Axes de disposition (28 domaines) | à collecter auprès des responsables |
| Écran de résultat | fait — `web/index.html`, 5 états, 96 tests, sans framework |
| Action « parler à un conseiller » | à câbler avec les admissions |

---

## Structure

```
config/taxonomy.json      Vocabulaire commun : écoles, familles, domaines, axes
config/questions.json     Les questions du parcours : filtres, aiguillage, profil
config/domaines_axes.json Les 2 axes de disposition, par domaine — à collecter
config/departages.json    Questions de départage par paire + seuils du score
config/reformulation.json Les fragments de « Si je comprends bien… », par axe et par sens
schema/filiere.schema.json  Contrat de données. Rien n'entre sans le respecter.
data/brochures/           Catalogues PDF, à plat (l'école se lit DANS le PDF)
data/filieres/            Fiches JSON générées, une par programme
data/_comparaisons/       Fiches de comparaison imprimables, une par paire
data/_contexte.json       Le contexte du moteur en un fichier, pour le navigateur (commité)
scripts/extract.mjs       Catalogues → fiches brouillon (orchestration + CLI)
scripts/lib/pdf-layout.mjs  Géométrie : items → colonnes → lignes
scripts/lib/profils.mjs     Les 3 profils de parsing (en-têtes, sommaire, écoles)
scripts/lib/fiche.mjs       Titres, UE, métiers, niveaux, comptage des axes
scripts/test-extract.mjs  Segmentation, fusion, axes, distinctivité, structure d'UE
scripts/report.mjs        Ce qui manque, et à qui le demander
scripts/distinctivite.mjs Trois mesures de proximité, attributs d'UE, paires à départager
scripts/fiches-comparaison.mjs  Le document de travail de l'entretien
scripts/axes-modules.mjs  Diagnostic : quels axes captent chaque module
scripts/stats-axes.mjs    Diagnostic : distribution des 5 axes
scripts/validate.mjs      Contrôle schéma + taxonomie + axes de disposition
src/engine/score.mjs      Corrélation de forme, 3 niveaux, classement
src/engine/filtres.mjs    niveau_acces et modalites : ils excluent, ils ne notent pas
src/engine/aiguillage.mjs famille → domaines → candidates
src/engine/departage.mjs  La cascade à 5 étages, questions générées depuis le catalogue
src/engine/parente.mjs    Reconnaître deux options d'un même programme
src/engine/texte.mjs      Normalisation de chaînes — unique implémentation du dépôt
src/engine/reformulation.mjs  « Si je comprends bien… », fragments pré-écrits
src/engine/moteur.mjs     Le parcours, l'arrêt anticipé, le résultat
src/engine/charger.mjs    La seule porte vers le disque + contrôles de cohérence
scripts/quiz.mjs          Banc d'essai du moteur en ligne de commande
scripts/simuler.mjs       Calibration des seuils sur la distribution réelle
scripts/test-moteur.mjs   Les interdits de la spec, sous forme exécutable
web/index.html            L'écran : le câblage seul — fetch, fragment d'URL, clics, CSS
src/ui/rendu.mjs          Tout le rendu, en fonctions pures qui rendent des chaînes
src/ui/etat-url.mjs       Le parcours dans location.hash — réponses, jamais l'état
scripts/contexte-web.mjs  config/ + data/filieres/ → data/_contexte.json
scripts/servir.mjs        Serveur local (node:http seul) : file:// interdit les modules ES
scripts/test-interface.mjs  Les 5 états, aucun score dans le rendu, dégradation, reprise
```

Lire `CLAUDE.md` avant toute modification : il contient l'architecture validée,
le principe directeur, et la liste de ce qu'il ne faut pas faire.

## Installation

```bash
npm install
```

Node 18 ou plus.

## Utilisation

**1. Déposer les catalogues** à plat dans `data/brochures/`. Pas de sous-dossier par
école : un catalogue en couvre plusieurs, et l'école est lue dans le PDF (sommaire,
pied de page, titres de section).

**2. Extraire :**

```bash
npm run extract          # tous les catalogues
npm run extract -- --dump   # + texte segmenté et journal dans data/_raw/
```

Un catalogue contient des dizaines de programmes : le script le **segmente**, puis
écrit une fiche par programme dans `data/filieres/`, au statut `brouillon`.

L'extraction **fusionne, elle n'écrase pas** : un champ dont `meta.sources` vaut `responsable`,
`admissions` ou `manuel` est intouchable, et `meta.statut` est conservé. Seuls `brochure` et
`inference` sont rafraîchis. On peut donc corriger le parsing et relancer sans perdre une semaine
de collecte.

**3. Vérifier :**

```bash
npm test                # les trois suites
npm run test:donnees    # extraction, distinctivité, structure d'UE
npm run test:moteur     # les interdits de la spec, le parcours, les cas limites
npm run test:interface  # les 5 états, aucun score dans le rendu, dégradation, reprise
```

La brochure Bachelor annonce 26 programmes page 13 et doit en produire exactement 26.
C'est le garde-fou : un parsing qui dérape se voit là, pas en relisant 48 pages.

`test:moteur` transforme en tests les interdits de `CLAUDE.md` : aucun nom de filière dans `src/engine/`, aucun score numérique sous une clé publique du résultat, la corrélation sur les proportions et non sur les notes, aucun programme non fiable dans un classement. Un interdit écrit seulement en prose se transgresse à la refactorisation suivante.

`test:interface` en fait autant pour l'écran : aucune valeur de score dans la page — le test
cherche chaque écriture plausible des scores réels, brute, arrondie, en pourcentage —, aucun
identifiant du catalogue dans le code, une charge hostile injectée dans chaque champ pour
prouver l'échappement, et aucun cadre vide quand la donnée manque.

**4. Calculer la distinctivité :**

```bash
npm run distinctivite                     # enrichit les fiches + data/_paires.csv
npm run distinctivite -- --dry            # calcule sans rien écrire
npm run distinctivite -- --par-domaine 2  # moins de paires à départager
```

Pour chaque programme : modules et métiers exclusifs dans son domaine, attributs de structure d'UE, et **trois mesures de proximité** avec les autres programmes du domaine :

| Mesure | Ce qu'elle dit |
|---|---|
| recouvrement de modules | ce que le catalogue partage — appariement exact, donc borne inférieure |
| corrélation d'axes | qui produira un **ex æquo** au scoring, ce que la première ne prédit pas |
| recouvrement d'UE | où le comptage est aveugle : mêmes modules, organisation différente |

Sont retenues les **3 paires les plus proches par domaine** selon chacune des deux premières. Un seuil unique à 80 % ne suffit pas : il laisse passer des paires à 26 % de modules communs et `r = 0,94`, qui feront trébucher le moteur.

`data/_paires.csv` distingue deux types : `ambigue` (destinataire `responsable`) et `option-soeurs` (destinataire `code`). Deux options d'un même programme partagent leur tronc commun par construction ; leur nom suffit à trancher, aucun responsable n'est mobilisé.

Le script marque `axes_fiables: false` les programmes dont les axes ne décrivent pas le contenu — aucun module, moins de 6 modules, ou trop de modules qu'aucun lexique ne reconnaît. **Le moteur ne doit pas les classer par le score** : ils restent accessibles par les filtres et l'aiguillage, avec mention.

À relancer après chaque `npm run extract`, qui retire la distinctivité devenue périmée.

**5. Imprimer les fiches de comparaison :**

```bash
npm run comparaisons          # data/_comparaisons/ + SOMMAIRE.md
npm run comparaisons -- --dry # liste sans écrire
```

Un document de travail par paire : l'en-tête comparatif, le socle partagé présenté comme ne distinguant rien, les modules et débouchés propres à chacun, trois questions fixes, et un bloc JSON prêt à reporter dans `config/departages.json`.

Aucune question ne demande au responsable de formuler quelque chose pour un prospect — il apporte la substance, la rédaction est un travail de conception fait ensuite. Une paire à cheval sur deux écoles produit **deux demi-fiches**, chacune ne portant que sur le programme que ce responsable connaît.

**6. Voir ce qui manque :**

```bash
npm run report           # à l'écran
npm run report -- --csv  # data/_manques.csv, à envoyer aux équipes
```

Le CSV contient une colonne `destinataire` : filtre dessus et chaque responsable ne reçoit que les points manquants de ses filières, au lieu d'une fiche vierge à remplir. Rien n'y est demandé que le catalogue sache déjà : ni séries de bac (ISM n'en exige pas), ni notes d'axes (comptées depuis les UE).

**7. Valider :**

```bash
npm run validate
```

**8. Passer le quiz :**

```bash
npm run quiz                # les questions du parcours
npm run quiz -- --etat      # contrôles de cohérence du contexte
npm run quiz -- --reponses F1=0,F2=3,A1=3,P1=1,P2=2,P3=0,P4=0,P5=1,P6=0,P7=0
```

Ce n'est pas l'interface : c'est le moyen de voir ce que le moteur répond. Le moteur, dans `src/engine/`, ne connaît ni ce script ni aucune filière — il reçoit son contexte en argument, ce qui le rend utilisable tel quel dans un navigateur.

Quand deux filières sont à égalité — 27 % des profils —, le moteur essaie **cinq étages** et s'arrête au premier qui produit quelque chose :

| Étage | Source | Résout |
|---|---|---|
| 1. question rédigée | `config/departages.json`, après entretiens | 0 % |
| — deux options sœurs | le nom de l'option suffit | 12 % |
| 2. question **générée** depuis les métiers exclusifs | le catalogue | **60 %** |
| 3. question **générée** depuis les modules exclusifs | le catalogue | **26 %** |
| 4. distance de disposition | `config/domaines_axes.json`, à collecter | 0 % |
| 5. afficher à égalité | — | 2 % |

Les étages 2 et 3 ne dépendent d'aucune collecte : **98 % des égalités sont tranchées sans attendre les entretiens**. Les questions sont situationnelles, jamais une liste de métiers affichée telle quelle, et aucun libellé du catalogue n'est reformulé.

**9. Calibrer les seuils :**

```bash
npm run simuler
```

Le tirage est **exhaustif sur les réponses possibles** aux 7 questions de profil — 16 384 combinaisons, 1942 vecteurs distincts —, jamais uniforme sur les axes : ce dernier produirait des profils que le quiz ne peut pas générer. Les bornes des trois niveaux sont **déduites** des objectifs de la spec, pas choisies : chaque objectif fixe une proportion cible, donc un quantile de la distribution observée.

À rejouer après toute modification de `config/questions.json` ou des lexiques d'axes : les deux déplacent la distribution. Le script sort en erreur si les objectifs ne sont plus atteints, et n'écrit jamais dans `config/` — il imprime le bloc à recopier.

**10. Voir l'écran de résultat :**

```bash
npm run contexte:web   # config/ + data/filieres/ → data/_contexte.json
npm run web            # puis http://localhost:8080/web/
```

Un seul fichier HTML, aucun framework, aucune dépendance, aucune étape de build : `git push`
suffit à déployer. Le serveur local n'existe que parce que `file://` interdit les modules ES.

`data/_contexte.json` **se commite** — c'est ce que le navigateur charge, en un seul appel. Il
ne contient pas les `unites_enseignement` : le moteur ne les lit jamais, et les embarquer
ferait payer au prospect 165 ko qui ne changent rien à ce qu'il voit. À régénérer après toute
modification de `config/` ou de `data/filieres/` ; la CI refuse un `git diff` non vide.

L'écran a **cinq états**, et pas un gabarit unique — une recommandation affirmée et une piste
à explorer ne se lisent pas de la même façon :

| État | Part des profils | Ce qui change |
|---|---|---|
| `forte` | 25 % | recommandation affirmée |
| `bonne` | 40 % | les alternatives remontent avant le contenu |
| `possible` | 35 % | le conseiller passe en haut, et le badge dit « une piste à explorer » |
| `egalite` | 2 % | deux cartes de même poids, aucune titrée « recommandation » |
| `impasse` | rare | on dit que le choix a vidé le jeu, on n'élargit jamais en silence |

Le « pourquoi » tient en trois lignes tirées de la chaîne de décision : l'univers retenu, le
nombre de candidats après filtres, et le module ou le métier qui a départagé — dans les mots de
la brochure, jamais reformulés. Tout vient du résultat du moteur : l'interface affiche, elle ne
calcule rien, et ne contient aucun nom de filière, d'école ou de domaine.

Le parcours vit dans le fragment d'URL — un prospect peut reprendre plus tard ou envoyer le
lien à un parent. Ce sont les **réponses** qui y sont écrites, pas l'état du moteur : sinon on
pourrait forger un profil qu'aucune combinaison de réponses ne peut produire. Aucun
`localStorage`, aucun cookie, aucun script tiers.

---

## Le principe de traçabilité

Chaque champ d'une fiche porte sa source dans `meta.sources` :

| Valeur | Signification |
|---|---|
| `brochure` | Extrait du PDF. Fiable, sous réserve de l'année. |
| `inference` | Deviné par le script à partir du champ lexical. **À faire confirmer.** |
| `responsable` | Confirmé par le responsable de programme. |
| `admissions` | Fourni par le service des admissions. |
| `manuel` | Saisi à la main. |

Les notes d'axes et les domaines sortent toujours en `inference` : ce sont des brouillons destinés à être corrigés, pas des vérités. `report.mjs` les traite comme manquants tant qu'un humain ne les a pas validés.

`meta.statut` suit le cycle `brouillon` → `a_valider` → `valide`.

---

## Adapter le parsing à d'autres catalogues

Toute la dépendance à la mise en page est concentrée dans `scripts/lib/profils.mjs` : un
profil par catalogue, sélectionné par nom de fichier. Ajouter un catalogue = ajouter un
profil, jamais élargir une liste unique de motifs.

```js
"mon-catalogue-2026": {
  segmentation: "page",          // ou "colonne" si 2 programmes par page
  exigeContenu: true,            // ignore les pages d'accroche
  hauteurTitre: 20,
  entetes: {
    objectif: /^objectifs?\s*:?/,
    contenu: /^contenu de la formation/,
    debouches: /^(debouches|perspectives professionnelles)/,
    autre: /^(admission|frais)\b/,
  },
  separateurMetiers: /\s*;\s*/,  // null = une ligne par métier
  modalitesBase: ["presentiel"],
  accesParNiveau: { licence: "bac", master: "bac+3" },
  sourceAcces: "inference",
}
```

Les motifs sont testés sur du texte **normalisé** (minuscules, sans accents) : la brochure
Bachelor écrit `DéBOUCHéS`, et `/DÉBOUCHÉS/` n'y matcherait jamais.

Lancer `npm run extract -- --dump` puis lire `data/_raw/*.txt` est la façon la plus rapide
de voir comment le PDF est réellement structuré : chaque ligne y sort avec sa colonne, son
abscisse et sa taille de police, suivie de la liste des programmes segmentés et du journal.

---

## Réutiliser pour un autre cas d'orientation

1. Remplacer `config/taxonomy.json` par le vocabulaire du nouveau contexte.
2. Produire les fiches dans `data/filieres/` (extraction ou saisie).
3. Écrire une entrée par domaine dans `config/domaines_axes.json`.
4. `npm run validate`.

Le moteur et l'interface suivent la donnée. Les 5 axes sont volontairement génériques — ils décrivent un profil, pas un secteur — ce qui les rend transposables au-delà de l'enseignement supérieur.

## Limites connues

- L'extraction suppose des PDF texte. Les PDF scannés sont signalés et ignorés (une passe OCR serait nécessaire).
- L'inférence des axes est lexicale, donc grossière : elle sert à donner un point de départ à corriger, pas un résultat. `npm run distinctivite` signale les programmes dont trop de modules échappent aux lexiques.
- Le découpage en UE n'est publié que pour 28 programmes sur 84 : `structure_ue.concentration` est `null` pour les autres, et les attributs de structure ne s'appliquent pas à eux.
- Les seuils des trois niveaux sont calibrés sur le catalogue 2024 et les questions v0. Toute modification de l'un ou de l'autre les périme : rejouer `npm run simuler`.
- Les formulations de `config/questions.json` sont une **v0** écrite pour débloquer le moteur. Le vocabulaire définitif se récolte auprès des admissions, qui parlent aux prospects tous les jours.
- Le départage par axes de disposition est implémenté mais **inactif** : les 28 domaines ne sont pas encore classés, et aucune question ne mesure la disposition du prospect. Ce n'est plus bloquant — les questions générées depuis le catalogue tranchent 98 % des égalités — mais le moteur le signale au lieu de le masquer.
- Le domaine `entrepreneuriat` ne porte aucune fiche du catalogue 2024 : l'option d'aiguillage correspondante existe pour qu'aucun domaine ne soit inatteignable, mais elle ne désigne aujourd'hui aucun programme.
- La famille `droit-action-publique` est celle où le score départage le plus — 61 % des profils, contre 22 % pour la plus large. Ses programmes partagent leur tronc commun, donc leurs formes d'axes. C'est la cascade de départage qui les sépare, pas l'aiguillage.
- Les brochures d'une année passée peuvent contenir des frais, dates ou programmes obsolètes. `meta.annee_source` sert à repérer ce qui doit être revérifié.
