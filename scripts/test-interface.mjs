#!/usr/bin/env node
/**
 * test-interface.mjs — ce que l'écran de résultat refuse de faire.
 *
 *   npm run test:interface
 *
 * Les interdits de la spec sont ici des TESTS, pas des intentions : aucun score dans le DOM
 * produit, aucun nom de filière dans le source de l'interface, dégradation quand la donnée
 * manque, et les cinq états qui rendent sur des fiches réelles.
 *
 * Le rendu étant une fonction pure qui rend une chaîne, tout se vérifie en Node — sans
 * bibliothèque de DOM, donc sans dépendance ajoutée.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chargerContexte } from "../src/engine/charger.mjs";
import { jouer, resultat, demarrer, repondre, reprendreProfil, prochaineQuestion } from "../src/engine/moteur.mjs";
import { normaliser } from "../src/engine/texte.mjs";
import {
  rendreResultat,
  rendreQuestion,
  rendreDepartage,
  blocContenu,
  blocQuantitatif,
  blocAlternatives,
  blocNonClasses,
  lignesPourquoi,
  echapper,
  ORDRE_BLOCS,
  TEXTES,
} from "../src/ui/rendu.mjs";
import { versFragment, depuisFragment } from "../src/ui/etat-url.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

let ok = 0;
let ko = 0;
const verifier = (nom, condition, detail = "") => {
  if (condition) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    ko++;
    console.log(`  ✗ ${nom}${detail ? ` — ${detail}` : ""}`);
  }
};

const contexte = chargerContexte();
const HTML = fs.readFileSync(path.join(ROOT, "web", "index.html"), "utf8");
const RENDU = fs.readFileSync(path.join(ROOT, "src", "ui", "rendu.mjs"), "utf8");
const URLS = fs.readFileSync(path.join(ROOT, "src", "ui", "etat-url.mjs"), "utf8");
const SOURCE_INTERFACE = [HTML, RENDU, URLS].join("\n");

/**
 * Le source privé de ses commentaires — c'est sur lui que portent les interdits.
 *
 * Un commentaire qui EXPLIQUE pourquoi la modalité doit être visible cite forcément les deux
 * écoles concernées, et c'est exactement l'explication qu'une session future aura besoin de
 * lire. L'interdit porte sur le CODE : aucune branche, aucun test, aucun libellé en dur.
 */
const sansCommentaires = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/([^:])\/\/.*$/gm, "$1");

const CODE_INTERFACE = sansCommentaires(SOURCE_INTERFACE);

/* ── 1. Les cinq états rendent, sur des fiches réelles ────────── */

console.log(`\n  Les cinq états\n`);

/**
 * Un parcours réel qui aboutit à l'état demandé.
 *
 * Le tirage porte sur les RÉPONSES POSSIBLES aux questions, jamais sur des vecteurs d'axes
 * fabriqués : un profil qu'aucune combinaison de réponses ne peut produire testerait un
 * écran qu'aucun prospect ne verra. Même principe que `scripts/simuler.mjs`.
 *
 * `egalite` ne concerne que 2 % des profils : une grille étroite ne le rencontre pas, et
 * conclure « inatteignable » serait faux. On énumère donc largement — les 4^7 combinaisons de
 * profil sont trop nombreuses croisées aux familles, mais un balayage déterministe suffit.
 */
function chercherEtat(vise) {
  const profil = contexte.questions.profil;
  const familles = contexte.questions.aiguillage.find((q) => q.cible === "famille").options.length;

  for (let motif = 0; motif < 400; motif++) {
    for (let f1 = 0; f1 < 4; f1++) {
      for (let a1 = 0; a1 < familles; a1++) {
        for (let a2 = 0; a2 < 5; a2++) {
          const reponses = { F1: f1, F2: 3, A1: a1, A2: a2 };
          // Un balayage déterministe de l'espace des réponses : chaque question prend une
          // base différente, ce qui parcourt les combinaisons sans les énumérer toutes.
          profil.forEach((q, i) => {
            reponses[q.id] = Math.floor(motif / Math.max(1, 4 ** i % 97)) % (q.options.length || 1);
          });
          const { resultat: r } = jouer(reponses, contexte);
          if (r.niveau === vise) return { reponses, resultat: r };
        }
      }
    }
  }
  return null;
}

