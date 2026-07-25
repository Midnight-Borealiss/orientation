#!/usr/bin/env node
/**
 * report.mjs — Que manque-t-il, et à qui le demander ?
 *
 *   node scripts/report.mjs            # rapport console
 *   node scripts/report.mjs --csv      # data/_manques.csv, à envoyer aux responsables
 *
 * C'est ce script qui remplace le guide de collecte : au lieu d'une page blanche,
 * chaque responsable reçoit uniquement les 3-4 champs manquants de SA filière.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "filieres");

const CSV = process.argv.includes("--csv");

// Champs qu'une brochure ne contient jamais → à demander systématiquement
const A_DEMANDER = [
  { champ: "ecole", qui: "interne", question: "Rattacher la filière à une école (ranger la brochure dans le bon sous-dossier)" },
  { champ: "axes", qui: "responsable", question: "Confirmer/corriger les 5 notes d'axes (1-5)" },
  { champ: "deconseille_si", qui: "responsable", question: "À qui déconseillez-vous cette filière ?" },
  { champ: "voisines", qui: "admissions", question: "Avec quelle(s) filière(s) est-elle confondue, et qu'est-ce qui tranche ?" },
  { champ: "profil_ideal", qui: "responsable", question: "3 traits du profil qui réussit ici" },
  { champ: "eligibilite.series_bac", qui: "admissions", question: "Séries de bac réellement acceptées" },
  { champ: "eligibilite.niveau_maths", qui: "responsable", question: "Niveau de maths requis : aucun / faible / moyen / élevé" },
  { champ: "vitrine.accroche", qui: "responsable", question: "1 phrase qui donne envie" },
];

const get = (obj, chemin) =>
  chemin.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const vide = (v) =>
  v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && !v.trim());

if (!fs.existsSync(DIR)) {
  console.error("Aucune fiche. Lance d'abord : node scripts/extract.mjs");
  process.exit(1);
}

const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
const fiches = fichiers.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")));

const lignes = [];
let totalManques = 0;

console.log(`\n  ${fiches.length} fiches analysées\n`);
console.log("  " + "─".repeat(66));

for (const f of fiches) {
  const manques = [];
  for (const item of A_DEMANDER) {
    const val = get(f, item.champ);
    const source = f.meta?.sources?.[item.champ.split(".")[0]];
    // "inference" compte comme manquant : c'est un brouillon à valider
    if (vide(val) || source === "inference") manques.push(item);
  }
  totalManques += manques.length;

  const badge = f.meta?.statut === "valide" ? "✓" : manques.length ? "○" : "◐";
  console.log(`\n  ${badge} ${f.nom}`);
  console.log(`     ${f.ecole || "école non renseignée"} · ${f.niveau} · ${f.domaines.join(", ")}`);
  if (manques.length) {
    for (const m of manques) {
      console.log(`       → [${m.qui}] ${m.question}`);
      lignes.push([f.id, f.nom, f.ecole || "", m.qui, m.champ, m.question]);
    }
  } else {
    console.log(`       Complète.`);
  }
}

console.log("\n  " + "─".repeat(66));
console.log(`\n  ${totalManques} points à confirmer sur ${fiches.length} filières`);
console.log(`  Moyenne : ${(totalManques / fiches.length).toFixed(1)} questions par filière\n`);

const parQui = {};
for (const l of lignes) parQui[l[3]] = (parQui[l[3]] || 0) + 1;
for (const [qui, n] of Object.entries(parQui)) console.log(`    ${qui.padEnd(14)} ${n} réponses attendues`);

if (CSV) {
  const csv = [
    "id_filiere,nom,ecole,destinataire,champ,question,reponse",
    ...lignes.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",") + ',""'),
  ].join("\n");
  const out = path.join(ROOT, "data", "_manques.csv");
  fs.writeFileSync(out, csv);
  console.log(`\n  CSV écrit : data/_manques.csv`);
  console.log(`  Filtre par 'destinataire' et envoie à chaque équipe.\n`);
} else {
  console.log(`\n  Ajoute --csv pour générer le fichier à envoyer aux équipes.\n`);
}
