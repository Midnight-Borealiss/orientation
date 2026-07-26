#!/usr/bin/env node
/**
 * simuler.mjs — calibrer les trois seuils sur la distribution RÉELLE des scores.
 *
 *   node scripts/simuler.mjs                # rapport + data/_calibration.json
 *   node scripts/simuler.mjs --niveau bac+3 # un seul niveau d'accès
 *
 * Les trois seuils de config/departages.json avaient d'abord été posés à 0,60 / 0,30 / 0,10,
 * avant toute observation. Ce script les mesure. Il est à REJOUER après toute modification
 * de config/questions.json ou des lexiques d'axes : les deux déplacent la distribution.
 *
 * MÉTHODE — le point qui compte. Le tirage porte sur les RÉPONSES POSSIBLES aux questions
 * de profil, pas sur les axes. Un tirage uniforme sur les axes produirait des profils que
 * le quiz ne peut pas générer — il n'existe aucune combinaison de réponses donnant
 * `quantitatif: 14, creatif: 0` — et on calibrerait sur des prospects imaginaires.
 *
 * Le tirage est ici EXHAUSTIF, pas aléatoire : 4^7 = 16384 combinaisons de réponses, ce
 * qui est énumérable. Les vecteurs identiques sont regroupés avec leur multiplicité, et
 * les quantiles sont pondérés par elle — sinon un vecteur atteignable par 40 chemins
 * pèserait autant qu'un vecteur atteignable par un seul.
 *
 * PROPORTIONS CIBLES, tirées des objectifs de la spec plutôt qu'inventées :
 *   « correspondance forte » minoritaire        → borne au quantile 0,75  (25 % des profils)
 *   « correspondance possible » non majoritaire → borne au quantile 0,35  (35 % des profils)
 *   départage sur au plus un tiers des profils  → borne au quantile 0,30  (30 % des profils)
 *
 * Les bornes proposées visent EXACTEMENT ces proportions : elles ne sont donc pas toujours
 * meilleures que celles en place. Si l'entonnoir a été amélioré ailleurs — un second étage
 * d'aiguillage —, le départage peut être descendu SOUS sa cible, et appliquer la
 * proposition le ferait remonter. Le script le dit et recommande alors de ne rien changer :
 * sans ce garde-fou, chaque exécution ramènerait les seuils à la cible, indéfiniment.
 *
 * Il sort en code d'erreur quand les seuils EN PLACE cessent de satisfaire les objectifs —
 * c'est ce que la CI surveille.
 *
 * Le script N'ÉCRIT PAS dans config/ : les scripts n'écrivent jamais hors de data/, et
 * remplacer un seuil de production est une décision humaine. Il imprime le bloc JSON à
 * recopier.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chargerContexte, verifierContexte } from "../src/engine/charger.mjs";
import { axesComptes, axesDisposition, classer, niveauCorrespondance } from "../src/engine/score.mjs";
import { appliquerFiltres } from "../src/engine/filtres.mjs";
import { aiguiller, chargeParFamille } from "../src/engine/aiguillage.mjs";
import { cascadeDepartage, tete, ETAGES } from "../src/engine/departage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

/** Les proportions visées, d'où sont déduites les bornes. Voir l'en-tête. */
const CIBLES = { forte: 0.25, possible: 0.35, departage: 0.3 };

const args = process.argv.slice(2);
const valeurArg = (nom) => {
  const i = args.indexOf(nom);
  return i >= 0 ? args[i + 1] : null;
};

/* ── Énumération des profils atteignables ─────────────────────── */

/**
 * Tous les vecteurs de profil que le quiz peut produire, avec leur multiplicité.
 * Regroupés par vecteur : deux chemins de réponses différents menant au même vecteur
 * donnent le même classement, il serait absurde de les scorer deux fois.
 */
export function profilsAtteignables(questions, axes) {
  const blocs = (questions.profil || []).map((q) => q.options || []);
  const vide = Object.fromEntries(axes.map((a) => [a, 0]));

  let courants = new Map([[JSON.stringify(vide), { profil: vide, poids: 1 }]]);
  for (const options of blocs) {
    const suivants = new Map();
    for (const { profil, poids } of courants.values()) {
      for (const o of options) {
        const p = { ...profil };
        for (const [axe, v] of Object.entries(o.poids || {})) p[axe] = (p[axe] || 0) + v;
        const cle = axes.map((a) => p[a]).join("-");
        const existant = suivants.get(cle);
        if (existant) existant.poids += poids;
        else suivants.set(cle, { profil: p, poids });
      }
    }
    courants = suivants;
  }
  return [...courants.values()];
}

