#!/usr/bin/env node
/**
 * test-extract.mjs — le filet de sécurité de la segmentation.
 *
 *   node scripts/test-extract.mjs      (aussi : npm test)
 *
 * Test de référence : la brochure Bachelor annonce page 13 « 4 écoles,
 * 26 possibilités » et énumère ses 26 programmes. Le script DOIT en produire
 * exactement 26. 24 ou 28 signifie que la segmentation est fausse — c'est le
 * seul moyen d'attraper une dérive de parsing sans relire 48 pages à la main.
 *
 * Le test ne touche pas data/filieres/ : l'extraction tourne en mémoire.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import addFormats from "ajv-formats";

import { extraire } from "./extract.mjs";
import { calculerDistinctivite, couvertureLexicale, MODULES_MIN, SEUIL_PAIRE } from "./distinctivite.mjs";
import { AXES, axesDunModule, cleParcours } from "./lib/fiche.mjs";
import { ARTEFACTS, empreinteSources } from "./lib/fraicheur.mjs";
import {
  construireManifeste,
  comparerManifestes,
  CHEMIN as CHEMIN_AFFECTATIONS,
  cheminPour as cheminAffectations,
  DOSSIER_FICHES,
} from "./lib/affectations.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const BROCHURES = path.join(ROOT, "data", "brochures");

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, "schema", "filiere.schema.json"), "utf8"));
const taxo = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "taxonomy.json"), "utf8"));
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const valider = ajv.compile(schema);

const ECOLES = new Set(taxo.ecoles.map((e) => e.id));
const DOMAINES = new Set(taxo.domaines.map((d) => d.id));

let echecs = 0;
let verifs = 0;

function verifier(intitule, condition, detail = "") {
  verifs++;
  if (condition) {
    console.log(`  ✓ ${intitule}`);
  } else {
    echecs++;
    console.log(`  ✗ ${intitule}${detail ? `\n      ${detail}` : ""}`);
  }
}

const trouver = (motif) => {
  const f = fs.existsSync(BROCHURES) ? fs.readdirSync(BROCHURES).find((n) => motif.test(n)) : null;
  return f ? path.join(BROCHURES, f) : null;
};

/* ── Fiches : conformité commune ──────────────────────────────── */

function verifierFiches(etiquette, fiches) {
  const invalides = [];
  for (const f of fiches) {
    const copie = { ...f };
    for (const k of Object.keys(copie)) if (k.startsWith("_")) delete copie[k];
    if (!valider(copie)) invalides.push(`${f.id} : ${valider.errors.map((e) => `${e.instancePath} ${e.message}`).join(", ")}`);
  }
  verifier(`${etiquette} — toutes les fiches respectent le schéma`, !invalides.length, invalides.slice(0, 5).join("\n      "));

  const horsTaxo = fiches.filter((f) => f.ecole && !ECOLES.has(f.ecole)).map((f) => `${f.id} → ${f.ecole}`);
  verifier(`${etiquette} — écoles dans la taxonomie`, !horsTaxo.length, horsTaxo.join(", "));

  const domHorsTaxo = fiches.flatMap((f) => (f.domaines || []).filter((d) => !DOMAINES.has(d)));
  verifier(`${etiquette} — domaines dans la taxonomie`, !domHorsTaxo.length, [...new Set(domHorsTaxo)].join(", "));

  const ids = fiches.map((f) => f.id);
  verifier(`${etiquette} — identifiants uniques`, new Set(ids).size === ids.length);

  const devine = fiches.filter((f) => f.eligibilite?.series_bac?.length);
  verifier(
    `${etiquette} — aucune série de bac inventée (absente des trois brochures)`,
    !devine.length,
    devine.map((f) => f.id).join(", ")
  );
}

/* ── Extraction unique, les trois catalogues ──────────────────── */

const bachelor = trouver(/bachelor/i);
if (!bachelor) {
  console.log("\n  ! ISM_bachelor_brochure.pdf absent de data/brochures/ — test de référence ignoré\n");
  process.exit(1);
}

const catalogues = [bachelor, trouver(/master/i), trouver(/online|isf/i)].filter(Boolean);
const resultats = await extraire({ fichiers: catalogues, ecrire: false });
const rBachelor = resultats.find((r) => r.chemin === bachelor);
const toutesFiches = resultats.flatMap((r) => r.fiches);

/* ── 1. Brochure Bachelor : 26 fiches, ni 24 ni 28 ────────────── */

console.log("\n  Brochure Bachelor — test de référence du sommaire\n");

verifier(
  "le sommaire p.13 énumère 26 programmes",
  rBachelor.sommaire.length === 26,
  `sommaire lu : ${rBachelor.sommaire.length}`
);
verifier(
  "l'extraction produit exactement 26 fiches",
  rBachelor.fiches.length === 26,
  `fiches produites : ${rBachelor.fiches.length}`
);

// Le motif est celui de l'appariement au sommaire, et lui seul : les autres alertes du
// journal (« ALERTE UE ») portent sur autre chose et ne doivent pas faire échouer ce
// contrôle-ci, sinon on finirait par relâcher le motif au lieu de corriger la cause.
const orphelins = rBachelor.journal.filter((l) => /^ALERTE p\.\d+/.test(l));
verifier("aucun programme de page absent du sommaire", !orphelins.length, orphelins.join("\n      "));

/* ── 1 bis. Le sommaire annonce aussi la modalité et le niveau d'accès ──
 * Format régulier : `Bachelor en Gestion (accessible après bac+2) full time`. Ces deux
 * informations étaient jusqu'ici captées PAR ACCIDENT — le titre brut de l'entrée était
 * concaténé dans le texte servi aux détecteurs. Une édition qui poserait la mention sur une
 * ligne séparée aurait fait disparaître la modalité sans aucune alerte.
 * ─────────────────────────────────────────────────────────── */
{
  const annotees = rBachelor.sommaire.filter((e) => e.niveauAcces || e.modalites?.length);
  verifier(
    "le sommaire livre niveau d'accès et modalité en champs, pas dans le titre",
    annotees.length >= 2,
    `${annotees.length} entrée(s) annotée(s)`
  );
  verifier(
    "le titre nu est conservé à part, sans la mention",
    annotees.every((e) => e.titreNu && !/accessible|full ?time|week-?end/i.test(e.titreNu)),
    annotees.map((e) => e.titreNu).join(" · ")
  );

  const parId = new Map(rBachelor.fiches.map((f) => [f.id, f]));

  // « Accessible après un bac+2, en semaine ou en WEEK-END » veut dire LES DEUX. Un choix
  // exclusif retirerait un programme réel du parcours d'un candidat qui travaille.
  const soir = parId.get("bachelor-professionnel-en-gestion");
  verifier(
    "« en semaine ou en week-end » produit les deux modalités, pas l'une ou l'autre",
    soir?.modalites.includes("presentiel") && soir?.modalites.includes("week-end"),
    JSON.stringify(soir?.modalites)
  );
  verifier(
    "et son niveau d'accès vient de la brochure, pas d'une inférence",
    soir?.niveau_acces === "bac+2" && soir?.meta.sources.niveau_acces === "brochure",
    `${soir?.niveau_acces} (${soir?.meta.sources.niveau_acces})`
  );

  // Annoncé `full time` au sommaire, et SANS page dédiée : c'est le cas où seul le sommaire
  // porte l'information. Une fiche squelette doit tout de même sortir avec sa modalité.
  const ft = parId.get("bachelor-en-gestion-full-time");
  verifier(
    "une entrée annoncée au sommaire sans page dédiée porte quand même sa modalité",
    ft?.modalites.includes("full-time"),
    JSON.stringify(ft?.modalites)
  );
  verifier(
    "et son niveau d'accès aussi",
    ft?.niveau_acces === "bac+2" && ft?.meta.sources.niveau_acces === "brochure",
    `${ft?.niveau_acces} (${ft?.meta.sources.niveau_acces})`
  );
}

