#!/usr/bin/env node
/**
 * fiches-comparaison.mjs — un document de travail par paire à départager.
 *
 *   node scripts/fiches-comparaison.mjs          # data/_comparaisons/*.md
 *   node scripts/fiches-comparaison.mjs --dry    # liste sans écrire
 *
 * Sortie : une fiche imprimable par paire retenue par `distinctivite.mjs`, à poser sur
 * la table pendant l'entretien. Le responsable lit ce que le catalogue dit déjà, et ne
 * répond que sur ce qu'il sait et que le catalogue ignore.
 *
 * TROIS QUESTIONS, TOUJOURS LES MÊMES, DANS CET ORDRE. Aucune ne demande au
 * responsable de formuler quelque chose pour un prospect : les responsables enseignent,
 * ils ne sont presque jamais en contact avec les candidats. Leur demander de rédiger une
 * question d'orientation produirait une réponse inventée qui aurait l'apparence d'une
 * donnée. La rédaction des questions du quiz est un travail de conception, fait ensuite,
 * à partir de leur substance et du vocabulaire recueilli aux admissions.
 *
 * PAIRES À CHEVAL SUR DEUX ÉCOLES : une DEMI-FICHE par école, portant les trois
 * questions sur le seul programme que ce responsable connaît. Le contraste est
 * reconstruit ensuite, par nous. Demander à un responsable de Management de comparer
 * son MBA à un master d'ISM Online qu'il n'a jamais vu produirait une réponse polie et
 * fausse.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normaliser } from "./lib/pdf-layout.mjs";
import { calculerDistinctivite } from "./distinctivite.mjs";
import { noterFraicheur } from "./lib/fraicheur.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "filieres");
const OUT = path.join(ROOT, "data", "_comparaisons");

/** Les trois questions, dans un ordre fixe : du général au diagnostic. */
const QUESTIONS = [
  "Pour vous, qu'est-ce qui les distingue réellement ?",
  "Vers quoi mène l'une que l'autre ne mène pas ?",
  "Un étudiant qui réussit dans l'une pourrait-il être en difficulté dans l'autre ? À quoi le verriez-vous ?",
];

const QUESTIONS_DEMI = [
  "Qu'est-ce qui caractérise réellement ce programme, au-delà de son intitulé ?",
  "Vers quoi mène-t-il, et vers quoi ne mène-t-il pas ?",
  "À quoi voyez-vous qu'un étudiant s'est trompé de programme ? À quel moment de l'année ?",
];

