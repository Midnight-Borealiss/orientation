#!/usr/bin/env node
/**
 * plafond-domaines.mjs — Diagnostic : quelle est la fragilité du plafond de 2 domaines ?
 *
 *   node scripts/plafond-domaines.mjs
 *   node scripts/plafond-domaines.mjs --json    # data/_plafond-domaines.json
 *
 * Pourquoi cette mesure existe. L'appartenance d'une fiche à une FAMILLE — donc sa place
 * dans le parcours — se déduit de ses domaines, et les domaines sont les deux mieux
 * corroborés. C'est un classement : il peut donc basculer sur peu de chose. Il a basculé
 * pour de vrai — huit modules retrouvés à l'extraction ont fait passer
 * `licence-de-gestion-option-comptabilite-finance` de `comptabilite + gestion` à
 * `finance + comptabilite`, donc d'`entreprise-management` à `chiffres-finance`.
 *
 * Ce script NE CHANGE RIEN. Il mesure, pour qu'on sache ce qu'on risque avant de décider :
 *
 *   1. combien de fiches ont un 3e domaine corroboré qu'un plafond de 2 a écarté ;
 *   2. combien de ces 3e domaines auraient ajouté une FAMILLE — c'est le seul écart qui
 *      change ce que voit un prospect, un 3e domaine dans une famille déjà présente ne
 *      déplace personne ;
 *   3. combien sont FRAGILES : celles dont le 2e et le 3e domaine ne sont pas dans la même
 *      famille. Ce sont elles qui peuvent se déplacer dans le parcours au prochain module
 *      ajouté, puisqu'il suffit que le 3e passe devant le 2e.
 *
 * Le point 3 est le vrai indicateur : le point 1 dit ce qu'on perd aujourd'hui, le point 3
 * dit ce qu'on risque de perdre demain sans rien décider.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { inferDomaines, modulesDe, MAX_DOMAINES } from "./lib/fiche.mjs";

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

/**
 * Les entrées d'`inferDomaines` telles que l'extraction les lui a passées. L'objectif vit
 * dans `vitrine.description` : c'est le bloc `OBJECTIF` de la brochure, pas une accroche
 * rédigée. On mesure donc sur la même matière, sans relire les PDF.
 */
const entreesDe = (f) => [
  f.nom || "",
  f.vitrine?.description || "",
  modulesDe(f.unites_enseignement || []),
  f.debouches?.metiers || [],
  autorises,
];

const familles = (domaines) => new Set(domaines.map((d) => familleDe.get(d)).filter(Boolean));

const lignes = [];
for (const f of fiches) {
  const e = entreesDe(f);
  const a2 = inferDomaines(...e, MAX_DOMAINES);
  const a3 = inferDomaines(...e, MAX_DOMAINES + 1);

  // Le 3e domaine que le plafond écarte, s'il existe. `inferDomaines` peut retomber sur son
  // dernier recours (le vocabulaire des modules, un seul domaine) : dans ce cas les deux
  // appels rendent la même chose et il n'y a rien à mesurer.
  const ecartes = a3.filter((d) => !a2.includes(d));
  if (!ecartes.length) continue;

  const famAvant = familles(a2);
  const famApres = familles(a3);
  const famAjoutees = [...famApres].filter((x) => !famAvant.has(x));

  lignes.push({
    id: f.id,
    nom: f.nom,
    retenus: a2,
    ecarte: ecartes[0],
    familles_avant: [...famAvant],
    familles_ajoutees: famAjoutees,
    // Vérité de terrain : ce que la fiche porte réellement sur le disque. Un écart ici
    // voudrait dire que la fiche n'a pas été régénérée depuis un changement de lexique.
    coherent: JSON.stringify(a2) === JSON.stringify(f.domaines || []),
  });
}

