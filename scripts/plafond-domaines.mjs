#!/usr/bin/env node
/**
 * plafond-domaines.mjs — Diagnostic : quelle est la fragilité du plafond de 2 domaines ?
 *
 *   node scripts/plafond-domaines.mjs        (aussi : npm run plafond)
 *   node scripts/plafond-domaines.mjs --json # data/_plafond-domaines.json
 *
 * Pourquoi cette mesure existe. L'appartenance d'une fiche à une FAMILLE — donc sa place dans
 * le parcours — se déduit de ses domaines, et les domaines sont les deux mieux corroborés.
 * C'est un CLASSEMENT : il peut donc basculer sur peu de chose. Il a basculé pour de vrai —
 * huit modules retrouvés à l'extraction ont fait passer une licence d'`entreprise-management`
 * à `chiffres-finance`.
 *
 * Ce que ce script mesure, et ce qu'il ne mesure pas. Il ne dit pas s'il faut monter le
 * plafond : cette question est tranchée, **non** — le 3e domaine d'un master de droit notarial
 * est `culture-evenementiel`, ce qui montre qu'un plafond plus haut laisserait entrer du bruit
 * lexical. Il dit ce que le plafond écarte, et surtout **où le classement est arbitraire**.
 *
 * Les deux ensembles à ne pas confondre, du plus large au plus étroit :
 *
 *   1. un 3e domaine corroboré, écarté par le plafond — ce qu'on ne voit pas ;
 *   2. dont le 3e relève d'une AUTRE FAMILLE que le 2e — un échange déplacerait la fiche ;
 *   3. dont le 2e et le 3e sont à ÉGALITÉ EXACTE de score — le seul ensemble réellement
 *      arbitraire, puisque `scoresDomaines` y départage sur l'ordre alphabétique de l'`id`.
 *
 * Le 3 est la vraie source du basculement silencieux : un module de plus n'y « fait pas
 * gagner » un domaine, il rompt une égalité que rien ne justifiait.
 *
 * Les ensembles 2 et 3 ne sont PAS recalculés ici : ils viennent de `lib/affectations.mjs`,
 * qui les consigne dans `data/_affectations-filieres.json` à chaque extraction. Deux définitions de
 * « fragile » divergeraient, et on ne saurait plus laquelle est celle que la CI surveille.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inferDomaines, modulesDe, MAX_DOMAINES } from "./lib/fiche.mjs";
import { construireManifeste } from "./lib/affectations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "filieres");
const JSON_OUT = process.argv.includes("--json");

const taxo = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "taxonomy.json"), "utf8"));
const autorises = new Set(taxo.domaines.map((d) => d.id));
const familleDe = new Map();
for (const f of taxo.familles || []) for (const d of f.domaines) familleDe.set(d, f.id);
const nomFamille = new Map((taxo.familles || []).map((f) => [f.id, f.label || f.id]));

const fiches = fs
  .readdirSync(DIR)
  .filter((n) => n.endsWith(".json"))
  .map((n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8")));
const parId = new Map(fiches.map((f) => [f.id, f]));

// Ensembles 2 et 3 : une seule définition, celle du manifeste committé.
const manifeste = construireManifeste(fiches, taxo);
const { egalite_frontiere: egalites, familles_differentes: familleDifferente } = manifeste._surveillance;

/* ── Ensemble 1 : ce que le plafond écarte ─────────────────────────
 * Seul calcul propre à ce script : relancer l'inférence avec un plafond relâché pour voir ce
 * qu'un domaine de plus apporterait. `inferDomaines` accepte un `max` dont la valeur par
 * défaut reste 2 — mesurer ne change rien.
 * ─────────────────────────────────────────────────────────── */
const entreesDe = (f) => [
  f.nom || "",
  f.vitrine?.description || "",
  modulesDe(f.unites_enseignement || []),
  f.debouches?.metiers || [],
  autorises,
];
const famillesDe = (domaines) => new Set(domaines.map((d) => familleDe.get(d)).filter(Boolean));

const ecartes = [];
for (const f of fiches) {
  const e = entreesDe(f);
  const a2 = inferDomaines(...e, MAX_DOMAINES);
  const a3 = inferDomaines(...e, MAX_DOMAINES + 1);
  const nouveaux = a3.filter((d) => !a2.includes(d));
  if (!nouveaux.length) continue; // dernier recours sur les modules : un seul domaine, pas de frontière

  const famAvant = famillesDe(a2);
  const famApres = famillesDe(a3);
  ecartes.push({
    id: f.id,
    nom: f.nom,
    retenus: a2,
    ecarte: nouveaux[0],
    familles_avant: [...famAvant],
    familles_ajoutees: [...famApres].filter((x) => !famAvant.has(x)),
    // Vérité de terrain : ce que la fiche porte réellement. Un écart signifie que les fiches
    // n'ont pas été régénérées depuis un changement de lexique.
    coherent: JSON.stringify(a2) === JSON.stringify(f.domaines || []),
  });
}