const cle = (s) =>
  normaliser(s)
    .replace(/^(ue|module|semestre)\s*\d*\s*[:.-]?\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const modulesDeFiche = (f) => (f.unites_enseignement || []).flatMap((u) => u.modules || []);

const pct = (n) => (n == null ? "n/a" : `${Math.round(n * 100)} %`);

const liste = (valeurs, vide = "_le catalogue n'en publie aucun_") =>
  valeurs.length ? valeurs.map((v) => `- ${v}`).join("\n") : vide;

/** Modules de `a` absents de `b`, dédoublonnés, dans les mots de la brochure. */
function propres(a, b) {
  const autres = new Set(modulesDeFiche(b).map(cle));
  const vus = new Set();
  const out = [];
  for (const m of modulesDeFiche(a)) {
    const k = cle(m);
    if (k.length <= 2 || autres.has(k) || vus.has(k)) continue;
    vus.add(k);
    out.push(m);
  }
  return out;
}

function communs(a, b) {
  const autres = new Set(modulesDeFiche(b).map(cle));
  const vus = new Set();
  const out = [];
  for (const m of modulesDeFiche(a)) {
    const k = cle(m);
    if (k.length <= 2 || !autres.has(k) || vus.has(k)) continue;
    vus.add(k);
    out.push(m);
  }
  return out;
}

function metiersPropres(a, b) {
  const autres = new Set((b.debouches?.metiers || []).map(cle));
  return (a.debouches?.metiers || []).filter((m) => !autres.has(cle(m)));
}

/** Bloc de saisie au format qui alimente config/departages.json, sans rien inventer. */
function blocSaisie(p) {
  return [
    "### Report dans `config/departages.json`",
    "",
    "À remplir après l'entretien, depuis les réponses ci-dessus. Ne pas recopier une",
    "question du responsable : reformuler en situation, sans option valorisée.",
    "",
    "```json",
    JSON.stringify(
      {
        entre: [p.a.id, p.b.id],
        difference: "",
        question: "",
        reponses: [
          { label: "", vers: p.a.id },
          { label: "", vers: p.b.id },
        ],
        source: "responsable",
      },
      null,
      2
    ),
    "```",
  ].join("\n");
}

function enTete(p, blocs) {
  const mesures = [
    `**${pct(p.taux)}** de modules communs (appariement exact, donc borne inférieure)`,
    `corrélation d'axes **${p.correlation == null ? "n/a" : p.correlation.toFixed(2)}** — ${
      p.correlation != null && p.correlation >= 0.9
        ? "les deux obtiendront des scores quasi identiques, le départage se déclenchera systématiquement"
        : "formes de profil distinctes"
    }`,
  ];
  if (p.structureA.publiee && p.structureB.publiee) mesures.push(`${pct(p.tauxUE)} d'unités d'enseignement communes`);
  if (p.aveugleUE) mesures.push("**modules communs mais UE divergentes** : une distinction de direction que le comptage ne voit pas");
  if (p.blocsDivergents.length) {
    const noms = p.blocsDivergents.map((b) => blocs.get(b) || b);
    mesures.push(`bloc d'UE présent d'un seul côté : _${noms.join(" · ")}_`);
  }

  return [
    `# ${p.a.nom}`,
    `# ${p.b.nom}`,
    "",
    `| | ${p.a.nom} | ${p.b.nom} |`,
    "|---|---|---|",
    `| École | ${p.a.ecole || "?"} | ${p.b.ecole || "?"} |`,
    `| Département | ${p.a.departement || "—"} | ${p.b.departement || "—"} |`,
    `| Niveau délivré | ${p.a.niveau} | ${p.b.niveau} |`,
    `| Accès | ${p.a.niveau_acces || "?"} | ${p.b.niveau_acces || "?"} |`,
    `| Modalités | ${(p.a.modalites || []).join(", ") || "—"} | ${(p.b.modalites || []).join(", ") || "—"} |`,
    `| Modules | ${modulesDeFiche(p.a).length} | ${modulesDeFiche(p.b).length} |`,
    "",
    `**Domaine commun :** ${p.domaines.join(", ")}`,
    "",
    "**Ce que le catalogue mesure :**",
    "",
    mesures.map((m) => `- ${m}`).join("\n"),
  ].join("\n");
}

/** Fiche complète : un seul responsable connaît les deux programmes. */
function ficheEntiere(p, blocs) {
  const partages = communs(p.a, p.b);
  const propresA = propres(p.a, p.b);
  const propresB = propres(p.b, p.a);

  return [
    enTete(p, blocs),
    "",
    "---",
    "",
    `## Socle partagé — ${partages.length} modules`,
    "",
    "Ces enseignements ne distinguent rien : ils sont dans les deux programmes. Inutile de",
    "les mentionner en réponse.",
    "",
    liste(partages, "_aucun module identique — les deux programmes se rapprochent par leur forme d'axes, pas par leur contenu_"),
    "",
    "---",
    "",
    `## Propre à ${p.a.nom}`,
    "",
    `**Modules absents de l'autre programme** (${propresA.length})`,
    "",
    liste(propresA),
    "",
    "**Débouchés que l'autre ne cite pas**",
    "",
    liste(metiersPropres(p.a, p.b)),
    "",
    `## Propre à ${p.b.nom}`,
    "",
    `**Modules absents de l'autre programme** (${propresB.length})`,
    "",
    liste(propresB),
    "",
    "**Débouchés que l'autre ne cite pas**",
    "",
    liste(metiersPropres(p.b, p.a)),
    "",
    "---",
    "",
    "## Les trois questions",
    "",
    QUESTIONS.map((q, i) => `**${i + 1}. ${q}**\n\n` + "_".repeat(72) + "\n\n" + "_".repeat(72) + "\n\n" + "_".repeat(72) + "\n").join("\n"),
    "---",
    "",
    blocSaisie(p),
    "",
  ].join("\n");
}

/** Demi-fiche : le responsable ne connaît qu'un des deux programmes. */
function demiFiche(p, cote, blocs) {
  const moi = cote === "a" ? p.a : p.b;
  const autre = cote === "a" ? p.b : p.a;
  const mesProfres = propres(moi, autre);

  return [
    `# ${moi.nom}`,
    "",
    `_Demi-fiche — ${moi.ecole || "?"}._ Ce programme est proche de **${autre.nom}**`,
    `(${autre.ecole || "?"}), que vous n'avez pas à connaître. Les questions ne portent que`,
    "sur votre programme ; le contraste est reconstruit ensuite.",
    "",
    `| | ${moi.nom} |`,
    "|---|---|",
    `| École | ${moi.ecole || "?"} |`,
    `| Niveau délivré | ${moi.niveau} |`,
    `| Accès | ${moi.niveau_acces || "?"} |`,
    `| Modalités | ${(moi.modalites || []).join(", ") || "—"} |`,
    `| Modules | ${modulesDeFiche(moi).length} |`,
    "",
    `**Domaine commun aux deux programmes :** ${p.domaines.join(", ")} · ${pct(p.taux)} de modules communs`,
    "",
    "---",
    "",
    `## Ce que ce programme enseigne et que l'autre n'enseigne pas — ${mesProfres.length} modules`,
    "",
    liste(mesProfres),
    "",
    "## Débouchés que l'autre programme ne cite pas",
    "",
    liste(metiersPropres(moi, autre)),
    "",
    "---",
    "",
    "## Les trois questions",
    "",
    QUESTIONS_DEMI.map((q, i) => `**${i + 1}. ${q}**\n\n` + "_".repeat(72) + "\n\n" + "_".repeat(72) + "\n\n" + "_".repeat(72) + "\n").join("\n"),
    "---",
    "",
    blocSaisie(p),
    "",
  ].join("\n");
}

/* ── CLI ──────────────────────────────────────────────────────── */

function main() {
  const dry = process.argv.includes("--dry");

  if (!fs.existsSync(DIR)) {
    console.error("Aucune fiche. Lance d'abord : npm run extract");
    process.exit(1);
  }
  const fiches = fs
    .readdirSync(DIR)
    .filter((f) => f.endsWith(".json"))
    .map((n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8")));

  const { paires, blocs } = calculerDistinctivite(fiches);
  const nomBloc = new Map(blocs.map((b) => [b.id, b.intitule]));

  // Les options sœurs ne vont pas chez un responsable : le nom de l'option tranche
  // déjà, et le code génère leur question de départage.
  const aTraiter = paires.filter((p) => !p.soeurs);

  if (!dry) {
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
  }

  console.log(`\n  ${paires.length} paires retenues · ${paires.length - aTraiter.length} options sœurs écartées\n`);

  let entieres = 0;
  let demies = 0;
  const parEcole = {};
  const index = [];

  for (const p of aTraiter) {
    const memeEcole = p.a.ecole && p.a.ecole === p.b.ecole;
    const base = `${p.a.id}--${p.b.id}`.slice(0, 90);

    if (memeEcole) {
      entieres++;
      parEcole[p.a.ecole] = (parEcole[p.a.ecole] || 0) + 1;
      index.push({ fichier: `${base}.md`, type: "entière", ecoles: p.a.ecole, p });
      if (!dry) fs.writeFileSync(path.join(OUT, `${base}.md`), ficheEntiere(p, nomBloc));
    } else {
      // À cheval sur deux écoles : une demi-fiche par responsable.
      demies += 2;
      for (const cote of ["a", "b"]) {
        const moi = cote === "a" ? p.a : p.b;
        parEcole[moi.ecole || "?"] = (parEcole[moi.ecole || "?"] || 0) + 1;
        const nom = `${base}--${moi.ecole || "sans-ecole"}.md`;
        index.push({ fichier: nom, type: "demi", ecoles: moi.ecole || "?", p });
        if (!dry) fs.writeFileSync(path.join(OUT, nom), demiFiche(p, cote, nomBloc));
      }
    }
  }

  console.log(`  ${entieres} fiche(s) entière(s) — un seul responsable connaît les deux programmes`);
  console.log(`  ${demies} demi-fiche(s) — ${demies / 2} paire(s) à cheval sur deux écoles\n`);
  for (const [ecole, n] of Object.entries(parEcole).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${ecole.padEnd(20)} ${n} document(s)`);
  }

  if (dry) {
    console.log(`\n  --dry : rien n'a été écrit.\n`);
    return;
  }

  // Un sommaire, pour savoir quoi imprimer pour qui.
  const sommaire = [
    "# Fiches de comparaison — sommaire",
    "",
    "Produites par `npm run comparaisons` depuis `npm run distinctivite`. Une fiche par",
    "paire que le catalogue ne sépare pas assez, options sœurs exclues.",
    "",
    "Filtrer par école : chaque responsable ne reçoit que ses documents.",
    "",
    "| École | Document | Type | Modules communs | r |",
    "|---|---|---|---|---|",
    ...index
      .sort((x, y) => (x.ecoles || "").localeCompare(y.ecoles || "") || x.fichier.localeCompare(y.fichier))
      .map(
        (x) =>
          `| ${x.ecoles} | [${x.fichier}](${x.fichier}) | ${x.type} | ${pct(x.p.taux)} | ${
            x.p.correlation == null ? "n/a" : x.p.correlation.toFixed(2)
          } |`
      ),
    "",
  ].join("\n");
  // `--dry` doit être SEC de bout en bout. Le sommaire et la note de fraîcheur échappaient à
  // la garde : un essai à blanc réécrivait donc data/_comparaisons/SOMMAIRE.md et déclarait
  // l'artefact à jour alors qu'aucune fiche n'avait été produite.
  if (!dry) {
    fs.writeFileSync(path.join(OUT, "SOMMAIRE.md"), sommaire);
    noterFraicheur("data/_comparaisons");
  }

  console.log(`\n  ${index.length} document(s) dans data/_comparaisons/ — voir SOMMAIRE.md\n`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "fiches-comparaison.mjs") {
  main();
}
