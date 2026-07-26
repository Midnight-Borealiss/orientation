#!/usr/bin/env node
/**
 * report.mjs — Que manque-t-il, et à qui le demander ?
 *
 *   node scripts/report.mjs            # rapport console
 *   node scripts/report.mjs --csv      # data/_manques.csv, à envoyer aux responsables
 *
 * Ce script remplace le guide de collecte : au lieu d'une page blanche, chaque
 * responsable reçoit uniquement les points manquants de SES filières.
 *
 * Règle : on ne demande QUE ce que le catalogue ne contient pas. Deux familles de
 * questions ont donc disparu de cette liste :
 *
 *   - les séries de bac : aucune brochure ISM n'en porte, et ISM n'en exige pas.
 *     Une question sans réponse possible n'est pas une question, c'est du bruit
 *     dans le CSV.
 *   - les 5 axes de contenu : ils sont désormais COMPTÉS depuis
 *     unites_enseignement. Le quantitatif d'un programme est le nombre de ses
 *     modules de maths et de calcul — un fait, pas une opinion. Demander de
 *     « confirmer » un comptage revient à demander de le refaire à la main.
 *
 * Restent les deux axes de disposition — qui se collectent par DOMAINE, pas par
 * filière — et les paires que la distinctivité n'a pas séparées.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sontSoeurs } from "./distinctivite.mjs";
import { modulesDe } from "./lib/fiche.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "filieres");

const CSV = process.argv.includes("--csv");

/**
 * Ce qu'une brochure ne contient jamais, par fiche.
 * `si` limite la question aux fiches concernées : personne ne doit recevoir une
 * ligne de CSV pour un point que le catalogue a déjà tranché.
 */
const A_DEMANDER = [
  {
    champ: "deconseille_si",
    qui: "responsable",
    question: "À qui déconseillez-vous cette filière ? (vos mots serviront aux options du quiz)",
  },
  {
    champ: "profil_ideal",
    qui: "responsable",
    question: "3 traits du profil qui réussit ici",
  },
  {
    champ: "vitrine.accroche",
    qui: "responsable",
    question: "1 phrase qui donne envie",
  },
  {
    champ: "domaines",
    qui: "responsable",
    question: "L'aiguillage est-il le bon ?",
    valeur: (f) => f.domaines.join(" + "),
  },
  {
    champ: "niveau_acces",
    qui: "admissions",
    // La brochure ne donne que le diplôme délivré : l'entrée est souvent déduite.
    si: (f) => f.meta?.sources?.niveau_acces === "inference",
    question: "Diplôme réellement exigé à l'entrée (déduit du niveau délivré, à confirmer)",
    valeur: (f) => f.niveau_acces,
  },
  {
    champ: "voisines",
    qui: "responsable",
    // Produit par scripts/distinctivite.mjs, pas par une intuition : `voisines` porte
    // les programmes avec qui cette fiche forme une paire retenue — les 3 plus proches
    // de son domaine, selon le recouvrement de modules OU la corrélation d'axes.
    // Retiré dès que la paire a sa question dans config/departages.json, et jamais posé
    // pour deux options du même programme : le nom de l'option tranche déjà.
    si: (f) => aDepartager(f).length > 0,
    question: "Qu'est-ce qui sépare cette filière de ses plus proches voisines ? (fiche imprimée : npm run comparaisons)",
    valeur: (f) => aDepartager(f).join(", "),
  },
];

/**
 * Les voisines de cette fiche qui restent à départager par un humain : ni options
 * sœurs, ni paires déjà documentées. Défini avant usage par A_DEMANDER, qui n'est
 * évalué qu'après la lecture des fiches.
 */
function aDepartager(f) {
  return (f.voisines || []).filter(
    (id) => !TRANCHEES.has([f.id, id].sort().join("|")) && !sontSoeurs(f, PAR_ID.get(id))
  );
}

/** Paires déjà documentées dans config/departages.json : ne pas les redemander. */
function pairesDejaTranchees() {
  const chemin = path.join(ROOT, "config", "departages.json");
  if (!fs.existsSync(chemin)) return new Set();
  const cfg = JSON.parse(fs.readFileSync(chemin, "utf8"));
  return new Set(
    (cfg.paires || [])
      .filter((p) => p.question && p.source !== "exemple")
      .map((p) => [...p.entre].sort().join("|"))
  );
}
const TRANCHEES = pairesDejaTranchees();

const get = (obj, chemin) => chemin.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

const vide = (v) =>
  v == null || (Array.isArray(v) && v.length === 0) || (typeof v === "string" && !v.trim());

if (!fs.existsSync(DIR)) {
  console.error("Aucune fiche. Lance d'abord : node scripts/extract.mjs");
  process.exit(1);
}

const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
if (!fichiers.length) {
  console.error("Aucune fiche dans data/filieres/. Lance d'abord : node scripts/extract.mjs");
  process.exit(1);
}

const fiches = fichiers
  .map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")))
  .sort((a, b) => (a.ecole || "").localeCompare(b.ecole || "") || a.nom.localeCompare(b.nom));

const PAR_ID = new Map(fiches.map((f) => [f.id, f]));

const lignes = [];
let totalManques = 0;

console.log(`\n  ${fiches.length} fiches analysées\n`);
console.log("  " + "─".repeat(70));