const trouves = {};
for (const etat of Object.keys(ORDRE_BLOCS)) {
  const cas = chercherEtat(etat);
  trouves[etat] = cas;
  if (!cas) {
    verifier(`état « ${etat} » : un parcours réel y aboutit`, false, "aucune combinaison trouvée");
    continue;
  }
  const html = rendreResultat(cas.resultat);
  verifier(
    `état « ${etat} » rend sans erreur, sur une fiche réelle`,
    html.includes(`data-etat="${etat}"`) && html.length > 200,
    `${html.length} caractères`
  );
  verifier(
    `état « ${etat} » commence par la reformulation`,
    html.indexOf("bloc--reformulation") > 0 &&
      ORDRE_BLOCS[etat][0] === "reformulation",
    ORDRE_BLOCS[etat].join(" → ")
  );
}

// Le conseiller passe EN HAUT quand le moteur est moins sûr : c'est là que l'humain vaut
// mieux qu'un écran. Sur les états affirmés, il ferme la page.
for (const etat of ["possible", "impasse"]) {
  const blocs = ORDRE_BLOCS[etat];
  verifier(
    `état « ${etat} » : le conseiller passe avant le classement`,
    blocs.indexOf("conseiller") === 1,
    blocs.join(" → ")
  );
}
verifier(
  "état « bonne » : les alternatives passent avant le contenu",
  ORDRE_BLOCS.bonne.indexOf("alternatives") < ORDRE_BLOCS.bonne.indexOf("contenu"),
  ORDRE_BLOCS.bonne.join(" → ")
);
verifier(
  "état « possible » : le badge ne ressemble pas à un échec",
  !/faible|insuffisan|mauvais|échec/i.test(TEXTES.badge.possible),
  TEXTES.badge.possible
);
verifier(
  "état « egalite » : deux cartes, aucune n'est titrée « recommandation »",
  (() => {
    const cas = trouves.egalite;
    if (!cas) return false;
    const html = rendreResultat(cas.resultat);
    return html.includes("bloc--egalite") && !html.includes("bloc--reco");
  })()
);
verifier(
  "état « impasse » : l'écran dit ce qui s'est passé, il n'élargit pas en silence",
  /aucun programme ne réunit/i.test(TEXTES.posture.impasse)
);

/* ── 2. Aucun score, nulle part ────────────────────────────────── */

console.log(`\n  Aucun score dans le rendu\n`);

/** Toutes les valeurs numériques d'un objet, avec le chemin de leur clé. */
function nombres(valeur, chemin = "", sortie = []) {
  if (valeur == null) return sortie;
  if (typeof valeur === "number") sortie.push({ chemin, valeur });
  else if (Array.isArray(valeur)) valeur.forEach((v, i) => nombres(v, `${chemin}[${i}]`, sortie));
  else if (typeof valeur === "object") {
    for (const [cle, v] of Object.entries(valeur)) nombres(v, chemin ? `${chemin}.${cle}` : cle, sortie);
  }
  return sortie;
}

{
  const cas = trouves.forte || trouves.bonne || trouves.possible;
  const r = cas.resultat;
  const html = rendreResultat(r);

  // Les scores du résultat, tels qu'ils existent réellement. Aucun ne doit se retrouver
  // dans la page, sous aucune forme — ni en texte, ni en attribut, ni en commentaire.
  const scores = nombres(r)
    .filter(({ chemin }) => /score|correlation/i.test(chemin))
    .map(({ valeur }) => valeur);
  verifier("le résultat porte bien des scores à ne pas afficher", scores.length > 0, `${scores.length} trouvés`);

  const fuites = scores.filter((s) => {
    // Toutes les écritures plausibles d'un même score : brut, arrondi, en pourcentage.
    const formes = [String(s), s.toFixed(2), s.toFixed(1), String(Math.round(s * 100)), s.toFixed(4)];
    return formes.some((forme) => forme.length >= 3 && html.includes(forme));
  });
  verifier("aucune valeur de score n'apparaît dans le rendu", fuites.length === 0, fuites.join(", "));

  verifier("aucun pourcentage dans le rendu", !/\d\s*%/.test(html));
  verifier("aucun « /5 » ni note sur cinq", !/\/\s*5\b/.test(html));
  verifier("aucun commentaire HTML dans le rendu", !html.includes("<!--"));
  verifier(
    "aucune clé interne du moteur ne fuit en attribut",
    !html.includes("_score") && !/data-score/.test(html)
  );
  verifier(
    "les seuls nombres affichés sont des comptes de programmes ou de modules",
    // Un compte est un entier ; un score est un décimal. Aucun décimal ne doit sortir.
    !/\d+[.,]\d/.test(html.replace(/[\d.]+ ?ko/g, "")),
    (html.match(/\d+[.,]\d+/g) || []).join(" ")
  );
}

