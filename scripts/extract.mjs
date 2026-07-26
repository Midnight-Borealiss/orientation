#!/usr/bin/env node
/**
 * extract.mjs — catalogues PDF ---> fiches filière (brouillon)
 *
 *   node scripts/extract.mjs                  # traite data/brochures/*.pdf
 *   node scripts/extract.mjs --file x.pdf     # un seul catalogue
 *   node scripts/extract.mjs --dump           # + texte segmenté dans data/_raw/
 *
 * Les sources ne sont PAS des brochures par filière : ce sont trois catalogues
 * de 40 à 80 pages contenant des dizaines de programmes. Le script segmente donc
 * chaque catalogue en programmes avant de construire les fiches, avec un profil
 * de parsing par catalogue (voir scripts/lib/profils.mjs).
 *
 * Il ne DEVINE jamais en silence : tout champ non trouvé reste null et ressort
 * dans scripts/report.mjs. Chaque champ trouvé porte sa source dans meta.sources.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { lirePdf, normaliser } from "./lib/pdf-layout.mjs";
import { choisirProfil, typeEntete, rattacherSections } from "./lib/profils.mjs";
import {
  slug,
  normaliserTitre,
  construireUE,
  modulesDe,
  extraireMetiers,
  niveauDelivre,
  niveauAcces,
  detecterModalites,
  detecterPartenariats,
  compterAxes,
  normaliserParcours,
  cleParcours,
  compterExigenceQuantitative,
  inferDomaines,
} from "./lib/fiche.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const IN_DIR = path.join(ROOT, "data", "brochures");
const OUT_DIR = path.join(ROOT, "data", "filieres");
const RAW_DIR = path.join(ROOT, "data", "_raw");

const taxonomie = JSON.parse(fs.readFileSync(path.join(ROOT, "config", "taxonomy.json"), "utf8"));
const DOMAINES_OK = new Set(taxonomie.domaines.map((d) => d.id));
const ECOLES = new Map(taxonomie.ecoles.map((e) => [e.id, e]));

/* ══ Segmentation ═══════════════════════════════════════════════ */

const aDesLettres = (s) => /[a-zA-ZÀ-ÿ]{2}/.test(s);

/** Un programme = un titre + les blocs OBJECTIF / CONTENU / DÉBOUCHÉS qui suivent. */
function segmenter(pages, profil, journal) {
  const programmes = [];
  let enAttente = null; // titre rencontré sans en-tête : le bloc arrive page suivante

  for (const page of pages) {
    const { lignes, entetes } = rattacherSections(page.colonnes, profil, page.hauteur);
    const groupes =
      profil.segmentation === "colonne"
        ? page.colonnes.map((c) => ({
            index: c.index,
            lignesColonne: c.lignes,
            entetes: entetes.filter((e) => e.colonne === c.index),
            lignes: lignes.filter((l) => l.colonne === c.index),
          }))
        : [{ index: null, lignesColonne: page.colonnes.flatMap((c) => c.lignes), entetes, lignes }];

    for (const g of groupes) {
      const types = new Set(g.entetes.map((e) => e.type));
      const utiles = profil.exigeContenu
        ? types.has("objectif") && types.has("contenu")
        : types.has("objectif") || types.has("contenu");
      const hautTitre = Math.max(...g.entetes.map((e) => e.y), -Infinity);

      // Au-dessus du premier en-tête : le titre, plus d'éventuelles mentions
      // (parcours, double diplôme, voie d'accès). Le titre n'est pas d'une seule
      // taille de police — « licence de gestion » en 25pt est complété par
      // « option Management international » en 14pt. On prend donc tout ce qui
      // fait au moins la moitié de la plus grande police du bloc.
      const dessus = g.lignesColonne.filter((l) => aDesLettres(l.texte) && (utiles ? l.y > hautTitre : true));
      const hMax = Math.max(...dessus.map((l) => l.h), 0);
      const seuilTitre = hMax >= profil.hauteurTitre ? Math.max(hMax / 2, 10) : Infinity;

      const titres = dessus.filter((l) => l.h >= seuilTitre).sort((a, b) => b.y - a.y || a.x - b.x);
      // « Master en Fiscalité- » + « Droit des Affaires » se recolle sans espace,
      // mais « Executive MBA - » + « parcours en Français » garde le sien : le
      // trait d'union collé à une lettre coupe un mot, précédé d'une espace il
      // sépare deux membres du titre.
      const titre = titres
        .reduce((acc, l) => (acc && /\p{L}-$/u.test(acc) ? acc + l.texte : acc ? `${acc} ${l.texte}` : l.texte), "")
        .replace(/\s+/g, " ")
        .trim();

      const mentions = utiles
        ? dessus.filter((l) => l.h < seuilTitre).sort((a, b) => b.y - a.y).map((l) => l.texte)
        : [];

      if (!utiles) {
        // Page de titre seule (Executive MBA, DBA) : on garde le titre en attente.
        if (titre && titre.length > 8 && !/^(rejoignez|integrez|optez|choisissez|decouvrez)/.test(normaliser(titre))) {
          enAttente = { titre, mentions: g.lignesColonne.filter((l) => l.h < profil.hauteurTitre).map((l) => l.texte), page: page.numero, lignes: g.lignes };
        }
        continue;
      }

      const paquet = {
        titre,
        mentions,
        page: page.numero,
        colonne: g.index,
        sections: { objectif: [], contenu: [], debouches: [] },
      };
      for (const l of g.lignes) {
        if (l.section && paquet.sections[l.section]) paquet.sections[l.section].push(l);
      }

      if (!titre) {
        if (enAttente) {
          paquet.titre = enAttente.titre;
          paquet.mentions = [...enAttente.mentions, ...paquet.mentions];
          paquet.pageTitre = enAttente.page;
          for (const l of enAttente.lignes) if (!l.section) paquet.sections.objectif.push(l);
          enAttente = null;
        } else if (programmes.length) {
          // Suite d'un programme entamé : on complète le précédent.
          const p = programmes[programmes.length - 1];
          for (const [k, v] of Object.entries(paquet.sections)) p.sections[k].push(...v);
          journal.push(`p.${page.numero} : bloc sans titre rattaché à « ${p.titre} »`);
          continue;
        } else {
          journal.push(`p.${page.numero} : bloc sans titre ignoré`);
          continue;
        }
      } else {
        enAttente = null;
      }

      programmes.push(paquet);
    }
  }
  return programmes;
}

