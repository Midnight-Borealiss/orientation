#!/usr/bin/env node
/**
 * test-moteur.mjs — le filet de sécurité du moteur.
 *
 *   node scripts/test-moteur.mjs      (aussi : npm run test:moteur)
 *
 * Il vérifie deux familles de choses, et la première compte autant que la seconde :
 *
 *   1. LES INTERDITS DE CLAUDE.md, sous forme exécutable. Aucun nom de filière dans
 *      src/engine/, aucun score en pourcentage, la corrélation sur `axes_parts` et non
 *      sur les notes, aucun programme non fiable dans un classement. Un interdit écrit
 *      seulement en prose se transgresse à la refactorisation suivante ;
 *   2. le comportement du parcours : arrêt anticipé, départage, cas limites.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chargerContexte, verifierContexte } from "../src/engine/charger.mjs";
import { axesComptes, axesDisposition, correlation, classer, niveauCorrespondance, vecteurFiliere } from "../src/engine/score.mjs";
import { appliquerFiltres, accessible } from "../src/engine/filtres.mjs";
import { aiguiller, familleParDomaine, famillesDeFiche, domainesInatteignables } from "../src/engine/aiguillage.mjs";
import {
  dispositionDeFiche,
  tete,
  cascadeDepartage,
  ETAGES,
  libelleUtilisable,
  libellesUtilisables,
} from "../src/engine/departage.mjs";
import { reformuler, traitsMarquants } from "../src/engine/reformulation.mjs";
import {
  demarrer,
  repondre,
  prochaineQuestion,
  questionApplicable,
  candidates,
  resultat,
  jouer,
  doitSArreter,
  MAX_QUESTIONS,
} from "../src/engine/moteur.mjs";
import { normaliser } from "./lib/pdf-layout.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const ENGINE = path.join(ROOT, "src", "engine");

let echecs = 0;
let verifs = 0;
function verifier(intitule, condition, detail = "") {
  verifs++;
  if (condition) console.log(`  ✓ ${intitule}`);
  else {
    echecs++;
    console.log(`  ✗ ${intitule}${detail ? `\n      ${detail}` : ""}`);
  }
}

const contexte = chargerContexte();
const axes = axesComptes(contexte.taxonomie);
const dispo = axesDisposition(contexte.taxonomie);
const seuils = contexte.departages._seuils;

/* ── 1. Le moteur ne connaît aucune filière ───────────────────── */

console.log(`\n  Le moteur est générique\n`);

const sources = fs.readdirSync(ENGINE).filter((n) => n.endsWith(".mjs"));
verifier(`src/engine/ contient ${sources.length} modules`, sources.length >= 5, sources.join(", "));

{
  // Un id ou un intitulé de filière dans le code du moteur casserait la réutilisation :
  // changer de contexte d'orientation doit se faire en changeant config/ et data/.
  const codes = sources.map((n) => ({ nom: n, texte: fs.readFileSync(path.join(ENGINE, n), "utf8") }));
  const fuites = [];
  for (const f of contexte.fiches) {
    for (const c of codes) {
      if (c.texte.includes(f.id)) fuites.push(`${c.nom} cite l'id ${f.id}`);
      // Les titres sont longs et distinctifs : on cherche leur forme normalisée.
      const titre = normaliser(f.nom);
      if (titre.length > 12 && normaliser(c.texte).includes(titre)) fuites.push(`${c.nom} cite « ${f.nom} »`);
    }
  }
  verifier("aucun id ni intitulé de filière dans src/engine/", !fuites.length, fuites.slice(0, 5).join(" ; "));

  // Les écoles, domaines et familles sont du vocabulaire de config/, pas du code.
  // Deux exclusions assumées :
  //   - charger.mjs est le seul module qui connaît le disque, donc les noms de dossiers ;
  //   - sous 6 caractères, un id comme `rh` ou `data` se retrouve dans n'importe quel
  //     mot et le contrôle ne mesurerait plus rien.
  const vocabulaire = [
    ...contexte.taxonomie.ecoles.map((e) => e.id),
    ...contexte.taxonomie.domaines.map((d) => d.id),
    ...contexte.taxonomie.familles.map((f) => f.id),
  ].filter((v) => v.length >= 6);
  const durs = [];
  for (const v of vocabulaire) {
    for (const c of codes.filter((x) => x.nom !== "charger.mjs")) {
      if (c.texte.includes(v)) durs.push(`${c.nom} → « ${v} »`);
    }
  }
  verifier("aucune école, aucun domaine, aucune famille en dur dans src/engine/", !durs.length, durs.slice(0, 5).join(" ; "));
}

/* ── 2. Aucun score en pourcentage ────────────────────────────── */

console.log(`\n  Le score ne s'affiche jamais en chiffre\n`);

const NIVEAUX_AUTORISES = new Set(["correspondance forte", "bonne correspondance", "correspondance possible"]);

verifier(
  "niveauCorrespondance ne rend que les trois niveaux prévus",
  [-1, -0.5, 0, 0.29, 0.3, 0.59, 0.6, 0.9, 1].every((r) => NIVEAUX_AUTORISES.has(niveauCorrespondance(r, seuils)))
);