/** Quantile pondéré. `valeurs` est une liste de `{ valeur, poids }`. */
function quantile(valeurs, q) {
  if (!valeurs.length) return null;
  const tri = [...valeurs].sort((a, b) => a.valeur - b.valeur);
  const total = tri.reduce((s, x) => s + x.poids, 0);
  let cumul = 0;
  for (const x of tri) {
    cumul += x.poids;
    if (cumul >= total * q) return x.valeur;
  }
  return tri[tri.length - 1].valeur;
}

const arrondi = (n, d = 2) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

const partPondere = (valeurs, predicat) => {
  const total = valeurs.reduce((s, x) => s + x.poids, 0);
  if (!total) return 0;
  return valeurs.filter((x) => predicat(x)).reduce((s, x) => s + x.poids, 0) / total;
};

/* ── Simulation ───────────────────────────────────────────────── */

const contexte = chargerContexte();
const controle = verifierContexte(contexte);
if (controle.problemes.length) {
  console.log(`\n  ✗ Contexte non servable, la calibration serait fausse :`);
  for (const p of controle.problemes) console.log(`      ${p}`);
  console.log("");
  process.exit(1);
}

const axes = axesComptes(contexte.taxonomie);
const seuilsEnPlace = contexte.departages._seuils;
const familles = (contexte.taxonomie.familles || []).map((f) => f.id);
const niveaux = valeurArg("--niveau") ? [valeurArg("--niveau")] : ["bac", "bac+2", "bac+3", "bac+4"];
const axesDispo = axesDisposition(contexte.taxonomie);

const profils = profilsAtteignables(contexte.questions, axes);

console.log(`\n  ${profils.length} vecteurs de profil distincts, pour ${(contexte.questions.profil || []).length} questions`);
console.log(`  ${profils.reduce((s, p) => s + p.poids, 0).toLocaleString("fr-FR")} combinaisons de réponses énumérées (tirage exhaustif, pas aléatoire)`);
console.log(`  × ${familles.length} familles × ${niveaux.length} niveaux d'accès, modalité indifférente\n`);

/**
 * Le jeu candidat ne dépend que de (niveau, famille, aiguillage fin) : on le calcule une
 * fois par combinaison, jamais par profil.
 *
 * Les familles qui reçoivent une seconde question d'aiguillage sont énumérées sur ses
 * options ; les autres n'en ont qu'une, `null`. Ne pas énumérer les sous-options
 * reviendrait à mesurer une branche que le prospect ne rencontre plus.
 */
const finPourFamille = (famille) => {
  for (const q of contexte.questions.aiguillage || []) {
    if (q.cible !== "domaines" || q.si?.famille !== famille) continue;
    return (q.options || []).map((o) => o.valeur || null);
  }
  return [null];
};

const jeux = [];
for (const niveau of niveaux) {
  const { retenues } = appliquerFiltres(contexte.fiches, { niveau_acces: niveau, modalites: null });
  for (const famille of familles) {
    for (const domaines of finPourFamille(famille)) {
      const { retenues: candidates } = aiguiller(retenues, famille, contexte.taxonomie, domaines);
      jeux.push({ niveau, famille, domaines, candidates });
    }
  }
}

const scoresTete = [];
const ecarts = [];
// Le 32 % global de départage masque probablement une branche très au-dessus et
// cinq très en dessous : sans la mesure PAR FAMILLE, on corrigerait à l'aveugle.
const parFamille = new Map(
  familles.map((f) => [f, { poids: 0, classees: 0, vides: 0, sansQuestion: 0, departages: 0, exAequo: 0 }])
);
// Quel étage de la cascade résout l'égalité ? L'objectif est que « egalite » — l'étage
// terminal, celui qui renonce à trancher — cesse d'être le cas majoritaire.
const parEtage = new Map(ETAGES.map((e) => [e, 0]));
let replis = 0;
let sansCandidat = 0;
let unSeul = 0;
let poidsTotal = 0;

