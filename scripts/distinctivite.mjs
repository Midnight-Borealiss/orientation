#!/usr/bin/env node
/**
 * distinctivite.mjs — ce qui distingue chaque programme des autres de son domaine.
 *
 *   node scripts/distinctivite.mjs              # enrichit data/filieres/ + rapport
 *   node scripts/distinctivite.mjs --par-domaine 3
 *   node scripts/distinctivite.mjs --dry        # calcule sans rien écrire
 *
 * Le catalogue est la source de la précision : 84 programmes avec leurs modules et
 * leurs métiers. Ce script exploite cette connaissance, et sert trois fois :
 *
 *   1. il fournit le contenu des questions de fin de parcours, dans les mots de la
 *      brochure (`modules_exclusifs`, `metiers_exclusifs`) ;
 *   2. il fournit la justification traçable du résultat ;
 *   3. il produit la liste des paires à départager — l'ordre du jour des entretiens.
 *
 * TROIS MESURES, qui ne disent pas la même chose et ne se remplacent pas :
 *
 *   recouvrement de modules  ce que le catalogue partage. Appariement EXACT, donc une
 *                            borne INFÉRIEURE : « Technologies JAVA-.NET & Python » et
 *                            « Programmation Python » comptent pour deux modules
 *                            distincts alors qu'ils partagent Python. Assumé — un
 *                            appariement flou rendrait le taux ininterprétable.
 *   corrélation d'axes       qui produira un EX ÆQUO au scoring. C'est la mesure qui
 *                            prédit le besoin de départage, et elle ne coïncide pas
 *                            avec la précédente : Génie logiciel et Électronique-
 *                            Télécoms sont à r = 0,94 pour 26 % de modules communs.
 *                            Calculée sur `axes_parts`, jamais sur les notes 1..5 :
 *                            l'arrondi de noter() produisait des ex æquo parfaits.
 *   recouvrement d'UE        là où le comptage est AVEUGLE : deux programmes aux mêmes
 *                            modules mais aux UE différentes ont une vraie distinction
 *                            de direction, que ni les modules ni les axes ne voient.
 *
 * D'où la sélection : les 3 paires les plus proches PAR DOMAINE selon chacune des deux
 * premières mesures — un seuil global unique laisserait passer les paires à 60-79 %,
 * qui produiront pourtant des ex æquo.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normaliser } from "../src/engine/texte.mjs";
import { sontSoeurs } from "../src/engine/parente.mjs";
import { AXES, axesDunModule } from "./lib/fiche.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DIR = path.join(ROOT, "data", "filieres");

/**
 * Repère de lecture, PAS un critère de sélection : au-delà, le catalogue ne sépare
 * plus deux programmes du tout. La sélection se fait par domaine, voir PAR_DOMAINE.
 */
export const SEUIL_PAIRE = 0.8;

/** Combien de paires on retient par domaine, pour chacune des deux mesures. */
export const PAR_DOMAINE = 3;

/** Combien d'exemples distinctifs on garde par fiche (assez pour écrire une question). */
const MAX_EXEMPLES = 8;

/** En dessous, une corrélation ne signale rien : deux programmes sans rapport de forme. */
const CORRELATION_MIN = 0.5;

/* ── Comparaison de deux programmes ───────────────────────────── */

/**
 * Un module se compare sur son intitulé nettoyé : « Comptabilité de Gestion » et
 * « comptabilité de gestion » sont le même enseignement, « Droit » et « Droit des
 * Obligations » ne le sont pas. Pas de rapprochement flou : deux libellés
 * différents restent deux modules différents, sinon le recouvrement devient une
 * opinion et non une mesure.
 */