const partie = { F1: 0, F2: 3, A1: 3, P1: 1, P2: 2, P3: 0, P4: 0, P5: 1, P6: 0, P7: 0 };
const { etat: etatFini, resultat: r1 } = jouer(partie, contexte);

{
  // Toute valeur numérique de score sortant du moteur doit être sous une clé qui
  // annonce qu'elle est interne. Sinon une interface finira par l'afficher.
  const numeriques = [];
  const parcourir = (objet, chemin) => {
    if (objet == null) return;
    if (Array.isArray(objet)) return objet.forEach((x, i) => parcourir(x, `${chemin}[${i}]`));
    if (typeof objet !== "object") return;
    for (const [k, v] of Object.entries(objet)) {
      const sous = chemin ? `${chemin}.${k}` : k;
      if (typeof v === "number" && /score|correspondance|correlation|\br\b/i.test(k) && !k.startsWith("_")) {
        numeriques.push(sous);
      }
      parcourir(v, sous);
    }
  };
  parcourir({ recommandation: r1.recommandation, alternatives: r1.alternatives }, "");
  verifier("aucun score numérique sous une clé publique du résultat", !numeriques.length, numeriques.join(", "));
}

verifier(
  "la recommandation porte un niveau affichable, pas une valeur",
  r1.recommandation && NIVEAUX_AUTORISES.has(r1.recommandation.correspondance),
  r1.recommandation?.correspondance
);

/* ── 3. La métrique ───────────────────────────────────────────── */

console.log(`\n  Corrélation de forme, sur les proportions\n`);

verifier("deux vecteurs de forme identique corrèlent à 1", Math.abs(correlation([1, 5, 1, 1, 2], [2, 10, 2, 2, 4]) - 1) < 1e-12);
verifier("deux vecteurs de formes opposées corrèlent à -1", Math.abs(correlation([1, 5, 1], [5, 1, 5]) + 1) < 1e-12);
verifier("un vecteur plat n'a pas de corrélation", correlation([3, 3, 3, 3, 3], [1, 5, 1, 1, 2]) === null);

{
  // Le vecteur d'une filière doit venir de axes_parts. On le vérifie sur une fiche dont
  // les deux versions diffèrent : sinon le test passerait même si le code lisait `axes`.
  const f = contexte.fiches.find((x) => x.axes_parts && axes.some((a) => x.axes_parts[a] !== x.axes[a]));
  const v = vecteurFiliere(f, axes);
  verifier(
    "le vecteur d'une filière est fait de proportions, pas de notes 1..5",
    v.every((x, i) => x === f.axes_parts[axes[i]]) && v.some((x) => !Number.isInteger(x)),
    `${f.id} → ${v.join(", ")}`
  );
}

{
  // La raison d'être de axes_parts : l'arrondi produisait des ex æquo parfaits, qui ne
  // sont pas classables. Ce test dirait qu'on est revenu aux notes.
  let surNotes = 0;
  let surParts = 0;
  for (let i = 0; i < contexte.fiches.length; i++) {
    for (let j = i + 1; j < contexte.fiches.length; j++) {
      const a = contexte.fiches[i];
      const b = contexte.fiches[j];
      if (!a.domaines.some((d) => b.domaines.includes(d))) continue;
      const rn = correlation(axes.map((x) => a.axes[x]), axes.map((x) => b.axes[x]));
      const rp = correlation(axes.map((x) => a.axes_parts[x]), axes.map((x) => b.axes_parts[x]));
      if (rn != null && Math.abs(rn - 1) < 1e-9) surNotes++;
      if (rp != null && Math.abs(rp - 1) < 1e-9) surParts++;
    }
  }
  verifier(
    "les proportions suppriment les égalités exactes que les notes produisaient",
    surNotes > 0 && surParts === 0,
    `notes : ${surNotes} · proportions : ${surParts}`
  );
}

{
  // Le cas de la spec, refait sur des vecteurs nus : une euclidienne couronnerait le
  // vecteur tiède. C'est le comportement que la corrélation doit éliminer.
  const prospect = [4, 5, 4, 3, 4];
  const pointu = [1, 5, 1, 1, 2];
  const tiede = [3, 3, 4, 3, 2];
  const euclid = (a, b) => Math.sqrt(a.reduce((s, x, i) => s + (x - b[i]) ** 2, 0));
  verifier(
    "l'euclidienne préfère le vecteur tiède, la corrélation préfère le vecteur pointu",
    euclid(prospect, tiede) < euclid(prospect, pointu) && correlation(prospect, pointu) > correlation(prospect, tiede),
    `euclid : ${euclid(prospect, pointu).toFixed(2)} vs ${euclid(prospect, tiede).toFixed(2)} · r : ${correlation(prospect, pointu).toFixed(2)} vs ${correlation(prospect, tiede).toFixed(2)}`
  );
}

/* ── 4. axes_fiables : accessible, jamais classé ──────────────── */

console.log(`\n  Programmes aux axes non fiables\n`);

