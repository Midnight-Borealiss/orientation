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

/* ── 1. Brochure Bachelor : 26 fiches, ni 24 ni 28 ────────────── */

const bachelor = trouver(/bachelor/i);
if (!bachelor) {
  console.log("\n  ! ISM_bachelor_brochure.pdf absent de data/brochures/ — test de référence ignoré\n");
  process.exit(1);
}

console.log("\n  Brochure Bachelor — test de référence du sommaire\n");
const [rBachelor] = await extraire({ fichiers: [bachelor], ecrire: false });

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

const orphelins = rBachelor.journal.filter((l) => l.startsWith("ALERTE"));
verifier("aucun programme de page absent du sommaire", !orphelins.length, orphelins.join("\n      "));

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
  if (!fichier) {
    console.log(`\n  ! catalogue ${a.etiquette} absent — ignoré`);
    continue;
  }
  console.log(`\n  Catalogue ${a.etiquette}\n`);
  const [r] = await extraire({ fichiers: [fichier], ecrire: false });
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

console.log(
  echecs
    ? `\n  ${echecs} test(s) en échec sur ${verifs}\n`
    : `\n  ${verifs} tests passés.\n`
);
process.exit(echecs ? 1 : 0);
