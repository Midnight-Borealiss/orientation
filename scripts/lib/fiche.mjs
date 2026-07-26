/**
 * fiche.mjs — d'un programme segmenté vers une fiche conforme au schéma.
 *
 * Deux règles structurantes du projet vivent ici :
 *   1. les 5 axes de contenu sont COMPTÉS depuis unites_enseignement, jamais
 *      inférés depuis la prose marketing ;
 *   2. rien n'est deviné : un champ absent de la source reste null et sort dans
 *      le rapport des manques.
 */

import { normaliser } from "./pdf-layout.mjs";

export const slug = (s) =>
  normaliser(s)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

/* ── Titres ───────────────────────────────────────────────────────
 * Les catalogues composent leurs titres en petites capitales. La police n'a pas
 * de glyphe minuscule pour les lettres accentuées : InDesign retombe sur la
 * capitale pleine, et l'extraction lit « MÉtiers », « ÉvÉnements », « MÉdias ».
 * D'autres titres sortent tout en capitales, ou tout en minuscules.
 * ─────────────────────────────────────────────────────────────── */

const CAPITALES_ACCENTUEES = /(?<=\p{L})[ÀÂÄÉÈÊËÎÏÔÖÙÛÜŸÇ]/gu;

// Sigles à ne pas décapitaliser lors de la remise en casse d'un titre.
const SIGLES = new Set([
  "MBA", "DBA", "MSC", "DSG", "QHSE", "RSE", "RH", "GRH", "SI", "IT", "UX", "UI",
  "ISM", "ISF", "IESA", "INU", "ESG", "RNCP", "CAMES", "BRVM", "FOREX", "OHADA",
  "UEMOA", "PME", "IA", "BTP", "IOT", "ERP", "CISCO", "BAC", "M1", "M2", "L3",
]);

// Mots qui restent en minuscules au milieu d'un titre.
const MOTS_MINEURS = new Set([
  "en", "et", "de", "des", "du", "d", "la", "le", "les", "l", "au", "aux", "à",
  "pour", "dans", "sur", "par", "option", "parcours", "in", "of", "the", "and", "with",
]);

export function normaliserTitre(brut) {
  let t = (brut || "").replace(/\s+/g, " ").trim();
  if (!t) return t;

  // 1. Petites capitales mal encodées, mot par mot : un mot entièrement en
  //    capitales est laissé tel quel, sinon « MASTÈRE » deviendrait « MAStère ».
  t = t
    .split(/(\s+)/)
    .map((mot) => (/\p{Ll}/u.test(mot) ? mot.replace(CAPITALES_ACCENTUEES, (c) => c.toLowerCase()) : mot))
    .join("");

  // 2. Titre tout en capitales ou tout en minuscules : remise en casse. Un titre
  //    déjà composé par la brochure (casse mixte) n'est pas touché.
  const toutCapitales = t === t.toUpperCase() && /\p{Lu}{4}/u.test(t);
  const commenceMinuscule = /^\p{Ll}/u.test(t);
  if (toutCapitales || commenceMinuscule) {
    let premier = true;
    t = t.replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (mot) => {
      const maj = mot.toUpperCase();
      if (SIGLES.has(maj)) return maj;
      const bas = mot.toLowerCase();
      if (!premier && MOTS_MINEURS.has(bas)) return bas;
      premier = false;
      return bas.charAt(0).toUpperCase() + bas.slice(1);
    });
  }

  return t.charAt(0).toUpperCase() + t.slice(1);
}