/* ── 1 bis². Une UE dont l'intitulé n'est pas distingué typographiquement ──
 * La page du Bachelor Professionnel nomme ses UE par semestre — « UE semestre 1 », « UE
 * semestre 2 » — et les compose à la MÊME taille que leurs modules, là où les autres pages
 * du catalogue les composent plus grand. La règle de recollement des retours à la ligne
 * versait donc les quatre modules de la seconde UE dans son intitulé ; l'UE finissait sans
 * module, elle était écartée, et la fiche sortait avec 4 modules au lieu de 8 — sous le seuil
 * de 6 qui la rendait non classable. Un défaut de mise en page produisait une conséquence
 * visible par le prospect.
 *
 * Le critère retenu est le mécanisme réel d'un retour à la ligne : le mot suivant ne tenait
 * plus avant la marge du bloc. Ni la taille de police ni la puce ne pouvaient servir — les
 * trois catalogues distinguent leurs UE de trois façons différentes.
 * ─────────────────────────────────────────────────────────── */
{
  const parId = new Map(rBachelor.fiches.map((f) => [f.id, f]));
  const bp = parId.get("bachelor-professionnel-en-gestion");
  const ue = bp?.unites_enseignement || [];
  verifier(
    "une UE nommée par semestre est reconnue au même titre qu'une UE nommée par thème",
    ue.length === 2,
    ue.map((u) => `${u.intitule} [${u.modules.length}]`).join(" | ")
  );
  verifier(
    "et ses modules ne sont pas versés dans son intitulé",
    ue.reduce((s, u) => s + u.modules.length, 0) === 8 && ue.every((u) => u.modules.length === 4),
    JSON.stringify(ue.map((u) => u.modules.length))
  );
  verifier(
    "aucun intitulé d'UE n'a avalé une liste de modules",
    ue.every((u) => u.intitule.split(/\s+/).length <= 10),
    ue.map((u) => u.intitule).join(" | ")
  );

  // Conséquence directe, et c'est elle qui compte : la fiche repasse au-dessus du seuil de
  // 6 modules, donc elle redevient comparable à un profil. Voir « Programmes aux axes non
  // fiables » — 8 modules ne la rendent pas exemplaire, mais ne la disqualifient plus.
  // `axes_fiables` est posé par la distinctivité, pas par l'extraction : on le lit donc sur
  // le disque. Absent se lit comme `false` — cela voudrait dire que la distinctivité n'a pas
  // tourné depuis la dernière extraction, donc que rien n'a été évalué.
  const chemin = path.join(ROOT, "data", "filieres", "bachelor-professionnel-en-gestion.json");
  const surDisque = fs.existsSync(chemin) ? JSON.parse(fs.readFileSync(chemin, "utf8")) : null;
  verifier(
    "et la fiche repasse au-dessus du seuil de 6 modules, donc redevient classable",
    surDisque?.axes_fiables === true,
    `axes_fiables=${surDisque?.axes_fiables} · ${surDisque ? "" : "fiche absente du disque"}`
  );

  /* Le contrôle générique, celui qui rend cette classe de défaut visible sans la chercher :
   * les lignes de contenu qu'aucune UE n'a reprises se trouvent EN BAS de la section. Une
   * fiche dont la dernière UE s'arrête loin de la fin de sa section est suspecte. On vérifie
   * ici que le contrôle EXISTE et qu'il reste lisible — 3 alertes sur 84 fiches. S'il en
   * remontait trente, personne ne les lirait ; s'il n'en remontait aucune, il aurait cessé
   * de mesurer quoi que ce soit. */
  const alertesUE = resultats.flatMap((r) => r.journal).filter((l) => l.startsWith("ALERTE UE"));
  verifier(
    "le contrôle des lignes de contenu non reprises est actif et reste lisible",
    alertesUE.length >= 1 && alertesUE.length <= 8,
    `${alertesUE.length} alerte(s)`
  );
  verifier(
    "et la fiche corrigée n'y figure plus",
    !alertesUE.some((l) => l.includes("Bachelor Professionnel en Gestion")),
    alertesUE.join(" · ").slice(0, 160)
  );
}

/* ── 1 ter. Toute modalité de la taxonomie est portée ──────────────
 * Le contrôle qui aurait attrapé seul un défaut d'extraction sur les modalités. Une modalité à
 * zéro fiche est soit une extraction manquée, soit une entrée de taxonomie à retirer — le
 * filtre du quiz, lui, se contente de ne rien trouver, sans rien dire.
 * ─────────────────────────────────────────────────────────── */
{
  const compte = new Map((taxo.modalites || []).map((m) => [m, 0]));
  const intrus = new Set();
  for (const f of toutesFiches) {
    for (const m of f.modalites || []) {
      if (compte.has(m)) compte.set(m, compte.get(m) + 1);
      else intrus.add(m);
    }
  }
  const vides = [...compte.entries()].filter(([, n]) => !n).map(([m]) => m);
  verifier(
    "chaque modalité de la taxonomie est portée par au moins une fiche",
    !vides.length,
    vides.length ? `à zéro : ${vides.join(", ")}` : [...compte.entries()].map(([m, n]) => `${m} ${n}`).join(" · ")
  );
  verifier("aucune fiche ne porte de modalité hors taxonomie", !intrus.size, [...intrus].join(", "));
}

/* ── 1 quater. Le nom ne porte jamais la modalité ──────────────────
 * L'affichage est dissocié de l'identité : l'`id` reste calculé sur le titre tel que lu — le
 * changer créerait une orpheline —, mais le `nom` est débarrassé des annotations du sommaire.
 *
 * Ce n'est pas de la cosmétique. « Bachelor en Gestion full time » et « Bachelor Professionnel
 * en Gestion » se ressemblent assez pour qu'un candidat croie à deux programmes sans lien,
 * alors que leur vraie différence est la modalité. C'est le doublon présentiel / en ligne sous
 * une autre forme : le nom nomme le programme, la modalité se lit à côté.
 * ─────────────────────────────────────────────────────────── */
{
  const sales = toutesFiches.filter((f) =>
    /full ?time|week-?end|cours du soir|\ben ligne\b|à distance|presentiel|présentiel/i.test(f.nom)
  );
  verifier(
    "aucun nom de fiche ne porte sa propre modalité",
    !sales.length,
    sales.map((f) => `${f.id} → « ${f.nom} »`).join(" · ")
  );

  const ft = toutesFiches.find((f) => f.id === "bachelor-en-gestion-full-time");
  verifier(
    "l'id survit au nettoyage du nom — sinon la fiche deviendrait orpheline",
    Boolean(ft),
    "bachelor-en-gestion-full-time introuvable"
  );
  verifier("et son nom ne dit plus que le programme", ft?.nom === "Bachelor en Gestion", ft?.nom);

  // Deux fiches peuvent légitimement porter le même intitulé : c'est le cas présentiel /
  // en ligne, et c'est pour cela que la modalité est toujours affichée à côté du nom.
  const parNom = new Map();
  for (const f of toutesFiches) parNom.set(f.nom, [...(parNom.get(f.nom) || []), f]);
  const homonymes = [...parNom.values()].filter((g) => g.length > 1);
  verifier(
    "deux homonymes se distinguent toujours par leur modalité, jamais par rien",
    homonymes.every((g) => new Set(g.map((f) => (f.modalites || []).join(","))).size === g.length),
    homonymes.map((g) => g.map((f) => `${f.id} [${f.modalites}]`).join(" vs ")).join(" · ")
  );
}