const nonFiables = contexte.fiches.filter((f) => f.axes_fiables !== true);
verifier(`${nonFiables.length} fiche(s) portent axes_fiables: false`, nonFiables.length > 0);

{
  const { classees, ecartees } = classer(
    Object.fromEntries(axes.map((a, i) => [a, i])),
    contexte.fiches,
    { axes, seuils }
  );
  verifier(
    "aucune fiche non fiable dans le classement",
    classees.every((c) => c.fiche.axes_fiables === true),
    classees.filter((c) => c.fiche.axes_fiables !== true).map((c) => c.fiche.id).join(", ")
  );
  verifier(
    "toutes les fiches non fiables ressortent à part, avec leur raison",
    ecartees.length === nonFiables.length && ecartees.every((e) => e.raison),
    `${ecartees.length} écartées pour ${nonFiables.length} non fiables`
  );
  verifier("aucune fiche perdue entre les deux listes", classees.length + ecartees.length === contexte.fiches.length);
}

{
  // Un axes_fiables absent doit se lire comme false : l'absence signifie « non évalué ».
  const bricolee = { ...contexte.fiches[0] };
  delete bricolee.axes_fiables;
  const { classees, ecartees } = classer(Object.fromEntries(axes.map((a, i) => [a, i])), [bricolee], { axes, seuils });
  verifier(
    "axes_fiables absent se lit comme false, jamais comme true",
    !classees.length && ecartees.length === 1 && /non évalué/.test(ecartees[0].raison),
    ecartees[0]?.raison
  );
}

verifier(
  "les non classables sont présentés avec une mention lisible par un prospect",
  r1.sans_classement.every((f) => f.mention && f.nom && f.raison),
  JSON.stringify(r1.sans_classement[0] || null)
);

/* ── 4 bis. Un seul candidat : le classement n'a plus d'objet ──────
 * Quand les filtres ne laissent qu'un programme, il n'y a rien à comparer. Le noter est au
 * mieux inutile ; sur un `axes_fiables: false` c'est nuisible, parce qu'il part en zone non
 * classée et que le prospect lit qu'on ne sait pas comparer ce programme à son profil —
 * alors que c'est sa SEULE option. C'est la faute la plus dure à voir, parce que l'écran
 * paraît fonctionner.
 * ─────────────────────────────────────────────────────────── */

console.log(`\n  Candidat unique\n`);

{
  const F = contexte.questions.filtres;
  const A1 = contexte.questions.aiguillage.find((q) => q.cible === "famille");
  const cas = [];
  for (let i = 0; i < F[0].options.length; i++) {
    for (let j = 0; j < F[1].options.length; j++) {
      for (let k = 0; k < A1.options.length; k++) {
        let e = demarrer(contexte);
        e = repondre(e, F[0].id, i, contexte);
        e = repondre(e, F[1].id, j, contexte);
        e = repondre(e, A1.id, k, contexte);
        const jeu = candidates(e, contexte);
        if (jeu.retenues.length === 1) cas.push({ etat: e, fiche: jeu.retenues[0] });
      }
    }
  }

  verifier(`${cas.length} combinaison(s) de filtres ne laissent qu'un programme`, cas.length > 0);

  const resultats = cas.map((c) => resultat(c.etat, contexte));
  verifier(
    "un candidat unique sort toujours en recommandation",
    resultats.every((r) => r.recommandation && r.sans_classement.length === 0),
    resultats.filter((r) => !r.recommandation).length + " sans recommandation"
  );
  verifier(
    "l'écran le dit en un état distinct, pas sous un palier de correspondance emprunté",
    resultats.every((r) => r.niveau === "unique" && r.parcours.candidat_unique === true),
    [...new Set(resultats.map((r) => r.niveau))].join(", ")
  );
  verifier(
    "aucun score n'a été calculé : il n'y avait rien à comparer",
    resultats.every((r) => r.recommandation._score === null),
    JSON.stringify(resultats.map((r) => r.recommandation._score).slice(0, 3))
  );
  verifier(
    "aucun départage, aucune alternative : il n'y a rien d'autre",
    resultats.every((r) => !r.departage.declenche && r.alternatives.length === 0),
    resultats.filter((r) => r.departage.declenche).length + " départagé(s)"
  );
  // Le profil n'a joué aucun rôle : rouvrir les questions de profil ne changerait rien, ce
  // sont les filtres qui ont réduit le jeu à un seul programme.
  verifier(
    "le bouton Reprendre rouvre les filtres, pas le profil",
    resultats.every((r) => r.reprise === "filtres"),
    [...new Set(resultats.map((r) => r.reprise))].join(", ")
  );

  // Le cas qui motive tout ceci : un programme dont les axes ne sont pas fiables et qui est
  // pourtant la seule option. Il doit être recommandé comme un autre.
  const avecNonFiable = cas.filter((c) => c.fiche.axes_fiables !== true);
  verifier(
    "un programme aux axes non fiables reste recommandé quand il est la seule option",
    avecNonFiable.length === 0 ||
      avecNonFiable.every((c) => resultat(c.etat, contexte).recommandation?.id === c.fiche.id),
    `${avecNonFiable.length} cas concerné(s)`
  );
  // Ce contrôle n'a de valeur que si le cas existe : sans lui, la ligne ci-dessus passerait
  // en ne vérifiant rien. On le dit plutôt que de le supposer.
  verifier(
    "et ce cas existe bien dans le catalogue, sinon le contrôle ne vérifie rien",
    avecNonFiable.length > 0,
    avecNonFiable.map((c) => c.fiche.id).join(", ")
  );
}