for (const jeu of jeux) {
  const suivi = parFamille.get(jeu.famille);
  for (const { profil, poids } of profils) {
    poidsTotal += poids;
    suivi.poids += poids;

    if (!jeu.candidates.length) {
      sansCandidat += poids;
      suivi.vides += poids;
      continue;
    }

    const { classees, repli } = classer(profil, jeu.candidates, { axes, seuils: seuilsEnPlace });
    if (repli) replis += poids;
    if (!classees.length) {
      sansCandidat += poids;
      suivi.vides += poids;
      continue;
    }
    suivi.classees += classees.length * poids;

    scoresTete.push({ valeur: classees[0].score, poids });
    if (classees.length < 2) {
      unSeul += poids;
      continue;
    }
    const ecart = classees[0].score - classees[1].score;
    ecarts.push({ valeur: ecart, poids });
    if (ecart < seuilsEnPlace.ecart_declenchant_departage) {
      const aEgalite = tete(classees, seuilsEnPlace);
      suivi.departages += poids;
      suivi.exAequo += aEgalite.length * poids;
      const casc = cascadeDepartage(aEgalite, {
        departages: contexte.departages,
        profilDisposition: null,
        domainesAxes: contexte.domainesAxes,
        axesDispo,
      });
      parEtage.set(casc.etage, (parEtage.get(casc.etage) || 0) + poids);
      if (casc.etage === "egalite") suivi.sansQuestion += poids;
    }
  }
}

/* ── Distribution observée ────────────────────────────────────── */

const q = (v, x) => arrondi(quantile(v, x), 3);
console.log(`  Distribution du score de tête (${scoresTete.length.toLocaleString("fr-FR")} classements)`);
console.log(`    minimum ${q(scoresTete, 0)} · médiane ${q(scoresTete, 0.5)} · maximum ${q(scoresTete, 1)}`);
console.log(`    déciles : ${[0.1, 0.25, 0.5, 0.75, 0.9].map((x) => `${x * 100}% ≤ ${q(scoresTete, x)}`).join(" · ")}`);

console.log(`\n  Distribution de l'écart entre les deux premières`);
console.log(`    médiane ${q(ecarts, 0.5)} · quantile 0,30 : ${q(ecarts, 0.3)} · quantile 0,70 : ${q(ecarts, 0.7)}`);

/* ── Seuils proposés ──────────────────────────────────────────── */

const propose = {
  correspondance_forte: arrondi(quantile(scoresTete, 1 - CIBLES.forte)),
  correspondance_bonne: arrondi(quantile(scoresTete, CIBLES.possible)),
  ecart_declenchant_departage: arrondi(quantile(ecarts, CIBLES.departage)),
};

const mesurer = (seuils) => ({
  forte: partPondere(scoresTete, (x) => niveauCorrespondance(x.valeur, seuils) === "correspondance forte"),
  bonne: partPondere(scoresTete, (x) => niveauCorrespondance(x.valeur, seuils) === "bonne correspondance"),
  possible: partPondere(scoresTete, (x) => niveauCorrespondance(x.valeur, seuils) === "correspondance possible"),
  departage: partPondere(ecarts, (x) => x.valeur < seuils.ecart_declenchant_departage),
});

const avant = mesurer(seuilsEnPlace);
const apres = mesurer(propose);
const pc = (x) => `${(x * 100).toFixed(0)} %`.padStart(5);

console.log(`\n  ` + "─".repeat(74));
console.log(`\n  Seuils : en place contre proposés\n`);
console.log(`                                 en place      →  proposé`);
console.log(`    correspondance_forte           ${String(seuilsEnPlace.correspondance_forte).padStart(6)}      →  ${String(propose.correspondance_forte).padStart(6)}`);
console.log(`    correspondance_bonne           ${String(seuilsEnPlace.correspondance_bonne).padStart(6)}      →  ${String(propose.correspondance_bonne).padStart(6)}`);
console.log(`    ecart_declenchant_departage    ${String(seuilsEnPlace.ecart_declenchant_departage).padStart(6)}      →  ${String(propose.ecart_declenchant_departage).padStart(6)}`);

console.log(`\n  Ce que voit un prospect, avec l'un puis l'autre\n`);
console.log(`                            en place   proposé`);
console.log(`    correspondance forte      ${pc(avant.forte)}   ${pc(apres.forte)}`);
console.log(`    bonne correspondance      ${pc(avant.bonne)}   ${pc(apres.bonne)}`);
console.log(`    correspondance possible   ${pc(avant.possible)}   ${pc(apres.possible)}`);
console.log(`    départage déclenché       ${pc(avant.departage)}   ${pc(apres.departage)}`);

/* ── Les trois objectifs de la spec ───────────────────────────── */

const objectifsDe = (effet) => [
  {
    intitule: "« correspondance forte » reste minoritaire",
    ok: effet.forte < 0.5,
    detail: `${pc(effet.forte)} des profils`,
  },
  {
    intitule: "« correspondance possible » n'est pas le cas majoritaire",
    ok: effet.possible < 0.5,
    detail: `${pc(effet.possible)} des profils`,
  },
  {
    intitule: "le départage ne se déclenche pas sur plus d'un tiers des profils",
    ok: effet.departage <= 1 / 3 + 1e-9,
    detail: `${pc(effet.departage)} des profils`,
  },
];