verifier(
  "24 programmes ont une page dédiée, 2 ne sont annoncés qu'au sommaire",
  rBachelor.programmes.length === 24 && rBachelor.fiches.filter((f) => f._sansPage).length === 2,
  `pages : ${rBachelor.programmes.length}, squelettes : ${rBachelor.fiches.filter((f) => f._sansPage).length}`
);

const attendues = [
  ["ism-management", 8],
  ["ism-droit", 5],
  ["madiba", 4],
  ["ism-ingenieurs", 7],
  ["ism-digital-campus", 2],
];
for (const [ecole, n] of attendues) {
  const obtenu = rBachelor.fiches.filter((f) => f.ecole === ecole).length;
  verifier(`école lue dans le sommaire : ${ecole} → ${n} fiches`, obtenu === n, `obtenu : ${obtenu}`);
}

const options = rBachelor.fiches.filter((f) => f.option && /gestion/i.test(f.nom));
verifier(
  "les 5 options de la Licence en Gestion pointent vers leur programme parent",
  options.length === 5 && options.every((f) => f.programme_parent === "licence-en-gestion"),
  `${options.length} options, parents : ${[...new Set(options.map((f) => f.programme_parent))].join(", ")}`
);

const departements = rBachelor.fiches.filter((f) => f.departement).map((f) => f.departement);
verifier(
  "les départements de l'École d'Ingénieurs sont renseignés",
  new Set(departements).size === 2 && departements.length === 7,
  `${departements.length} fiches, valeurs : ${[...new Set(departements)].join(" / ")}`
);

const avecUE = rBachelor.fiches.filter((f) => f.unites_enseignement?.length);
verifier(
  "24 fiches sur 26 portent des unités d'enseignement",
  avecUE.length === 24,
  `avec UE : ${avecUE.length}`
);

verifierFiches("Bachelor", rBachelor.fiches);

/* ── 2. Les deux autres catalogues ────────────────────────────── */

const autres = [
  { motif: /master/i, etiquette: "Master", mini: 40, profil: "master-2024" },
  { motif: /online|isf/i, etiquette: "Online/ISF", mini: 10, profil: "online-2425" },
];

for (const a of autres) {
  const fichier = trouver(a.motif);
  const r = resultats.find((x) => x.chemin === fichier);
  if (!r) {
    console.log(`\n  ! catalogue ${a.etiquette} absent — ignoré`);
    continue;
  }
  console.log(`\n  Catalogue ${a.etiquette}\n`);
  verifier(`${a.etiquette} — profil retenu : ${a.profil}`, r.profil.nom === a.profil, r.profil.nom);
  verifier(
    `${a.etiquette} — au moins ${a.mini} programmes segmentés`,
    r.fiches.length >= a.mini,
    `obtenu : ${r.fiches.length}`
  );
  verifier(
    `${a.etiquette} — chaque fiche a un titre exploitable`,
    r.fiches.every((f) => f.nom.length >= 6 && /[a-zà-ÿ]/i.test(f.nom)),
    r.fiches.filter((f) => f.nom.length < 6).map((f) => f.nom).join(", ")
  );
  verifier(
    `${a.etiquette} — chaque fiche porte des unités d'enseignement`,
    r.fiches.every((f) => f.unites_enseignement?.length),
    r.fiches.filter((f) => !f.unites_enseignement?.length).map((f) => f.id).join(", ")
  );
  verifierFiches(a.etiquette, r.fiches);
}

/* ── 3. Fusion : une fiche travaillée à la main survit ────────── */

console.log(`\n  Fusion d'une ré-extraction\n`);

// Bac à sable dans data/, jamais ailleurs : les scripts n'écrivent pas hors de data/.
const SABLE = path.join(ROOT, "data", "_test-fusion");
// Le manifeste du bac à sable est son FRÈRE, pas son contenu : effacer le dossier ne l'emporte
// pas. Un test qui laisse une donnée derrière lui la fait passer pour de la production.
fs.rmSync(SABLE, { recursive: true, force: true });
fs.rmSync(cheminAffectations(SABLE), { force: true });

/* Le manifeste d'affectation décrit LE CATALOGUE : une extraction partielle vers un bac à
 * sable ne doit pas le toucher. Ce contrôle est né d'un vrai dégât — ce test remplaçait le
 * manifeste des 84 fiches par celui des 26 du seul catalogue Bachelor, et `npm run validate`
 * l'a attrapé. Un test qui écrase la donnée de production est exactement ce qu'un manifeste
 * suivi par git doit rendre visible. */
const manifesteAvantSable = fs.existsSync(CHEMIN_AFFECTATIONS)
  ? fs.readFileSync(CHEMIN_AFFECTATIONS, "utf8")
  : null;

await extraire({ fichiers: [bachelor], ecrire: true, dossierSortie: SABLE });

/* Deux contrôles, et le premier est indispensable : le second peut passer par accident.
 *
 * Comparer le manifeste avant et après ne prouve rien une fois la production déjà écrasée — la
 * réécrire à l'identique se lit alors comme une absence d'écriture. C'est exactement ce qui est
 * arrivé : le contrôle avant/après a couvert un correctif qui ne corrigeait rien, parce que
 * `path.dirname()` rend `data/` pour `data/filieres` comme pour `data/_test-fusion`.
 *
 * Le contrôle STRUCTUREL, lui, ne dépend d'aucun état sur le disque : deux dossiers de fiches
 * distincts doivent donner deux manifestes distincts. Une collision devient impossible, et pas
 * seulement non observée aujourd'hui. */
verifier(
  "deux dossiers de fiches distincts donnent deux manifestes distincts",
  cheminAffectations(SABLE) !== cheminAffectations(DOSSIER_FICHES),
  `le bac à sable et la production écrivent tous deux dans ${cheminAffectations(SABLE)}`
);
verifier(
  "une extraction vers un bac à sable ne touche pas le manifeste d'affectation",
  manifesteAvantSable === (fs.existsSync(CHEMIN_AFFECTATIONS) ? fs.readFileSync(CHEMIN_AFFECTATIONS, "utf8") : null),
  `${path.basename(CHEMIN_AFFECTATIONS)} a été réécrit par une extraction partielle`
);
verifier(
  "le bac à sable produit bien SON manifeste",
  fs.existsSync(cheminAffectations(SABLE)),
  `${cheminAffectations(SABLE)} absent — l'extraction n'a pas consigné ses affectations`
);