/* ── Unités d'enseignement ────────────────────────────────────────
 * Une ligne ouvre une UE si elle porte un mot d'ouverture (UE, semestre,
 * enseignements M1/M2, première année…) ou si sa police dépasse nettement
 * celle des modules de la même section. Les deux signaux sont nécessaires :
 * la brochure Bachelor distingue les UE par la taille (8pt contre 6pt) là où
 * la brochure Online les distingue par le préfixe « *UE: » à taille égale.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Bandeau thématique du catalogue Master (« Parcours investissement et gouvernance
 * d'entreprise »), composé en petites capitales et donc casé au hasard d'une page à
 * l'autre : la brochure écrit « Parcours responsabilité, organisation et management »
 * ET « Parcours Responsabilité, Organisation et Management » pour le même parcours.
 *
 * Ce n'est PAS une unité d'enseignement — c'est un regroupement de portefeuille, quatre
 * thèmes pour 44 programmes. Voir « La structure en UE ne couvre que les licences et
 * bachelors » dans CLAUDE.md. On normalise ici la casse ; le rapprochement des variantes
 * d'ordre des mots se fait en fin d'extraction, quand tous les parcours sont connus.
 */
export function normaliserParcours(brut) {
  if (!brut) return null;
  const sansPrefixe = brut.trim().replace(/^parcours\s*:?\s*/i, "");
  if (!sansPrefixe) return null;
  const bas = sansPrefixe.toLocaleLowerCase("fr");
  return `Parcours ${bas.charAt(0).toLocaleUpperCase("fr")}${bas.slice(1)}`;
}

/** Clé de rapprochement de deux parcours : mêmes mots, ordre indifférent. */
export function cleParcours(label) {
  return normaliser(label || "")
    .replace(/^parcours\s*/, "")
    .split(/[^a-z0-9]+/)
    .filter((m) => m.length > 2 && !["les", "des", "aux", "une", "and", "the"].includes(m))
    .sort()
    .join(" ");
}

const OUVRE_UE =
  /^(ue\b|ue[.*:]|\*ue|semestre\b|enseignements?\b|premiere annee|deuxieme annee|troisieme annee|module\b)/;
const PUCE = /^\s*([•·▪◦*-]|\d+[.)])\s*/;

/**
 * Le premier mot de `suite` aurait-il tenu au bout de la ligne `ligne` ?
 *
 * La largeur d'un glyphe se déduit de la ligne elle-même — sa longueur en points divisée
 * par son nombre de caractères —, ce qui évite d'avoir à connaître la police. Si le mot
 * tenait, la ligne n'a pas été coupée : ce qui suit est un nouvel élément, pas sa suite.
 */
function tenaitEncore(ligne, suite, margeDroite) {
  if (ligne.x2 == null || !ligne.texte) return true; // sans géométrie, on ne conclut pas
  const glyphe = (ligne.x2 - ligne.x) / Math.max(ligne.texte.length, 1);
  const mot = (suite.trim().split(/\s+/)[0] || "").length;
  return ligne.x2 + glyphe * (mot + 1) <= margeDroite;
}

