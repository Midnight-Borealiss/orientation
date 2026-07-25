#!/usr/bin/env node
/**
 * validate.mjs — Vérifie que toutes les fiches respectent le schéma
 * et que le vocabulaire employé existe bien dans la taxonomie.
 *
 *   node scripts/validate.mjs
 *
 * À brancher en CI : le dépôt refuse une fiche hors-schéma.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schema", "filiere.schema.json"), "utf8"));
const taxo = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "taxonomy.json"), "utf8"));
const DIR = path.join(ROOT, "data", "filieres");

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const domainesOk = new Set(taxo.domaines.map((d) => d.id));
const ecolesOk = new Set(taxo.ecoles.map((e) => e.id));
const seriesOk = new Set(taxo.series_bac);

const fichiers = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
if (!fichiers.length) {
  console.error("Aucune fiche à valider dans data/filieres/");
  process.exit(1);
}

const ids = new Set();
let erreurs = 0;

console.log(`\n  Validation de ${fichiers.length} fiches\n`);

for (const nom of fichiers) {
  const f = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"));
  const problemes = [];

  if (!validate(f)) {
    for (const e of validate.errors) problemes.push(`schéma ${e.instancePath || "/"} ${e.message}`);
  }
  if (ids.has(f.id)) problemes.push(`id dupliqué : ${f.id}`);
  ids.add(f.id);

  if (f.ecole && !ecolesOk.has(f.ecole)) problemes.push(`école inconnue : ${f.ecole}`);
  for (const d of f.domaines || []) if (!domainesOk.has(d)) problemes.push(`domaine hors taxonomie : ${d}`);
  for (const s of f.eligibilite?.series_bac || []) if (!seriesOk.has(s)) problemes.push(`série bac inconnue : ${s}`);

  if (problemes.length) {
    erreurs++;
    console.log(`  ✗ ${nom}`);
    for (const p of problemes) console.log(`      ${p}`);
  } else {
    console.log(`  ✓ ${nom}`);
  }
}

// Vérifie que les filières voisines pointent vers des fiches existantes
for (const nom of fichiers) {
  const f = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"));
  // voisines ne contient que des id (la question de départage vit dans config/departages.json)
  for (const v of f.voisines || []) {
    if (!ids.has(v)) {
      console.log(`  ! ${nom} — voisine inexistante : ${v}`);
      erreurs++;
    }
  }
}

console.log(erreurs ? `\n  ${erreurs} fiche(s) en erreur\n` : `\n  Tout est conforme.\n`);
process.exit(erreurs ? 1 : 0);
