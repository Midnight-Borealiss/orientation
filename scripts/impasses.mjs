#!/usr/bin/env node
/**
 * impasses.mjs — la liste des combinaisons sans issue, écrite pour les admissions.
 *
 *   npm run impasses
 *
 * Chaque ligne est une réponse qu'un candidat peut donner en toute légitimité et qui ne mène à
 * aucun programme. Ce n'est PAS un rapport de bogues : le moteur fonctionne, c'est le catalogue
 * qui ne couvre pas ces combinaisons. Le document sert donc à décider — ouvrir une formation,
 * ou savoir quoi répondre à ce candidat au téléphone.
 *
 * D'où le format : des libellés lisibles (« à distance », « avec le bac »), jamais des
 * identifiants ; un regroupement par ce qui manque, jamais par ordre de balayage ; et le
 * nombre de candidats concernés, pour hiérarchiser.
 *
 * Deux natures d'impasse, distinguées parce qu'elles n'appellent pas la même décision :
 *   AUCUN PROGRAMME       le catalogue n'a rien — c'est une question d'offre ;
 *   AUCUN COMPARABLE      des programmes existent mais leur contenu publié est trop mince pour
 *                         les comparer à un profil — c'est une question de brochure.
 *
 * Les scripts n'écrivent jamais hors de `data/`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chargerContexte } from "../src/engine/charger.mjs";
import { jouer } from "../src/engine/moteur.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SORTIE = path.join(ROOT, "data", "_impasses.md");

const contexte = chargerContexte();
const [F1, F2] = contexte.questions.filtres;
const A1 = contexte.questions.aiguillage.find((q) => q.cible === "famille");
const A2 = contexte.questions.aiguillage.find((q) => q.cible === "domaines");

const familles = new Map((contexte.taxonomie.familles || []).map((f) => [f.id, f.label]));
const libModalites = contexte.taxonomie.modalites_libelles || {};
const libAcces = contexte.taxonomie.niveaux_acces_libelles || {};

/** Le libellé de l'option, tel que le candidat l'a lu à l'écran. */
const direNiveau = (i) => F1.options[i].label;
const direModalite = (i) => {
  const v = F2.options[i].valeur;
  if (!v) return F2.options[i].label;
  return (Array.isArray(v) ? v : [v]).map((m) => libModalites[m] || m).join(" ou ");
};

/* ── Le balayage ──────────────────────────────────────────────── */

const lignes = [];
let total = 0;

for (let i = 0; i < F1.options.length; i++) {
  for (let j = 0; j < F2.options.length; j++) {
    for (let k = 0; k < A1.options.length; k++) {
      const a2s = A1.options[k].valeur === A2?.si?.famille ? A2.options.map((_, x) => x) : [null];
      for (const a2 of a2s) {
        total++;
        const reponses = { F1: i, F2: j, A1: k };
        if (a2 !== null) reponses.A2 = a2;
        // Un profil quelconque : ce qui est mesuré ici est l'offre, pas le score.
        contexte.questions.profil.forEach((q, n) => {
          reponses[q.id] = (i + j + k + n) % (q.options.length || 1);
        });

        const { resultat: r } = jouer(reponses, contexte);
        if (r.recommandation) continue;

        lignes.push({
          nature: r.parcours.apres_aiguillage ? "non-comparables" : "aucun",
          niveau: direNiveau(i),
          niveauCle: F1.options[i].valeur,
          modalite: direModalite(j),
          famille: familles.get(A1.options[k].valeur) || A1.options[k].valeur,
          familleCle: A1.options[k].valeur,
          registre: a2 !== null ? A2.options[a2].label : null,
          candidats: r.parcours.apres_aiguillage,
          nonClasses: r.sans_classement.length,
        });
      }
    }
  }
}

/* ── Le document ──────────────────────────────────────────────── */

const aucun = lignes.filter((l) => l.nature === "aucun");
const nonComparables = lignes.filter((l) => l.nature === "non-comparables");

