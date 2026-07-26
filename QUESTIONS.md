# Questions du quiz — version 0

À placer en `config/questions.json` (le JSON est en fin de document).

**Statut : v0, à calibrer et à corriger.** Les formulations viennent de moi, pas des
responsables ni des admissions. Elles servent à débloquer l'écriture du moteur ; le
vocabulaire définitif se récolte en entretien, comme prévu dans la spec.

---

## Structure du parcours

| # | Bloc | Effet |
|---|---|---|
| F1 | Diplôme actuel | filtre `niveau_acces` |
| F2 | Modalité souhaitée | filtre `modalites` |
| A1 | Univers qui attire | aiguillage vers une famille |
| P1–P7 | Profil, 7 questions situationnelles | vecteur sur les 5 axes comptés |
| D | Départage | conditionnel, `config/departages.json` |

Dix questions systématiques au plus, souvent moins avec l'arrêt anticipé.

## Comment se construit le vecteur du prospect

Chaque option ajoute des points à un ou deux axes. Le vecteur est la somme des sept
réponses, comparé aux `axes_parts` de chaque filière par corrélation de forme.

Pearson étant invariant d'échelle et de position, le vecteur du prospect n'a pas besoin
d'être sur la même échelle que les proportions d'une filière. Aucune normalisation
préalable n'est requise.

**Cas limite.** Un prospect dont le vecteur est plat — variance nulle — n'a pas de forme
comparable. Se replier alors sur les parts de budget, et le signaler, comme prévu au
point 1 de la spec. C'est peu probable ici : les options à deux axes rendent un vecteur
parfaitement plat difficile à obtenir.

## Couverture des axes

Chaque axe est atteignable dans au moins cinq des sept questions, ce qui évite qu'une
seule réponse détermine un axe entier.

| Axe | Questions le portant |
|---|---|
| quantitatif | P2, P4, P5, P6, P7 |
| technique | P1, P3, P4, P6, P7 |
| relationnel | P1, P2, P3, P4, P6, P7 |
| creatif | P1, P2, P4, P5, P6, P7 |
| cadre | P1, P2, P3, P5, P6 |

`technique` et `creatif` étant quasi binaires dans le catalogue — 46 fiches sur 84 à 1
sur l'un, 57 sur l'autre — leurs options sont volontairement tranchées : elles séparent
plutôt qu'elles ne gradent.

## Règles de rédaction appliquées

- **Situationnelle, jamais déclarative.** Aucune question ne demande au prospect de
  s'auto-évaluer. On présente une situation, on déduit.
- **Aucune option valorisée.** Les quatre réponses de chaque question sont également
  honorables. Un prospect ne doit pas pouvoir deviner « la bonne ».
- **P5 porte le « ça dépend ».** Sans au moins une option de ce type, l'ensemble prend
  un ton d'interrogatoire et les gens répondent ce qu'ils croient attendu.
- **Pas de vocabulaire scolaire ni technique** dans les énoncés.

## Ce qui reste à faire

1. **Calibrer les poids par simulation** — point 5 de la spec. Les valeurs ci-dessous
   sont plausibles, pas mesurées.
2. **Remplacer le vocabulaire** par celui récolté en entretien, notamment auprès des
   admissions qui parlent aux prospects tous les jours.
3. **Valider par la cohorte étudiante** — 20 à 30 étudiants de 2e/3e année. C'est le
   seul test qui dise si le quiz retrouve la filière réelle de quelqu'un.
4. **Vérifier la répartition des familles.** `entreprise-management` porte 33 fiches sur
   84 : près de 40 % du catalogue derrière une seule réponse à A1. Si la simulation
   montre que cette branche est engorgée, il faudra soit la scinder, soit ajouter une
   seconde question d'aiguillage sur cette seule branche.

---

## config/questions.json