/* ── 3. Aucun vocabulaire de données dans le source ───────────── */

console.log(`\n  Aucun nom de filière dans le source de l'interface\n`);

{
  const source = normaliser(CODE_INTERFACE);
  const fuites = [];

  // Les identifiants courts se retrouvent dans n'importe quel mot — « isf » vit dans
  // « depuisFragment ». Même exclusion que pour le moteur, et même seuil.
  const assezLong = (s) => s.length >= 6;

  for (const f of contexte.fiches) {
    if (assezLong(f.id) && source.includes(normaliser(f.id))) fuites.push(`id ${f.id}`);
    const nom = normaliser(f.nom);
    if (nom.length >= 8 && source.includes(nom)) fuites.push(`nom ${f.nom}`);
  }
  for (const e of contexte.taxonomie.ecoles || []) {
    if (assezLong(e.nom) && source.includes(normaliser(e.nom))) fuites.push(`école ${e.nom}`);
    if (assezLong(e.id) && source.includes(normaliser(e.id))) fuites.push(`école ${e.id}`);
  }
  for (const d of contexte.taxonomie.domaines || []) {
    if (assezLong(d.id) && source.includes(normaliser(d.id))) fuites.push(`domaine ${d.id}`);
  }
  for (const fam of contexte.taxonomie.familles || []) {
    if (source.includes(normaliser(fam.id))) fuites.push(`famille ${fam.id}`);
    if (source.includes(normaliser(fam.label))) fuites.push(`famille ${fam.label}`);
  }

  verifier("aucun identifiant ni intitulé du catalogue dans le code de l'interface", fuites.length === 0, fuites.slice(0, 6).join(" · "));
  verifier("l'interface ne lit aucun seuil de score", !/correspondance_forte|ecart_declenchant|_seuils/.test(CODE_INTERFACE));
  // `exigence_quantitative` est un champ du résultat que l'écran doit lire : ce n'est pas
  // l'axe compté du même nom. Ce sont les axes eux-mêmes qui n'ont rien à y faire.
  verifier(
    "l'interface ne touche pas aux axes ni à la métrique",
    !/axes_parts|axes_fiables|\bcorrelation\b|vecteurFiliere|niveauCorrespondance/.test(CODE_INTERFACE)
  );
}

/* ── 4. Aucune dépendance, aucun script tiers, aucun stockage ─── */

console.log(`\n  Contraintes techniques\n`);

