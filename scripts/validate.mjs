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
import { domainesInatteignables } from "../src/engine/aiguillage.mjs";

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

/* ── Taxonomie : un domaine appartient à une famille et une seule ──
 * Le quiz demande une FAMILLE (question 3) et les 2 axes de disposition vivent à
 * ce niveau. Un domaine orphelin sortirait donc du parcours sans prévenir.
 * ─────────────────────────────────────────────────────────────── */
{
  const problemes = [];
  const famille = new Map();
  for (const fam of taxo.familles || []) {
    for (const d of fam.domaines) {
      if (!domainesOk.has(d)) problemes.push(`famille ${fam.id} : domaine inconnu « ${d} »`);
      if (famille.has(d)) problemes.push(`domaine « ${d} » dans deux familles : ${famille.get(d)} et ${fam.id}`);
      famille.set(d, fam.id);
    }
  }
  for (const d of domainesOk) if (!famille.has(d)) problemes.push(`domaine « ${d} » sans famille`);

  if (problemes.length) {
    console.log(`\n  ✗ config/taxonomy.json`);
    for (const p of problemes) console.log(`      ${p}`);
    console.log("");
    process.exit(1);
  }
  console.log(`\n  ✓ taxonomie : ${(taxo.familles || []).length} familles couvrent les ${domainesOk.size} domaines`);
}

/* ── Axes de disposition : une entrée par domaine réellement utilisé ──
 * `ancrage` et `abstraction` se collectent par DOMAINE, pas par famille : au niveau
 * famille ils seraient identiques pour tous les programmes d'une même famille, donc
 * sans pouvoir discriminant là où le scoring en a besoin. Un domaine porté par une
 * fiche mais absent de domaines_axes.json serait scoré sur deux axes vides, sans que
 * rien ne le signale.
 * ─────────────────────────────────────────────────────────────── */
{
  const chemin = path.join(ROOT, "config", "domaines_axes.json");
  if (!fs.existsSync(chemin)) {
    console.log(`\n  ✗ config/domaines_axes.json manquant (les 2 axes de disposition sont au niveau domaine)`);
    process.exit(1);
  }
  const dispo = JSON.parse(fs.readFileSync(chemin, "utf8")).domaines || {};
  const utilises = new Set();
  const dossier = fs.existsSync(DIR) ? fs.readdirSync(DIR).filter((f) => f.endsWith(".json")) : [];
  for (const nom of dossier) {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"));
    for (const d of f.domaines || []) utilises.add(d);
  }
  const absents = [...utilises].filter((d) => !dispo[d]);
  if (absents.length) {
    console.log(`\n  ✗ config/domaines_axes.json : domaine(s) utilisé(s) par une fiche mais absent(s) — ${absents.join(", ")}`);
    process.exit(1);
  }
  const aCollecter = [...utilises].filter((d) => dispo[d].ancrage == null || dispo[d].abstraction == null);
  console.log(
    `  ✓ axes de disposition : ${utilises.size} domaine(s) utilisé(s) présent(s)` +
      (aCollecter.length ? ` — ${aCollecter.length} encore à collecter` : "")
  );
}

/* ── Aiguillage fin : aucun domaine inatteignable ──────────────────
 * Une seconde question d'aiguillage restreint les domaines à l'intérieur d'une famille.
 * Un domaine de cette famille qu'aucune option ne permet d'atteindre retirerait ses
 * fiches du parcours quelle que soit la réponse du prospect, sans que rien ne le dise.
 * ─────────────────────────────────────────────────────────────── */
{
  const chemin = path.join(ROOT, "config", "questions.json");
  if (fs.existsSync(chemin)) {
    const questions = JSON.parse(fs.readFileSync(chemin, "utf8"));
    const problemes = domainesInatteignables(questions, taxo);
    if (problemes.length) {
      console.log(`\n  ✗ config/questions.json`);
      for (const p of problemes) console.log(`      ${p}`);
      console.log("");
      process.exit(1);
    }
    const fines = (questions.aiguillage || []).filter((q) => q.cible === "domaines");
    console.log(
      `  ✓ aiguillage : ${fines.length} question(s) fine(s), tous les domaines de leur famille sont atteignables`
    );
  }
}

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