/* ── 5. Filtres : ils excluent, ils ne notent pas ─────────────── */

console.log(`\n  Filtres durs\n`);

verifier("un bac+3 accède à ce qui n'exige que le bac", accessible({ niveau_acces: "bac" }, "bac+3").ok);
verifier("un bac n'accède pas à ce qui exige un bac+3", !accessible({ niveau_acces: "bac+3" }, "bac").ok);
verifier(
  "un niveau_acces absent n'exclut pas, il rend incertain",
  accessible({ niveau_acces: null }, "bac").ok === true && accessible({ niveau_acces: null }, "bac").incertain === true
);

{
  const { retenues, exclues } = appliquerFiltres(contexte.fiches, { niveau_acces: "bac", modalites: "en-ligne" });
  verifier(
    "le filtre réduit et rend compte de ce qu'il a écarté",
    retenues.length > 0 && retenues.length < contexte.fiches.length && exclues.every((e) => e.motif),
    `${retenues.length} retenues, ${exclues.length} exclues`
  );
  verifier(
    "aucune retenue ne contredit le filtre de modalité",
    retenues.every((f) => !f.modalites?.length || f.modalites.includes("en-ligne"))
  );
  verifier("aucune fiche perdue par les filtres", retenues.length + exclues.length === contexte.fiches.length);
}

/* ── 6. Aiguillage ────────────────────────────────────────────── */

console.log(`\n  Aiguillage par famille\n`);

{
  const index = familleParDomaine(contexte.taxonomie);
  verifier(
    "chaque fiche relève d'au moins une famille",
    contexte.fiches.every((f) => famillesDeFiche(f, index).length >= 1),
    contexte.fiches.filter((f) => !famillesDeFiche(f, index).length).map((f) => f.id).join(", ")
  );
  const deux = contexte.fiches.filter((f) => famillesDeFiche(f, index).length === 2);
  verifier(`${deux.length} fiches relèvent de deux familles, par leurs deux domaines`, deux.length > 0);

  const famille = contexte.taxonomie.familles[0].id;
  const { retenues, alertes } = aiguiller(contexte.fiches, famille, contexte.taxonomie);
  verifier(
    `l'aiguillage sur ${famille} réduit le jeu candidat`,
    retenues.length > 0 && retenues.length < contexte.fiches.length,
    `${retenues.length} / ${contexte.fiches.length}`
  );
  verifier("aucun domaine orphelin de famille", !alertes.length, alertes.join(" ; "));
  verifier(
    "sans aiguillage, rien n'est retiré",
    aiguiller(contexte.fiches, null, contexte.taxonomie).retenues.length === contexte.fiches.length
  );
}

/* ── Second étage d'aiguillage, conditionnel ─────────────────────
 * Une famille qui porte 39 % du catalogue ne réduit rien à elle seule : la simulation
 * mesurait 17,8 filières encore en lice contre 4,0 pour la plus petite famille. Les
 * autres familles n'ont pas besoin de ce second étage et ne doivent pas le subir.
 * ─────────────────────────────────────────────────────────────── */

const questionsFines = (contexte.questions.aiguillage || []).filter((q) => q.cible === "domaines");
verifier(`${questionsFines.length} question(s) d'aiguillage fin, conditionnée(s) par une famille`, questionsFines.length >= 1);

verifier(
  "aucun domaine de la famille visée n'est inatteignable",
  !domainesInatteignables(contexte.questions, contexte.taxonomie).length,
  domainesInatteignables(contexte.questions, contexte.taxonomie).join(" ; ")
);