const tableau = (rows, colonneFin) =>
  [
    `| Diplôme du candidat | Façon d'étudier | Univers choisi | ${colonneFin} |`,
    `|---|---|---|---|`,
    ...rows.map(
      (l) =>
        `| ${l.niveau} | ${l.modalite} | ${l.famille}${l.registre ? ` — « ${l.registre} »` : ""} | ${
          colonneFin.startsWith("Programmes") ? `${l.nonClasses}` : "—"
        } |`
    ),
  ].join("\n");

/** Ce qui revient le plus souvent : c'est là que l'ouverture d'une formation rapporterait. */
function recurrences(rows, cle, dire) {
  const compte = new Map();
  for (const l of rows) compte.set(l[cle], (compte.get(l[cle]) || 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `- **${dire(v)}** — ${n} combinaison(s)`)
    .join("\n");
}

const doc = `# Combinaisons de réponses sans résultat

Document produit par \`npm run impasses\`. **Ne pas le modifier à la main** : il est régénéré à
chaque exécution.

Chaque ligne ci-dessous est une réponse qu'un candidat peut donner en toute légitimité et qui ne
lui propose aucune formation. **Ce n'est pas une liste de bogues** : le questionnaire fonctionne,
c'est le catalogue 2024 qui ne couvre pas ces combinaisons.

À quoi ça sert : décider s'il faut ouvrir une formation, et savoir quoi répondre au téléphone à
un candidat qui se présente avec ce profil.

**${lignes.length} combinaisons sans résultat sur ${total} balayées.** Le questionnaire ne laisse
jamais un candidat sans issue : il lui dit ce qui s'est passé et rouvre ses deux premières
réponses.

---

## 1. Aucun programme ne correspond — ${aucun.length} combinaisons

Le catalogue ne propose rien pour ces trois réponses combinées. C'est une **question d'offre**.

${tableau(aucun, "Programmes")}

### Ce qui revient le plus souvent

Par façon d'étudier :

${recurrences(aucun, "modalite", (v) => v)}

Par univers :

${recurrences(aucun, "famille", (v) => v)}

Par diplôme du candidat :

${recurrences(aucun, "niveau", (v) => v)}

---

## 2. Des programmes existent, mais aucun n'est comparable — ${nonComparables.length} combinaisons

Ici le catalogue **a** des formations, et le candidat les voit. Mais leur contenu publié est trop
mince pour les comparer à sa façon de travailler : la brochure n'en détaille pas assez les
enseignements. Le questionnaire les affiche donc **sans les classer**, en le disant.

C'est une **question de brochure**, pas d'offre : compléter le descriptif de ces programmes les
ferait entrer dans le classement.

${tableau(nonComparables, "Programmes affichés sans classement")}

### Ce qui revient le plus souvent

Par univers :

${recurrences(nonComparables, "famille", (v) => v)}

---

## Comment lire une ligne

> ${aucun[0] ? `« ${aucun[0].niveau} » · « ${aucun[0].modalite} » · « ${aucun[0].famille} »` : "—"}

se lit : un candidat qui a ce diplôme, qui veut étudier de cette façon, et qui choisit cet
univers, ne reçoit aucune proposition.

## Ce qui ferait bouger ces chiffres

| Action | Effet |
|---|---|
| ouvrir une formation dans une combinaison de la section 1 | retire ses lignes |
| compléter le descriptif des programmes de la section 2 | les fait entrer dans le classement |
| corriger une modalité mal saisie dans une brochure | peut retirer plusieurs lignes d'un coup |

Le nombre de combinaisons sans résultat est **suivi par les tests** : une hausse brutale signale
une modalité ou un niveau d'accès mal extrait, pas une évolution du catalogue.
`;

fs.writeFileSync(SORTIE, doc, "utf8");

console.log(`\n  data/_impasses.md — ${lignes.length} combinaison(s) sans résultat sur ${total}`);
console.log(`      ${aucun.length} sans aucun programme (question d'offre)`);
console.log(`      ${nonComparables.length} avec des programmes non comparables (question de brochure)\n`);
