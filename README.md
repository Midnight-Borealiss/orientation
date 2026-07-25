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
| Calcul de distinctivité | point de contrôle |
| Moteur de scoring | après le point de contrôle |
| Interface du quiz | à venir |

---

## Structure

```
config/taxonomy.json      Vocabulaire commun : écoles, domaines, axes
config/domaines_axes.json Les 2 axes de disposition, par domaine — à collecter
config/departages.json    Questions de départage par paire + seuils
schema/filiere.schema.json  Contrat de données. Rien n'entre sans le respecter.
data/brochures/           Catalogues PDF, à plat (l'école se lit DANS le PDF)
data/filieres/            Fiches JSON générées, une par programme
scripts/extract.mjs       Catalogues → fiches brouillon (orchestration + CLI)
scripts/lib/pdf-layout.mjs  Géométrie : items → colonnes → lignes
scripts/lib/profils.mjs     Les 3 profils de parsing (en-têtes, sommaire, écoles)
scripts/lib/fiche.mjs       UE, métiers, niveaux, comptage des axes
scripts/test-extract.mjs  Test de segmentation (26 fiches Bachelor)
scripts/report.mjs        Ce qui manque, et à qui le demander
scripts/distinctivite.mjs Ce qui distingue chaque programme dans son domaine
scripts/validate.mjs      Contrôle schéma + taxonomie
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

**3. Vérifier la segmentation :**

```bash
npm test
```

La brochure Bachelor annonce 26 programmes page 13 et doit en produire exactement 26.
C'est le garde-fou : un parsing qui dérape se voit là, pas en relisant 48 pages.

**4. Voir ce qui manque :**

```bash
npm run report           # à l'écran
npm run report -- --csv  # data/_manques.csv, à envoyer aux équipes
```

Le CSV contient une colonne `destinataire` : filtre dessus et chaque responsable ne reçoit que les 3 ou 4 champs de sa filière, au lieu d'une fiche vierge à remplir.

**5. Valider :**

```bash
npm run validate
```

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
3. `npm run validate`.

Le moteur et l'interface suivent la donnée. Les 5 axes sont volontairement génériques — ils décrivent un profil, pas un secteur — ce qui les rend transposables au-delà de l'enseignement supérieur.

## Limites connues

- L'extraction suppose des PDF texte. Les PDF scannés sont signalés et ignorés (une passe OCR serait nécessaire).
- L'inférence des axes est lexicale, donc grossière : elle sert à donner un point de départ à corriger, pas un résultat.
- Les brochures d'une année passée peuvent contenir des frais, dates ou programmes obsolètes. `meta.annee_source` sert à repérer ce qui doit être revérifié.