for (const qf of questionsFines) {
  const cible = qf.si.famille;
  const autre = contexte.taxonomie.familles.map((f) => f.id).find((f) => f !== cible);
  const qA1 = contexte.questions.aiguillage.find((q) => q.cible === "famille");

  // Les filtres d'abord : `prochaineQuestion` les sert avant l'aiguillage, et un état
  // qui les aurait sautés testerait autre chose que ce qu'on croit.
  //
  // On prend le niveau d'accès qui laisse le PLUS de filières dans la famille : c'est là
  // que l'engorgement se joue et que le second étage doit prouver qu'il réduit. À un
  // niveau restrictif la famille est déjà petite, et le test passerait sans rien montrer.
  const qNiveau = contexte.questions.filtres.find((q) => q.filtre === "niveau_acces");
  const flexible = contexte.questions.filtres.filter((q) => q !== qNiveau);
  let apresFiltres = null;
  let plusLarge = -1;
  for (let i = 0; i < qNiveau.options.length; i++) {
    let e = repondre(demarrer(contexte), qNiveau.id, i, contexte);
    for (const q of flexible) {
      const j = q.options.findIndex((o) => o.valeur === null);
      e = repondre(e, q.id, j >= 0 ? j : 0, contexte);
    }
    const avecFamille = repondre(e, qA1.id, qA1.options.findIndex((o) => o.valeur === cible), contexte);
    const n = candidates(avecFamille, contexte).retenues.length;
    if (n > plusLarge) {
      plusLarge = n;
      apresFiltres = e;
    }
  }
  const etatCible = repondre(apresFiltres, qA1.id, qA1.options.findIndex((o) => o.valeur === cible), contexte);
  const etatAutre = repondre(apresFiltres, qA1.id, qA1.options.findIndex((o) => o.valeur === autre), contexte);

  verifier(
    `${qf.id} est posée à ${cible}`,
    questionApplicable(qf, etatCible, contexte) && prochaineQuestion(etatCible, contexte).question.id === qf.id
  );
  verifier(
    `${qf.id} n'est PAS posée à ${autre} — les autres familles ne subissent pas la question`,
    !questionApplicable(qf, etatAutre, contexte) && prochaineQuestion(etatAutre, contexte).question.id !== qf.id
  );

  // Une réponse à une question non applicable ne doit rien restreindre : sinon un état
  // bricolé à la main pourrait filtrer les domaines d'une famille jamais interrogée.
  const bricole = { ...etatAutre, reponses: { ...etatAutre.reponses, [qf.id]: 0 } };
  verifier(
    `une réponse à ${qf.id} est ignorée quand la question ne s'applique pas`,
    candidates(bricole, contexte).domaines === null &&
      candidates(bricole, contexte).retenues.length === candidates(etatAutre, contexte).retenues.length
  );

  // L'effet mesurable : chaque option réduit, ou revient à la famille en le disant.
  const sansFin = candidates(etatCible, contexte).retenues.length;
  const effets = qf.options.map((o, i) => {
    const e = repondre(etatCible, qf.id, i, contexte);
    const j = candidates(e, contexte);
    return { label: o.label, n: j.retenues.length, alertes: j.alertes };
  });
  verifier(
    `${qf.id} réduit le jeu candidat sur la majorité de ses options`,
    effets.filter((x) => x.n < sansFin).length >= Math.ceil(qf.options.length / 2),
    effets.map((x) => `${x.n}/${sansFin}`).join(" ")
  );
  verifier(
    "aucune option ne vide le jeu en silence : on revient à la famille en le disant",
    effets.every((x) => x.n > 0 && (x.n < sansFin || x.alertes.some((a) => /retour à la famille/.test(a)) || x.n === sansFin)),
    effets.filter((x) => !x.n).map((x) => x.label).join(" ; ")
  );
  const revenues = effets.filter((x) => x.alertes.some((a) => /retour à la famille/.test(a)));
  verifier(
    `${revenues.length} option(s) sans filière accessible reviennent à la famille avec une alerte`,
    revenues.every((x) => x.n === sansFin),
    revenues.map((x) => x.label).join(" ; ")
  );
}

/* ── 7. Départage ─────────────────────────────────────────────── */

console.log(`\n  Départage\n`);

verifier(
  "le départage rend un étage connu de la cascade",
  !r1.departage.declenche || ETAGES.includes(r1.departage.etage),
  r1.departage.etage
);
verifier(
  "chaque étage franchi sans rien produire laisse son motif",
  !r1.departage.declenche || r1.departage.essais.every((e) => e.etage && e.motif),
  JSON.stringify(r1.departage.essais)
);
verifier(
  "l'étage disposition ne peut pas trancher tant que rien n'est collecté",
  r1.departage.etage !== "disposition",
  r1.departage.etage
);