const gagnent = ecartes.filter((l) => l.familles_ajoutees.length);

/* ── Sortie ───────────────────────────────────────────────────── */

console.log(`\n  Fragilité du plafond de ${MAX_DOMAINES} domaines — ${fiches.length} fiches\n`);

const incoherentes = ecartes.filter((l) => !l.coherent);
if (incoherentes.length) {
  console.log(`  ! ${incoherentes.length} fiche(s) dont les domaines sur disque ne correspondent plus au lexique :`);
  for (const l of incoherentes.slice(0, 5)) {
    console.log(`      ${l.id} — disque ${JSON.stringify(parId.get(l.id).domaines)}, calcul ${JSON.stringify(l.retenus)}`);
  }
  console.log(`    Relance  npm run extract  avant de lire les chiffres ci-dessous.\n`);
}

console.log(`  Trois ensembles, du plus large au plus étroit :\n`);
console.log(`    ${String(ecartes.length).padStart(2)}  ont un 3e domaine corroboré, écarté par le plafond`);
console.log(`    ${String(familleDifferente.length).padStart(2)}  dont le 3e relève d'une AUTRE FAMILLE que le 2e — un échange les déplacerait`);
console.log(`    ${String(egalites.length).padStart(2)}  dont le 2e et le 3e sont à ÉGALITÉ EXACTE — le seul ensemble arbitraire`);

console.log(`\n  Égalité exacte — départagée par l'ordre alphabétique de l'id, pas par une mesure :\n`);
if (!egalites.length) {
  console.log(`    aucune aujourd'hui.`);
}
for (const e of egalites) {
  console.log(`    ${e.nom}`);
  console.log(`      ${e.retenu} et ${e.ecarte} à ${e.scores[0]} points — « ${e.retenu} » passe parce qu'il vient avant`);
  console.log(`      ${nomFamille.get(e.famille_retenu) || e.famille_retenu}  contre  ${nomFamille.get(e.famille_ecarte) || e.famille_ecarte}`);
}

console.log(`\n  Familles différentes de part et d'autre de la frontière — à revérifier après chaque catalogue :\n`);
for (const e of familleDifferente) {
  const marque = egalites.some((x) => x.id === e.id) ? "  ← et à égalité" : "";
  console.log(`    ${e.nom}`);
  console.log(`      ${e.retenu} (${e.scores[0]}) / ${e.ecarte} (${e.scores[1]})${marque}`);
}

console.log(`\n  Ce qu'un plafond de ${MAX_DOMAINES + 1} changerait — ${gagnent.length} fiche(s) gagneraient une famille :\n`);
for (const l of gagnent) {
  console.log(`    ${l.nom}`);
  console.log(`      ${l.retenus.join(" + ")}  →  + ${l.ecarte}`);
  console.log(
    `      ${l.familles_avant.map((x) => nomFamille.get(x) || x).join(" + ")}  →  + ` +
      l.familles_ajoutees.map((x) => nomFamille.get(x) || x).join(" + ")
  );
}
const memeFamille = ecartes.length - gagnent.length;
if (memeFamille) {
  console.log(
    `\n    ${memeFamille} autre(s) : le 3e domaine écarté est dans une famille déjà présente,` +
      `\n    donc le plafond ne change rien à leur place dans le parcours.`
  );
}

console.log(`\n  DÉCISION PRISE : le plafond reste à ${MAX_DOMAINES}. Ce script ne modifie rien.`);
console.log(`  Le monter laisserait entrer du bruit lexical — voir la liste ci-dessus —, et chaque`);
console.log(`  domaine de plus élargit l'aiguillage, dont le rôle est de RÉDUIRE le jeu candidat.`);
console.log(`  Les deux ensembles étroits sont consignés dans data/_affectations-filieres.json, suivi par git.\n`);

if (JSON_OUT) {
  fs.writeFileSync(
    path.join(ROOT, "data", "_plafond-domaines.json"),
    JSON.stringify(
      {
        plafond: MAX_DOMAINES,
        fiches: fiches.length,
        avec_3e_domaine: ecartes.length,
        familles_differentes: familleDifferente.length,
        egalite_frontiere: egalites.length,
        gagneraient_une_famille: gagnent.map((l) => l.id),
        detail: ecartes,
      },
      null,
      2
    ) + "\n"
  );
}