const cible = path.join(SABLE, "licence-en-droit-des-affaires.json");
if (!fs.existsSync(cible)) {
  echecs++;
  console.log("  ✗ fiche témoin absente du bac à sable");
} else {
  const avant = JSON.parse(fs.readFileSync(cible, "utf8"));

  // Travail humain : trois sources protégées, un statut, et une valeur d'inférence
  // volontairement fausse qui DOIT être écrasée.
  const edite = JSON.parse(JSON.stringify(avant));
  edite.profil_ideal = ["méthodique", "à l'aise à l'écrit"];
  edite.deconseille_si = ["ne supporte pas les textes longs"];
  edite.vitrine.accroche = "Le droit qui fait tourner les entreprises.";
  edite.niveau_acces = "bac+2";
  edite.eligibilite.niveau_maths = "faible";
  edite.domaines = ["droit"];
  edite.axes.quantitatif = 5; // source inference : doit être recalculé
  edite.meta.statut = "a_valider";
  edite.meta.valide_par = "responsable École de Droit";
  edite.meta.sources = {
    ...edite.meta.sources,
    profil_ideal: "responsable",
    deconseille_si: "responsable",
    "vitrine.accroche": "manuel",
    niveau_acces: "admissions",
    eligibilite: "admissions",
    domaines: "responsable",
  };
  fs.writeFileSync(cible, JSON.stringify(edite, null, 2) + "\n");

  const [rFusion] = await extraire({ fichiers: [bachelor], ecrire: true, dossierSortie: SABLE });
  const apres = JSON.parse(fs.readFileSync(cible, "utf8"));

  verifier(
    "les champs « responsable » survivent à la ré-extraction",
    JSON.stringify(apres.profil_ideal) === JSON.stringify(edite.profil_ideal) &&
      JSON.stringify(apres.deconseille_si) === JSON.stringify(edite.deconseille_si) &&
      JSON.stringify(apres.domaines) === JSON.stringify(["droit"]),
    `profil_ideal: ${JSON.stringify(apres.profil_ideal)}, domaines: ${JSON.stringify(apres.domaines)}`
  );
  verifier(
    "les champs « admissions » survivent",
    apres.niveau_acces === "bac+2" && apres.eligibilite.niveau_maths === "faible",
    `niveau_acces: ${apres.niveau_acces}, niveau_maths: ${apres.eligibilite?.niveau_maths}`
  );
  verifier(
    "les champs « manuel » survivent",
    apres.vitrine.accroche === edite.vitrine.accroche,
    `accroche: ${apres.vitrine.accroche}`
  );
  verifier(
    "les sources protégées restent déclarées comme telles",
    apres.meta.sources.niveau_acces === "admissions" &&
      apres.meta.sources.profil_ideal === "responsable" &&
      apres.meta.sources["vitrine.accroche"] === "manuel"
  );
  verifier(
    "meta.statut et meta.valide_par sont conservés",
    apres.meta.statut === "a_valider" && apres.meta.valide_par === "responsable École de Droit",
    `statut: ${apres.meta.statut}`
  );
  verifier(
    "les champs « inference » sont, eux, recalculés",
    apres.axes.quantitatif === avant.axes.quantitatif,
    `quantitatif: ${apres.axes.quantitatif} au lieu de ${avant.axes.quantitatif}`
  );
  verifier(
    "les champs « brochure » sont rafraîchis, pas figés",
    apres.unites_enseignement.length === avant.unites_enseignement.length &&
      apres.meta.sources.unites_enseignement === "brochure" &&
      apres.vitrine.description === avant.vitrine.description
  );
  verifier(
    "la fusion est comptée dans le journal de l'extraction",
    rFusion.journal.some((l) => l.startsWith("fusion licence-en-droit-des-affaires")),
    rFusion.journal.filter((l) => l.startsWith("fusion")).slice(0, 2).join(" | ")
  );

  // Les 25 autres fiches du catalogue n'ont pas été touchées par un humain :
  // elles doivent rester strictement identiques à la première extraction.
  const intactes = fs
    .readdirSync(SABLE)
    .filter((n) => n.endsWith(".json") && n !== "licence-en-droit-des-affaires.json");
  verifier(
    "une ré-extraction sans apport humain ne change rien",
    intactes.length === 25,
    `${intactes.length} fiches`
  );
}

// Le manifeste du bac à sable est son FRÈRE, pas son contenu : effacer le dossier ne l'emporte
// pas. Un test qui laisse une donnée derrière lui la fait passer pour de la production.
fs.rmSync(SABLE, { recursive: true, force: true });
fs.rmSync(cheminAffectations(SABLE), { force: true });

/* ── 4. Titres et aiguillage ──────────────────────────────────── */

console.log(`\n  Titres et domaines\n`);

// Petites capitales InDesign : une capitale accentuée au milieu d'un mot.
const petitesCaps = toutesFiches.filter((f) => /\p{Ll}\p{Lu}|\p{Lu}[ÀÂÉÈÊËÎÏÔÖÙÛÜÇ]\p{Ll}/u.test(f.nom));
verifier(
  "aucun titre ne garde de petite capitale mal encodée (« MÉtiers »)",
  !petitesCaps.length,
  petitesCaps.map((f) => f.nom).join(", ")
);

const toutCaps = toutesFiches.filter((f) => f.nom === f.nom.toUpperCase() && f.nom.length > 8);
verifier("aucun titre n'est resté tout en capitales", !toutCaps.length, toutCaps.map((f) => f.nom).join(", "));

// Familles : le prospect choisit une famille (question 3). Un domaine sans famille
// sortirait du parcours sans prévenir.
const familleDe = new Map();
for (const fam of taxo.familles || []) for (const d of fam.domaines) familleDe.set(d, fam.id);

verifier(
  `${(taxo.familles || []).length} familles couvrent tous les domaines utilisés`,
  toutesFiches.every((f) => f.domaines.every((d) => familleDe.has(d))),
  [...new Set(toutesFiches.flatMap((f) => f.domaines).filter((d) => !familleDe.has(d)))].join(", ")
);
verifier(
  "6 à 8 familles : assez pour aiguiller, assez peu pour tenir en une question",
  (taxo.familles || []).length >= 6 && (taxo.familles || []).length <= 8,
  `${(taxo.familles || []).length} familles`
);

// Les 2 axes de disposition vivent au niveau DOMAINE, pas famille : au niveau famille
// ils seraient identiques pour tous les candidats d'une même famille, donc sans pouvoir
// discriminant là où le scoring en a besoin.
const axesDomaines = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "domaines_axes.json"), "utf8"));
const domainesUtilises = [...new Set(toutesFiches.flatMap((f) => f.domaines))].sort();

verifier(
  "chaque domaine utilisé a son entrée dans domaines_axes.json",
  domainesUtilises.every((d) => axesDomaines.domaines?.[d]),
  domainesUtilises.filter((d) => !axesDomaines.domaines?.[d]).join(", ")
);
verifier(
  "config/familles_axes.json n'existe plus (les axes de disposition ne sont plus au niveau famille)",
  !fs.existsSync(path.join(ROOT, "config", "familles_axes.json"))
);

