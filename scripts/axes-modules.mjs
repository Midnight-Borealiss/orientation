#!/usr/bin/env node
/**
 * axes-modules.mjs — Quel(s) axe(s) captent chaque module d'un programme ?
 *
 *   node scripts/axes-modules.mjs mastere-ux-design
 *   node scripts/axes-modules.mjs mastere-ux-design licence-en-journalisme-et-metiers-de-l-information
 *
 * Sert à diagnostiquer un axe qui reste bas alors que le programme en est
 * manifestement porteur : on voit immédiatement si le module n'est capté par
 * AUCUN lexique (trou lexical) ou capté par un autre axe (recouvrement).
 *
 * Un module peut contribuer à plusieurs axes : les axes ne se disputent pas les
 * modules. Voir « Normalisation des cinq axes » dans CLAUDE.md.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AXES, axesDunModule, compterAxes } from "./lib/fiche.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.join(__dirname, "..", "data", "filieres");

const ids = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (!ids.length) {
  console.error("Usage : node scripts/axes-modules.mjs <id-de-filiere> [autre-id...]");
  process.exit(1);
}

for (const id of ids) {
  const chemin = path.join(DIR, `${id}.json`);
  if (!fs.existsSync(chemin)) {
    console.error(`\n  ✗ fiche introuvable : ${id}`);
    continue;
  }
  const f = JSON.parse(fs.readFileSync(chemin, "utf8"));
  const modules = (f.unites_enseignement || []).flatMap((ue) => ue.modules || []);

  console.log(`\n  ${f.nom}`);
  console.log(`  ${f.ecole || "?"} · ${f.domaines.join(", ")} · ${modules.length} modules\n`);

  const largeur = Math.min(58, Math.max(20, ...modules.map((m) => m.length)));
  for (const m of modules) {
    const captes = axesDunModule(m);
    const marque = captes.length ? captes.join(", ") : "— AUCUN";
    console.log(`    ${m.slice(0, largeur).padEnd(largeur)}  ${marque}`);
  }

  const { axes } = compterAxes(modules);
  console.log("");
  for (const axe of AXES) {
    const n = modules.filter((m) => axesDunModule(m).includes(axe)).length;
    const taux = modules.length ? n / modules.length : 0;
    const barre = "█".repeat(axes[axe]) + "·".repeat(5 - axes[axe]);
    console.log(
      `    ${axe.padEnd(12)} ${barre}  ${axes[axe]}   ${String(n).padStart(3)}/${modules.length} modules  (${(taux * 100).toFixed(0)} %)`
    );
  }
  const orphelins = modules.filter((m) => !axesDunModule(m).length);
  console.log(`\n    ${orphelins.length} module(s) capté(s) par aucun axe\n`);
}