verifier("aucun localStorage ni cookie", !/localStorage|sessionStorage|document\.cookie/.test(CODE_INTERFACE));
verifier(
  "aucun script tiers, aucune ressource externe",
  !/https?:\/\//.test(HTML.replace(/<html lang="fr">/, "")),
  (HTML.match(/https?:\/\/[^"'\s)]+/g) || []).join(" ")
);
verifier("aucune police à télécharger", !/@font-face|fonts\.google/.test(HTML));
verifier("aucune dépendance importée hors du dépôt", (() => {
  const imports = [...CODE_INTERFACE.matchAll(/from\s+["']([^"']+)["']/g)].map((m) => m[1]);
  return imports.length > 0 && imports.every((i) => i.startsWith("."));
})());
verifier("les polices sont celles du système", /system-ui/.test(HTML));
verifier("une seule colonne, largeur bornée", /max-width/.test(HTML));
verifier("la page déclare le viewport mobile", /name="viewport"/.test(HTML));

{
  const octets = Buffer.byteLength(HTML, "utf8");
  verifier(`le fichier HTML pèse moins de 50 ko`, octets < 50 * 1024, `${(octets / 1024).toFixed(1)} ko`);
}

verifier(
  "le rendu ne touche jamais au DOM : il rend des chaînes, donc il se teste",
  !/document\.|window\.|innerHTML/.test(RENDU)
);
verifier("aucune dépendance ajoutée pour l'interface", (() => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return Object.keys(pkg.dependencies || {}).length === 3;
})());

/* ── 5. Dégradation : jamais un cadre vide ─────────────────────── */

console.log(`\n  Dégradation\n`);

{
  const nue = { id: "x", nom: "N", vitrine: {}, modules_distinctifs: [], metiers: [], deconseille_si: [] };
  verifier("une fiche sans accroche, sans module et sans métier ne rend aucun bloc", blocContenu(nue) === "");
  verifier(
    "une fiche sans accroche mais avec des modules rend les modules",
    blocContenu({ ...nue, modules_distinctifs: ["Un module"] }).includes("Un module")
  );
  verifier(
    "une fiche sans module rend les métiers seuls",
    (() => {
      const html = blocContenu({ ...nue, metiers: ["Un métier"] });
      return html.includes("Un métier") && !html.includes("class=\"modules\"");
    })()
  );
  verifier(
    "une accroche présente passe avant les modules",
    (() => {
      const html = blocContenu({ ...nue, vitrine: { accroche: "Une accroche" }, modules_distinctifs: ["Un module"] });
      return html.indexOf("Une accroche") < html.indexOf("Un module");
    })()
  );
  verifier(
    "deconseille_si absent ne laisse pas de cadre",
    !blocContenu({ ...nue, modules_distinctifs: ["M"] }).includes("deconseille")
  );

  verifier(
    "l'avertissement quantitatif est absent quand aucun module n'est compté",
    blocQuantitatif({ ...nue, exigence_quantitative: { modules_comptes: 0 } }) === ""
  );
  verifier(
    "il est présent dès qu'un module est compté, sur un ton informatif",
    (() => {
      const html = blocQuantitatif({ ...nue, exigence_quantitative: { modules_comptes: 9, modules_exemples: [] } });
      // Informatif se prouve par ce que le texte AFFIRME — « une information à connaître » —
      // et non par l'absence d'une liste de mots, qui interdirait de dire « pas un obstacle ».
      return html.includes("9") && /information à conna/i.test(html) && !/difficile|niveau requis/i.test(html);
    })()
  );

  verifier("aucune alternative ne rend aucun bloc", blocAlternatives([]) === "");
  verifier(
    "une alternative sans différenciateur n'affiche que son nom",
    (() => {
      const html = blocAlternatives([{ ...nue, differenciateur: null }]);
      return html.includes("N") && !html.includes("differenciateur");
    })()
  );
  verifier(
    "un différenciateur est cité tel quel, jamais reformulé",
    blocAlternatives([{ ...nue, differenciateur: { source: "modules", valeur: "Produits dérivés" } }]).includes(
      "Produits d&#233;riv&#233;s".replace(/&#\d+;/g, (m) => ({ "&#233;": "é" })[m] || m)
    ) ||
      blocAlternatives([{ ...nue, differenciateur: { source: "modules", valeur: "Produits derives" } }]).includes(
        "Produits derives"
      )
  );
  verifier("aucun non-classé ne rend aucun bloc", blocNonClasses([]) === "");
  verifier(
    "les non-classés attribuent le manque à la brochure, pas au programme",
    /brochure/i.test(TEXTES.nonClasses) && !/moins bon|faible|médiocre/i.test(TEXTES.nonClasses)
  );

  // Le « pourquoi » omet une ligne dont la donnée manque, au lieu de l'inventer.
  verifier("le pourquoi n'invente aucune ligne", lignesPourquoi({}).length === 0);
  verifier(
    "le pourquoi rend trois lignes quand la chaîne est complète",
    lignesPourquoi({
      famille_label: "Un univers",
      sous_famille: "Un registre",
      candidats_apres_filtres: 40,
      candidats_apres_aiguillage: 9,
      element_tranchant: { source: "metiers", valeurs: ["A", "B"] },
    }).length === 3
  );
  verifier(
    "la troisième ligne change de formulation selon l'étage qui a tranché",
    (() => {
      const base = { famille_label: "U", candidats_apres_filtres: 1 };
      const m = lignesPourquoi({ ...base, element_tranchant: { source: "metiers", valeurs: ["A", "B"] } })[2];
      const mod = lignesPourquoi({ ...base, element_tranchant: { source: "modules", valeurs: ["A"] } })[2];
      const s = lignesPourquoi({ ...base, element_tranchant: { source: "option-soeurs", valeurs: ["A", "B"] } })[2];
      return new Set([m, mod, s]).size === 3;
    })()
  );
}

/* ── 6. Échappement ───────────────────────────────────────────── */

console.log(`\n  Échappement\n`);

verifier("les chevrons et les guillemets sont échappés", echapper('<a href="x">&') === "&lt;a href=&quot;x&quot;&gt;&amp;");
verifier(
  "un libellé de catalogue hostile ne casse pas la page",
  !blocAlternatives([{ id: "x", nom: '<script>alert(1)</script>', modalites: [] }]).includes("<script>")
);
/**
 * Plutôt que de deviner par expression régulière quelle interpolation est enveloppée, on
 * fait passer une charge hostile dans CHAQUE champ de données d'un résultat complet et on
 * vérifie qu'aucune balise n'en ressort. C'est le seul test qui prouve quelque chose : une
 * relecture de regex laisserait passer le champ ajouté demain.
 */
{
  const CHARGE = '<script>alert("x")</script>';
  const empoisonner = (valeur) => {
    if (typeof valeur === "string") return CHARGE;
    if (Array.isArray(valeur)) return valeur.length ? valeur.map(empoisonner) : [CHARGE];
    if (valeur && typeof valeur === "object") {
      return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, empoisonner(v)]));
    }
    return valeur;
  };

  const fuites = [];
  for (const [etat, cas] of Object.entries(trouves)) {
    if (!cas) continue;
    const empoisonne = { ...empoisonner(cas.resultat), niveau: etat };
    const html = rendreResultat(empoisonne);
    if (html.includes("<script>") || html.includes(CHARGE)) fuites.push(etat);
  }
  verifier(
    "aucune donnée n'échappe à l'échappement, sur les cinq états",
    fuites.length === 0,
    fuites.join(", ")
  );

  const q = { id: CHARGE, question: CHARGE, aide: CHARGE, options: [{ label: CHARGE }] };
  verifier(
    "l'écran de question échappe aussi",
    !rendreQuestion({ question: q, posees: 0, plafond: 12 }).includes("<script>")
  );
  verifier(
    "la question de départage échappe aussi",
    !rendreDepartage({ question: { question: CHARGE, reponses: [{ label: CHARGE, vers: CHARGE }] } }).includes("<script>")
  );
}