export function construireUE(lignes, intituleParDefaut) {
  if (!lignes.length) return [];

  // Une puce en milieu de ligne signale deux colonnes de modules qu'aucune
  // gouttière ne séparait : on rétablit un module par puce.
  const propres = lignes
    .flatMap((l) => {
      const morceaux = l.texte.split(/\s+[•·▪]\s+/);
      return morceaux.map((m, i) => ({ ...l, x: l.x + i * 0.1, texte: i ? `• ${m.trim()}` : m.trim() }));
    })
    .map((l) => ({ ...l, puce: PUCE.test(l.texte), texte: l.texte.replace(/^\s*[•·▪◦]\s*/, "").trim() }))
    .filter((l) => l.texte && !/^\*?unite d'enseignement$/.test(normaliser(l.texte)));

  const hauteurs = {};
  for (const l of propres) hauteurs[l.h] = (hauteurs[l.h] || 0) + 1;
  const hModale = Number(
    Object.entries(hauteurs).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0][0]
  );

  /* Marge droite, mesurée sur le BLOC et non sur la section : la plus grande borne
   * droite parmi les lignes qui partagent le même alignement à gauche. Une section
   * peut porter une ligne étrangère bien plus large — un pied de page, un reste de
   * colonne voisine —, et prendre le maximum de la section faisait passer la marge de
   * 558 à 768. Aucun intitulé n'était alors jugé coupé, et les retours à la ligne
   * repartaient en modules. */
  const margeDroiteDe = (x) => {
    const bloc = propres.filter((l) => Math.abs(l.x - x) <= 12 && l.x2 != null);
    return bloc.length ? Math.max(...bloc.map((l) => l.x2)) : 0;
  };

  if (process.env.UE_DEBUG) {
    console.error(`--- section (hModale ${hModale})`);
    for (const l of propres) console.error(`  x${l.x} x2:${l.x2} h${l.h} puce:${l.puce ? 1 : 0} | ${l.texte}`);
  }

  const ue = [];
  let courante = null;
  let precedente = null; // dernière ligne écrite, pour recoller les retours à la ligne
  let intituleOuvert = false; // l'intitulé courant peut-il encore recevoir un fragment ?

  for (const l of propres) {
    const n = normaliser(l.texte);
    const ouvre = OUVRE_UE.test(n) || l.h > hModale + 1.5;

    // Ligne de continuation : indentée plus à droite que la précédente, ou
    // précédente coupée sur un tiret / deux-points. Un intitulé d'UE, lui, se
    // poursuit à la même indentation et à la même taille de police
    // (« UE. Maitrise des Comportements » / « Professionnels »).
    //
    // Ce recollement exige que l'intitulé ait été COUPÉ faute de place : son premier
    // mot suivant ne tenait plus avant la marge du bloc. C'est le mécanisme réel d'un
    // retour à la ligne, et il se mesure — « atteindre la marge » ne suffit pas, un
    // intitulé s'arrête là où le mot suivant cesse de tenir : « *UE: Outils et
    // techniques de » finit à 522 quand son bloc va jusqu'à 559, et c'est bien
    // « gestion » (35 pts) qui n'y tenait pas. « UE semestre 2 », lui, s'arrête à 91
    // dans un bloc large de 157 : rien ne l'a coupé, donc la ligne suivante est un
    // module. Sans cette condition, un intitulé court avalait tous ses modules, l'UE
    // finissait vide, donc écartée, et les modules disparaissaient en silence.
    //
    // Ni la taille de police ni la puce ne peuvent servir ici : la brochure Bachelor
    // distingue ses UE par la taille, la brochure Online par le préfixe « *UE: » à
    // taille égale, et la page du Bachelor Professionnel n'emploie ni l'un ni l'autre.
    const intituleCoupe = precedente && !tenaitEncore(precedente, l.texte, margeDroiteDe(precedente.x));
    const suiteIntitule =
      precedente &&
      precedente.cible === "intitule" &&
      intituleOuvert &&
      intituleCoupe &&
      !l.puce &&
      !OUVRE_UE.test(n) &&
      Math.abs(l.h - precedente.h) < 0.6;
    // Un « : » final n'est pas une phrase coupée : il ANNONCE une liste, donc ce qui
    // suit est un élément, pas la suite de l'intitulé. « UE. Maitrise des comportements
    // professionnels : » était ainsi suivi de son premier module, absorbé dans le titre.
    const ponctuationOuverte = /[-–]$/.test(precedente?.texte || "") ||
      (precedente?.cible !== "intitule" && /:$/.test(precedente?.texte || ""));
    const continuation = precedente && !l.puce && (suiteIntitule || l.x > precedente.x + 8 || ponctuationOuverte);

    if (continuation) {
      if (precedente.cible === "intitule" && courante) {
        courante.intitule = `${courante.intitule} ${l.texte}`.replace(/\s*-\s*$/, "").trim();
      } else if (precedente.cible === "module" && courante && courante.modules.length) {
        courante.modules[courante.modules.length - 1] += ` ${l.texte}`;
      }
      precedente = { ...l, cible: precedente.cible, texte: l.texte };
      continue;
    }

    if (ouvre) {
      courante = { intitule: nettoyerIntitule(l.texte), modules: [] };
      ue.push(courante);
      precedente = { ...l, cible: "intitule" };
      intituleOuvert = true;
      continue;
    }

    if (!courante) {
      courante = { intitule: intituleParDefaut, modules: [] };
      ue.push(courante);
    }
    courante.modules.push(l.texte.replace(PUCE, "").trim());
    precedente = { ...l, cible: "module" };
    intituleOuvert = false;
  }

  return ue
    .map((u) => ({
      intitule: nettoyerIntitule(u.intitule),
      modules: u.modules.map((m) => m.replace(/\s+/g, " ").trim()).filter((m) => m.length > 2),
    }))
    .filter((u) => u.intitule && (u.modules.length || ue.length === 1));
}