// Les seuils vivent dans [-1, 1] : le score est une corrélation, pas un pourcentage.
// Les valeurs 85/70 des versions précédentes supposaient une distance euclidienne
// sur 0-100, écartée. Un seuil hors de [-1, 1] rendrait tout classement absurde.
const departages = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "departages.json"), "utf8"));
const seuils = departages._seuils || {};
verifier(
  "les 3 seuils sont dans [-1, 1] — le score est une corrélation, pas un pourcentage",
  ["correspondance_forte", "correspondance_bonne", "ecart_declenchant_departage"].every(
    (k) => typeof seuils[k] === "number" && seuils[k] >= -1 && seuils[k] <= 1
  ),
  JSON.stringify(seuils)
);
verifier(
  "correspondance_forte est au-dessus de correspondance_bonne",
  seuils.correspondance_forte > seuils.correspondance_bonne
);
// Un seuil sans provenance est un seuil qu'on ne peut plus discuter : soit il se
// déclare provisoire, soit il dit par quelle simulation il a été calibré.
verifier(
  "les seuils déclarent leur provenance — provisoires, ou calibrés par simulation",
  typeof seuils._statut === "string" && /provisoire|calibre/i.test(seuils._statut),
  seuils._statut || "aucun _statut"
);

verifier(
  "au plus 2 domaines par fiche",
  toutesFiches.every((f) => f.domaines.length >= 1 && f.domaines.length <= 2),
  toutesFiches.filter((f) => f.domaines.length > 2).map((f) => `${f.id} (${f.domaines.length})`).join(", ")
);

// L'aiguillage doit trancher : un domaine porté par plus de la moitié du catalogue
// ne réduit plus l'ensemble candidat.
const frequences = {};
for (const f of toutesFiches) for (const d of f.domaines) frequences[d] = (frequences[d] || 0) + 1;
const envahissants = Object.entries(frequences).filter(([, n]) => n > toutesFiches.length / 3);
verifier(
  "aucun domaine ne couvre plus d'un tiers du catalogue",
  !envahissants.length,
  envahissants.map(([d, n]) => `${d}: ${n}/${toutesFiches.length}`).join(", ")
);

/* ── 5. Axes : ancrages lexicaux ───────────────────────────────────────────
 *
 * Un lexique d'axe est de la donnée déguisée en code : il se dégrade en silence
 * dès qu'un module change de libellé. Ces quatre ancrages sont les programmes
 * dont personne ne discute la note : si UX Design n'est plus créatif, ce n'est
 * pas le programme qui a changé, c'est le lexique qui s'est cassé.
 *
 * Ancrage, pas seuil de qualité : ils constatent qu'un axe capte encore son
 * vocabulaire évident, ils ne prétendent pas que les 84 notes sont justes.
 * ───────────────────────────────────────────────────────────────────────── */

console.log(`\n  Axes\n`);

const ANCRAGES = [
  ["mastere-ux-design", "creatif"],
  ["licence-en-mathematiques-appliquees-informatique-et-economet", "quantitatif"],
  ["licence-en-genie-logiciel-reseaux-et-systemes", "technique"],
  ["licence-en-droit-des-affaires", "cadre"],
];

const parIdAxes = new Map(toutesFiches.map((f) => [f.id, f]));

for (const [id, axe] of ANCRAGES) {
  const f = parIdAxes.get(id);
  verifier(
    `${axe} ≥ 4 pour ${f ? f.nom : id}`,
    f && f.axes?.[axe] >= 4,
    f ? `${axe} = ${f.axes?.[axe]}` : "fiche absente (id changé ?)"
  );
}

// Les cinq axes sont indépendants : un module peut nourrir plusieurs axes, aucun
// ne se les dispute. Un axe bas se lit donc « lexique muet », jamais « axe évincé ».
const multiAxes = toutesFiches
  .flatMap((f) => (f.unites_enseignement || []).flatMap((ue) => ue.modules || []))
  .some((m) => axesDunModule(m).length >= 2);
verifier("un module peut alimenter plusieurs axes à la fois", multiAxes);

// Faux positifs vus sur les vraies données : « Développement personnel » comptait
// pour technique, « Rédaction d'actes » et « Rédaction de mémoire » pour créatif.
const FAUX_POSITIFS = [
  ["Développement personnel", "technique"],
  ["Développement durable", "technique"],
  ["Rédaction d'actes", "creatif"],
  ["Rédaction et Soutenance de Mémoire", "creatif"],
  ["Marchés des capitaux", "technique"],
  ["Gestion du patrimoine", "creatif"],
];
for (const [module, axe] of FAUX_POSITIFS) {
  verifier(
    `« ${module} » n'est pas compté en ${axe}`,
    !axesDunModule(module).includes(axe),
    axesDunModule(module).join(", ")
  );
}

/* ── Notes et proportions : deux sorties d'une seule mesure ───────
 * `axes` (1..5) pour l'affichage et les ancrages, `axes_parts` pour la corrélation.
 * L'arrondi de noter() fabriquait des égalités exactes à r = 1,00 entre programmes de
 * formes différentes : un ex æquo parfait n'est pas classable.
 * ─────────────────────────────────────────────────────────────── */

verifier(
  "chaque fiche porte ses 5 proportions brutes à côté de ses notes",
  toutesFiches.every((f) => f.axes_parts && AXES.every((a) => Number.isFinite(f.axes_parts[a]))),
  toutesFiches.filter((f) => !f.axes_parts).map((f) => f.id).slice(0, 3).join(", ")
);

verifier(
  "les proportions sont dans [0, 1]",
  toutesFiches.every((f) => AXES.every((a) => f.axes_parts[a] >= 0 && f.axes_parts[a] <= 1))
);

verifier(
  "chaque note est cohérente avec sa proportion",
  toutesFiches.every((f) =>
    AXES.every((a) => {
      const attendue = Math.max(1, Math.min(5, 1 + Math.floor(f.axes_parts[a] / 0.1)));
      // Les fiches sans module gardent la note par défaut 3 pour une proportion de 0.
      return f.axes[a] === attendue || (!f.axes_parts[a] && f.axes[a] === 3);
    })
  ),
  toutesFiches
    .filter((f) => AXES.some((a) => f.axes[a] !== Math.max(1, Math.min(5, 1 + Math.floor(f.axes_parts[a] / 0.1))) && f.axes_parts[a]))
    .map((f) => f.id)
    .slice(0, 3)
    .join(", ")
);

{
  // La mesure qui justifie le champ : les égalités exactes disparaissent.
  const pearson = (va, vb) => {
    const moy = (v) => v.reduce((s, n) => s + n, 0) / v.length;
    const ma = moy(va);
    const mb = moy(vb);
    let num = 0;
    let da = 0;
    let db = 0;
    for (let i = 0; i < va.length; i++) {
      num += (va[i] - ma) * (vb[i] - mb);
      da += (va[i] - ma) ** 2;
      db += (vb[i] - mb) ** 2;
    }
    return da && db ? num / Math.sqrt(da * db) : null;
  };
  let surNotes = 0;
  let surParts = 0;
  for (let i = 0; i < toutesFiches.length; i++) {
    for (let j = i + 1; j < toutesFiches.length; j++) {
      const a = toutesFiches[i];
      const b = toutesFiches[j];
      if (!a.domaines.some((d) => b.domaines.includes(d))) continue;
      const rn = pearson(AXES.map((x) => a.axes[x]), AXES.map((x) => b.axes[x]));
      const rp = pearson(AXES.map((x) => a.axes_parts[x]), AXES.map((x) => b.axes_parts[x]));
      if (rn != null && Math.abs(rn - 1) < 1e-9) surNotes++;
      if (rp != null && Math.abs(rp - 1) < 1e-9) surParts++;
    }
  }
  verifier(
    "aucune égalité exacte à r = 1,00 sur les proportions, là où les notes en produisaient",
    surParts === 0 && surNotes > 0,
    `notes : ${surNotes} paire(s) à r = 1,00 · proportions : ${surParts}`
  );
}

