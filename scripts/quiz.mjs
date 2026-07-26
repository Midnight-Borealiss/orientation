#!/usr/bin/env node
/**
 * quiz.mjs — passer le parcours en ligne de commande.
 *
 *   node scripts/quiz.mjs                       # affiche les questions et un exemple
 *   node scripts/quiz.mjs --reponses F1=0,F2=3,A1=3,P1=1,P2=2,P3=0,P4=0,P5=1,P6=0,P7=0
 *   node scripts/quiz.mjs --etat                # contrôles de cohérence du contexte
 *
 * Ce n'est pas l'interface du quiz : c'est le moyen de voir ce que le moteur répond sans
 * attendre qu'une interface existe. Le moteur lui-même ne sait rien de ce script.
 */

import { chargerContexte, verifierContexte } from "../src/engine/charger.mjs";
import { jouer, prochaineQuestion, demarrer, MAX_QUESTIONS } from "../src/engine/moteur.mjs";

const args = process.argv.slice(2);
const valeur = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};

const contexte = chargerContexte();
const controle = verifierContexte(contexte);

console.log(`\n  ${contexte.fiches.length} filières chargées · ${(contexte.questions.profil || []).length} questions de profil · plafond ${MAX_QUESTIONS}`);
if (contexte.questions._statut) console.log(`  questions : ${contexte.questions._statut}`);

if (controle.problemes.length) {
  console.log(`\n  ✗ Le contexte n'est pas servable :`);
  for (const p of controle.problemes) console.log(`      ${p}`);
}
for (const a of controle.avertissements) console.log(`\n  ⚠ ${a}`);

if (args.includes("--etat")) {
  console.log(controle.ok ? `\n  Contexte servable.\n` : `\n  ${controle.problemes.length} problème(s).\n`);
  process.exit(controle.ok ? 0 : 1);
}

if (controle.problemes.length) process.exit(1);

/* ── Les questions, telles qu'un prospect les verrait ─────────── */

if (!valeur("--reponses")) {
  console.log(`\n  ` + "─".repeat(74));
  for (const bloc of ["filtres", "aiguillage", "profil"]) {
    for (const q of contexte.questions[bloc] || []) {
      console.log(`\n  [${q.id}] ${q.question}`);
      if (q.aide) console.log(`        ${q.aide}`);
      (q.options || []).forEach((o, i) => console.log(`        ${i}. ${o.label}`));
    }
  }
  console.log(`\n  ` + "─".repeat(74));
  console.log(`\n  Passe le parcours :  node scripts/quiz.mjs --reponses F1=0,F2=3,A1=3,P1=0,…\n`);
  process.exit(0);
}

/* ── Un parcours ──────────────────────────────────────────────── */

const reponses = {};
for (const paire of valeur("--reponses").split(",")) {
  const [id, indice] = paire.split("=");
  if (id && indice !== undefined) reponses[id.trim()] = Number(indice);
}

const { etat, resultat: r } = jouer(reponses, contexte);

console.log(`\n  ` + "─".repeat(74));
console.log(`\n  ${r.reformulation.phrase || "(aucun trait marqué : " + r.reformulation.motif + ")"}`);
if (r.reformulation.phrase) console.log(`  [ ${r.reformulation.reprise} ]`);

const p = r.parcours;
console.log(`\n  ${p.filieres_au_depart} filières → ${p.apres_filtres} après filtres → ${p.apres_aiguillage} après aiguillage (${p.famille || "aucun"}) → ${p.classees} classées`);
console.log(`  ${p.questions_posees} question(s) posée(s) · arrêt : ${etat.motifArret}`);
if (p.niveau_incertain) console.log(`  ⚠ ${p.niveau_incertain} filière(s) retenues sur un niveau d'accès non confirmé`);

const ligne = (f, rang) => {
  console.log(`\n  ${rang}. ${f.nom}`);
  console.log(`     ${f.ecole || "?"} · ${f.niveau} · ${f.modalites.join(", ") || "modalité non renseignée"}`);
  console.log(`     ${f.correspondance}`);
  if (f.exigence_quantitative && f.exigence_quantitative !== "faible") {
    console.log(`     ⚠ exigence quantitative ${f.exigence_quantitative}`);
  }
  if (f.justification.modules.length) console.log(`     propre à cette filière : ${f.justification.modules.slice(0, 3).join(" · ")}`);
  if (f.justification.metiers.length) console.log(`     débouchés propres : ${f.justification.metiers.slice(0, 2).join(" · ")}`);
};

if (!r.recommandation) {
  console.log(`\n  Aucune filière à recommander.`);
} else {
  console.log(`\n  RECOMMANDATION`);
  ligne(r.recommandation, 1);
  if (r.alternatives.length) {
    console.log(`\n  À REGARDER AUSSI`);
    r.alternatives.forEach((f, i) => ligne(f, i + 2));
  }
}

if (r.departage.declenche) {
  console.log(`\n  Départage déclenché — étage : ${r.departage.etage}`);
  if (r.departage.question) {
    console.log(`     ${r.departage.question.question}`);
    for (const rep of r.departage.question.reponses || []) console.log(`       - ${rep.label} → ${rep.vers}`);
  }
  if (r.departage.motif) console.log(`     ${r.departage.motif}`);
}

if (r.sans_classement.length) {
  console.log(`\n  ${r.sans_classement.length} programme(s) de ce domaine non comparables à ton profil :`);
  for (const f of r.sans_classement.slice(0, 6)) console.log(`     ${f.nom} (${f.raison})`);
}

if (r.repli_parts) console.log(`\n  ⚠ profil sans forme : classement calculé sur les parts, dégradé`);
for (const a of r.alertes) console.log(`\n  ⚠ ${a}`);
console.log("");