```json
{
  "_statut": "v0 — formulations et poids a calibrer, voir QUESTIONS.md",

  "filtres": [
    {
      "id": "F1",
      "question": "Où en es-tu dans tes études ?",
      "aide": "C'est ton diplôme actuel qui compte, pas celui que tu vises.",
      "filtre": "niveau_acces",
      "options": [
        { "label": "J'ai le bac, ou je le passe cette année", "valeur": "bac" },
        { "label": "J'ai un bac+2", "valeur": "bac+2" },
        { "label": "J'ai une licence, ou un bac+3", "valeur": "bac+3" },
        { "label": "J'ai un bac+4 ou un bac+5", "valeur": "bac+4" }
      ]
    },
    {
      "id": "F2",
      "question": "Comment veux-tu suivre ta formation ?",
      "filtre": "modalites",
      "options": [
        { "label": "Sur le campus, en journée", "valeur": "presentiel" },
        { "label": "À distance, depuis chez moi", "valeur": "en-ligne" },
        { "label": "Le week-end ou le soir, je travaille", "valeur": "week-end" },
        { "label": "Peu importe, je suis flexible", "valeur": null }
      ]
    }
  ],

  "aiguillage": [
    {
      "id": "A1",
      "question": "Parmi ces univers, lequel t'attire le plus ?",
      "aide": "Ton profil comptera aussi. Ici, c'est le goût qui parle.",
      "cible": "famille",
      "options": [
        { "label": "Diriger une entreprise, une équipe, un projet", "valeur": "entreprise-management" },
        { "label": "Le droit, l'administration, la vie publique", "valeur": "droit-action-publique" },
        { "label": "Les chiffres, la finance, la comptabilité", "valeur": "chiffres-finance" },
        { "label": "Le numérique, les données, les réseaux", "valeur": "numerique" },
        { "label": "Le commerce, la communication, les médias", "valeur": "commerce-communication" },
        { "label": "La technique, l'industrie, la logistique", "valeur": "ingenierie-industrie" }
      ]
    }
  ],

  "profil": [
    {
      "id": "P1",
      "question": "Un gros travail à rendre dans trois semaines. Concrètement, ça se passe comment pour toi ?",
      "options": [
        { "label": "Je découpe et j'avance un peu chaque jour", "poids": { "cadre": 2 } },
        { "label": "Je rassemble tout, puis je fais l'essentiel d'un bloc", "poids": { "technique": 1, "creatif": 1 } },
        { "label": "Je commence par la partie qui m'intéresse le plus", "poids": { "creatif": 2 } },
        { "label": "Je demande d'abord ce qui est précisément attendu", "poids": { "cadre": 1, "relationnel": 1 } }
      ]
    },
    {
      "id": "P2",
      "question": "Un problème admet plusieurs réponses défendables, sans certitude sur la meilleure.",
      "options": [
        { "label": "Ça me stimule, j'aime argumenter", "poids": { "relationnel": 1, "creatif": 1 } },
        { "label": "Ça m'agace, je veux savoir laquelle est juste", "poids": { "cadre": 2 } },
        { "label": "Je cherche des données pour trancher", "poids": { "quantitatif": 2 } },
        { "label": "Je demande l'avis de quelqu'un d'expérimenté", "poids": { "relationnel": 2 } }
      ]
    },
    {
      "id": "P3",
      "question": "Dans un travail de groupe, quel rôle prends-tu naturellement ?",
      "options": [
        { "label": "Je fais avancer la partie technique", "poids": { "technique": 2 } },
        { "label": "Je répartis les tâches et je coordonne", "poids": { "relationnel": 1, "cadre": 1 } },
        { "label": "Je présente et je défends devant les autres", "poids": { "relationnel": 2 } },
        { "label": "Je vérifie que rien n'a été oublié", "poids": { "cadre": 2 } }
      ]
    },
    {
      "id": "P4",
      "question": "Qu'est-ce qui te donne le sentiment d'avoir bien travaillé ?",
      "options": [
        { "label": "Voir le résultat concret de ce que j'ai fait", "poids": { "technique": 2 } },
        { "label": "Avoir compris quelque chose de compliqué", "poids": { "quantitatif": 2 } },
        { "label": "Que les gens autour soient satisfaits", "poids": { "relationnel": 2 } },
        { "label": "Avoir produit quelque chose qui n'existait pas", "poids": { "creatif": 2 } }
      ]
    },
    {
      "id": "P5",
      "question": "On te donne un cadre précis, avec des règles à respecter.",
      "options": [
        { "label": "Ça me rassure, je sais où je vais", "poids": { "cadre": 2 } },
        { "label": "Je me sens à l'étroit", "poids": { "creatif": 2 } },
        { "label": "Ça dépend — si les règles ont du sens, ça me va", "poids": { "cadre": 1, "quantitatif": 1 } },
        { "label": "Je respecte le cadre, puis je cherche les marges", "poids": { "cadre": 1, "creatif": 1 } }
      ]
    },
    {
      "id": "P6",
      "question": "Quelque chose ne marche pas et tu ne sais pas pourquoi.",
      "options": [
        { "label": "Je démonte pour comprendre le mécanisme", "poids": { "technique": 2 } },
        { "label": "Je cherche si quelqu'un a déjà eu ce problème", "poids": { "relationnel": 1, "cadre": 1 } },
        { "label": "Je teste des hypothèses une par une", "poids": { "quantitatif": 2 } },
        { "label": "Je bricole jusqu'à ce que ça reparte", "poids": { "technique": 1, "creatif": 1 } }
      ]
    },
    {
      "id": "P7",
      "question": "Dans quel décor te vois-tu, un mardi ordinaire ?",
      "options": [
        { "label": "Devant un écran, au calme", "poids": { "technique": 1, "quantitatif": 1 } },
        { "label": "En réunion, avec des gens", "poids": { "relationnel": 2 } },
        { "label": "Sur le terrain, en déplacement", "poids": { "relationnel": 1, "technique": 1 } },
        { "label": "Ça change tous les jours", "poids": { "creatif": 2 } }
      ]
    }
  ]
}
```