/* ── 7. L'état survit à un aller-retour par l'URL ─────────────── */

console.log(`\n  Reprise par l'URL\n`);

{
  const reponses = { F1: 2, F2: 0, A1: 0, A2: 1, P1: 1, P2: 2, P3: 0, P4: 0, P5: 1, P6: 0, P7: 0 };
  const fragment = versFragment(reponses, "un-identifiant");
  const relu = depuisFragment("#" + fragment);
  verifier(
    "les réponses survivent à un aller-retour par le fragment",
    // Comparaison clé à clé : l'ordre des clés diffère par construction, le fragment étant
    // trié pour qu'une même URL sorte deux fois du même parcours.
    Object.keys(reponses).length === Object.keys(relu.reponses).length &&
      Object.entries(reponses).every(([id, i]) => relu.reponses[id] === i),
    fragment
  );
  verifier("la réponse de départage survit aussi", relu.departage === "un-identifiant");
  verifier("aucun état interne du moteur n'est sérialisé", !fragment.includes("profil") && !fragment.includes("axes"));
  verifier(
    "le fragment est stable : deux parcours identiques donnent la même URL",
    versFragment({ P2: 1, F1: 0 }) === versFragment({ F1: 0, P2: 1 })
  );
  verifier(
    "un fragment tronqué ne casse rien et signale ce qu'il ignore",
    (() => {
      const r = depuisFragment("#r=F1:2,CASSE,P1:x&z=1");
      // Trois entrées illisibles : « CASSE » sans indice, « P1:x » non entier, « z=1 » inconnue.
      return r.reponses.F1 === 2 && r.ignorees.length === 3 && r.reponses.P1 === undefined;
    })()
  );
  verifier("un fragment vide rend un parcours vide, sans réponse inventée", Object.keys(depuisFragment("").reponses).length === 0);

  // Le même résultat doit sortir des mêmes réponses : c'est ce que la reprise promet.
  const a = jouer(reponses, contexte).resultat;
  const b = jouer(depuisFragment("#" + fragment).reponses, contexte).resultat;
  verifier(
    "rejouer les réponses relues donne exactement le même résultat",
    a.recommandation?.id === b.recommandation?.id && a.niveau === b.niveau
  );
}