{
  // La cascade, étage par étage, sur des fiches construites pour l'occasion : c'est le
  // seul moyen de vérifier l'ORDRE, que les vraies données ne permettent pas d'exercer
  // (aucune question rédigée n'existe encore, aucune disposition n'est collectée).
  const fiche = (id, opts = {}) => ({
    id,
    nom: `Programme ${id}`,
    domaines: ["d1"],
    axes_fiables: true,
    distinctivite: { metiers_exclusifs: [], modules_exclusifs: [] },
    ...opts,
  });
  const paire = (a, b) => [{ fiche: a, score: 0.9 }, { fiche: b, score: 0.89 }];
  const sansRien = { departages: { paires: [] }, profilDisposition: null, domainesAxes: { domaines: {} }, axesDispo: dispo };

  const a = fiche("a", { distinctivite: { metiers_exclusifs: ["Juriste d'entreprise"], modules_exclusifs: ["Droit fiscal"] } });
  const b = fiche("b", { distinctivite: { metiers_exclusifs: ["Clerc de notaire"], modules_exclusifs: ["Droit notarial"] } });

  const parMetiers = cascadeDepartage(paire(a, b), sansRien);
  verifier(
    "étage 2 : la question se génère depuis les métiers exclusifs",
    parMetiers.etage === "metiers" && /Juriste d'entreprise/.test(parMetiers.question.question),
    parMetiers.question?.question
  );
  verifier(
    "elle est situationnelle, pas une liste de métiers affichée",
    /^Un mardi ordinaire, tu te vois plutôt /.test(parMetiers.question.question)
  );
  verifier(
    "chaque réponse pointe vers une filière",
    parMetiers.question.reponses.length === 2 &&
      parMetiers.question.reponses.every((r) => [a.id, b.id].includes(r.vers))
  );
  verifier("la question générée se déclare comme telle", parMetiers.question.genere === true && /catalogue/.test(parMetiers.question.source));

  // Métiers vides d'un seul côté : on descend, on ne fabrique pas une demi-question.
  const bSansMetier = fiche("b", { distinctivite: { metiers_exclusifs: [], modules_exclusifs: ["Droit notarial"] } });
  const parModules = cascadeDepartage(paire(a, bSansMetier), sansRien);
  verifier(
    "étage 3 : métiers vides d'un côté → on passe aux modules exclusifs",
    parModules.etage === "modules" && /Droit fiscal/.test(parModules.question.question),
    parModules.question?.question
  );

  const rien = cascadeDepartage(paire(fiche("a"), fiche("b")), sansRien);
  verifier(
    "étage 5 : sans exclusivité ni disposition, on affiche à égalité",
    rien.etage === "egalite" && rien.question === null
  );
  verifier(
    "et les quatre étages franchis ont chacun laissé leur motif",
    rien.essais.length === 4 && rien.essais.every((e) => e.motif),
    JSON.stringify(rien.essais.map((e) => e.etage))
  );

  // Une question rédigée en entretien bat tout le reste : c'est un humain qui l'a écrite.
  const redigee = {
    paires: [{ entre: ["a", "b"], question: "Rédigée en entretien ?", reponses: [{ label: "A", vers: "a" }] }],
  };
  const avecRedigee = cascadeDepartage(paire(a, b), { ...sansRien, departages: redigee });
  verifier(
    "étage 1 : une question rédigée passe devant les questions générées",
    avecRedigee.etage === "question-redigee" && avecRedigee.question.question === "Rédigée en entretien ?"
  );

  // Deux options du même programme : le nom de l'option tranche, aucune question générée.
  const s1 = fiche("s1", { option: "Comptabilité", programme_parent: "p", distinctivite: { metiers_exclusifs: ["Comptable"], modules_exclusifs: [] } });
  const s2 = fiche("s2", { option: "Ressources humaines", programme_parent: "p", distinctivite: { metiers_exclusifs: ["Gestionnaire de paie"], modules_exclusifs: [] } });
  const soeurs = cascadeDepartage(paire(s1, s2), sansRien);
  verifier(
    "deux options sœurs : on affiche les deux noms, sans question générée",
    soeurs.etage === "option-soeurs" &&
      soeurs.question.reponses.map((r) => r.label).join("|") === "Comptabilité|Ressources humaines",
    soeurs.question?.question
  );

  // La disposition, le jour où elle sera collectée.
  const c1 = fiche("c1", { domaines: ["dx"] });
  const c2 = fiche("c2", { domaines: ["dy"] });
  const avecDispo = cascadeDepartage(paire(c1, c2), {
    departages: { paires: [] },
    profilDisposition: { [dispo[0]]: 5, [dispo[1]]: 1 },
    domainesAxes: { domaines: { dx: { [dispo[0]]: 5, [dispo[1]]: 1 }, dy: { [dispo[0]]: 1, [dispo[1]]: 5 } } },
    axesDispo: dispo,
  });
  verifier(
    "étage 4 : la disposition réordonne quand elle est collectée",
    avecDispo.etage === "disposition" && avecDispo.ordonnees[0].fiche.id === "c1",
    avecDispo.ordonnees?.map((c) => c.fiche.id).join(", ")
  );
}

{
  // Les libellés viennent de l'extraction : quelques artefacts doivent être écartés,
  // sur des critères génériques et sans jamais reformuler un intitulé.
  const rejetes = [
    "Le titulaire de la Licence peut occuper les fonctions suivantes :",
    "Aministrations… École de Droit",
    "Président Directeur Général Directeur d'entreprise Cadre supérieur Directeur Fonctionnel",
    "abc",
    "juriste sans capitale",
  ];
  verifier(
    "les artefacts d'extraction sont écartés des libellés utilisables",
    rejetes.every((s) => !libelleUtilisable(s)),
    rejetes.filter((s) => libelleUtilisable(s)).join(" ; ")
  );
  verifier(
    "les vrais intitulés de poste passent",
    ["Actuaire", "Clerc de notaire", "Concepteur de systèmes embarqués", "Chargé de clientèle"].every(libelleUtilisable)
  );
  verifier(
    "on retient le libellé le plus lisible, pas le premier du tableau",
    libellesUtilisables(["Analyste (junior/senior) 2024", "Clerc de notaire"])[0] === "Clerc de notaire"
  );
}
verifier(
  "aucun domaine n'a encore ses axes de disposition — le fichier de collecte est vide",
  contexte.fiches.every((f) => dispositionDeFiche(f, contexte.domainesAxes, dispo) === null)
);
{
  // Le jour où la collecte arrive, la moyenne des domaines doit s'appliquer.
  const faux = { domaines: { a: { ancrage: 2, abstraction: 4 }, b: { ancrage: 4, abstraction: 2 } } };
  const d = dispositionDeFiche({ domaines: ["a", "b"] }, faux, ["ancrage", "abstraction"]);
  verifier("une fiche à deux domaines prend la moyenne simple de leurs dispositions", d.ancrage === 3 && d.abstraction === 3);
  verifier(
    "un seul domaine non collecté suffit à invalider la disposition d'une fiche",
    dispositionDeFiche({ domaines: ["a", "inconnu"] }, faux, ["ancrage", "abstraction"]) === null ||
      dispositionDeFiche({ domaines: ["a", "b", "c"] }, { domaines: { ...faux.domaines, c: { ancrage: null, abstraction: 1 } } }, ["ancrage", "abstraction"]) === null
  );
}