// Un axe qui ne distingue plus personne ne sert à rien dans une comparaison de vecteurs.
for (const axe of AXES) {
  const notes = toutesFiches.map((f) => f.axes[axe]);
  verifier(
    `l'axe ${axe} prend au moins 3 valeurs distinctes sur le catalogue`,
    new Set(notes).size >= 3,
    `valeurs : ${[...new Set(notes)].sort().join(", ")}`
  );
}

/* ── 6. Distinctivité ─────────────────────────────────────────── */

console.log(`\n  Distinctivité\n`);

const { resultats: dist, paires, blocs } = calculerDistinctivite(toutesFiches, SEUIL_PAIRE);

verifier("un résultat de distinctivité par fiche", dist.length === toutesFiches.length);

verifier(
  "aucune fiche n'est sa propre plus proche voisine",
  dist.every((r) => r.distinctivite.plus_proche !== r.id),
  dist.filter((r) => r.distinctivite.plus_proche === r.id).map((r) => r.id).join(", ")
);

verifier(
  "recouvrement_max toujours entre 0 et 1",
  dist.every((r) => r.distinctivite.recouvrement_max >= 0 && r.distinctivite.recouvrement_max <= 1)
);

verifier(
  "une paire ne se compte qu'une fois",
  new Set(paires.map((p) => [p.a.id, p.b.id].sort().join("|")).map((k) => k)).size === paires.length
);

/* ── Les DEUX mesures de proximité ────────────────────────────────
 * Le recouvrement de modules dit ce que le catalogue partage, la corrélation d'axes
 * dit qui produira un ex æquo au scoring. Un seuil unique sur la première laisse
 * passer les paires qui feront pourtant trébucher le moteur.
 * ─────────────────────────────────────────────────────────────── */

verifier(
  "chaque paire retenue dit par quelle mesure elle l'a été",
  paires.every((p) => p.motifs.length && p.motifs.every((m) => m === "modules" || m === "axes")),
  paires.filter((p) => !p.motifs.length).map((p) => p.a.id).join(", ")
);

verifier(
  "les deux mesures retiennent chacune des paires que l'autre ignore",
  paires.some((p) => p.motifs.length === 1 && p.motifs[0] === "modules") &&
    paires.some((p) => p.motifs.length === 1 && p.motifs[0] === "axes"),
  `modules seuls : ${paires.filter((p) => p.motifs.join() === "modules").length}, axes seuls : ${
    paires.filter((p) => p.motifs.join() === "axes").length
  }`
);

verifier(
  "les paires retenues par les deux mesures viennent en tête",
  paires.every((p, i) => i === 0 || paires[i - 1].motifs.length >= p.motifs.length)
);

verifier(
  "correlation_axes_max reste dans [-1, 1]",
  dist.every((r) => r.distinctivite.correlation_axes_max >= -1 && r.distinctivite.correlation_axes_max <= 1)
);

// L'exemple de la spec : ces deux programmes n'atteignent PAS 80 % de modules communs,
// et un seuil unique les aurait manqués. Leur corrélation d'axes, elle, les désigne.
const paireIngenieurs = paires.find(
  (p) =>
    [p.a.id, p.b.id].includes("licence-en-genie-logiciel-reseaux-et-systemes") &&
    [p.a.id, p.b.id].some((x) => x.startsWith("licence-en-electronique"))
);
verifier(
  "Génie logiciel et Électronique-Télécoms sont retenus malgré un recouvrement sous 80 %",
  paireIngenieurs && paireIngenieurs.taux < SEUIL_PAIRE && paireIngenieurs.correlation >= 0.8,
  paireIngenieurs
    ? `modules ${Math.round(paireIngenieurs.taux * 100)} %, r = ${paireIngenieurs.correlation}`
    : "paire absente"
);

/* ── Structure en UE ─────────────────────────────────────────────
 * Le comptage traite les modules comme un sac de mots. La structure en UE porte des
 * distinctions que ni les modules ni les axes ne voient.
 * ─────────────────────────────────────────────────────────────── */

verifier(
  "les UE récurrentes sont détectées, sans liste écrite à la main",
  blocs.length >= 10 && blocs.every((b) => b.programmes.length >= 3),
  `${blocs.length} blocs`
);

// Le marqueur vérifié à la main : Génie logiciel et Maths appliquées portent l'UE
// Management & Organisations, Électronique et Modélisation statistique ne l'ont pas.
const blocManagement = blocs.find((b) => b.id === "management-organisations");
verifier(
  "l'UE « Management & Organisations » est reconnue comme bloc récurrent",
  Boolean(blocManagement),
  blocs.map((b) => b.id).slice(0, 10).join(", ")
);
if (blocManagement) {
  const porte = (id) => dist.find((r) => r.id === id)?.structure_ue.blocs_types.includes("management-organisations");
  verifier(
    "ce bloc sépare Génie logiciel d'Électronique-Télécoms",
    porte("licence-en-genie-logiciel-reseaux-et-systemes") === true &&
      dist
        .filter((r) => r.id.startsWith("licence-en-electronique"))
        .every((r) => !r.structure_ue.blocs_types.includes("management-organisations"))
  );
  verifier(
    "et Maths appliquées de Modélisation statistique",
    porte("licence-en-mathematiques-appliquees-informatique-et-economet") === true &&
      dist
        .filter((r) => r.id.startsWith("licence-modelisation-statistique"))
        .every((r) => !r.structure_ue.blocs_types.includes("management-organisations"))
  );
}

verifier(
  "la concentration n'est calculée que là où le catalogue publie un découpage en UE",
  dist.every((r) => (r.structure_ue.publiee ? r.structure_ue.concentration != null : r.structure_ue.concentration === null)),
  dist
    .filter((r) => r.structure_ue.publiee !== (r.structure_ue.concentration != null))
    .map((r) => r.id)
    .join(", ")
);

verifier(
  "les conteneurs génériques du catalogue Master ne comptent pas comme UE",
  dist.filter((r) => r.structure_ue.publiee).length < toutesFiches.length / 2,
  `${dist.filter((r) => r.structure_ue.publiee).length} fiches avec UE publiées`
);

/* ── Couverture des lexiques ─────────────────────────────────────
 * C'est ce contrôle, et lui seul, qui aurait détecté le bug d'UX Design : 55 % de
 * modules non reconnus quand la moyenne du catalogue était à 26 %.
 * ─────────────────────────────────────────────────────────────── */