const objectifs = objectifsDe(avant);
const objectifsProposes = objectifsDe(apres);

console.log(`\n  ` + "─".repeat(74));
console.log(`\n  Objectifs de la spec, avec les seuils EN PLACE\n`);
for (const o of objectifs) console.log(`    ${o.ok ? "✓" : "✗"} ${o.intitule.padEnd(58)} ${o.detail}`);

/**
 * Les bornes proposées visent EXACTEMENT les proportions cibles. Elles ne sont donc pas
 * toujours meilleures : si l'entonnoir a été amélioré ailleurs — un second étage
 * d'aiguillage, par exemple —, le départage peut être descendu sous sa cible, et
 * appliquer la proposition le ferait remonter. Sans ce garde-fou, chaque exécution
 * ramènerait les seuils à la cible et on tournerait en rond.
 */
const proposeMieux = objectifs.some((o) => !o.ok);
if (!proposeMieux) {
  console.log(`\n  Les seuils en place satisfont les trois objectifs : NE RIEN CHANGER.`);
  const degradations = objectifsProposes
    .map((o, i) => ({ o, avant: objectifs[i] }))
    .filter((x) => !x.o.ok || x.o.detail !== x.avant.detail);
  if (degradations.length) {
    console.log(`  La proposition ci-dessous ne vaut que comme repère — elle vise les proportions cibles,`);
    console.log(`  ce qui ferait ici remonter le départage de ${pc(avant.departage).trim()} à ${pc(apres.departage).trim()}.`);
  }
}

/* ── Ce que la simulation apprend d'autre ─────────────────────── */

console.log(`\n  ` + "─".repeat(74));
console.log(`\n  Répartition du catalogue par famille — l'aiguillage réduit-il vraiment ?\n`);
const charge = chargeParFamille(contexte.fiches, contexte.taxonomie);
/**
 * L'engorgement se mesure sur les filières RESTANT EN LICE, pas sur le nombre de fiches
 * de la famille. Une famille peut porter 39 % du catalogue et aiguiller correctement si
 * elle a un second étage ; c'est cette mesure-là qui dit si l'entonnoir fonctionne.
 */
const moyennes = charge.map(([f]) => {
  const s = parFamille.get(f);
  return s.poids ? s.classees / s.poids : 0;
});
const medianeClassees = [...moyennes].sort((a, b) => a - b)[Math.floor(moyennes.length / 2)];

console.log(`    famille                  fiches      classées   départage   ex æquo`);
for (const [famille, n] of charge) {
  const suivi = parFamille.get(famille);
  const moyenne = suivi.poids ? suivi.classees / suivi.poids : 0;
  const tauxDepartage = suivi.poids ? suivi.departages / suivi.poids : 0;
  const exAequo = suivi.departages ? suivi.exAequo / suivi.departages : 0;
  const alerte =
    moyenne > medianeClassees * 1.5
      ? "  ⚠ engorgée"
      : tauxDepartage > 0.5
        ? "  ⚠ le score y départage mal"
        : "";
  console.log(
    `    ${famille.padEnd(24)} ${String(n).padStart(2)} (${String(Math.round((n / contexte.fiches.length) * 100)).padStart(2)} %)` +
      `  ${moyenne.toFixed(1).padStart(9)}  ${pc(tauxDepartage)}      ${exAequo.toFixed(1)}${alerte}`
  );
}
console.log(`\n    « classées » = filières encore en lice après filtres et aiguillage, en moyenne.`);
console.log(`    « ex æquo » = combien de filières se retrouvent à égalité quand le départage se déclenche.`);

/* ── Quel étage de la cascade tranche l'égalité ? ─────────────────
 * L'objectif du correctif : que « affiché à égalité » — l'étage terminal, celui qui
 * renonce à trancher — cesse d'être le cas majoritaire, sans attendre les entretiens.
 * ─────────────────────────────────────────────────────────────── */

const poidsDepartages = [...parEtage.values()].reduce((a, b) => a + b, 0);
const LIBELLE_ETAGE = {
  "question-redigee": "1. question rédigée en entretien",
  "option-soeurs": "—  deux options du même programme, le nom tranche",
  metiers: "2. question générée depuis les métiers exclusifs",
  modules: "3. question générée depuis les modules exclusifs",
  disposition: "4. distance de disposition",
  egalite: "5. affiché à égalité, sans trancher",
};