{
  const profil = Object.fromEntries(axes.map((a, i) => [a, i * 2]));
  const { classees } = classer(profil, contexte.fiches, { axes, seuils });
  const t = tete(classees, seuils);
  verifier(
    "la tête regroupe toutes les filières à moins d'un écart déclenchant",
    t.length >= 1 && t.every((c) => classees[0].score - c.score < seuils.ecart_declenchant_departage)
  );
}

/* ── 8. Reformulation ─────────────────────────────────────────── */

console.log(`\n  Reformulation\n`);

verifier("la reformulation est une phrase, pas une liste de notes", /^Si je comprends bien : /.test(r1.reformulation.phrase), r1.reformulation.phrase);
verifier("elle retient au plus 3 traits", r1.reformulation.traits.length <= 3, String(r1.reformulation.traits.length));
verifier("le bouton de reprise est fourni comme donnée, pas laissé à l'interface", Boolean(r1.reformulation.reprise));
verifier("elle ne contient aucun chiffre", !/\d/.test(r1.reformulation.phrase), r1.reformulation.phrase);
{
  const plat = Object.fromEntries(axes.map((a) => [a, 4]));
  const rf = reformuler(plat, axes);
  verifier("un profil sans trait marqué ne produit pas de phrase inventée", rf.phrase === "" && Boolean(rf.motif), rf.motif);
  verifier("les traits se mesurent en écart au profil, pas en valeur absolue", traitsMarquants(plat, axes).length === 0);
}

/* ── 9. Parcours : machine à états ────────────────────────────── */

console.log(`\n  Parcours\n`);

{
  const e0 = demarrer(contexte);
  const q0 = prochaineQuestion(e0, contexte);
  verifier("le parcours commence par un filtre dur, pas par une question de profil", q0.bloc === "filtres", q0.question.id);

  const e1 = repondre(e0, q0.question.id, 0, contexte);
  verifier("repondre ne modifie pas l'état reçu", Object.keys(e0.reponses).length === 0 && Object.keys(e1.reponses).length === 1);
  verifier("le profil de départ est nul sur tous les axes", axes.every((a) => e0.profil[a] === 0));

  let leve = false;
  try {
    repondre(e0, q0.question.id, 99, contexte);
  } catch {
    leve = true;
  }
  verifier("un indice d'option hors bornes est refusé, pas remplacé par un défaut", leve);

  leve = false;
  try {
    repondre(e0, "QUESTION-INEXISTANTE", 0, contexte);
  } catch {
    leve = true;
  }
  verifier("une question inconnue est refusée", leve);
}

verifier(
  `le parcours ne dépasse jamais ${MAX_QUESTIONS} questions`,
  etatFini.poses <= MAX_QUESTIONS,
  `${etatFini.poses} posées`
);
verifier("le parcours dit pourquoi il s'est arrêté", Boolean(etatFini.motifArret), etatFini.motifArret);

{
  // Déterminisme : deux exécutions des mêmes réponses doivent donner le même ordre.
  const a = jouer(partie, contexte).resultat;
  const b = jouer(partie, contexte).resultat;
  verifier(
    "les mêmes réponses donnent exactement le même résultat",
    JSON.stringify(a) === JSON.stringify(b)
  );
}

{
  // Arrêt anticipé : un jeu réduit à une seule filière n'a plus rien à départager.
  // Les réponses sont construites DEPUIS la fiche : un filtre qui l'exclurait ferait
  // passer le test pour la mauvaise raison (« aucune filière ne survit »).
  const seule = contexte.fiches.find((f) => f.axes_fiables === true && f.niveau_acces && f.modalites?.length);
  const ctxUn = { ...contexte, fiches: [seule] };
  const indexFamille = familleParDomaine(contexte.taxonomie);
  const familleDeLaFiche = famillesDeFiche(seule, indexFamille)[0];
  let e = demarrer(ctxUn);
  for (const q of ctxUn.questions.filtres) {
    const i =
      q.filtre === "niveau_acces"
        ? q.options.findIndex((o) => o.valeur === seule.niveau_acces)
        : q.options.findIndex((o) => o.valeur === null);
    e = repondre(e, q.id, i >= 0 ? i : 0, ctxUn);
  }
  for (const q of ctxUn.questions.aiguillage) {
    const i = q.options.findIndex((o) => o.valeur === familleDeLaFiche);
    e = repondre(e, q.id, i >= 0 ? i : 0, ctxUn);
  }
  const stop = doitSArreter(e, ctxUn);
  verifier(
    "le moteur s'arrête dès qu'une seule filière survit aux filtres",
    stop.arret && /une seule/.test(stop.motif),
    JSON.stringify(stop)
  );
}