/* ══ École par page ═════════════════════════════════════════════ */

/**
 * L'école se lit dans le PDF, jamais dans le nom du dossier : chaque catalogue
 * couvre plusieurs écoles. Deux signaux, dans cet ordre : un titre de section
 * (« REJOIGNEZ L'ÉCOLE DE MANAGEMENT »), puis le pied de page des pages impaires
 * (« École de Management p.25 »).
 */
function ecolesParPage(pages, profil) {
  const parSection = new Array(pages.length).fill(null);
  const parPied = new Array(pages.length).fill(null);

  pages.forEach((page, i) => {
    const toutes = page.colonnes.flatMap((c) => c.lignes);
    for (const [re, id] of profil.ecoleDepuisSection || []) {
      if (toutes.some((l) => re.test(normaliser(l.texte)))) parSection[i] = id;
    }
    for (const l of toutes.filter((l) => l.y < 45)) {
      for (const [re, id] of profil.ecoleDepuisPied || []) {
        if (re.test(normaliser(l.texte))) parPied[i] = id;
      }
    }
  });

  // Report du dernier titre de section rencontré
  let courante = profil.ecoleParDefaut || null;
  const reportSection = parSection.map((e) => (e ? (courante = e) : courante));

  return pages.map((_, i) => {
    if (parPied[i]) return parPied[i];
    // Une page paire porte un pied de page générique : l'école est sur la suivante.
    for (let j = i + 1; j < Math.min(pages.length, i + 3); j++) if (parPied[j]) return parPied[j];
    for (let j = i - 1; j >= Math.max(0, i - 3); j--) if (parPied[j]) return parPied[j];
    return reportSection[i];
  });
}

/* ══ Sommaire du catalogue Bachelor (page 13) ══════════════════ */