for (const f of fiches) {
  const manques = [];
  for (const item of A_DEMANDER) {
    if (item.si) {
      if (item.si(f)) manques.push(item);
      continue;
    }
    const val = get(f, item.champ);
    const source = f.meta?.sources?.[item.champ.split(".")[0]];
    // « inference » compte comme manquant : c'est un brouillon à valider.
    if (vide(val) || source === "inference") manques.push(item);
  }
  totalManques += manques.length;

  const badge = f.meta?.statut === "valide" ? "✓" : manques.length ? "○" : "◐";
  console.log(`\n  ${badge} ${f.nom}`);
  console.log(`     ${f.ecole || "école non renseignée"} · ${f.niveau} · ${f.domaines.join(", ")}`);
  for (const m of manques) {
    const contexte = m.valeur ? ` [${m.valeur(f)}]` : "";
    console.log(`       → [${m.qui}] ${m.question}${contexte}`);
    lignes.push([f.id, f.nom, f.ecole || "", m.qui, m.champ, m.question + contexte]);
  }
  if (!manques.length) console.log(`       Complète.`);
}

console.log("\n  " + "─".repeat(70));
console.log(`\n  ${totalManques} points à confirmer sur ${fiches.length} filières`);
console.log(`  Moyenne : ${(totalManques / fiches.length).toFixed(1)} questions par filière`);

const parQui = {};
for (const l of lignes) parQui[l[3]] = (parQui[l[3]] || 0) + 1;
for (const [qui, n] of Object.entries(parQui)) console.log(`    ${qui.padEnd(14)} ${n} réponses attendues`);

/* ── Ce qui ne se demande pas filière par filière ─────────────── */

const taxo = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "taxonomy.json"), "utf8"));
const axesConfig = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "domaines_axes.json"), "utf8"));

// Les 2 axes de disposition se collectent par DOMAINE, pas par famille : au niveau
// famille ils seraient identiques pour tous les programmes d'une même famille, donc
// sans pouvoir discriminant là où le scoring en a besoin.
const familleDe = new Map();
for (const fam of taxo.familles || []) for (const d of fam.domaines) familleDe.set(d, fam.id);

const domainesUtilises = [...new Set(fiches.flatMap((f) => f.domaines))].sort();
const aCollecter = domainesUtilises.filter((id) => {
  const a = axesConfig.domaines?.[id];
  return !a || a.ancrage == null || a.abstraction == null;
});
const sansEntree = domainesUtilises.filter((d) => !axesConfig.domaines?.[d]);
const sansFamille = domainesUtilises.filter((d) => !familleDe.has(d));

console.log(`\n  Axes de disposition (ancrage, abstraction) — par DOMAINE, jamais par filière :`);
console.log(`    ${aCollecter.length} domaine(s) sur ${domainesUtilises.length} à renseigner dans config/domaines_axes.json`);
if (sansEntree.length) console.log(`    ! domaine(s) sans entrée dans domaines_axes.json : ${sansEntree.join(", ")}`);
if (sansFamille.length) console.log(`    ! domaine(s) hors famille dans taxonomy.json : ${sansFamille.join(", ")}`);

/* ── Programmes qu'aucun profil ne peut faire remonter ─────────────
 * Un manque d'une autre nature, et qui n'apparaissait nulle part dans ce rapport : ces
 * programmes sont accessibles par les filtres et l'aiguillage, mais leurs axes ne décrivent
 * pas leur contenu, donc le score ne les classe jamais. Un prospect ne les voit qu'en zone
 * « sans classement » — sauf s'ils sont sa seule option, auquel cas ils sont recommandés
 * directement.
 *
 * Ce n'est PAS une question aux responsables et ça n'entre pas dans le CSV : le remède est
 * documentaire (des intitulés de modules exploitables) ou lexical (élargir les cinq lexiques),
 * pas déclaratif. Demander à un responsable de « confirmer » un comptage reviendrait à le lui
 * faire refaire à la main. C'est un compte à suivre, pas une réponse à attendre.
 * ─────────────────────────────────────────────────────────── */
{
  // Absent se lit comme `false` : cela veut dire que la distinctivité n'a pas tourné depuis la
  // dernière extraction, donc que rien n'a été évalué.
  const nonNotables = fiches.filter((f) => f.axes_fiables !== true);
  console.log(`\n  Programmes que le score ne classe jamais (axes_fiables: false) :`);
  console.log(
    `    ${nonNotables.length} sur ${fiches.length} — accessibles par les filtres et l'aiguillage, jamais notés`
  );
  if (nonNotables.length) {
    const sansModules = nonNotables.filter((f) => !modulesDe(f.unites_enseignement || []).length).length;
    const troppeu = nonNotables.filter((f) => {
      const n = modulesDe(f.unites_enseignement || []).length;
      return n > 0 && n < 6;
    }).length;
    console.log(
      `    dont ${sansModules} sans aucun module, ${troppeu} sous 6 modules, ` +
        `${nonNotables.length - sansModules - troppeu} à couverture lexicale insuffisante`
    );
    console.log(`    La liste nommée est produite par  npm run distinctivite`);
  }
}

const avecDistinctivite = fiches.filter((f) => f.distinctivite).length;
if (!avecDistinctivite) {
  console.log(`\n  ! La distinctivité n'a pas tourné : les paires à départager manquent à l'ordre du jour.`);
  console.log(`    Lance  npm run distinctivite  avant de convoquer les responsables.`);
}

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
