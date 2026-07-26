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
let universParFamille = 0;

for (let i = 0; i < F1.options.length; i++) {
  for (let j = 0; j < F2.options.length; j++) {
    let dansCeCouple = 0;
    for (let k = 0; k < A1.options.length; k++) {
      const a2s = A1.options[k].valeur === A2?.si?.famille ? A2.options.map((_, x) => x) : [null];
      for (const a2 of a2s) {
        total++;
        dansCeCouple++;
        const reponses = { F1: i, F2: j, A1: k };
        if (a2 !== null) reponses.A2 = a2;
        // Un profil quelconque : ce qui est mesuré ici est l'offre, pas le score.
        contexte.questions.profil.forEach((q, n) => {
          reponses[q.id] = (i + j + k + n) % (q.options.length || 1);
        });

        const { resultat: r } = jouer(reponses, contexte);
        if (r.recommandation) continue;

        lignes.push({
          i,
          j,
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
    universParFamille = dansCeCouple;
  }
}

/* ── Les règles ───────────────────────────────────────────────────
 * Une RÈGLE se comprend ; quatorze lignes dont il faut la déduire ne se comprennent pas. On
 * cherche donc ce qui est systématique, et on le met en tête — c'est le seul contenu du
 * document qui soit directement actionnable.
 *
 * Toutes sont CALCULÉES sur les fiches, jamais écrites à la main : une règle recopiée se
 * périmerait à la prochaine édition du catalogue en gardant l'air d'un fait.
 * ─────────────────────────────────────────────────────────── */

const fiches = contexte.fiches;
const familleParDomaine = new Map();
for (const f of contexte.taxonomie.familles || []) for (const d of f.domaines) familleParDomaine.set(d, f.id);
const famillesDe = (f) => [...new Set((f.domaines || []).map((d) => familleParDomaine.get(d)).filter(Boolean))];

const ORDRE_ACCES = ["bac", "bac+2", "bac+3", "bac+4", "bac+5"];
const direAcces = (a) => libAcces[a] || a;
const direMod = (m) => libModalites[m] || m;

const regles = [];

/* Règle 1 — le niveau d'accès minimal d'une modalité.
 * Si toutes les fiches d'une modalité exigent au moins bac+2, aucun bachelier ne peut y
 * accéder, dans aucune famille. C'est une question d'offre, pas de brochure ni de code. */
const horsCampus = ["cours-du-soir", "week-end", "full-time"];
const minimaParModalite = new Map();
for (const m of contexte.taxonomie.modalites || []) {
  const concernees = fiches.filter((f) => (f.modalites || []).includes(m));
  if (!concernees.length) continue;
  const rangs = concernees.map((f) => ORDRE_ACCES.indexOf(f.niveau_acces)).filter((r) => r >= 0);
  if (!rangs.length) continue;
  minimaParModalite.set(m, { min: ORDRE_ACCES[Math.min(...rangs)], nb: concernees.length });
}

const bloqueesAuBac = horsCampus.filter((m) => minimaParModalite.get(m) && minimaParModalite.get(m).min !== "bac");
if (bloqueesAuBac.length) {
  const detail = bloqueesAuBac
    .map((m) => {
      const { nb, min } = minimaParModalite.get(m);
      return nb === 1
        ? `**${direMod(m)}** (1 programme, à ${min})`
        : `**${direMod(m)}** (${nb} programmes, tous à ${min} minimum)`;
    })
    .join(", ");
  regles.push({
    titre: "Aucune formation hors journée n'est accessible avec le bac seul",
    corps: `Les formations qui ne se suivent pas en journée sont : ${detail}. Aucune n'est ouverte à un titulaire du bac, **dans aucune famille**.

Conséquence directe : **un bachelier qui travaille n'a aucune option.** Quelle que soit sa réponse sur l'univers, le questionnaire ne peut rien lui proposer — c'est ce qui produit à lui seul ${
      lignes.filter((l) => /soir|week/i.test(l.modalite) && l.niveauCle === "bac").length
    } des combinaisons listées plus bas.`,
    nature: "offre",
  });
}

/* Règle 2 — une modalité qui n'existe que dans une famille. */
for (const m of contexte.taxonomie.modalites || []) {
  const fams = new Set();
  for (const f of fiches) if ((f.modalites || []).includes(m)) for (const fam of famillesDe(f)) fams.add(fam);
  if (fams.size === 1 && (contexte.taxonomie.familles || []).length > 1) {
    const seule = familles.get([...fams][0]) || [...fams][0];
    regles.push({
      titre: `« ${direMod(m)} » n'existe que dans un seul univers`,
      corps: `Seul **${seule}** propose cette façon d'étudier. Un candidat qui la demande dans l'un des ${
        (contexte.taxonomie.familles || []).length - 1
      } autres univers ne trouvera rien, quel que soit son diplôme.`,
      nature: "offre",
    });
  }
}

/* Règle 3 — une modalité entièrement absente d'une famille. */
const absencesParModalite = new Map();
for (const fam of contexte.taxonomie.familles || []) {
  const dedans = fiches.filter((f) => famillesDe(f).includes(fam.id));
  for (const m of contexte.taxonomie.modalites || []) {
    if (dedans.some((f) => (f.modalites || []).includes(m))) continue;
    // Une modalité portée par une seule fiche est absente presque partout : ce n'est pas une
    // règle sur la famille, c'est la règle 2. On ne la répète pas ici.
    if ((minimaParModalite.get(m)?.nb || 0) <= 1) continue;
    absencesParModalite.set(m, [...(absencesParModalite.get(m) || []), fam.label]);
  }
}
for (const [m, fams] of absencesParModalite) {
  regles.push({
    titre: `Aucun « ${direMod(m)} » dans ${fams.length === 1 ? "un univers" : `${fams.length} univers`}`,
    corps: `${fams.map((f) => `**${f}**`).join(", ")} ne propose${fams.length > 1 ? "nt" : ""} rien dans cette modalité, à aucun niveau.`,
    nature: "offre",
  });
}

/* Règle 4 — un niveau d'entrée absent d'une famille entière. */
for (const fam of contexte.taxonomie.familles || []) {
  const dedans = fiches.filter((f) => famillesDe(f).includes(fam.id));
  const manquants = ORDRE_ACCES.slice(0, 3).filter((a) => !dedans.some((f) => f.niveau_acces === a));
  if (manquants.length) {
    regles.push({
      titre: `${fam.label} : aucune entrée ${manquants.map(direAcces).join(", ")}`,
      corps: `Sur ses ${dedans.length} programmes, aucun ne s'ouvre ${manquants.map(direAcces).join(" ni ")}.`,
      nature: "offre",
    });
  }
}

/* ── Le document ──────────────────────────────────────────────── */

const aucun = lignes.filter((l) => l.nature === "aucun");
const nonComparables = lignes.filter((l) => l.nature === "non-comparables");

/**
 * Le tableau des combinaisons. `colonneFin` est omise en section 1 : elle y vaudrait zéro sur
 * toutes les lignes, et une colonne constante n'apprend rien à celui qui lit.
 */
const tableau = (rows, colonneFin = null) =>
  [
    `| Diplôme du candidat | Façon d'étudier | Univers choisi |${colonneFin ? ` ${colonneFin} |` : ""}`,
    `|---|---|---|${colonneFin ? "---|" : ""}`,
    ...rows.map(
      (l) =>
        `| ${l.niveau} | ${l.modalite} | ${l.famille}${l.registre ? ` — « ${l.registre} »` : ""} |` +
        (colonneFin ? ` ${l.nonClasses} |` : "")
    ),
  ].join("\n");

/** Ce qui revient le plus souvent : c'est là que l'ouverture d'une formation rapporterait. */
function recurrences(rows, cle, dire) {
  const compte = new Map();
  for (const l of rows) compte.set(l[cle], (compte.get(l[cle]) || 0) + 1);
  return [...compte.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v, n]) => `- **${dire(v)}** — ${n} combinaisons`)
    .join("\n");
}

/* ── Par diplôme et par façon d'étudier ──────────────────────────
 * La vue qui remet le taux global à sa place : elle montre qu'un profil courant ne rencontre
 * presque aucune impasse, et que tout se concentre sur quelques cases.
 * ─────────────────────────────────────────────────────────── */
const parCouple = [];
for (let i = 0; i < F1.options.length; i++) {
  for (let j = 0; j < F2.options.length; j++) {
    const dedans = lignes.filter((l) => l.i === i && l.j === j);
    parCouple.push({
      niveau: direNiveau(i),
      modalite: direModalite(j),
      total: universParFamille,
      aucun: dedans.filter((l) => l.nature === "aucun").length,
      nonComparables: dedans.filter((l) => l.nature === "non-comparables").length,
    });
  }
}

const pire = [...parCouple].sort((a, b) => b.aucun + b.nonComparables - (a.aucun + a.nonComparables));
const sains = parCouple.filter((c) => !c.aucun && !c.nonComparables);

const doc = `# Combinaisons de réponses sans résultat

Document produit par \`npm run impasses\`. **Ne pas le modifier à la main** : il est régénéré à
chaque exécution.

Chaque ligne de ce document est une réponse qu'un candidat peut donner en toute légitimité et qui
ne lui propose aucune formation. **Ce n'est pas une liste de bogues** : le questionnaire
fonctionne, c'est le catalogue 2024 qui ne couvre pas ces combinaisons.

À quoi ça sert : décider s'il faut ouvrir une formation, et savoir quoi répondre au téléphone à
un candidat qui se présente avec ce profil.

---

## À retenir en premier

${
  regles.length
    ? regles.map((r, n) => `### ${n + 1}. ${r.titre}\n\n${r.corps}`).join("\n\n")
    : "_Aucune règle systématique détectée sur ce catalogue._"
}

---

## Ce que « ${lignes.length} sur ${total} » ne veut PAS dire

**Ce n'est pas « ${Math.round((lignes.length / total) * 100)} % des candidats ».** Les ${total}
combinaisons balayées ne sont pas également probables : elles comptent chacune pour une, alors
que la grande majorité des candidats sont des bacheliers qui cherchent du présentiel — et ce
profil-là ne rencontre presque aucune impasse.

**Le taux réel, pondéré par la vraisemblance des profils, n'est pas connu**, et ce document ne
peut pas l'estimer : il faudrait la répartition réelle des candidatures par diplôme, modalité
souhaitée et domaine visé. C'est une donnée des admissions, pas du catalogue. Tant qu'elle
manque, la seule lecture honnête est celle du tableau ci-dessous — **par profil**, jamais en
proportion globale.

${(() => {
  // Une colonne entièrement vide ne s'affiche pas : quatorze tirets d'affilée se lisent
  // comme une donnée manquante, alors que c'est un zéro mesuré. On la retire, et la
  // section 2 dit pourquoi elle vaut zéro.
  const avecColonne = parCouple.some((c) => c.nonComparables);
  const entete = avecColonne
    ? "| Diplôme du candidat | Façon d'étudier | Sans aucun programme | Programmes non comparables |\n|---|---|---|---|"
    : "| Diplôme du candidat | Façon d'étudier | Sans aucun programme |\n|---|---|---|";
  const corps = parCouple
    .map((c) => {
      const debut = `| ${c.niveau} | ${c.modalite} | ${c.aucun ? `**${c.aucun} / ${c.total}**` : `0 / ${c.total}`} |`;
      return avecColonne ? `${debut} ${c.nonComparables ? `${c.nonComparables} / ${c.total}` : "—"} |` : debut;
    })
    .join("\n");
  return `${entete}\n${corps}`;
})()}

Les ${universParFamille} cas comptés à droite sont les réponses possibles à la question sur
l'univers : six univers, dont le plus large se subdivise en cinq registres.

Lecture : **${sains.length} des ${parCouple.length} profils ne rencontrent aucune impasse**, quel
que soit l'univers choisi. À l'inverse, un candidat « ${pire[0].niveau} » qui répond
« ${pire[0].modalite} » n'obtient rien, dans aucun des ${pire[0].total} cas.

Le questionnaire ne laisse jamais un candidat sans issue : il lui dit ce qui s'est passé et
rouvre ses deux premières réponses.

---

## 1. Aucun programme ne correspond — ${aucun.length} combinaisons

Le catalogue ne propose rien pour ces trois réponses combinées. C'est une **question d'offre**.

${tableau(aucun)}

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

${
  nonComparables.length
    ? `${tableau(nonComparables, "Programmes affichés sans classement")}

### Ce qui revient le plus souvent

Par univers :

${recurrences(nonComparables, "famille", (v) => v)}`
    : `**Aucune combinaison n'est dans ce cas aujourd'hui.** Rien à demander aux brochures de ce
côté : quand une seule formation réunit les réponses d'un candidat, le questionnaire la lui
propose directement, sans chercher à la comparer — il n'y a rien à comparer. Cette section
comptait des combinaisons tant que ce cas était traité comme une absence de résultat.

Un chiffre autre que zéro reviendrait ici dès qu'un candidat aurait **plusieurs** formations
possibles dont aucune n'est assez décrite pour être classée.`
}

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

console.log(`\n  data/_impasses.md — ${lignes.length} combinaisons sans résultat sur ${total}`);
console.log(`      ${aucun.length} sans aucun programme (question d'offre)`);
console.log(`      ${nonComparables.length} avec des programmes non comparables (question de brochure)\n`);