/* ── 8. Le bouton Reprendre ───────────────────────────────────── */

console.log(`\n  Le bouton Reprendre\n`);

{
  const reponses = { F1: 2, F2: 0, A1: 0, A2: 1, P1: 1, P2: 2, P3: 0, P4: 0, P5: 1, P6: 0, P7: 0 };
  const { etat } = jouer(reponses, contexte);
  const repris = reprendreProfil(etat, contexte);
  const idsProfil = contexte.questions.profil.map((q) => q.id);

  verifier(
    "il conserve les filtres et l'aiguillage",
    ["F1", "F2", "A1", "A2"].every((id) => repris.etat.reponses[id] === etat.reponses[id])
  );
  verifier(
    "il rouvre les seules questions de profil",
    idsProfil.every((id) => repris.etat.reponses[id] === undefined)
  );
  verifier(
    "les réponses précédentes sont rendues pour être pré-sélectionnées",
    idsProfil.every((id) => repris.precedentes[id] === etat.reponses[id])
  );
  verifier(
    "elles sont pré-sélectionnées, PAS réappliquées : le profil repart de zéro",
    Object.values(repris.etat.profil).every((v) => v === 0)
  );
  verifier("l'état reçu n'est pas modifié", etat.reponses.P1 === reponses.P1 && !etat.reponses.__touche);
  verifier(
    "la prochaine question posée est bien une question de profil",
    idsProfil.includes(prochaineQuestion(repris.etat, contexte)?.question.id)
  );
  verifier("le libellé du bouton vient de la donnée, pas de l'interface", Boolean(contexte.reformulation?.reprise));
}

/* ── 9. Le contrat du moteur ──────────────────────────────────── */

console.log(`\n  Le contrat exposé par le moteur\n`);