/* ── Fragilité : le 2e et le 3e domaine ne sont pas dans la même famille ──
 * `inferDomaines` ne rend pas ses scores, seulement son classement : on ne peut donc pas
 * mesurer ici l'écart qui sépare le 2e du 3e. Ce qu'on peut mesurer, et qui suffit à décider,
 * c'est la CONSÉQUENCE d'un basculement — si le 2e et le 3e relèvent de la même famille, la
 * fiche reste au même endroit du parcours quel que soit l'ordre. Sinon elle se déplace.
 *
 * À score égal, `inferDomaines` départage sur l'`id`, en ordre alphabétique : deux domaines
 * ex æquo sont donc séparés par une convention et non par une mesure. C'est précisément ce
 * qui rend ces fiches fragiles.
 * ─────────────────────────────────────────────────────────── */
const fragiles = lignes.filter((l) => {
  // Un basculement du 2e vers le 3e ne change la famille que si le 3e apporte une famille
  // que le 2e n'apporte pas. Sinon la fiche reste au même endroit du parcours.
  const famDu2e = familleDe.get(l.retenus[1]);
  const famDu3e = familleDe.get(l.ecarte);
  return famDu2e && famDu3e && famDu2e !== famDu3e;
});

if (JSON_OUT) {
  const sortie = {
    plafond: MAX_DOMAINES,
    fiches: fiches.length,
    avec_3e_domaine: lignes.length,
    changeraient_de_famille: lignes.filter((l) => l.familles_ajoutees.length).length,
    fragiles: fragiles.length,
    detail: lignes,
  };
  fs.writeFileSync(path.join(ROOT, "data", "_plafond-domaines.json"), JSON.stringify(sortie, null, 2) + "\n");
}

console.log(`\n  Fragilité du plafond de ${MAX_DOMAINES} domaines — ${fiches.length} fiches\n`);

const incoherentes = lignes.filter((l) => !l.coherent);
if (incoherentes.length) {
  console.log(`  ! ${incoherentes.length} fiche(s) dont les domaines sur disque ne correspondent plus au lexique :`);
  for (const l of incoherentes.slice(0, 5)) {
    console.log(`      ${l.id} — disque ${JSON.stringify(fiches.find((f) => f.id === l.id).domaines)}, calcul ${JSON.stringify(l.retenus)}`);
  }
  console.log(`    Relance  npm run extract  avant de lire les chiffres ci-dessous.\n`);
}

console.log(`  ${lignes.length} fiche(s) ont un 3e domaine corroboré, écarté par le plafond`);
const changent = lignes.filter((l) => l.familles_ajoutees.length);
console.log(`  ${changent.length} d'entre elles gagneraient une famille si le plafond passait à ${MAX_DOMAINES + 1}`);
console.log(`  ${fragiles.length} sont FRAGILES : leur 2e et leur 3e domaine ne sont pas dans la même famille,`);
console.log(`    donc un module de plus peut les déplacer dans le parcours.`);
console.log(`    Ce compte peut dépasser le précédent : une fiche fragile ne « gagne » pas de famille`);
console.log(`    quand la famille de son 3e domaine est déjà apportée par son 1er.\n`);

if (lignes.length) {
  console.log(`  Détail — les fiches qui gagneraient une famille :\n`);
  for (const l of changent) {
    const av = l.familles_avant.map((x) => nomFamille.get(x) || x).join(" + ");
    const aj = l.familles_ajoutees.map((x) => nomFamille.get(x) || x).join(" + ");
    console.log(`    ${l.nom}`);
    console.log(`      ${l.retenus.join(" + ")}  →  + ${l.ecarte}`);
    console.log(`      ${av}  →  + ${aj}`);
  }
  if (!changent.length) console.log(`    aucune — tous les 3e domaines écartés sont dans une famille déjà présente`);

  const memeFamille = lignes.length - changent.length;
  if (memeFamille) {
    console.log(
      `\n  ${memeFamille} autre(s) : le 3e domaine écarté est dans une famille déjà présente,` +
        `\n    donc le plafond ne change rien à leur place dans le parcours.`
    );
  }
}

console.log(`\n  Ce script ne modifie rien. Le plafond reste à ${MAX_DOMAINES} tant que la décision n'est pas prise.`);
console.log(`  Contrepartie d'un plafond à ${MAX_DOMAINES + 1}, à peser avec ces chiffres : chaque domaine`);
console.log(`  supplémentaire élargit l'aiguillage, et c'est lui qui doit RÉDUIRE le jeu candidat.\n`);