function nettoyerIntitule(s) {
  return s
    .replace(/^\s*\*?\s*ue\s*[.*:–-]*\s*/i, "UE ")
    .replace(/\s+/g, " ")
    .replace(/\s*[:;,–-]\s*$/, "") // ponctuation d'annonce de la brochure, pas un mot
    .trim();
}

export const modulesDe = (ue) => ue.flatMap((u) => u.modules);

/* ── Métiers ──────────────────────────────────────────────────── */

export function extraireMetiers(lignes, separateur) {
  if (!lignes.length) return [];

  // Le séparateur du profil ne vaut que si la brochure l'emploie ici : les mêmes
  // pages listent parfois un métier par puce (ISM Online, Digital Campus), et
  // découper sur « ; » rendrait alors un seul bloc de 300 caractères.
  const puces = lignes.filter((l) => /^\s*[•·▪]\s*|^\s*-\s+/.test(l.texte)).length;
  const parPuce = puces >= lignes.length / 2;

  const parSeparateur = () =>
    lignes
      .map((l) => l.texte)
      .join(" ")
      .split(separateur)
      .flatMap((s) => s.split(/\s*[•·▪]\s*/));

  // Une ligne = un métier, sauf les retours à la ligne : un intitulé de métier
  // commence par une majuscule, « d'expertise comptable » complète le précédent.
  const parLigne = () => {
    const out = [];
    for (const l of lignes) {
      const t = l.texte.replace(PUCE, "").replace(/^\s*-\s+/, "").trim();
      if (out.length && /^[a-zà-ÿ'(]/.test(t)) out[out.length - 1] += ` ${t}`;
      else out.push(t);
    }
    return out;
  };

  // Ordre d'essai, le premier qui donne quelque chose gagne : le séparateur du
  // profil n'est pas toujours employé sur la page (liste à puces, une ligne par
  // métier), et découper au mauvais endroit ne rend qu'un bloc trop long, écarté.
  const essais = separateur && !parPuce ? [parSeparateur, parLigne] : [parLigne, () => (separateur ? parSeparateur() : [])];

  for (const essai of essais) {
    const vus = new Set();
    const metiers = [];
    for (const m of essai()) {
      const t = m.replace(PUCE, "").replace(/\s+/g, " ").replace(/[.;,]$/, "").trim();
      if (t.length < 4 || t.length > 120) continue;
      if (!/[a-zA-ZÀ-ÿ]{3}/.test(t)) continue;
      const cle = normaliser(t);
      if (vus.has(cle)) continue;
      vus.add(cle);
      metiers.push(t);
    }
    if (metiers.length) return metiers;
  }
  return [];
}

/* ── Niveau délivré, niveau d'accès, modalités ────────────────── */

export function niveauDelivre(titre) {
  const t = normaliser(titre);
  if (/\bdba\b|doctorate|doctorat/.test(t)) return "dba";
  if (/\bmba\b/.test(t)) return "mba";
  if (/\bmaster|\bmastere/.test(t)) return "master";
  if (/licence professionnelle/.test(t)) return "licence-pro";
  if (/\bbachelor\b/.test(t)) return "bachelor";
  if (/\blicence\b|\bdsg\b/.test(t)) return "licence";
  if (/certificat/.test(t)) return "certificat";
  return null;
}

const NIVEAUX_ACCES = ["bac", "bac+2", "bac+3", "bac+4", "bac+5"];

/**
 * Aucune brochure ne donne de prérequis par programme (vérifié sur les trois).
 * On n'accepte donc qu'une voie d'accès explicitement écrite ; sinon on déduit
 * du niveau délivré, et la source le dit.
 */
export function niveauAcces(texte, niveau, profil) {
  const t = normaliser(texte);
  const motifs = [
    /accessible\s+(?:apres|avec)\s+(?:un\s+)?bac\s*\+?\s*(\d)/g,
    /justifiant d'un niveau[^.]*?bac\s*\+?\s*(\d)/g,
    /ouvert[^.]{0,40}titulaires? d'un[^.]*?bac\s*\+?\s*(\d)/g,
  ];
  let meilleur = null;
  for (const re of motifs) {
    for (const m of t.matchAll(re)) {
      const n = Number(m[1]);
      if (n >= 2 && n <= 5) meilleur = Math.max(meilleur ?? 0, n);
    }
  }
  if (meilleur) return { valeur: `bac+${meilleur}`, source: "brochure" };

  const defaut = profil.accesParNiveau?.[niveau] || null;
  return defaut && NIVEAUX_ACCES.includes(defaut)
    ? { valeur: defaut, source: profil.sourceAcces }
    : { valeur: null, source: null };
}

export function detecterModalites(texte, profil) {
  const t = normaliser(texte);
  const set = new Set(profil.modalitesBase);
  if (/cours du soir/.test(t)) set.add("cours-du-soir");
  if (/week-?end/.test(t)) set.add("week-end");
  if (/full ?time/.test(t)) set.add("full-time");
  if (/(en ligne|a distance|foad|100% en ligne|hybride)/.test(t)) set.add("en-ligne");
  if (/presentiel/.test(t)) set.add("presentiel");
  // « en semaine ou en week-end » : les deux, pas l'un ou l'autre. « En semaine » est la façon
  // dont la brochure Bachelor dit « présentiel » — et sans ce motif, un catalogue dont
  // `modalitesBase` ne contiendrait pas `presentiel` perdrait la moitié de l'information.
  if (/en semaine/.test(t)) set.add("presentiel");
  return [...set];
}

export function detecterPartenariats(texte) {
  const t = normaliser(texte);
  const p = { double_diplome: null, diplome_delocalise: null, accreditations: [] };
  const dd = t.match(/double diplome[^.)]*?avec ([^.)]{4,70})/);
  if (dd) p.double_diplome = dd[1].trim();
  else if (/double diplome/.test(t)) p.double_diplome = "double diplôme mentionné";
  const dl = t.match(/(?:diplome )?delocalise (?:de |d')?([^.)]{4,70})/);
  if (dl) p.diplome_delocalise = dl[1].trim();
  if (/\bcames\b/.test(t)) p.accreditations.push("Cames");
  if (/\brncp\b/.test(t)) p.accreditations.push("RNCP");
  if (/uemoa/.test(t) && /label/.test(t)) p.accreditations.push("Label UEMOA");
  return p;
}

/* ── Axes : comptage sur les modules, jamais sur la prose ──────────────────
 *
 * NORMALISATION (documentée dans CLAUDE.md, section « Normalisation des cinq axes ») :
 * la note est la PART des modules du programme que le lexique de l'axe capte,
 * passée dans `noter()`. Le dénominateur est le nombre de modules du programme —
 * ni le maximum du catalogue, ni la somme des autres axes.
 *
 * Corollaire : les cinq axes sont INDÉPENDANTS. Un module compté par `technique`
 * ne retire rien à `creatif`, il peut nourrir les deux. Un axe bas ne signifie donc
 * jamais « un autre axe l'a pris » : il signifie « le lexique n'a pas reconnu les
 * modules », ou « le tronc commun dilue le dénominateur ». C'est ce diagnostic que
 * `node scripts/axes-modules.mjs <id>` rend lisible.
 *
 * Un lexique s'élargit toujours depuis les modules RÉELS d'un programme emblématique,
 * jamais depuis une liste de mots plausibles — et se relit ensuite sur les programmes
 * des autres axes, où il fabrique des faux positifs. Les gardes ci-dessous
 * (`developpement personnel`, `patrimoine`, `redaction`) viennent tous de là.
 * ───────────────────────────────────────────────────────────────────────── */

const LEXIQUE_AXES = {
  quantitatif:
    /(math|statis|probabilit|econometr|calcul|stochast|actuar|comptab|financ|budget|fiscal|audit|monnaie|econom|tresorerie|quantitat|analyse de donnees|analyse predictive|evaluation|diagnostic financier|marches? des capitaux|bourse|boursier|portefeuille|recherche operationnelle|optimisation|modelisation|tableau de bord|indicateur|banqu|bancaire)/,
  // `developp` : les brochures écrivent aussi « développement personnel » et
  // « développement durable », qui ne sont pas de la technique.
  technique:
    /(informatiq|logiciel|programm|developp(?!ement (durable|personnel|local|economique|des competences))|reseau|systeme|bases? de donnees|linux|windows|web|javascript|php|symfony|angular|framework|algorithm|cyber|securite des|machine learning|\bdata\b|technolog|electroniq|telecom|embarque|\bapi\b|\buml\b|excel|\berp\b|progiciel|saari|numeriq|digital|maintenance|production|architectur|devops|infrastructure|oracle|\bsql\b|serveur|\bjava\b|python)/,
  relationnel:
    /(management|ressources humaines|\brh\b|negocia|vente|commercial|client|communication|equipe|leadership|recrutement|relation|conseil|coaching|service|social|paie|personnel|entretien|mediation|animation|accompagn|prise de parole|comportement|psychosocio)/,
  // Élargi depuis les modules réels de Mastère UX Design (conception, interface,
  // utilisateur, marque), de la Licence Journalisme (médias, écriture, presse,
  // rédactionnel) et de la Licence Événements culturels (spectacle, exposition,
  // arts, œuvres, culturel). `redaction` seul marquait « Rédaction d'actes » et
  // « Rédaction de mémoire » : restreint aux écritures éditoriales.
  creatif:
    /(creativ|design|graphi|redaction (web|editorial|journalistique|mediatique|publicitaire)|redactionnel|contenu|publicit|marketing|evenement|image|typographi|illustrator|photoshop|video|audiovisuel|innovation|brand|marque|\bux\b|\bui\b|motion|\barts?\b|artistiq|artisan|scenar|editorial|dataviz|data visualisation|conception|interface|utilisateur|\bmedias?\b|mediatique|ecriture|presse|journalis|sources? d information|reportage|documentaire|spectacle|exposition|patrimoine (immateriel|culturel|architectural|artistique)|\boeuvres\b|cinemato|musiq|culturel|esthetiq|storytelling)/,
  cadre:
    /(droit|juridiq|judiciaire|norme|procedur|reglementa|conformite|qualite|securite|controle|contentieux|ethique|gouvernance|deontolog|\biso\b|certifica|protocol|penal|obligation|contrat|audit|fiscal|risque|prudentiel|compliance|societaire|propriete (intellectuelle|litteraire)|\brse\b|public-prive)/,
};

const LEXIQUE_QUANTITATIF =
  /(math|statis|probabilit|econometr|calcul|stochast|actuar|modelisation|quantitat|algebre|analyse numerique|suites numeriques|matriciel|combinatoire)/;

export const AXES = Object.keys(LEXIQUE_AXES);

/**
 * Les axes qui captent ce module. Un module peut en alimenter PLUSIEURS :
 * « Droit fiscal des entreprises » est du cadre et du quantitatif, et il l'est
 * vraiment. Aucune attribution exclusive, aucun ordre de priorité — voir
 * « Normalisation des cinq axes » dans CLAUDE.md.
 */
export function axesDunModule(module) {
  const m = normaliser(module);
  return AXES.filter((axe) => LEXIQUE_AXES[axe].test(m));
}

/**
 * 1..5 depuis la PART des modules du programme qui touchent l'axe.
 * Seuils absolus sur une proportion : 10 % de modules par point, 40 % suffisent
 * pour un 5. Le dénominateur est le nombre de modules du programme, jamais le
 * total du catalogue ni la somme des autres axes.
 */
function noter(taux) {
  return Math.max(1, Math.min(5, 1 + Math.floor(taux / 0.1)));
}

/**
 * Deux sorties pour une seule mesure, et il ne faut pas les confondre :
 *
 *   `axes`       notes 1..5, pour l'AFFICHAGE et les tests d'ancrage. Un entier se lit,
 *                se discute avec un responsable et se compare d'une édition à l'autre.
 *   `axes_parts` la proportion brute, pour le CALCUL de corrélation. `noter()` écrase
 *                10 points de proportion dans un seul entier : sur 5 dimensions, cet
 *                arrondi fabrique des égalités exactes à r = 1,00 entre programmes qui
 *                n'ont pas la même forme, et le moteur ne peut alors plus les classer.
 *
 * Les notes ne se recalculent jamais depuis `axes_parts` arrondi : les deux sortent du
 * même comptage, au même moment.
 */
export function compterAxes(modules) {
  const axes = { quantitatif: 3, technique: 3, relationnel: 3, creatif: 3, cadre: 3 };
  const parts = { quantitatif: 0, technique: 0, relationnel: 0, creatif: 0, cadre: 0 };
  if (!modules.length) return { axes, parts, calcules: false };
  const n = modules.map(normaliser);
  for (const [axe, re] of Object.entries(LEXIQUE_AXES)) {
    const taux = n.filter((m) => re.test(m)).length / n.length;
    // 4 décimales : un module sur 56 vaut 0,0179, il faut le distinguer de 0,0182.
    parts[axe] = Math.round(taux * 10000) / 10000;
    axes[axe] = noter(taux);
  }
  return { axes, parts, calcules: true };
}

export function compterExigenceQuantitative(modules) {
  const trouves = modules.filter((m) => LEXIQUE_QUANTITATIF.test(normaliser(m)));
  const n = trouves.length;
  return {
    modules_comptes: n,
    modules_exemples: trouves.slice(0, 5),
    niveau: n >= 5 ? "eleve" : n >= 2 ? "modere" : "faible",
  };
}

/* ── Domaines : liste fermée de config/taxonomy.json ──────────── */

const LEXIQUE_DOMAINES = {
  finance: /(banqu|financ|credit|microfinance|monnaie|tresorerie)/,
  "marches-financiers": /(marche financier|marches? des capitaux|trading|bourse|boursier|brvm|forex|produits derives|opcvm|portefeuille)/,
  comptabilite: /(comptab|audit|controle de gestion|controle interne|ifrs|revision)/,
  fiscalite: /(fiscal|impot|taxe)/,
  // « management » seul est volontairement absent : il colle à tout. Les programmes
  // de management général sont attrapés par leurs formules propres.
  gestion:
    /(gestion|administration des|management des organisations|management general|management strategique|business administration|executive mba|cadres dirigeants|direction generale|organisation|pilotage|secretariat)/,
  "management-projet": /(management de projet|gestion de projet|chef de projet|cadre logique|passation de marche|suivi-evaluation)/,
  entrepreneuriat: /(entrepreneur|business plan|creation d'entreprise|incubat|startup|intrepreunariat)/,
  marketing: /(marketing|vente|commercial|merchandising|distribution|relation client|fidelisation)/,
  communication: /(communication|media|relations publiques|publicit|community manager)/,
  // « développement durable » et « développement personnel » ne sont pas de
  // l'informatique : le mot seul ne suffit pas.
  informatique:
    /(developpement(?! durable| personnel| local| economique| des competences)|logiciel|programmation|genie logiciel|php|javascript|symfony|angular|application|informatique appliquee|web)/,
  reseaux: /(reseau|telecommunication|administration systeme|interconnexion|linux server|windows server)/,
  cybersecurite: /(cyber|securite des systemes|securite informatique|compliance informatique)/,
  data: /(\bdata\b|donnees massives|big data|intelligence artificielle|business intelligence|datascience|machine learning|dataviz)/,
  ingenierie: /(ingenieur|mecaniq|industriel|automatis|electrotechniq|process industriel)/,
  qualite: /(qhse|qualite|hygiene|securite au travail|environnement|iso|smi\b|smq)/,
  logistique: /(logistiq|transport|supply chain|approvisionnement|chaine logistique|aeroportuaire|aeronautique)/,
  energie: /(energies? (petrolieres|renouvelables|et des mines)|petrolier|gazier|hydrocarbure|solaire|mines?)/,
  rh: /(ressources humaines|\brh\b|recrutement|paie|gpec|bilan social|formation professionnelle)/,
  droit: /(droit|juridiq|contentieux|arbitrage|notarial|penal|obligations|societes commerciales)/,
  "science-politique": /(science politique|relations internationales|geopolitiq|diplomat|organisations internationales|paix et securite|resolution des conflits|securite internationale)/,
  rse: /(\brse\b|responsabilite sociale|developpement durable|ethique)/,
  assurance: /(assurance|actuar|souscripteur|prevoyance)/,
  agrobusiness: /(agrobusiness|agro-?alimentaire|agricole|agronom)/,
  "commerce-international": /(commerce international|management international|import|export|douane|incoterm)/,
  journalisme: /(journalis|reportage|redaction de presse|information et media)/,
  "culture-evenementiel": /(evenementiel|culturel|spectacle|patrimoine|production des evenements)/,
  "administration-publique": /(administration publique|finances publiques|collectivites (locales|territoriales)|marches publics|service public|decentralisation|gouvernance territoriale)/,
  "design-web": /(design|graphis|\bux\b|\bui\b|webdesign|photoshop|illustrator|typographi|identite visuelle)/,
  electronique: /(electroniq|systemes embarques|microcontroleur|automatique|signal)/,
  mathematiques: /(mathematiques appliquees|econometr|modelisation statistique|probabilit|stochast|analyse numerique)/,
};

/** Nombre maximal de domaines par fiche. Deux, pas trois : l'aiguillage doit trancher. */
const MAX_DOMAINES = 2;

/**
 * Un domaine n'est retenu que si son vocabulaire apparaît dans le TITRE ou dans
 * l'OBJECTIF du programme. Les modules seuls ne suffisent pas : toute filière
 * enseigne de la gestion, du droit et de la comptabilité en tronc commun, et s'y
 * fier collait « gestion » à 48 fiches sur 84 — un aiguillage qui n'aiguille rien.
 *
 * Les modules et les métiers ne servent donc plus qu'à ORDONNER les candidats
 * déjà légitimés par le titre ou l'objectif.
 */
export function inferDomaines(titre, objectif, modules, metiers, domainesAutorises) {
  const nTitre = normaliser(titre);
  const nObjectif = normaliser(objectif || "");
  const appuis = [...modules, ...metiers].map(normaliser);

  const scores = [];
  for (const [id, re] of Object.entries(LEXIQUE_DOMAINES)) {
    if (!domainesAutorises.has(id)) continue;
    const dansTitre = re.test(nTitre);
    const dansObjectif = re.test(nObjectif);
    if (!dansTitre && !dansObjectif) continue;
    const appui = appuis.filter((s) => re.test(s)).length;
    // Un domaine tiré du seul objectif doit être corroboré par les modules :
    // l'objectif est de la prose marketing, un mot y passe sans rien engager.
    if (!dansTitre && appui < 2) continue;
    const n = (dansTitre ? 8 : 0) + (dansObjectif ? 3 : 0) + appui;
    scores.push({ id, n, dansTitre });
  }
  scores.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));

  // Si le titre suffit à désigner des domaines, l'objectif ne vient pas les diluer.
  const parTitre = scores.filter((s) => s.dansTitre);
  const retenus = (parTitre.length ? parTitre : scores).slice(0, MAX_DOMAINES).map((s) => s.id);
  if (retenus.length) return retenus;

  // Dernier recours : le vocabulaire des modules, un seul domaine, jamais deux.
  const surModules = [];
  for (const [id, re] of Object.entries(LEXIQUE_DOMAINES)) {
    if (!domainesAutorises.has(id)) continue;
    const n = appuis.filter((s) => re.test(s)).length;
    if (n) surModules.push({ id, n });
  }
  surModules.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  return surModules.slice(0, 1).map((s) => s.id);
}
