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
import { domainesInatteignables, fichesInatteignables } from "../src/engine/aiguillage.mjs";
import { etatFraicheur } from "./lib/fraicheur.mjs";

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

    /* ── Filtre de modalité : aucune modalité inatteignable ──────────
     * Une option de filtre peut désigner PLUSIEURS modalités, parce que les catalogues
     * n'emploient pas le même mot pour la même chose. Une modalité qu'aucune option ne
     * désigne rend ses programmes invisibles quelle que soit la réponse — et c'est ainsi
     * que l'option « le week-end ou le soir » ne trouvait qu'une fiche sur 84.
     * ─────────────────────────────────────────────────────────── */
    const modalitesTaxo = new Set(taxo.modalites || []);
    const soucis = [];
    const atteintes = new Set();
    for (const q of questions.filtres || []) {
      if (q.filtre !== "modalites") continue;
      for (const o of q.options || []) {
        if (o.valeur == null) continue; // « peu importe » n'exclut rien
        const valeurs = Array.isArray(o.valeur) ? o.valeur : [o.valeur];
        if (!valeurs.length) soucis.push(`${q.id} : option « ${o.label} » sans modalité`);
        for (const v of valeurs) {
          if (!modalitesTaxo.has(v)) soucis.push(`${q.id} : modalité inconnue « ${v} »`);
          atteintes.add(v);
        }
      }
    }
    const inatteignables = [...modalitesTaxo].filter((m) => !atteintes.has(m));
    if (inatteignables.length) {
      soucis.push(`modalité(s) qu'aucune option de filtre ne désigne — ${inatteignables.join(", ")}`);
    }
    if (soucis.length) {
      console.log(`\n  ✗ config/questions.json`);
      for (const s of soucis) console.log(`      ${s}`);
      console.log("");
      process.exit(1);
    }
    console.log(`  ✓ filtres : les ${modalitesTaxo.size} modalités de la taxonomie sont toutes atteignables`);
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

/* ── Toute modalité de la taxonomie est portée par au moins une fiche ──
 * C'est le contrôle qui aurait attrapé seul un défaut d'extraction sur les modalités : une
 * modalité à zéro fiche est soit une extraction manquée — la brochure la déclare et personne
 * ne la lit —, soit une entrée de taxonomie à supprimer. Dans les deux cas c'est une
 * incohérence entre le vocabulaire et les données, et rien d'autre ne la signale : le filtre,
 * lui, se contente de ne rien trouver.
 *
 * Il est complémentaire du contrôle sur les questions plus haut, qui vérifie qu'une modalité
 * est ATTEIGNABLE par une option. Les deux sont nécessaires : une modalité peut être
 * atteignable et ne désigner aucun programme, ou être portée par des fiches qu'aucune réponse
 * ne permet d'atteindre.
 * ─────────────────────────────────────────────────────────── */
{
  const compte = new Map((taxo.modalites || []).map((m) => [m, 0]));
  const horsTaxonomie = new Set();
  for (const nom of fichiers) {
    const f = JSON.parse(fs.readFileSync(path.join(DIR, nom), "utf8"));
    for (const m of f.modalites || []) {
      if (compte.has(m)) compte.set(m, compte.get(m) + 1);
      else horsTaxonomie.add(m);
    }
  }

  const vides = [...compte.entries()].filter(([, n]) => !n).map(([m]) => m);
  if (vides.length || horsTaxonomie.size) {
    console.log(`\n  ✗ modalités`);
    for (const m of vides) {
      console.log(`      « ${m} » n'est portée par aucune fiche — extraction manquée, ou entrée à retirer de la taxonomie`);
    }
    for (const m of horsTaxonomie) console.log(`      « ${m} » portée par une fiche mais absente de la taxonomie`);
    console.log("");
    process.exit(1);
  }
  const detail = [...compte.entries()].map(([m, n]) => `${m} ${n}`).join(" · ");
  console.log(`\n  ✓ modalités : chacune est portée par au moins une fiche — ${detail}`);
}