console.log(`\n  ` + "─".repeat(74));
console.log(`\n  Départage : quel étage tranche, sur les ${pc(poidsDepartages / poidsTotal).trim()} de profils concernés\n`);
for (const etage of ETAGES) {
  const n = parEtage.get(etage) || 0;
  const part = poidsDepartages ? n / poidsDepartages : 0;
  console.log(`    ${LIBELLE_ETAGE[etage].padEnd(50)} ${pc(part)}  ${"█".repeat(Math.round(part * 40))}`);
}
const resolus = poidsDepartages - (parEtage.get("egalite") || 0);
console.log(
  `\n    ${pc(resolus / Math.max(poidsDepartages, 1)).trim()} des égalités sont tranchées sans attendre les entretiens.`
);

console.log(`\n  Cas limites`);
console.log(`    profils sans forme (repli sur les parts)      ${pc(replis / poidsTotal)}`);
console.log(`    profils sans aucune filière à classer         ${pc(sansCandidat / poidsTotal)}`);
console.log(`    profils avec une seule filière classée        ${pc(unSeul / poidsTotal)}`);
const sansQ = [...parFamille.values()].reduce((s, x) => s + x.sansQuestion, 0);
console.log(`    ex æquo que rien ne tranche (étage 5)         ${pc(sansQ / poidsTotal)}  → ordre du jour des entretiens`);

/* ── Sorties ──────────────────────────────────────────────────── */

console.log(`\n  ` + "─".repeat(74));
console.log(`\n  À recopier dans config/departages.json > _seuils :\n`);
console.log(
  JSON.stringify(
    {
      _statut: `calibre par simulation sur ${profils.length} vecteurs de profil x ${familles.length} familles x ${niveaux.length} niveaux`,
      correspondance_forte: propose.correspondance_forte,
      correspondance_bonne: propose.correspondance_bonne,
      ecart_declenchant_departage: propose.ecart_declenchant_departage,
    },
    null,
    2
  )
    .split("\n")
    .map((l) => `    ${l}`)
    .join("\n")
);
console.log(`\n  Ce script n'écrit pas dans config/ : remplacer un seuil de production est une`);
console.log(`  décision humaine, et les scripts n'écrivent jamais hors de data/.\n`);

const rapport = {
  _comment:
    "Produit par npm run simuler. Tirage exhaustif sur les reponses possibles aux questions de profil, jamais uniforme sur les axes.",
  cibles: CIBLES,
  vecteurs_distincts: profils.length,
  combinaisons: profils.reduce((s, p) => s + p.poids, 0),
  familles: familles.length,
  niveaux,
  distribution_score_tete: Object.fromEntries(
    [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1].map((x) => [`q${x}`, q(scoresTete, x)])
  ),
  distribution_ecart: Object.fromEntries([0, 0.3, 0.5, 0.7, 1].map((x) => [`q${x}`, q(ecarts, x)])),
  seuils_en_place: seuilsEnPlace,
  seuils_proposes: propose,
  effet_en_place: avant,
  effet_proposes: apres,
  objectifs_en_place: objectifs,
  objectifs_proposes: objectifsProposes,
  proposition_utile: proposeMieux,
  cas_limites: {
    repli_parts: replis / poidsTotal,
    sans_candidat: sansCandidat / poidsTotal,
    une_seule_classee: unSeul / poidsTotal,
    ex_aequo_sans_question: sansQ / poidsTotal,
  },
  charge_familles: Object.fromEntries(charge),
  departage_par_etage: Object.fromEntries(
    [...parEtage.entries()].map(([e, n]) => [e, poidsDepartages ? n / poidsDepartages : 0])
  ),
  departage_resolu_sans_entretien: poidsDepartages ? resolus / poidsDepartages : 0,
  par_famille: Object.fromEntries(
    [...parFamille.entries()].map(([f, x]) => [
      f,
      {
        fiches: charge.find(([id]) => id === f)?.[1] ?? 0,
        classees_moyenne: x.poids ? x.classees / x.poids : 0,
        taux_departage: x.poids ? x.departages / x.poids : 0,
        ex_aequo_moyen: x.departages ? x.exAequo / x.departages : 0,
        sans_question: x.poids ? x.sansQuestion / x.poids : 0,
      },
    ])
  ),
};
fs.writeFileSync(path.join(ROOT, "data", "_calibration.json"), JSON.stringify(rapport, null, 2) + "\n");
console.log(`  Rapport complet : data/_calibration.json\n`);

process.exit(objectifs.every((o) => o.ok) ? 0 : 1);