const cle = (s) =>
  normaliser(s)
    .replace(/^(ue|module|semestre)\s*\d*\s*[:.-]?\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const ensemble = (valeurs) => new Set(valeurs.map(cle).filter((s) => s.length > 2));

const modulesDeFiche = (f) => (f.unites_enseignement || []).flatMap((u) => u.modules || []);

/* ── Structure en UE ──────────────────────────────────────────────
 * Le comptage des axes traite les 1918 modules comme un sac de mots et jette la
 * structure en unités d'enseignement. Or c'est elle qui porte les distinctions que
 * les axes ne voient pas : une même liste de modules rangée autrement décrit un
 * programme tourné vers l'entreprise ou vers l'approfondissement technique.
 * ─────────────────────────────────────────────────────────────── */

/** Intitulé d'UE réduit à sa clé de regroupement (« UE Management & Organisations » → « management organisations »). */
const cleUE = (s) =>
  normaliser(s)
    .replace(/^ue\s*[.:-]?\s*/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Conteneurs produits par l'extraction quand la brochure ne publie AUCUN découpage
 * (catalogue Master : une liste plate de puces sous « Contenus pédagogiques »). Ce
 * ne sont pas des UE : les compter comme telles ferait croire à une structure là où
 * il n'y en a pas, et donnerait une concentration de 100 % à 56 fiches — voir « La
 * structure en UE ne couvre que les licences et bachelors » dans CLAUDE.md.
 */
const CONTENEURS_GENERIQUES = /^(contenus? pedagogiques|contenus? des enseignements|enseignements m[12]|contenu de la formation|programme)$/;

/** Une UE est « récurrente » si au moins ce nombre de programmes la porte. */
const BLOC_MIN_PROGRAMMES = 3;

/**
 * Les UE que le catalogue répète d'un programme à l'autre, détectées par similarité
 * d'intitulé — jamais une liste écrite à la main, qui se périmerait à la prochaine
 * édition. Chacune devient un attribut booléen par programme.
 */
export function blocsRecurrents(fiches) {
  const parCle = new Map();
  for (const f of fiches) {
    for (const u of f.unites_enseignement || []) {
      const k = cleUE(u.intitule || "");
      if (!k || CONTENEURS_GENERIQUES.test(k)) continue;
      if (!parCle.has(k)) parCle.set(k, { cle: k, intitule: u.intitule.trim(), fiches: new Set(), modules: new Set() });
      const bloc = parCle.get(k);
      bloc.fiches.add(f.id);
      for (const m of u.modules || []) bloc.modules.add(cle(m));
    }
  }
  return [...parCle.values()]
    .filter((b) => b.fiches.size >= BLOC_MIN_PROGRAMMES)
    .sort((a, b) => b.fiches.size - a.fiches.size)
    .map((b) => ({ id: b.cle.replace(/\s+/g, "-").slice(0, 48), intitule: b.intitule, cle: b.cle, programmes: [...b.fiches], nbModules: b.modules.size }));
}

/**
 * Concentration : part des modules portée par la plus grosse UE. Un programme dont
 * une seule UE porte 60 % des modules est spécialisé, un programme réparti également
 * sur six UE est généraliste.
 *
 * Mesure brute, **sans seuil et sans libellé dérivé** : rien ne dit encore où placer
 * la frontière, et inventer un seuil ici referait l'erreur des seuils 85/70.
 */
export function structureUE(fiche, blocs) {
  const ues = (fiche.unites_enseignement || []).filter((u) => (u.modules || []).length);
  const reelles = ues.filter((u) => !CONTENEURS_GENERIQUES.test(cleUE(u.intitule || "")));
  const nbModules = ues.reduce((s, u) => s + u.modules.length, 0);
  const publiee = reelles.length >= 2;

  const tailles = reelles.map((u) => u.modules.length);
  const concentration = publiee && nbModules ? Math.round((Math.max(...tailles) / nbModules) * 1000) / 1000 : null;

  const mesCles = new Set(ues.map((u) => cleUE(u.intitule || "")));
  return {
    publiee,
    nb_ue: reelles.length,
    nb_modules: nbModules,
    concentration,
    blocs_types: blocs.filter((b) => mesCles.has(b.cle)).map((b) => b.id),
  };
}

/* ── Options sœurs ────────────────────────────────────────────────
 * Deux options du même programme partagent forcément leur tronc commun : la
 * Licence de Gestion option Comptabilité-Finance et l'option RH ont 43 modules
 * identiques. Un recouvrement élevé y est ATTENDU, pas un défaut du catalogue.
 *
 * Ces paires n'ont donc rien à faire chez un responsable : ce qui les sépare est
 * déjà écrit dans la brochure — le nom de l'option et les quelques modules
 * exclusifs de chacune. La question de départage se génère, elle ne se demande pas.
 * ─────────────────────────────────────────────────────────────── */

// Unique implémentation dans src/engine/parente.mjs : le moteur en a besoin pour ne pas
// générer une question de départage entre deux sœurs, et deux copies divergeraient — une
// paire serait « sœur » ici et « ambiguë » là. Réexportée pour report.mjs.
export { sontSoeurs, racineTitre } from "../src/engine/parente.mjs";

/** Jaccard : part de vocabulaire commun aux deux programmes. Symétrique, donc une paire = une ligne. */
function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/**
 * Le vecteur sur lequel se calcule la corrélation : les **proportions brutes**, pas les
 * notes 1..5. `noter()` écrase 10 points de proportion dans un entier ; sur 5
 * dimensions, cet arrondi fabriquait des égalités exactes à r = 1,00 entre programmes
 * de formes différentes, et un ex æquo parfait n'est pas classable.
 *
 * Repli sur `axes` si `axes_parts` manque — une fiche écrite à la main avant l'ajout du
 * champ reste comparable, avec la précision dégradée que ce repli implique.
 */
function vecteurAxes(f) {
  if (f.axes_parts && AXES.every((x) => Number.isFinite(f.axes_parts[x]))) return AXES.map((x) => f.axes_parts[x]);
  return AXES.map((x) => f.axes?.[x]);
}

/**
 * Corrélation de forme sur les 5 axes comptés — le Pearson qui sert de score au
 * moteur, appliqué ici entre deux FILIÈRES. Deux programmes fortement corrélés
 * obtiendront des scores quasi identiques quel que soit le profil du prospect :
 * le départage se déclenchera systématiquement.
 *
 * `null` si l'un des deux vecteurs est plat : il n'a pas de forme, donc pas de
 * corrélation. Côté filière ce cas est anormal et se signale.
 */
export function correlationAxes(a, b) {
  const va = vecteurAxes(a);
  const vb = vecteurAxes(b);
  if (va.some((v) => !Number.isFinite(v)) || vb.some((v) => !Number.isFinite(v))) return null;
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
  if (da === 0 || db === 0) return null; // vecteur plat : aucune forme
  return num / Math.sqrt(da * db);
}

const arrondi = (n, d = 3) => (n == null ? null : Math.round(n * 10 ** d) / 10 ** d);

/* ── Calcul ───────────────────────────────────────────────────── */

/**
 * Comparaison à l'intérieur du domaine : un programme ne se distingue que de ceux
 * avec qui le prospect peut le confondre. Comparer une licence de droit à un
 * mastère UX Design ne produit aucune information utile.
 */
export function calculerDistinctivite(fiches, seuil = SEUIL_PAIRE, parDomaine = PAR_DOMAINE) {
  const blocs = blocsRecurrents(fiches);
  // Un programme dont trop de modules échappent aux lexiques a des axes qui ne
  // décrivent pas son contenu : le moteur ne doit pas le classer par le score.
  const couverture = couvertureLexicale(fiches);
  const nonFiables = new Set(couverture.signales.map((x) => x.id));

  const index = fiches.map((f) => ({
    fiche: f,
    modules: ensemble(modulesDeFiche(f)),
    metiers: ensemble(f.debouches?.metiers || []),
    ue: new Set((f.unites_enseignement || []).map((u) => cleUE(u.intitule || "")).filter((k) => k && !CONTENEURS_GENERIQUES.test(k))),
    domaines: new Set(f.domaines || []),
    structure: structureUE(f, blocs),
  }));
  const parIdIndex = new Map(index.map((x, i) => [x.fiche.id, i]));

  const resultats = [];
  const candidates = new Map(); // clé "idA|idB" → paire, une seule fois

  for (let i = 0; i < index.length; i++) {
    const a = index[i];
    const voisinage = index.filter((b, j) => j !== i && [...b.domaines].some((d) => a.domaines.has(d)));

    // Modules et métiers que PERSONNE d'autre du domaine n'enseigne / ne propose.
    const ailleursModules = new Set(voisinage.flatMap((b) => [...b.modules]));
    const ailleursMetiers = new Set(voisinage.flatMap((b) => [...b.metiers]));

    const exclusifs = (originaux, ailleurs) => {
      const vus = new Set();
      const out = [];
      for (const brut of originaux) {
        const k = cle(brut);
        if (k.length <= 2 || ailleurs.has(k) || vus.has(k)) continue;
        vus.add(k);
        out.push(brut);
      }
      return out;
    };

    const modules_exclusifs = exclusifs(modulesDeFiche(a.fiche), ailleursModules);
    const metiers_exclusifs = exclusifs(a.fiche.debouches?.metiers || [], ailleursMetiers);

    // Recouvrement : sur les modules, qui décrivent le contenu réel. À défaut de
    // modules (fiche annoncée au sommaire sans page dédiée), sur les métiers.
    const surMetiers = a.modules.size === 0;
    const proches = voisinage
      .map((b) => ({
        id: b.fiche.id,
        nom: b.fiche.nom,
        taux: surMetiers || b.modules.size === 0 ? jaccard(a.metiers, b.metiers) : jaccard(a.modules, b.modules),
        correlation: correlationAxes(a.fiche, b.fiche),
        tauxUE: jaccard(a.ue, b.ue),
        communs: surMetiers ? null : [...a.modules].filter((m) => b.modules.has(m)).length,
      }))
      .sort((x, y) => y.taux - x.taux);

    const plusProche = proches[0] && proches[0].taux > 0 ? proches[0] : null;
    const parAxes = [...proches].filter((p) => p.correlation != null).sort((x, y) => y.correlation - x.correlation)[0] || null;

    resultats.push({
      id: a.fiche.id,
      base: surMetiers ? "metiers" : "modules",
      nbVoisins: voisinage.length,
      structure_ue: a.structure,
      // Trois façons de n'avoir pas d'axes exploitables, une seule conséquence : le
      // moteur ne classe pas ce programme par le score.
      //   - aucun module : les axes valent leur défaut 3-3-3-3-3, une valeur inventée ;
      //   - moins de MODULES_MIN modules : la proportion ne mesure plus rien, un seul
      //     module ferait basculer deux points de note ;
      //   - trop de modules qu'aucun lexique ne reconnaît : les axes décrivent le tiers
      //     du programme que le code a compris, pas le programme.
      axes_fiables: a.structure.nb_modules >= MODULES_MIN && !nonFiables.has(a.fiche.id),
      distinctivite: {
        modules_exclusifs: modules_exclusifs.slice(0, MAX_EXEMPLES),
        metiers_exclusifs: metiers_exclusifs.slice(0, MAX_EXEMPLES),
        recouvrement_max: plusProche ? arrondi(plusProche.taux) : 0,
        plus_proche: plusProche ? plusProche.id : null,
        correlation_axes_max: parAxes ? arrondi(parAxes.correlation) : 0,
        plus_proche_axes: parAxes && parAxes.correlation >= CORRELATION_MIN ? parAxes.id : null,
      },
      // Comptes complets, pour le rapport console (non écrits dans la fiche).
      totalModulesExclusifs: modules_exclusifs.length,
      totalMetiersExclusifs: metiers_exclusifs.length,
      totalModules: a.modules.size,
      axesPlats: correlationAxes(a.fiche, a.fiche) == null,
      proches,
    });

    // Toutes les paires possibles du domaine, une seule fois (i < j). La sélection
    // vient après : elle se fait par domaine, pas par fiche.
    for (const b of proches) {
      const j = parIdIndex.get(b.id);
      if (j == null || j <= i) continue;
      const bi = index[j];
      const communsDomaines = [...a.domaines].filter((d) => bi.domaines.has(d));
      candidates.set(`${a.fiche.id}|${b.id}`, {
        taux: b.taux,
        correlation: b.correlation,
        tauxUE: b.tauxUE,
        a: a.fiche,
        b: bi.fiche,
        // Deux options d'un même programme : recouvrement attendu, traité par le
        // code. Sinon : vraie ambiguïté, à porter devant un responsable.
        soeurs: sontSoeurs(a.fiche, bi.fiche),
        communs: b.communs,
        domaines: communsDomaines,
        propresA: [...a.modules].filter((m) => !bi.modules.has(m)).length,
        propresB: [...bi.modules].filter((m) => !a.modules.has(m)).length,
        uesA: [...a.ue],
        uesB: [...bi.ue],
        structureA: a.structure,
        structureB: bi.structure,
      });
    }
  }

  /* ── Sélection : les 3 plus proches PAR DOMAINE, selon CHACUNE des deux mesures ──
   * Un seuil global unique ne suffit pas. L'appariement exact sous-estime le
   * recouvrement, donc les paires à 60-79 % sont réelles ; et le moteur doit
   * départager tous les programmes d'un domaine, pas seulement les quasi-jumeaux.
   * ─────────────────────────────────────────────────────────────── */

  const toutes = [...candidates.values()];
  const retenues = new Set();
  const motifs = new Map(); // paire → pourquoi elle est retenue

  const marquer = (p, motif) => {
    const k = `${p.a.id}|${p.b.id}`;
    retenues.add(k);
    if (!motifs.has(k)) motifs.set(k, new Set());
    motifs.get(k).add(motif);
  };

  const domaines = [...new Set(toutes.flatMap((p) => p.domaines))].sort();
  for (const d of domaines) {
    const duDomaine = toutes.filter((p) => p.domaines.includes(d));
    for (const p of [...duDomaine].sort((x, y) => y.taux - x.taux).slice(0, parDomaine)) {
      if (p.taux > 0) marquer(p, "modules");
    }
    // Sur 5 entiers de 1 à 5, la corrélation SATURE : 27 paires du catalogue sont
    // à r ≥ 0,97, dont plusieurs à 1,00 exactement (Pearson est invariant d'échelle,
    // donc deux formes proportionnelles corrèlent à 1 sans avoir le même vecteur).
    // Un `slice(0, 3)` sur des ex æquo choisirait arbitrairement : on départage donc
    // les égalités par le recouvrement de modules, qui désigne les paires réellement
    // confondables, puis par l'id pour rester déterministe.
    for (const p of [...duDomaine]
      .filter((x) => x.correlation != null && x.correlation >= CORRELATION_MIN)
      .sort(
        (x, y) =>
          y.correlation - x.correlation ||
          y.taux - x.taux ||
          `${x.a.id}|${x.b.id}`.localeCompare(`${y.a.id}|${y.b.id}`)
      )
      .slice(0, parDomaine)) {
      marquer(p, "axes");
    }
  }

  const paires = toutes
    .filter((p) => retenues.has(`${p.a.id}|${p.b.id}`))
    .map((p) => ({
      ...p,
      taux: arrondi(p.taux),
      correlation: arrondi(p.correlation),
      tauxUE: arrondi(p.tauxUE),
      motifs: [...motifs.get(`${p.a.id}|${p.b.id}`)].sort(),
      // Le comptage est AVEUGLE ici : les modules se recouvrent nettement plus que
      // les UE. Une distinction de direction existe — qu'est-ce qui sert à quoi — et
      // ni les modules ni les axes ne la voient.
      aveugleUE: p.taux >= 0.25 && p.structureA.publiee && p.structureB.publiee && p.tauxUE <= p.taux - 0.2,
      // Le marqueur le plus net, et le plus lisible pour un responsable : l'un porte
      // un bloc d'UE récurrent que l'autre n'a pas. `management-organisations` d'un
      // côté et rien de l'autre sépare un programme tourné vers l'entreprise d'un
      // programme d'approfondissement technique, sans aucun lexique.
      blocsDivergents: [
        ...(p.structureA.blocs_types || []).filter((x) => !(p.structureB.blocs_types || []).includes(x)),
        ...(p.structureB.blocs_types || []).filter((x) => !(p.structureA.blocs_types || []).includes(x)),
      ],
    }))
    // Ordre de lecture pour un responsable : d'abord les paires que les DEUX mesures
    // désignent — signal le plus fort —, puis par recouvrement de modules décroissant,
    // qui est ce qu'il peut vérifier lui-même dans la brochure.
    .sort(
      (x, y) =>
        y.motifs.length - x.motifs.length ||
        y.taux - x.taux ||
        (y.correlation ?? 0) - (x.correlation ?? 0) ||
        `${x.a.id}|${x.b.id}`.localeCompare(`${y.a.id}|${y.b.id}`)
    );

  // `voisines` d'une fiche = les programmes avec qui elle forme une paire retenue.
  const voisinesParId = new Map();
  for (const p of paires) {
    for (const [x, y] of [
      [p.a.id, p.b.id],
      [p.b.id, p.a.id],
    ]) {
      if (!voisinesParId.has(x)) voisinesParId.set(x, []);
      voisinesParId.get(x).push(y);
    }
  }
  for (const r of resultats) r.voisines = (voisinesParId.get(r.id) || []).sort();

  return { resultats, paires, blocs };
}

/* ── Contrôle de couverture des lexiques ──────────────────────────
 * Un programme dont la moitié des modules n'est reconnue par aucun lexique a des
 * axes qui ne décrivent pas son contenu. C'est ce contrôle, et lui seul, qui aurait
 * détecté le bug d'UX Design : 55 % de modules non reconnus quand la moyenne du
 * catalogue est à 26 %.
 * ─────────────────────────────────────────────────────────────── */

/** Au-delà de ce multiple de la moyenne du catalogue, un programme est signalé. */
const COUVERTURE_FACTEUR = 1.6;

/**
 * En dessous, une proportion de modules ne mesure plus rien : sur 5 modules, un seul
 * vaut 20 % et fait basculer deux points de note. Ces fiches sont exclues du contrôle
 * de taux — sinon un unique orphelin les signalerait toutes — et leurs axes sont
 * déclarés non fiables pour la même raison.
 */
export const MODULES_MIN = 6;

export function couvertureLexicale(fiches, facteur = COUVERTURE_FACTEUR) {
  const parFiche = fiches
    .map((f) => {
      const modules = modulesDeFiche(f);
      const orphelins = modules.filter((m) => !axesDunModule(m).length);
      return { id: f.id, nom: f.nom, nbModules: modules.length, orphelins: orphelins.length, exemples: orphelins.slice(0, 4) };
    })
    .filter((x) => x.nbModules);

  const totalModules = parFiche.reduce((s, x) => s + x.nbModules, 0);
  const totalOrphelins = parFiche.reduce((s, x) => s + x.orphelins, 0);
  const moyenne = totalModules ? totalOrphelins / totalModules : 0;

  for (const x of parFiche) x.taux = x.orphelins / x.nbModules;
  const signales = parFiche
    .filter((x) => x.nbModules >= MODULES_MIN && x.taux > moyenne * facteur)
    .sort((a, b) => b.taux - a.taux);

  return { moyenne, seuil: moyenne * facteur, totalModules, signales, parFiche };
}

/* ── CLI ──────────────────────────────────────────────────────── */

function main() {
  const args = process.argv.slice(2);
  const seuil = args.includes("--seuil") ? Number(args[args.indexOf("--seuil") + 1]) : SEUIL_PAIRE;
  const parDomaine = args.includes("--par-domaine") ? Number(args[args.indexOf("--par-domaine") + 1]) : PAR_DOMAINE;
  const dry = args.includes("--dry");

  if (!fs.existsSync(DIR)) {
    console.error("Aucune fiche. Lance d'abord : npm run extract");
    process.exit(1);
  }
  const fichiers = fs.readdirSync(DIR).filter((f) => f.endsWith(".json"));
  if (!fichiers.length) {
    console.error("Aucune fiche dans data/filieres/. Lance d'abord : npm run extract");
    process.exit(1);
  }

  const fiches = fichiers.map((n) => JSON.parse(fs.readFileSync(path.join(DIR, n), "utf8")));
  const { resultats, paires, blocs } = calculerDistinctivite(fiches, seuil, parDomaine);
  const parId = new Map(resultats.map((r) => [r.id, r]));

  console.log(`\n  ${fiches.length} programmes comparés à l'intérieur de leur domaine\n`);

  // Ce que le catalogue sépare tout seul, et ce qu'il ne sépare pas.
  const sansExclusif = resultats.filter((r) => !r.totalModulesExclusifs && r.totalModules);
  const isoles = resultats.filter((r) => !r.nbVoisins);

  console.log(`  ${resultats.length - sansExclusif.length - isoles.length} programmes ont au moins un module exclusif dans leur domaine`);
  console.log(`  ${isoles.length} seuls dans leur domaine (rien à départager)`);
  if (sansExclusif.length) {
    console.log(`  ${sansExclusif.length} sans aucun module exclusif :`);
    for (const r of sansExclusif) console.log(`      ${r.id} → voisin : ${r.distinctivite.plus_proche}`);
  }

  // Un vecteur d'axes plat n'a pas de forme : le moteur ne pourrait pas le classer.
  const plats = resultats.filter((r) => r.axesPlats);
  if (plats.length) {
    console.log(`\n  ⚠ ${plats.length} fiche(s) aux 5 axes identiques — aucune forme, donc non classables :`);
    for (const r of plats) console.log(`      ${r.id}`);
  }

  /* ── Structure en UE ──────────────────────────────────────── */

  const publiees = resultats.filter((r) => r.structure_ue.publiee);
  console.log(`\n  ` + "─".repeat(74));
  console.log(`\n  Structure en UE`);
  console.log(`    ${publiees.length} programmes sur ${resultats.length} ont un découpage en UE publié`);
  console.log(`    ${resultats.length - publiees.length} n'ont qu'une liste plate de modules (catalogue Master) : concentration non calculable`);
  if (publiees.length) {
    const c = publiees.map((r) => r.structure_ue.concentration).sort((a, b) => a - b);
    console.log(
      `    concentration : min ${c[0].toFixed(2)} · médiane ${c[Math.floor(c.length / 2)].toFixed(2)} · max ${c.at(-1).toFixed(2)}` +
        `   (part des modules dans la plus grosse UE)`
    );
  }
  console.log(`\n    ${blocs.length} UE récurrentes détectées (≥ ${BLOC_MIN_PROGRAMMES} programmes), sans liste écrite à la main :`);
  for (const b of blocs.slice(0, 8)) {
    console.log(`      ${String(b.programmes.length).padStart(2)} programmes  ${b.intitule.slice(0, 56)}`);
  }

  /* ── Paires retenues ──────────────────────────────────────── */

  const ambigues = paires.filter((p) => !p.soeurs);
  const soeurs = paires.filter((p) => p.soeurs);

  console.log(`\n  ` + "─".repeat(74));
  console.log(`\n  ${paires.length} paires retenues — les ${parDomaine} plus proches par domaine, selon chacune des deux mesures`);
  console.log(`    ${paires.filter((p) => p.motifs.includes("modules")).length} par recouvrement de modules`);
  console.log(`    ${paires.filter((p) => p.motifs.includes("axes")).length} par corrélation d'axes (celles qui produiront un ex æquo)`);
  console.log(`    ${paires.filter((p) => p.motifs.length === 2).length} par les deux`);
  console.log(`    ${paires.filter((p) => p.taux >= seuil).length} dépassent aussi l'ancien seuil unique de ${Math.round(seuil * 100)} %`);

  console.log(`\n  ${ambigues.length} paire(s) à soumettre aux responsables\n`);
  const ligne = (p) => {
    const marques = [];
    if (p.motifs.includes("modules")) marques.push("modules");
    if (p.motifs.includes("axes")) marques.push("axes");
    if (p.aveugleUE) marques.push("UE divergentes");
    console.log(`  ${String(Math.round(p.taux * 100)).padStart(3)} % modules · r = ${p.correlation == null ? " n/a" : p.correlation.toFixed(2)}   ${p.a.nom.slice(0, 52)}`);
    console.log(`                          ${p.b.nom.slice(0, 52)}`);
    console.log(`        ${p.domaines.join(", ")} · ${p.communs ?? "?"} modules communs · retenue par : ${marques.join(" + ")}`);
  };
  for (const p of ambigues) ligne(p);

  if (soeurs.length) {
    console.log(`\n  ${soeurs.length} paire(s) d'options sœurs — traitées par le code, aucun responsable requis\n`);
    for (const p of soeurs) {
      const parent = p.a.programme_parent || p.b.programme_parent || "programme non publié";
      console.log(`  ${String(Math.round(p.taux * 100)).padStart(3)} %  ${p.a.option || p.a.nom} / ${p.b.option || p.b.nom}`);
      console.log(`         ${parent} · le nom de l'option et ${p.propresA}/${p.propresB} modules propres suffisent à trancher`);
    }
  }

  const aveugles = paires.filter((p) => p.aveugleUE);
  console.log(`\n  ${aveugles.length} paire(s) où le comptage est aveugle — modules communs, UE divergentes :`);
  for (const p of aveugles) {
    console.log(`    ${Math.round(p.taux * 100)} % de modules mais ${Math.round(p.tauxUE * 100)} % d'UE  ${p.a.id} ↔ ${p.b.id}`);
  }

  // Marqueur le plus lisible : un bloc d'UE récurrent présent d'un seul côté.
  const nomBloc = new Map(blocs.map((b) => [b.id, b.intitule]));
  const divergentes = paires.filter((p) => p.blocsDivergents.length);
  console.log(`\n  ${divergentes.length} paire(s) séparées par un bloc d'UE récurrent présent d'un seul côté :`);
  for (const p of divergentes.slice(0, 12)) {
    console.log(`    ${p.a.id.slice(0, 32)} ↔ ${p.b.id.slice(0, 32)}`);
    console.log(`        ${p.blocsDivergents.map((b) => nomBloc.get(b) || b).join(" · ").slice(0, 100)}`);
  }

  /* ── Couverture des lexiques ──────────────────────────────── */

  const couv = couvertureLexicale(fiches);
  console.log(`\n  ` + "─".repeat(74));
  console.log(`\n  Couverture des lexiques d'axes : ${Math.round(couv.moyenne * 100)} % des ${couv.totalModules} modules ne sont reconnus par aucun axe`);
  if (!couv.signales.length) {
    console.log(`    Aucun programme ne dépasse nettement cette moyenne.`);
  } else {
    console.log(`    ${couv.signales.length} programme(s) au-delà de ${Math.round(couv.seuil * 100)} % — leurs axes ne décrivent pas leur contenu :`);
    for (const x of couv.signales) {
      console.log(`      ${String(Math.round(x.taux * 100)).padStart(3)} %  ${x.id}  (${x.orphelins}/${x.nbModules})`);
      console.log(`             ex. ${x.exemples.join(" · ").slice(0, 90)}`);
    }
  }

  const nonFiables = resultats.filter((r) => !r.axes_fiables);
  console.log(`\n  ${nonFiables.length} programme(s) marqués axes_fiables: false`);
  console.log(`    Le moteur ne doit PAS les classer par le score : filtres et aiguillage seulement,`);
  console.log(`    avec mention. Voir CLAUDE.md > Programmes aux axes non fiables.`);
  for (const r of nonFiables) {
    const raison = !r.structure_ue.nb_modules
      ? "aucun module"
      : r.structure_ue.nb_modules < MODULES_MIN
        ? `${r.structure_ue.nb_modules} modules seulement`
        : "couverture lexicale insuffisante";
    console.log(`      ${r.id.padEnd(58)} ${raison}`);
  }

  if (dry) {
    console.log(`\n  --dry : rien n'a été écrit.\n`);
    return;
  }

  // Enrichissement des fiches
  for (const nom of fichiers) {
    const chemin = path.join(DIR, nom);
    const f = JSON.parse(fs.readFileSync(chemin, "utf8"));
    const r = parId.get(f.id);
    if (!r) continue;
    f.distinctivite = r.distinctivite;
    f.structure_ue = r.structure_ue;
    f.axes_fiables = r.axes_fiables;
    f.voisines = r.voisines;
    f.meta.sources = {
      ...f.meta.sources,
      distinctivite: "inference",
      structure_ue: "inference",
      axes_fiables: "inference",
      voisines: "inference",
    };
    fs.writeFileSync(chemin, JSON.stringify(f, null, 2) + "\n");
  }

  // Les vraies ambiguïtés d'abord : le CSV s'envoie tel quel, et personne ne doit
  // avoir à trier les lignes qui ne le concernent pas.
  const csv = [
    "type,destinataire,retenue_par,recouvrement_modules,correlation_axes,recouvrement_ue,ue_divergentes,id_a,nom_a,option_a,id_b,nom_b,option_b,ecole_a,ecole_b,programme_parent,domaine_commun,modules_communs,modules_propres_a,modules_propres_b,question_de_departage,reponse_a,reponse_b",
    ...[...ambigues, ...soeurs].map((p) =>
      [
        p.soeurs ? "option-soeurs" : "ambigue",
        p.soeurs ? "code" : "responsable",
        p.motifs.join("+"),
        Math.round(p.taux * 100) + "%",
        p.correlation == null ? "" : p.correlation.toFixed(2),
        Math.round(p.tauxUE * 100) + "%",
        p.aveugleUE ? "oui" : "",
        p.a.id,
        p.a.nom,
        p.a.option || "",
        p.b.id,
        p.b.nom,
        p.b.option || "",
        p.a.ecole || "",
        p.b.ecole || "",
        p.a.programme_parent || p.b.programme_parent || "",
        p.domaines.join(" "),
        p.communs,
        p.propresA,
        p.propresB,
        "",
        "",
        "",
      ]
        .map((c) => `"${String(c).replace(/"/g, '""')}"`)
        .join(",")
    ),
  ].join("\n");
  fs.writeFileSync(path.join(ROOT, "data", "_paires.csv"), csv);

  console.log(`\n  ${fichiers.length} fiches enrichies (distinctivite, structure_ue, axes_fiables, voisines)`);
  console.log(
    `  data/_paires.csv : ${ambigues.length} ligne(s) pour les responsables, ${soeurs.length} option(s) sœurs pour information`
  );
  console.log(`\n  Étape suivante :  npm run comparaisons   puis   npm run validate   puis   npm run report -- --csv\n`);
}

if (process.argv[1] && path.basename(process.argv[1]) === "distinctivite.mjs") {
  main();
}