const nettoyerTitre = (s) =>
  s
    .replace(/\((?:[^)]*(?:diplome|diplôme|accessible|bac|iesa|inu|double)[^)]*)\)/gi, " ")
    .replace(/\*+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const cleTitre = (s) =>
  normaliser(nettoyerTitre(s))
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Ce que l'entrée du sommaire annonce, en plus du titre.
 *
 * Le sommaire du catalogue Bachelor est régulier : `Bachelor en Gestion (accessible après
 * bac+2) full time`. Niveau d'accès entre parenthèses, modalité en suffixe.
 *
 * POURQUOI L'EXTRAIRE EXPLICITEMENT, alors que ça « marchait déjà ». Ça marchait par accident :
 * le titre brut de l'entrée était concaténé dans le texte servi aux détecteurs, qui y
 * retrouvaient « bac+2 » et « full time » par expression régulière. Deux conséquences que
 * personne n'aurait vues venir :
 *
 *   - une édition qui pose la mention sur une ligne séparée du titre, ou qui l'écrit
 *     autrement, ferait disparaître la modalité SANS ALERTE — la fiche sortirait simplement
 *     en `presentiel` ;
 *   - on ne peut rien CROISER avec la page du programme si la donnée n'existe pas comme champ.
 *     Or c'est le croisement qui dit si les deux sources se contredisent.
 *
 * Le titre nu est conservé à part. On ne s'en sert PAS pour l'`id` : un `id` qui change crée
 * une fiche orpheline et n'emporte pas le travail humain déjà saisi. Voir CLAUDE.md.
 */
function annotationsSommaire(titre) {
  const n = normaliser(titre);

  // « (accessible après bac+2) », « (accessible apres un bac +2) »
  const acces = n.match(/accessible\s+(?:apres\s+)?(?:un\s+)?bac\s*\+?\s*(\d)/);
  const niveauAcces = acces && Number(acces[1]) >= 2 && Number(acces[1]) <= 5 ? `bac+${acces[1]}` : null;

  const modalites = [];
  if (/full ?time/.test(n)) modalites.push("full-time");
  if (/week-?end/.test(n)) modalites.push("week-end");
  if (/cours du soir/.test(n)) modalites.push("cours-du-soir");
  if (/en ligne|a distance/.test(n)) modalites.push("en-ligne");

  const titreNu = titre
    .replace(/\((?:[^()]*accessible[^()]*)\)/gi, " ")
    .replace(/\b(full ?time|week-?end|cours du soir|en ligne)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { niveauAcces, modalites, titreNu };
}

/**
 * Le sommaire (« 4 écoles, 26 possibilités ») est la référence de segmentation :
 * il énumère les 26 programmes et donne pour chacun son école, son département, son niveau
 * d'accès et sa modalité.
 */
function lireSommaire(pages, profil) {
  const page = pages.find((p) => p.numero === profil.sommaire.page);
  if (!page) return [];
  const entrees = [];

  for (const col of page.colonnes) {
    let ecole = null;
    let sousSection = null;
    let derniere = null;

    for (const l of col.lignes) {
      const t = l.texte.trim();
      const n = normaliser(t);
      if (!aDesLettres(t)) continue;
      if (/^[(*]/.test(t)) continue; // note de bas de page

      if (l.h >= profil.sommaire.hauteurSection) {
        const trouve = profil.sommaire.sections.find(([re]) => re.test(n));
        ecole = trouve ? trouve[1] : ecole;
        sousSection = null;
        derniere = null;
        continue;
      }

      const estEntree = profil.sommaire.entree.test(n) && n.split(" ").length >= 2;
      if (estEntree) {
        const departements = (ECOLES.get(ecole)?.departements || []).map(normaliser);
        const entree = {
          titre: t,
          ecole,
          departement: sousSection && departements.includes(normaliser(sousSection)) ? sousSection : null,
          option: /^option\b/i.test(t) ? t.replace(/^option\s*/i, "").trim() : null,
          parent: null,
          x: l.x,
        };
        if (entree.option) {
          const parent = [...entrees].reverse().find((e) => !e.option && e.ecole === ecole);
          entree.parent = parent ? parent.titre : null;
        }
        entrees.push(entree);
        derniere = entree;
        continue;
      }

      if (derniere && Math.abs(l.x - derniere.x) <= 2) {
        derniere.titre = `${derniere.titre} ${t}`.replace(/\s+/g, " ");
        continue;
      }
      sousSection = t;
      derniere = null;
    }
  }

  // Les annotations se lisent APRÈS coup : le titre d'une entrée s'accumule sur plusieurs
  // lignes de même abscisse, et « (accessible après bac+2) full time » arrive souvent sur la
  // suivante. Les analyser au fil de la lecture n'en verrait que la première moitié.
  for (const e of entrees) Object.assign(e, annotationsSommaire(e.titre));

  return entrees;
}

/** Apparie les programmes trouvés dans les pages aux entrées du sommaire. */
function apparier(entrees, programmes) {
  const restants = new Set(programmes);
  const paires = new Map();

  const tokens = (s) => new Set(cleTitre(s).split(" ").filter(Boolean));
  const jaccard = (a, b) => {
    const A = tokens(a);
    const B = tokens(b);
    const inter = [...A].filter((t) => B.has(t)).length;
    return inter / (A.size + B.size - inter || 1);
  };

  // 1. égalité stricte des titres normalisés
  for (const e of entrees) {
    const exact = [...restants].filter((p) => cleTitre(p.titre) === cleTitre(e.titre));
    if (exact.length === 1) {
      paires.set(e, exact[0]);
      restants.delete(exact[0]);
    }
  }
  // 2. inclusion, si elle est sans ambiguïté
  for (const e of entrees.filter((e) => !paires.has(e))) {
    const ce = cleTitre(e.titre);
    const inclus = [...restants].filter((p) => {
      const cp = cleTitre(p.titre);
      return cp.includes(ce) || ce.includes(cp);
    });
    if (inclus.length === 1) {
      paires.set(e, inclus[0]);
      restants.delete(inclus[0]);
    }
  }
  // 3. recouvrement lexical, seuil haut
  for (const e of entrees.filter((e) => !paires.has(e))) {
    const notes = [...restants]
      .map((p) => ({ p, s: jaccard(e.titre, p.titre) }))
      .sort((a, b) => b.s - a.s);
    if (notes.length && notes[0].s >= 0.6 && (notes.length === 1 || notes[0].s - notes[1].s > 0.1)) {
      paires.set(e, notes[0].p);
      restants.delete(notes[0].p);
    }
  }

  return { paires, orphelins: [...restants] };
}

/* ══ Construction de la fiche ══════════════════════════════════ */

function construireFiche(programme, contexte, profil) {
  const sources = {};
  const tracer = (champ, source, valeur) => {
    const vide =
      valeur == null || (Array.isArray(valeur) && !valeur.length) || (typeof valeur === "string" && !valeur.trim());
    if (!vide) sources[champ] = source;
    return valeur;
  };

  /* ── L'AFFICHAGE SE DISSOCIE DE L'IDENTITÉ ──────────────────────
   * L'`id` reste calculé sur le titre TEL QUE LU, annotations comprises : un `id` qui change
   * crée une fiche orpheline et n'emporte pas le travail humain déjà saisi (voir CLAUDE.md).
   *
   * Le `nom`, lui, prend le titre débarrassé des annotations du sommaire. Deux raisons :
   *   - la modalité est déjà affichée à côté du nom, l'avoir dans le titre est redondant ;
   *   - surtout, deux programmes dont la seule différence réelle est la modalité doivent se
   *     ressembler à l'écran. Un intitulé qui absorbe « full time » d'un côté et pas de
   *     l'autre fait croire à deux programmes sans lien. C'est le doublon présentiel / en
   *     ligne sous une autre forme, et il se règle de la même façon : le nom nomme le
   *     programme, la modalité se lit à côté.
   * ─────────────────────────────────────────────────────────── */
  const titreLu = programme?.titre || contexte.entree?.titre || "";
  const idBase = slug(normaliserTitre(nettoyerTitre(titreLu)));
  // La page reste la source du titre quand elle existe — le sommaire ne fournit le titre que
  // pour les entrées sans page dédiée. On retire les annotations de CE titre-là, quelle qu'en
  // soit la provenance : un titre de page qui en porterait serait nettoyé de la même façon.
  const nom = normaliserTitre(nettoyerTitre(annotationsSommaire(titreLu).titreNu || titreLu));

  const objectif = (programme?.sections.objectif || []).map((l) => l.texte).join(" ").replace(/\s+/g, " ").trim();
  const ue = construireUE(programme?.sections.contenu || [], "Contenus pédagogiques");
  const modules = modulesDe(ue);

  /* ── Contrôle : la dernière UE finit-elle là où la section finit ? ──
   * Une UE perdue ne laisse aucune trace dans la fiche — elle a simplement moins de
   * modules, et rien ne dit combien elle aurait dû en avoir. Le seul témoin est
   * géométrique : les lignes de contenu que la construction n'a pas consommées se
   * trouvent EN BAS de la section. Une fiche dont la dernière UE s'arrête loin de la
   * fin de sa section est donc suspecte, et c'est ce contrôle — pas une relecture —
   * qui a rendu visibles les 4 modules manquants du Bachelor Professionnel.
   * ─────────────────────────────────────────────────────────── */
  const lignesContenu = programme?.sections.contenu || [];
  if (lignesContenu.length && ue.length && contexte.journal) {
    // Clé insensible à la ponctuation : l'intitulé retenu est nettoyé (« UE. » → « UE »),
    // comparer les chaînes brutes signalerait comme perdue chaque UE réellement présente.
    const cle = (t) => normaliser(t).replace(/[^a-z0-9]/g, "");
    const repris = [...modules, ...ue.map((u) => u.intitule)].map(cle);
    const orphelines = lignesContenu.filter((l) => {
      const t = cle(l.texte.replace(/^\s*([•·▪◦*]|\d+[.)])\s*/, ""));
      return t.length > 3 && !repris.some((v) => v.includes(t));
    });
    // Les lignes non reprises ne comptent que si elles sont sous la dernière UE : au-dessus,
    // ce sont des restes d'en-tête déjà écartés à dessein.
    const yMin = Math.min(...lignesContenu.map((l) => l.y));
    const perduesEnBas = orphelines.filter((l) => l.y <= yMin + 40);
    if (perduesEnBas.length) {
      contexte.journal.push(
        `ALERTE UE : « ${nom} » — ${perduesEnBas.length} ligne(s) de contenu non reprise(s) en bas de section : ` +
          perduesEnBas.map((l) => `« ${l.texte} »`).join(", ")
      );
    }
  }
  const metiers = extraireMetiers(programme?.sections.debouches || [], profil.separateurMetiers);

  const mentions = (programme?.mentions || []).join(" ");
  const texteComplet = [programme?.titre, contexte.entree?.titre, mentions, objectif].filter(Boolean).join(" ");

  const niveau = niveauDelivre(programme?.titre || contexte.entree?.titre || "") || "licence";

  /* ── Deux sources pour la modalité et le niveau d'accès ─────────
   * Le sommaire l'annonce par programme, la page du programme le redit dans sa prose. On
   * prend l'UNION des modalités, jamais l'une au détriment de l'autre : « Accessible après un
   * bac+2, en semaine ou en WEEK-END » veut dire les DEUX, présentiel et week-end, pas l'un ou
   * l'autre. Un choix exclusif retirerait un programme réel du parcours de quelqu'un.
   *
   * Le désaccord, lui, se REMONTE au journal au lieu d'être lissé : deux sources qui se
   * contredisent sur une modalité sont un signal, et c'est la seule façon de l'apprendre avant
   * qu'un prospect ne s'en aperçoive.
   * ─────────────────────────────────────────────────────────── */
  const modalitesPage = detecterModalites(texteComplet, profil);
  const modalitesSommaire = contexte.entree?.modalites || [];
  const modalites = [...new Set([...modalitesPage, ...modalitesSommaire])];
  const manquantesPage = modalitesSommaire.filter((m) => !modalitesPage.includes(m));
  if (manquantesPage.length && contexte.journal) {
    contexte.journal.push(
      `modalité : « ${nom} » — le sommaire annonce ${manquantesPage.join(", ")}, la page ne le redit pas`
    );
  }

  // Le niveau d'accès du sommaire est de la donnée de brochure, aussi fiable que la page et
  // disponible même pour les entrées sans page dédiée. Il ne l'emporte que sur une INFÉRENCE.
  let acces = niveauAcces(texteComplet, niveau, profil);
  const accesSommaire = contexte.entree?.niveauAcces || null;
  if (accesSommaire) {
    if (acces.source !== "brochure" || !acces.valeur) {
      acces = { valeur: accesSommaire, source: "brochure" };
    } else if (acces.valeur !== accesSommaire && contexte.journal) {
      contexte.journal.push(
        `niveau d'accès : « ${nom} » — sommaire ${accesSommaire}, page ${acces.valeur} : la page l'emporte`
      );
    }
  }
  const { axes, parts: axesParts, calcules } = compterAxes(modules);
  const partenariats = detecterPartenariats(texteComplet);
  const parcours = normaliserParcours(
    (programme?.mentions || []).find((m) => /^parcours\b/i.test(m.trim()))
  );

  const option = contexte.entree?.option || (programme?.titre.match(/\boption\s+(.+)$/i)?.[1]?.trim() ?? null);

  const fiche = {
    id: idBase + (profil.suffixeId || ""),
    nom: tracer("nom", "brochure", nom),
    ecole: tracer("ecole", "brochure", contexte.ecole || null),
    niveau: tracer("niveau", "brochure", niveau),
    langue: /full english|bilingue|anglais\/francais|francais\/anglais/.test(normaliser(texteComplet))
      ? tracer("langue", "brochure", /full english/.test(normaliser(texteComplet)) ? "anglais" : "bilingue")
      : "francais",

    eligibilite: {
      // Aucune brochure ne porte de série de bac ni de prérequis : cela vient
      // des admissions, sans exception. Absent de la source = vide, jamais deviné.
      series_bac: [],
      prerequis_autres: [],
    },

    niveau_acces: tracer("niveau_acces", acces.source, acces.valeur),
    modalites: tracer("modalites", "brochure", modalites),

    // Notes 1..5 pour l'affichage et les tests ; proportions brutes pour le calcul de
    // corrélation, que l'arrondi de `noter()` rendrait faux — voir « Deux sorties pour
    // une seule mesure » dans lib/fiche.mjs.
    axes,
    axes_parts: axesParts,
    domaines: inferDomaines(nom, objectif, modules, metiers, DOMAINES_OK),

    profil_ideal: [],
    deconseille_si: [],
    voisines: [],

    debouches: { metiers: tracer("debouches.metiers", "brochure", metiers), secteurs: [], poursuite_etudes: [] },
    unites_enseignement: tracer("unites_enseignement", "brochure", ue),
    exigence_quantitative: compterExigenceQuantitative(modules),

    vitrine: {},

    meta: {
      sources: {
        ...sources,
        axes: "inference",
        axes_parts: "inference",
        domaines: "inference",
        exigence_quantitative: "inference",
      },
      statut: "brouillon",
      brochure_fichier: contexte.fichier,
      annee_source: contexte.annee,
    },
  };

  if (objectif) {
    fiche.vitrine.description = objectif.slice(0, 600);
    fiche.meta.sources["vitrine.description"] = "brochure";
  }
  if (parcours) fiche.parcours = parcours.replace(/\s+/g, " ").trim();
  if (contexte.entree?.departement) fiche.departement = contexte.entree.departement;
  if (option) fiche.option = option;
  if (contexte.entree?.parent) fiche._parentTitre = contexte.entree.parent;
  if (partenariats.double_diplome || partenariats.diplome_delocalise || partenariats.accreditations.length) {
    fiche.partenariats = partenariats;
    fiche.meta.sources.partenariats = "brochure";
  }
  if (!fiche.meta.annee_source) delete fiche.meta.annee_source;
  if (!calcules) fiche._axesNonCalcules = true;
  if (!programme) fiche._sansPage = true;

  return fiche;
}

/* ══ Traitement d'un catalogue ═════════════════════════════════ */

async function traiterCatalogue(chemin) {
  const nomFichier = path.basename(chemin);
  const profil = choisirProfil(nomFichier);
  if (!profil) throw new Error(`aucun profil de parsing pour « ${nomFichier} »`);

  const { pages } = await lirePdf(chemin, fs);
  const journal = [];
  const programmes = segmenter(pages, profil, journal);
  const ecoles = ecolesParPage(pages, profil);
  const annee = Number((nomFichier.match(/20\d{2}/) || [])[0]) || null;

  const contexteDe = (programme, entree) => ({
    ecole: entree?.ecole || ecoles[(programme.pageTitre || programme.page) - 1],
    entree,
    fichier: nomFichier,
    annee,
    // Le journal voyage avec le contexte : un désaccord entre le sommaire et la page doit se
    // lire dans `data/_raw/*.txt`, pas se perdre.
    journal,
  });

  let fiches;
  let sommaire = null;
  if (profil.sommaire) {
    const entrees = (sommaire = lireSommaire(pages, profil));
    const { paires, orphelins } = apparier(entrees, programmes);
    journal.push(`sommaire p.${profil.sommaire.page} : ${entrees.length} programmes annoncés`);
    fiches = entrees.map((e) => {
      const p = paires.get(e) || null;
      if (!p) journal.push(`sommaire : « ${e.titre} » n'a pas de page dédiée — fiche squelette`);
      return construireFiche(p, contexteDe(p || { page: profil.sommaire.page }, e), profil);
    });
    for (const o of orphelins) {
      journal.push(`ALERTE p.${o.page} : « ${o.titre} » absent du sommaire`);
      fiches.push(construireFiche(o, contexteDe(o, null), profil));
    }
  } else {
    fiches = programmes.map((p) => construireFiche(p, contexteDe(p, null), profil));
  }

  return { profil, pages, programmes, fiches, sommaire, journal };
}

/* ══ Sorties ═══════════════════════════════════════════════════ */

function dumpTexte(pages, programmes, journal, nomFichier) {
  const lignes = [`### ${nomFichier} — ${pages.length} pages`, ""];
  for (const p of pages) {
    lignes.push(`===== PAGE ${p.numero} — ${p.colonnes.length} colonne(s)`);
    for (const c of p.colonnes) {
      lignes.push(`  --- colonne ${c.index} [${Math.round(c.x0)}..${Math.round(c.x1)}]`);
      for (const l of c.lignes) lignes.push(`    (y${l.y} x${l.x} h${l.h.toFixed(0)}) ${l.texte}`);
    }
    lignes.push("");
  }
  lignes.push("", "### PROGRAMMES SEGMENTÉS", "");
  for (const pr of programmes) {
    lignes.push(`p.${pr.page}${pr.colonne != null ? ` col.${pr.colonne}` : ""} — ${pr.titre}`);
    for (const [k, v] of Object.entries(pr.sections)) lignes.push(`    ${k}: ${v.length} ligne(s)`);
  }
  lignes.push("", "### JOURNAL", "", ...journal);
  return lignes.join("\n");
}

/* ══ Fusion : une ré-extraction ne détruit pas le travail humain ══
 *
 * L'extraction est rejouée à chaque correction de parsing. Si elle écrasait les
 * fiches, elle effacerait ce que les responsables et les admissions ont mis des
 * semaines à fournir — et personne n'oserait plus la relancer.
 *
 * Règle : `brochure` et `inference` sont rafraîchis, `responsable`, `admissions`
 * et `manuel` sont intouchables. `meta.statut` est conservé : c'est un état du
 * cycle de validation, pas une donnée de brochure.
 * ────────────────────────────────────────────────────────────── */

/** Sources qu'une ré-extraction n'a pas le droit de remplacer. */
const SOURCES_PROTEGEES = new Set(["responsable", "admissions", "manuel"]);

/**
 * Champs que l'extraction ne produit JAMAIS. Ils viennent d'un humain (ou d'un
 * autre script) et sont conservés même si personne n'a pensé à déclarer leur
 * source : une fusion ne doit pas punir un oubli de traçabilité.
 */
const CHAMPS_JAMAIS_EXTRAITS = [
  "profil_ideal",
  "deconseille_si",
  "vitrine.accroche",
  "vitrine.fait_marquant",
  "vitrine.couleur",
  "eligibilite.series_bac",
  "eligibilite.niveau_maths",
  "eligibilite.prerequis_autres",
  "debouches.secteurs",
  "debouches.poursuite_etudes",
];

/**
 * Champs calculés par scripts/distinctivite.mjs. Ils dépendent de l'ensemble des
 * fiches : après une ré-extraction ils sont périmés, donc retirés — sauf si un
 * humain les a validés. `report.mjs` signale alors qu'il faut recalculer.
 */
const CHAMPS_CALCULES = ["distinctivite", "structure_ue", "axes_fiables", "voisines"];

const lire = (obj, chemin) => chemin.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);

function ecrireChemin(obj, chemin, valeur) {
  const cles = chemin.split(".");
  const derniere = cles.pop();
  let cible = obj;
  for (const c of cles) {
    if (typeof cible[c] !== "object" || cible[c] === null) cible[c] = {};
    cible = cible[c];
  }
  cible[derniere] = valeur;
}

const estVide = (v) =>
  v == null || (Array.isArray(v) && !v.length) || (typeof v === "string" && !v.trim()) ||
  (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

/**
 * Fusionne une fiche fraîchement extraite avec celle déjà présente sur le disque.
 * Retourne la fiche fusionnée et la liste des champs préservés, pour le journal.
 */
export function fusionnerFiche(nouvelle, ancienne) {
  if (!ancienne) return { fiche: nouvelle, preserves: [] };

  const fusion = JSON.parse(JSON.stringify(nouvelle));
  const sources = { ...(nouvelle.meta?.sources || {}) };
  const preserves = [];

  // 1. Champs dont la source est protégée : on remet la valeur ET la source d'origine.
  for (const [champ, source] of Object.entries(ancienne.meta?.sources || {})) {
    if (!SOURCES_PROTEGEES.has(source)) continue;
    const valeur = lire(ancienne, champ);
    if (valeur === undefined) continue;
    ecrireChemin(fusion, champ, valeur);
    sources[champ] = source;
    preserves.push(`${champ} (${source})`);
  }

  // 2. Champs que l'extraction ne produit pas : conservés s'ils portent quelque chose.
  for (const champ of CHAMPS_JAMAIS_EXTRAITS) {
    if (sources[champ] && SOURCES_PROTEGEES.has(sources[champ])) continue; // déjà traité
    const valeur = lire(ancienne, champ);
    if (estVide(valeur)) continue;
    ecrireChemin(fusion, champ, valeur);
    if (ancienne.meta?.sources?.[champ]) sources[champ] = ancienne.meta.sources[champ];
    preserves.push(champ);
  }

  // 3. Champs calculés : périmés après ré-extraction, sauf validation humaine.
  for (const champ of CHAMPS_CALCULES) {
    const source = ancienne.meta?.sources?.[champ];
    if (source && SOURCES_PROTEGEES.has(source)) {
      fusion[champ] = ancienne[champ];
      sources[champ] = source;
      preserves.push(`${champ} (${source})`);
    } else {
      delete fusion[champ];
      delete sources[champ];
    }
  }
  if (!fusion.voisines) fusion.voisines = [];

  // 4. Métadonnées de validation : elles ne se réinventent pas à chaque extraction.
  fusion.meta.sources = sources;
  if (ancienne.meta?.statut) fusion.meta.statut = ancienne.meta.statut;
  if (ancienne.meta?.valide_par) fusion.meta.valide_par = ancienne.meta.valide_par;
  if (ancienne.meta?.valide_le) fusion.meta.valide_le = ancienne.meta.valide_le;

  return { fiche: fusion, preserves };
}

export async function extraire({ fichiers, dump = false, ecrire = true, dossierSortie = OUT_DIR }) {
  const resultats = [];
  for (const chemin of fichiers) {
    const r = await traiterCatalogue(chemin);
    resultats.push({ chemin, ...r });
    if (dump) {
      fs.mkdirSync(RAW_DIR, { recursive: true });
      fs.writeFileSync(
        path.join(RAW_DIR, path.basename(chemin).replace(/\.pdf$/i, ".txt")),
        dumpTexte(r.pages, r.programmes, r.journal, path.basename(chemin))
      );
    }
  }

  // Identifiants uniques, puis résolution des programmes parents
  const parId = new Map();
  for (const r of resultats) {
    for (const f of r.fiches) {
      let id = f.id;
      for (let n = 2; parId.has(id); n++) id = `${f.id}-${n}`;
      if (id !== f.id) r.journal.push(`id dupliqué : ${f.id} → ${id}`);
      f.id = id;
      parId.set(id, f);
    }
  }
  const parNom = new Map([...parId.values()].map((f) => [cleTitre(f.nom), f.id]));
  for (const f of parId.values()) {
    if (f._parentTitre) {
      const parent = parNom.get(cleTitre(f._parentTitre));
      if (parent && parent !== f.id) f.programme_parent = parent;
      delete f._parentTitre;
    }
  }

  /* ── Parcours : rapprochement des variantes ────────────────────────
   * La brochure Master compose ses bandeaux en petites capitales et en inverse
   * parfois les mots : « Parcours créativité, communication et marketing » et
   * « Parcours Communication, Créativité et Marketing » désignent le même parcours.
   * On regroupe par ensemble de mots et on retient le libellé le plus fréquent —
   * pas une liste écrite à la main, qui se périmerait à la prochaine édition.
   * ─────────────────────────────────────────────────────────────── */
  {
    const variantes = new Map(); // clé de mots → { label → occurrences }
    for (const f of parId.values()) {
      if (!f.parcours) continue;
      const k = cleParcours(f.parcours);
      if (!variantes.has(k)) variantes.set(k, new Map());
      const compte = variantes.get(k);
      compte.set(f.parcours, (compte.get(f.parcours) || 0) + 1);
    }
    const canonique = new Map();
    for (const [k, compte] of variantes) {
      const [label] = [...compte.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
      canonique.set(k, label);
    }
    for (const f of parId.values()) {
      if (!f.parcours) continue;
      const label = canonique.get(cleParcours(f.parcours));
      if (label && label !== f.parcours) f.parcours = label;
    }
  }

  // Fusion avec l'existant : on ne réécrit jamais par-dessus un apport humain.
  const anciennes = new Map();
  if (fs.existsSync(dossierSortie)) {
    for (const nom of fs.readdirSync(dossierSortie).filter((n) => n.endsWith(".json"))) {
      try {
        const f = JSON.parse(fs.readFileSync(path.join(dossierSortie, nom), "utf8"));
        anciennes.set(f.id || nom.replace(/\.json$/, ""), f);
      } catch {
        console.log(`  ⚠ ${nom} illisible, ignoré à la fusion`);
      }
    }
  }

  const fusion = { preserves: 0, fiches: 0, statuts: 0, calculesPerdus: 0 };
  for (const r of resultats) {
    r.fiches = r.fiches.map((nouvelle) => {
      const ancienne = anciennes.get(nouvelle.id);
      const { fiche, preserves } = fusionnerFiche(nouvelle, ancienne);
      if (preserves.length) {
        fusion.preserves += preserves.length;
        fusion.fiches++;
        r.journal.push(`fusion ${fiche.id} : ${preserves.join(", ")}`);
      }
      if (ancienne?.meta?.statut && ancienne.meta.statut !== "brouillon") fusion.statuts++;
      if (ancienne?.distinctivite && !fiche.distinctivite) fusion.calculesPerdus++;
      return fiche;
    });
  }

  // Une fiche présente sur le disque et plus produite par l'extraction n'est pas
  // supprimée : elle peut porter du travail humain. On la signale (programme
  // fermé ou renommé dans le catalogue).
  const produits = new Set(resultats.flatMap((r) => r.fiches.map((f) => f.id)));
  const catalogues = new Set(fichiers.map((f) => path.basename(f)));
  const orphelines = [...anciennes.values()].filter(
    (f) => !produits.has(f.id) && catalogues.has(f.meta?.brochure_fichier)
  );

  if (ecrire) {
    fs.mkdirSync(dossierSortie, { recursive: true });
    for (const r of resultats) {
      for (const f of r.fiches) {
        // Les champs de travail préfixés « _ » ne sortent jamais dans data/.
        const propre = Object.fromEntries(Object.entries(f).filter(([k]) => !k.startsWith("_")));
        fs.writeFileSync(path.join(dossierSortie, `${f.id}.json`), JSON.stringify(propre, null, 2) + "\n");
      }
    }
  }

  return Object.assign(resultats, { fusion, orphelines });
}

/* ══ CLI ═══════════════════════════════════════════════════════ */

function pdfDuDossier() {
  return fs
    .readdirSync(IN_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".pdf"))
    .map((e) => path.join(IN_DIR, e.name));
}

async function main() {
  const args = process.argv.slice(2);
  const un = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;
  const dump = args.includes("--dump");

  if (!fs.existsSync(IN_DIR)) {
    console.error(`Dossier introuvable : ${IN_DIR}\nDépose les catalogues PDF dedans (à plat).`);
    process.exit(1);
  }
  const fichiers = un ? [path.isAbsolute(un) ? un : path.join(IN_DIR, un)] : pdfDuDossier();
  if (!fichiers.length) {
    console.error("Aucun PDF trouvé dans data/brochures/");
    process.exit(1);
  }

  console.log(`\n  ${fichiers.length} catalogue(s) à traiter\n`);
  const resultats = await extraire({ fichiers, dump });

  let total = 0;
  for (const r of resultats) {
    console.log(`  ${path.basename(r.chemin)}  [profil ${r.profil.nom}]`);
    console.log(`     ${r.pages.length} pages → ${r.programmes.length} programmes segmentés → ${r.fiches.length} fiches`);
    const sansUE = r.fiches.filter((f) => f._axesNonCalcules);
    const sansPage = r.fiches.filter((f) => f._sansPage);
    const sansMetiers = r.fiches.filter((f) => !f.debouches.metiers.length);
    if (sansUE.length)
      console.log(`     ⚠ ${sansUE.length} sans unités d'enseignement (axes non calculables) : ${sansUE.map((f) => f.id).join(", ")}`);
    if (sansPage.length)
      console.log(`     ⚠ ${sansPage.length} annoncées au sommaire sans page dédiée : ${sansPage.map((f) => f.id).join(", ")}`);
    if (sansMetiers.length)
      console.log(`     ⚠ ${sansMetiers.length} sans métiers : ${sansMetiers.map((f) => f.id).join(", ")}`);
    for (const l of r.journal.filter((l) => l.startsWith("ALERTE"))) console.log(`     ${l}`);
    total += r.fiches.length;
  }

  const { fusion, orphelines } = resultats;
  if (fusion.fiches) {
    console.log(
      `\n  Fusion : ${fusion.preserves} champ(s) humain(s) préservés sur ${fusion.fiches} fiche(s) déjà travaillées`
    );
    if (fusion.statuts) console.log(`     ${fusion.statuts} fiche(s) gardent leur statut de validation`);
  }
  if (fusion.calculesPerdus) {
    console.log(`     ${fusion.calculesPerdus} fiche(s) ont perdu leur distinctivité (périmée) → npm run distinctivite`);
  }
  for (const o of orphelines) {
    console.log(`  ⚠ ${o.id}.json n'est plus produit par le catalogue (programme fermé ou renommé ?) — fiche conservée`);
  }

  console.log(`\n  ${total} fiches écrites dans data/filieres/`);
  if (dump) console.log(`  Texte segmenté + journal : data/_raw/`);
  // L'extraction réécrit les fiches : la distinctivité doit être recalculée après.
  console.log(`\n  Étapes suivantes :  npm test   puis   npm run distinctivite   puis   npm run report\n`);
}

// Lancé directement, pas importé (le test importe extraire() sans exécuter le CLI).
if (process.argv[1] && path.basename(process.argv[1]) === "extract.mjs") {
  main();
}