{
  const cas = trouves.forte || trouves.bonne || trouves.possible;
  const r = cas.resultat;
  const f = r.recommandation;

  verifier("niveau est l'un des cinq états", Object.keys(ORDRE_BLOCS).includes(r.niveau), r.niveau);
  verifier("le profil du prospect est exposé pour la reformulation", Object.keys(r.profil || {}).length === 5);
  verifier("la chaîne de décision porte le libellé de la famille, pas son id", Boolean(r.chaine.famille_label));
  verifier("la chaîne porte le nombre de candidats après filtres", Number.isFinite(r.chaine.candidats_apres_filtres));
  verifier("la chaîne porte l'élément tranchant", Boolean(r.chaine.element_tranchant));
  verifier("l'école est exposée avec son nom, pas seulement son id", Boolean(f.ecole_label));
  verifier("la modalité est exposée — un même intitulé existe en deux modalités", Array.isArray(f.modalites));
  verifier("les métiers sont exposés", Array.isArray(f.metiers));
  verifier("les modules distinctifs sont exposés", Array.isArray(f.modules_distinctifs));
  verifier("l'exigence quantitative expose son compte de modules", Number.isFinite(f.exigence_quantitative.modules_comptes));
  verifier("la vitrine est exposée, même vide", f.vitrine && "accroche" in f.vitrine);
  verifier("deconseille_si est exposé", Array.isArray(f.deconseille_si));
  verifier(
    "chaque alternative porte son différenciateur, généré ou nul",
    r.alternatives.every((a) => a.differenciateur === null || typeof a.differenciateur.valeur === "string")
  );
  verifier(
    "l'étage qui a tranché est exposé en rang et en nom",
    r.chaine.etage === null || (Number.isInteger(r.chaine.etage_resolveur) && typeof r.chaine.etage === "string")
  );

  // Le retour à la famille est un DRAPEAU, pas un texte d'alerte à reconnaître.
  verifier("le retour à la famille est exposé comme drapeau", typeof r.parcours.retour_famille === "boolean");

  // Les libellés lisibles viennent de la taxonomie : l'interface ne porte aucune table de
  // traduction, sinon elle vivrait en double et divergerait au premier renommage.
  verifier(
    "la modalité est exposée en libellé lisible, pas en identifiant",
    f.modalites.length === 0 || (f.modalites_labels.length === f.modalites.length && !f.modalites_labels.includes("presentiel"))
  );
  verifier("le niveau délivré est exposé en libellé", Boolean(f.niveau_label));
  verifier("le diplôme requis est exposé en libellé", f.niveau_acces === null || Boolean(f.niveau_acces_label));
  verifier(
    "les non-classés portent aussi le nom de leur école, pas son identifiant",
    r.sans_classement.every((n) => n.ecole === undefined || n.ecole_label !== undefined)
  );

  // Une alternative ne se présente jamais par un libellé que la recommandation vient
  // d'annoncer comme lui étant propre : l'écran se contredirait sous les yeux du prospect.
  {
    let collisions = 0;
    for (const cas of Object.values(trouves)) {
      if (!cas?.resultat?.recommandation) continue;
      const cites = new Set([
        ...(cas.resultat.chaine.element_tranchant?.valeurs || []),
        ...cas.resultat.recommandation.modules_distinctifs,
      ]);
      for (const a of cas.resultat.alternatives) {
        if (a.differenciateur && cites.has(a.differenciateur.valeur)) collisions++;
      }
    }
    verifier("aucune alternative ne reprend un libellé déjà cité par la recommandation", collisions === 0, `${collisions} collision(s)`);
  }
}

/* ── 10. Question et départage ─────────────────────────────────── */

console.log(`\n  Écran de question\n`);

{
  const q = contexte.questions.profil[0];
  const html = rendreQuestion({ question: q, posees: 3, plafond: 12 });
  verifier("chaque option est un bouton portant son indice", (html.match(/data-indice="\d+"/g) || []).length === q.options.length);
  verifier("aucune option n'est cochée par défaut", !html.includes("option--choisie"));
  verifier(
    "une réponse précédente est pré-sélectionnée quand on la fournit",
    rendreQuestion({ question: q, posees: 0, plafond: 12, choisie: 2 }).includes('data-indice="2"') &&
      rendreQuestion({ question: q, posees: 0, plafond: 12, choisie: 2 }).includes("option--choisie")
  );
  verifier("la progression est affichée", /Question 4 sur 12/.test(html));

  verifier("aucune question de départage ne rend rien", rendreDepartage(null) === "");
  {
    // Un départage réel : on cherche un profil qui le déclenche avec une question.
    let avecQuestion = null;
    for (const cas of Object.values(trouves)) {
      if (cas?.resultat?.departage?.question) { avecQuestion = cas.resultat; break; }
    }
    if (avecQuestion) {
      const dep = rendreDepartage(avecQuestion.departage);
      verifier(
        "la question de départage est situationnelle, pas une liste de métiers",
        /\?$/m.test(avecQuestion.departage.question.question) && dep.includes("data-vers"),
        avecQuestion.departage.question.question
      );
    } else {
      verifier("un parcours réel produit une question de départage", false, "aucun trouvé parmi les cas testés");
    }
  }
}

/* ── Bilan ────────────────────────────────────────────────────── */

console.log(`\n  ${ok} test(s) passés, ${ko} échec(s)\n`);
process.exit(ko ? 1 : 0);