const couv = couvertureLexicale(toutesFiches);
verifier(
  "la couverture des lexiques est mesurée et la moyenne reste sous 35 %",
  couv.moyenne > 0 && couv.moyenne < 0.35,
  `${Math.round(couv.moyenne * 100)} % de modules non reconnus`
);
verifier(
  "UX Design ne fait plus partie des programmes signalés pour couverture",
  !couv.signales.some((x) => x.id === "mastere-ux-design"),
  couv.signales.map((x) => x.id).slice(0, 5).join(", ")
);

/* ── axes_fiables ────────────────────────────────────────────────
 * Le moteur ne doit pas classer par le score un programme dont les axes ne décrivent
 * pas le contenu. Trois causes, une seule conséquence.
 * ─────────────────────────────────────────────────────────────── */

verifier(
  "chaque fiche porte axes_fiables",
  dist.every((r) => typeof r.axes_fiables === "boolean")
);

verifier(
  "les programmes à couverture insuffisante sont marqués non fiables",
  couv.signales.every((x) => dist.find((r) => r.id === x.id)?.axes_fiables === false),
  couv.signales.filter((x) => dist.find((r) => r.id === x.id)?.axes_fiables !== false).map((x) => x.id).join(", ")
);

verifier(
  "une fiche sans module n'a jamais d'axes fiables — sa note 3 est une valeur par défaut",
  dist.filter((r) => !r.structure_ue.nb_modules).every((r) => r.axes_fiables === false),
  dist.filter((r) => !r.structure_ue.nb_modules && r.axes_fiables).map((r) => r.id).join(", ")
);

verifier(
  `une fiche sous ${MODULES_MIN} modules n'a pas d'axes fiables — la proportion n'y mesure rien`,
  dist.filter((r) => r.structure_ue.nb_modules && r.structure_ue.nb_modules < MODULES_MIN).every((r) => !r.axes_fiables)
);

verifier(
  "les 4 ancrages restent sur des fiches aux axes fiables",
  ANCRAGES.every(([id]) => dist.find((r) => r.id === id)?.axes_fiables === true),
  ANCRAGES.filter(([id]) => dist.find((r) => r.id === id)?.axes_fiables !== true).map(([id]) => id).join(", ")
);

verifier(
  "les non fiables restent minoritaires : au plus un quart du catalogue",
  dist.filter((r) => !r.axes_fiables).length <= toutesFiches.length / 4,
  `${dist.filter((r) => !r.axes_fiables).length} / ${toutesFiches.length}`
);

/* ── Parcours — la seule structure thématique hors licences ──────
 * Le catalogue Master ne publie aucune UE : une liste plate de puces. Son seul
 * regroupement thématique est le bandeau « Parcours … », composé en petites capitales
 * et parfois avec les mots dans un autre ordre.
 * ─────────────────────────────────────────────────────────────── */

const parcoursVus = [...new Set(toutesFiches.map((f) => f.parcours).filter(Boolean))];
verifier(
  "les variantes de casse et d'ordre des mots d'un parcours sont rapprochées",
  new Set(parcoursVus.map(cleParcours)).size === parcoursVus.length,
  parcoursVus.join(" | ")
);
verifier(
  "les parcours restent un regroupement grossier : moins de 6 pour tout le catalogue",
  parcoursVus.length > 0 && parcoursVus.length < 6,
  `${parcoursVus.length} parcours`
);

// Deux options d'un même programme partagent leur tronc commun : un recouvrement
// élevé y est attendu et se tranche par le nom de l'option, sans mobiliser personne.
const soeurs = paires.filter((p) => p.soeurs);
const ambigues = paires.filter((p) => !p.soeurs);
verifier(
  "les paires d'options sœurs sont séparées des vraies ambiguïtés",
  soeurs.length > 0 && ambigues.length > 0,
  `${soeurs.length} sœurs, ${ambigues.length} ambiguës`
);
verifier(
  "aucune paire d'options sœurs n'est adressée à un responsable",
  soeurs.every(
    (p) =>
      (p.a.programme_parent && p.a.programme_parent === p.b.programme_parent) ||
      (p.a.option && p.b.option)
  ),
  soeurs.map((p) => `${p.a.id} / ${p.b.id}`).join(" ; ")
);
verifier(
  "les options de la Licence en Gestion sont reconnues comme sœurs, pas comme ambiguïté",
  !ambigues.some((p) => p.a.programme_parent && p.a.programme_parent === p.b.programme_parent),
  ambigues.map((p) => `${p.a.id} / ${p.b.id}`).join(" ; ")
);

verifier(
  "les voisines pointent vers des fiches existantes",
  dist.every((r) => r.voisines.every((v) => toutesFiches.some((f) => f.id === v))),
  dist.flatMap((r) => r.voisines.filter((v) => !toutesFiches.some((f) => f.id === v))).join(", ")
);

// Exemple vérifié à la main dans CLAUDE.md : le catalogue sépare seul ces deux
// programmes, malgré des intitulés que le prospect confond.
const trading = dist.find((r) => r.id === "master-en-marche-financier-trading");
const banque = toutesFiches.find((f) => f.id === "mba-en-banque-assurance");
if (trading && banque) {
  const modulesTrading = new Set(
    (toutesFiches.find((f) => f.id === trading.id).unites_enseignement || []).flatMap((u) => u.modules)
  );
  const modulesBanque = new Set((banque.unites_enseignement || []).flatMap((u) => u.modules));
  const communs = [...modulesTrading].filter((m) => modulesBanque.has(m)).length;
  verifier(
    "Marché Financier & Trading et Banque-Assurance sont séparés par le catalogue seul",
    communs === 0 && trading.distinctivite.plus_proche !== "mba-en-banque-assurance",
    `${communs} module(s) commun(s), plus proche : ${trading.distinctivite.plus_proche}`
  );
  verifier(
    "chacun garde des modules exclusifs dans son domaine",
    trading.totalModulesExclusifs > 3 &&
      dist.find((r) => r.id === "mba-en-banque-assurance").totalModulesExclusifs > 3
  );
} else {
  console.log("  ! fiches de référence absentes — contrôle de distinctivité ignoré");
}

/* ── Affectation en familles : aucune migration silencieuse ────────
 * L'appartenance d'une fiche à une famille n'est pas déclarée, elle se DÉDUIT de ses domaines,
 * qui se déduisent du titre, de l'objectif et des modules. Une correction de parsing peut donc
 * déplacer une fiche d'entonnoir sans que personne l'ait demandé — et c'est arrivé sans que
 * rien ne le dise. Ce bloc vérifie que le manifeste couvre tout et que la comparaison réagit.
 * ─────────────────────────────────────────────────────────── */

console.log(`\n  Affectation en domaines et en familles\n`);