/* ── Toute fiche est atteignable par au moins une combinaison d'aiguillage ──
 * Invariant DIFFÉRENT de celui des domaines orphelins plus haut. Celui-là contrôle la
 * question — chaque domaine d'une famille doit être désigné par une option ; celui-ci
 * contrôle les FICHES.
 *
 * Pourquoi il faut les deux. L'appartenance d'une fiche à une famille se déduit de ses
 * domaines, qui se déduisent eux-mêmes du titre, de l'objectif et des modules. Une correction
 * d'extraction peut donc déplacer une fiche d'une famille à l'autre sans que personne l'ait
 * demandé — c'est arrivé, huit modules retrouvés ont fait passer une licence
 * d'`entreprise-management` à `chiffres-finance`. Rien ne garantit que la nouvelle famille
 * soit atteignable, et une fiche hors de portée ne se signale jamais : elle se contente de
 * ne jamais apparaître à l'écran.
 * ─────────────────────────────────────────────────────────── */
{
  const chemin = path.join(ROOT, "config", "questions.json");
  if (fs.existsSync(chemin)) {
    const questions = JSON.parse(fs.readFileSync(chemin, "utf8"));
    const fiches = fichiers.map((n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8")));
    const { inatteignables, combinaisons } = fichesInatteignables(fiches, questions, taxo);
    if (inatteignables.length) {
      console.log(`\n  ✗ aiguillage : ${inatteignables.length} fiche(s) qu'aucune réponse ne peut atteindre`);
      for (const f of inatteignables) {
        console.log(`      ${f.id} — domaines ${JSON.stringify(f.domaines || [])}`);
      }
      console.log("");
      erreurs += inatteignables.length;
    } else {
      console.log(
        `  ✓ aiguillage : les ${fiches.length} fiches sont atteignables par au moins une des ${combinaisons} combinaisons A1 × A2`
      );
    }
  }
}

/* ── Fraîcheur des artefacts générés ──────────────────────────────
 * Quatre des cinq sorties sont ignorées par git : leur péremption ne produit aucun diff, et
 * `git status` reste vide. Une consigne dans CLAUDE.md ne suffisait pas — les 80 fiches de
 * comparaison sont bel et bien parties d'une exécution périmée, en citant des modules
 * exclusifs d'avant une correction d'extraction. La péremption se mesure donc, par le contenu
 * des sources et non par leur horodatage. Voir `scripts/lib/fraicheur.mjs`.
 *
 * Un artefact ABSENT n'est pas une erreur : quatre le sont dans un clone neuf, et il n'y a
 * rien de périmé dans ce qui n'existe pas. Seul `perime` fait échouer.
 * ─────────────────────────────────────────────────────────── */
{
  const etats = etatFraicheur();
  const perimes = etats.filter((e) => e.etat === "perime");
  const inconnus = etats.filter((e) => e.etat === "inconnu");
  const absents = etats.filter((e) => e.etat === "absent");

  if (perimes.length) {
    console.log(`\n  ✗ artefact(s) périmé(s) — leurs sources ont changé depuis leur génération :`);
    for (const e of perimes) console.log(`      ${e.nom.padEnd(24)} relancer :  ${e.commande}`);
    console.log(`\n      Ces fichiers sont gitignorés pour la plupart : rien d'autre ne le signale.`);
    console.log("");
    erreurs += perimes.length;
  } else {
    const aJour = etats.length - absents.length - inconnus.length;
    console.log(`  ✓ fraîcheur : ${aJour} artefact(s) à jour${absents.length ? `, ${absents.length} non généré(s)` : ""}`);
  }
  for (const e of inconnus) {
    console.log(`  ! ${e.nom} existe mais n'est pas dans data/_fraicheur.json — relancer : ${e.commande}`);
  }
  for (const e of absents) console.log(`    ${e.nom} non généré — ${e.commande}`);
}

console.log(erreurs ? `\n  ${erreurs} erreur(s)\n` : `\n  Tout est conforme.\n`);
process.exit(erreurs ? 1 : 0);
