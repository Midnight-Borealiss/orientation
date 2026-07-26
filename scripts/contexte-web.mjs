#!/usr/bin/env node
/**
 * contexte-web.mjs — le contexte du moteur en UN fichier, pour le navigateur.
 *
 *   node scripts/contexte-web.mjs
 *
 * L'interface n'a pas de `fs` : elle ne peut pas parcourir `data/filieres/`, et 84 requêtes
 * séparées seraient absurdes sur un réseau lent. Ce script produit le même objet que
 * `chargerContexte()`, en un seul JSON à charger d'un `fetch`.
 *
 * ON NE COPIE PAS TOUT. Les `unites_enseignement` pèsent l'essentiel du catalogue — 1918
 * modules — et le moteur ne les lit jamais : les axes en ont déjà été comptés à
 * l'extraction. Les embarquer ferait payer au prospect, souvent en données limitées, une
 * donnée qui ne changera pas ce qu'il voit.
 *
 * La liste des champs est donc EXPLICITE, et c'est volontaire : un `delete` de ce qui est
 * gros laisserait passer tout nouveau champ, alors qu'une liste blanche fait échouer
 * bruyamment quand le moteur se met à lire autre chose — `verifierContexte()` s'exécute
 * ici même sur le contexte allégé, et refuse d'écrire s'il n'est plus servable.
 *
 * Les scripts n'écrivent jamais hors de `data/` : la sortie va dans `data/_contexte.json`.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chargerContexte, verifierContexte } from "../src/engine/charger.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SORTIE = path.join(ROOT, "data", "_contexte.json");

/**
 * Les champs d'une fiche dont dépendent le moteur et l'écran de résultat.
 *
 * Chaque ligne porte qui en a besoin — sans quoi la prochaine session ne saura pas si un
 * champ peut sauter.
 */
const CHAMPS = {
  id: "identité, ordre déterministe du classement",
  nom: "affichage, et racine de titre pour reconnaître deux options sœurs",
  ecole: "affichage de la modalité et de l'école ; l'écran en tire le libellé de la taxonomie",
  niveau: "affichage",
  niveau_acces: "FILTRE dur",
  modalites: "FILTRE dur, et affichage obligatoire — un même intitulé existe en deux modalités",
  domaines: "aiguillage, et axes de disposition au départage",
  axes: "affichage et tests d'ancrage — jamais le calcul",
  axes_parts: "LE CALCUL de corrélation",
  axes_fiables: "décide du classement ; absent se lit comme false",
  option: "reconnaître deux options sœurs",
  programme_parent: "reconnaître deux options sœurs",
  distinctivite: "questions générées du départage, différenciateur, modules distinctifs",
  debouches: "métiers affichés",
  exigence_quantitative: "avertissement — informe, n'exclut ni ne note",
  vitrine: "accroche et description, souvent vides",
  deconseille_si: "affiché quand il existe",
};

const alleger = (fiche) => {
  const out = {};
  for (const champ of Object.keys(CHAMPS)) {
    if (fiche[champ] !== undefined) out[champ] = fiche[champ];
  }
  // `distinctivite` porte aussi des mesures de proximité qui ne servent qu'aux entretiens.
  if (out.distinctivite) {
    out.distinctivite = {
      modules_exclusifs: out.distinctivite.modules_exclusifs || [],
      metiers_exclusifs: out.distinctivite.metiers_exclusifs || [],
    };
  }
  if (out.debouches) out.debouches = { metiers: out.debouches.metiers || [] };
  return out;
};

const contexte = chargerContexte();

const allege = {
  _produit_par: "npm run contexte:web — ne pas éditer à la main, il est régénéré",
  taxonomie: contexte.taxonomie,
  questions: contexte.questions,
  departages: contexte.departages,
  domainesAxes: contexte.domainesAxes,
  reformulation: contexte.reformulation,
  contact: contexte.contact,
  fiches: contexte.fiches.map(alleger),
};

/* ── Le contexte allégé doit rester servable ──────────────────────
 * Sinon on livrerait au navigateur un contexte que le moteur accepte en apparence mais
 * qui classe mal — et personne ne le verrait, puisque la version Node, elle, est complète.
 * ─────────────────────────────────────────────────────────────── */
const controle = verifierContexte(allege);
if (controle.problemes.length) {
  console.log(`\n  ✗ le contexte allégé n'est pas servable — rien n'a été écrit :`);
  for (const p of controle.problemes) console.log(`      ${p}`);
  console.log("");
  process.exit(1);
}

fs.writeFileSync(SORTIE, JSON.stringify(allege), "utf8");

const ko = (n) => `${Math.round(n / 1024)} ko`;
const complet = JSON.stringify({ ...allege, fiches: contexte.fiches }).length;
const taille = fs.statSync(SORTIE).size;

console.log(`\n  data/_contexte.json — ${contexte.fiches.length} fiches, ${ko(taille)}`);
console.log(`  catalogue complet : ${ko(complet)} — les unités d'enseignement ne partent pas au navigateur`);
for (const a of controle.avertissements) console.log(`\n  ⚠ ${a}`);
console.log("");