verifier(
  "le résultat rend compte de l'entonnoir, il ne l'escamote pas",
  r1.parcours.filieres_au_depart >= r1.parcours.apres_filtres &&
    r1.parcours.apres_filtres >= r1.parcours.apres_aiguillage &&
    r1.parcours.apres_aiguillage >= r1.parcours.classees,
  JSON.stringify(r1.parcours)
);

verifier("1 recommandation et au plus 2 alternatives", Boolean(r1.recommandation) && r1.alternatives.length <= 2);
verifier(
  "la modalité est affichée : un même intitulé peut exister en présentiel et en ligne",
  [r1.recommandation, ...r1.alternatives].every((f) => Array.isArray(f.modalites))
);
verifier(
  "la justification vient du catalogue, pas d'une phrase générée",
  [r1.recommandation, ...r1.alternatives].every((f) => f.justification && Array.isArray(f.justification.modules))
);

/* ── 10. Cas limites ──────────────────────────────────────────── */

console.log(`\n  Cas limites\n`);

{
  const plat = Object.fromEntries(axes.map((a) => [a, 3]));
  const res = classer(plat, contexte.fiches.filter((f) => f.axes_fiables === true), { axes, seuils });
  verifier("un profil plat bascule sur les parts de budget", res.repli === true);
  verifier("et le repli est signalé, jamais silencieux", res.alertes.some((a) => /dégradé/.test(a)), res.alertes.join(" ; "));
  verifier("le repli produit tout de même un classement", res.classees.length > 0);
}

{
  const vide = Object.fromEntries(axes.map((a) => [a, 0]));
  const res = classer(vide, contexte.fiches, { axes, seuils });
  verifier("un profil vide ne classe rien et le dit", !res.classees.length && res.alertes.some((a) => /profil vide/.test(a)));
}

{
  const res = resultat(demarrer(contexte), contexte);
  verifier("un résultat demandé sans aucune réponse ne plante pas", res && res.recommandation === null);
}

/* ── 11. Contexte ─────────────────────────────────────────────── */

console.log(`\n  Cohérence du contexte\n`);

const ctrl = verifierContexte(contexte);
verifier("le contexte réel est servable", ctrl.ok, ctrl.problemes.join(" ; "));
{
  // Des seuils encore provisoires doivent être signalés à l'appelant : servir un
  // prospect sur des bornes jamais mesurées est un choix, pas un défaut à taire.
  const provisoire = { ...contexte, departages: { ...contexte.departages, _seuils: { ...seuils, _statut: "provisoire" } } };
  verifier(
    "des seuils encore provisoires sont signalés",
    verifierContexte(provisoire).avertissements.some((a) => /provisoires/.test(a))
  );
  verifier(
    "les seuils réels ne le sont plus : la simulation a tourné",
    !ctrl.avertissements.some((a) => /provisoires/.test(a)),
    contexte.departages._seuils._statut
  );
}
verifier(
  "l'absence de question de disposition est signalée",
  ctrl.avertissements.some((a) => /poids_disposition/.test(a))
);

{
  // Un seuil sur l'ancienne échelle 0-100 doit être refusé : le score est une corrélation.
  const faux = { ...contexte, departages: { _seuils: { correspondance_forte: 85, correspondance_bonne: 70, ecart_declenchant_departage: 5 } } };
  const c = verifierContexte(faux);
  verifier(
    "des seuils sur 0-100 sont refusés — le score n'est pas un pourcentage",
    !c.ok && c.problemes.some((p) => /corrélation, pas un pourcentage/.test(p)),
    c.problemes.join(" ; ")
  );
}

{
  const faux = { ...contexte, questions: { ...contexte.questions, profil: [{ id: "PX", options: [{ poids: { inexistant: 2 } }] }] } };
  const c = verifierContexte(faux);
  verifier("un poids visant un axe inconnu est détecté", c.problemes.some((p) => /axe inconnu/.test(p)));
}

{
  const faux = { ...contexte, questions: { ...contexte.questions, aiguillage: [{ id: "AX", cible: "famille", options: [{ valeur: "famille-fantome" }] }] } };
  const c = verifierContexte(faux);
  verifier("une option d'aiguillage vers une famille inexistante est détectée", c.problemes.some((p) => /famille inconnue/.test(p)));
}

console.log(echecs ? `\n  ${echecs} test(s) en échec sur ${verifs}\n` : `\n  ${verifs} tests passés.\n`);
process.exit(echecs ? 1 : 0);