{
  const manifeste = construireManifeste(toutesFiches, taxo);

  verifier(
    `le manifeste consigne les ${toutesFiches.length} fiches`,
    Object.keys(manifeste.affectations).length === toutesFiches.length,
    `${Object.keys(manifeste.affectations).length} consignée(s)`
  );

  const sansFamille = Object.entries(manifeste.affectations).filter(([, a]) => !a.familles.length);
  verifier(
    "chaque fiche consignée relève d'au moins une famille",
    !sansFamille.length,
    sansFamille.map(([id]) => id).join(", ")
  );

  /* L'ensemble réellement arbitraire : le 2e et le 3e domaine à ÉGALITÉ EXACTE de score, que
   * `scoresDomaines` départage sur l'ordre alphabétique de l'`id`. C'est là qu'un module de
   * plus ne fait pas « gagner » un domaine — il rompt une égalité que rien ne justifiait. */
  const egalites = manifeste._surveillance.egalite_frontiere;
  verifier(
    `${egalites.length} fiche(s) à égalité exacte entre leur 2e et leur 3e domaine`,
    egalites.every((e) => e.scores[0] === e.scores[1]),
    egalites.map((e) => `${e.id} ${e.retenu}/${e.ecarte} ${e.scores.join("=")}`).join(" · ")
  );

  // Les fiches à surveiller : leur 2e et leur 3e domaine ne sont pas dans la même famille.
  // C'est un sur-ensemble des égalités — un écart d'un point suffit à rendre le cas instable.
  const aSurveiller = manifeste._surveillance.familles_differentes;
  verifier(
    "les fiches à égalité sont toutes dans la liste à surveiller quand elles changent de famille",
    egalites
      .filter((e) => e.famille_retenu !== e.famille_ecarte)
      .every((e) => aSurveiller.some((x) => x.id === e.id)),
    `${egalites.length} égalité(s), ${aSurveiller.length} à surveiller`
  );
  verifier(
    "chaque fiche à surveiller a bien deux familles différentes de part et d'autre",
    aSurveiller.every((e) => e.famille_retenu && e.famille_ecarte && e.famille_retenu !== e.famille_ecarte),
    aSurveiller.map((e) => `${e.id} ${e.famille_retenu}/${e.famille_ecarte}`).join(" · ")
  );

  /* La comparaison doit RÉAGIR. On fabrique un manifeste précédent où une fiche relevait d'une
   * autre famille : sans ce contrôle, `comparerManifestes` pourrait ne rien détecter et le test
   * passerait quand même. */
  const cible = Object.keys(manifeste.affectations)[0];
  const ancien = { affectations: JSON.parse(JSON.stringify(manifeste.affectations)) };
  ancien.affectations[cible] = {
    domaines: ["_domaine-de-controle"],
    familles: ["_famille-de-controle"],
    modules: (ancien.affectations[cible].modules || 0) + 7,
  };
  const diff = comparerManifestes(ancien, manifeste);
  verifier(
    "une migration de famille est détectée",
    diff.migrations.length === 1 && diff.migrations[0].id === cible,
    JSON.stringify(diff.migrations.map((m) => m.id))
  );
  verifier(
    "et sa cause est attribuée quand elle est identifiable",
    /nombre de modules/.test(diff.migrations[0]?.cause || ""),
    diff.migrations[0]?.cause || "aucune cause"
  );

  // Un déplacement de domaine SANS changement de famille ne doit pas être rangé avec les
  // migrations : il ne déplace personne dans le parcours, et le confondre noierait le signal.
  const idDeuxDomaines = Object.keys(manifeste.affectations).find(
    (id) => manifeste.affectations[id].domaines.length === 2
  );
  const ancien2 = { affectations: JSON.parse(JSON.stringify(manifeste.affectations)) };
  ancien2.affectations[idDeuxDomaines] = {
    ...manifeste.affectations[idDeuxDomaines],
    domaines: [...manifeste.affectations[idDeuxDomaines].domaines].reverse(),
  };
  const diff2 = comparerManifestes(ancien2, manifeste);
  verifier(
    "un domaine réordonné sans changer de famille n'est pas compté comme une migration",
    !diff2.migrations.length && diff2.deplacementsDomaine.length === 1,
    `${diff2.migrations.length} migration(s), ${diff2.deplacementsDomaine.length} déplacement(s)`
  );

  // Deux exécutions identiques ne produisent aucun changement : sinon le journal crierait à
  // chaque extraction et on finirait par ne plus le lire.
  const rien = comparerManifestes(manifeste, manifeste);
  verifier(
    "deux exécutions identiques ne signalent rien",
    !rien.migrations.length && !rien.deplacementsDomaine.length && !rien.disparues.length
  );
}

/* ── Le mécanisme de fraîcheur est-il branché ? ────────────────────
 * `validate.mjs` compare les empreintes ; ce test-ci vérifie le mécanisme lui-même. Le mode
 * de défaillance à couvrir n'est pas un artefact périmé — c'est un artefact **ajouté sans
 * être surveillé** : personne ne s'apercevrait jamais qu'il n'est pas suivi, puisque
 * l'absence de contrôle ne produit aucun message.
 * ─────────────────────────────────────────────────────────── */

console.log(`\n  Fraîcheur des artefacts générés\n`);

{
  const scriptsDir = path.join(ROOT, "scripts");
  const code = fs
    .readdirSync(scriptsDir)
    .filter((n) => n.endsWith(".mjs"))
    .map((n) => fs.readFileSync(path.join(scriptsDir, n), "utf8"))
    .join("\n");

  const noms = Object.keys(ARTEFACTS);
  verifier(`${noms.length} artefact(s) déclarés dans lib/fraicheur.mjs`, noms.length >= 5, noms.join(", "));

  const nonNotes = noms.filter((n) => !code.includes(`noterFraicheur("${n}")`));
  verifier(
    "chaque artefact déclaré est noté par le script qui le produit",
    !nonNotes.length,
    nonNotes.length ? `jamais noté : ${nonNotes.join(", ")}` : ""
  );

  const sansCommande = noms.filter((n) => !ARTEFACTS[n].commande || !ARTEFACTS[n].sources?.length);
  verifier(
    "chaque artefact nomme sa commande de régénération et ses sources",
    !sansCommande.length,
    sansCommande.join(", ")
  );

  // Un artefact ne peut pas être sa propre source, ni celle d'un autre : une cascade
  // d'empreintes ferait qu'une seule péremption en signalerait cinq, sans dire laquelle
  // relancer. Les fichiers générés commencent tous par « _ », et fichiersDe les écarte.
  const enCascade = noms.filter((n) =>
    Object.values(ARTEFACTS).some((d) => d.sources.includes(n))
  );
  verifier("aucun artefact n'est source d'un autre", !enCascade.length, enCascade.join(", "));

  // L'empreinte doit dépendre du CONTENU : deux appels de suite doivent concorder, sinon
  // elle embarque une date ou un parcours de dossier non trié et se déclare périmée seule.
  const deuxFois = noms.every((n) => empreinteSources(n) === empreinteSources(n));
  verifier("l'empreinte est déterministe — aucune date, aucun ordre de dossier", deuxFois);

  // Et elle doit RÉAGIR : on modifie une fiche en mémoire… impossible, l'empreinte lit le
  // disque. On vérifie donc que deux artefacts aux sources différentes ont des empreintes
  // différentes, ce qui prouve au moins que les sources déclarées sont bien prises en compte.
  const distinctes = new Set(noms.map((n) => empreinteSources(n)));
  verifier(
    "des sources différentes donnent des empreintes différentes",
    distinctes.size > 1,
    `${distinctes.size} empreinte(s) distincte(s) pour ${noms.length} artefacts`
  );
}

console.log(
  echecs
    ? `\n  ${echecs} test(s) en échec sur ${verifs}\n`
    : `\n  ${verifs} tests passés.\n`
);
process.exit(echecs ? 1 : 0);
