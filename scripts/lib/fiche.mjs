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

/* ── Unités d'enseignement ────────────────────────────────────────
 * Une ligne ouvre une UE si elle porte un mot d'ouverture (UE, semestre,
 * enseignements M1/M2, première année…) ou si sa police dépasse nettement
 * celle des modules de la même section. Les deux signaux sont nécessaires :
 * la brochure Bachelor distingue les UE par la taille (8pt contre 6pt) là où
 * la brochure Online les distingue par le préfixe « *UE: » à taille égale.
 * ─────────────────────────────────────────────────────────────── */

const OUVRE_UE =
  /^(ue\b|ue[.*:]|\*ue|semestre\b|enseignements?\b|premiere annee|deuxieme annee|troisieme annee|module\b)/;
const PUCE = /^\s*([•·▪◦*-]|\d+[.)])\s*/;

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

  const ue = [];
  let courante = null;
  let precedente = null; // dernière ligne écrite, pour recoller les retours à la ligne

  for (const l of propres) {
    const n = normaliser(l.texte);
    const ouvre = OUVRE_UE.test(n) || l.h > hModale + 1.5;

    // Ligne de continuation : indentée plus à droite que la précédente, ou
    // précédente coupée sur un tiret / deux-points. Un intitulé d'UE, lui, se
    // poursuit à la même indentation et à la même taille de police
    // (« UE. Maitrise des Comportements » / « Professionnels »).
    const suiteIntitule =
      precedente &&
      precedente.cible === "intitule" &&
      !l.puce &&
      !OUVRE_UE.test(n) &&
      Math.abs(l.h - precedente.h) < 0.6;
    const continuation =
      precedente &&
      !l.puce &&
      (suiteIntitule || l.x > precedente.x + 8 || /[-–:]$/.test(precedente.texte));

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
      continue;
    }

    if (!courante) {
      courante = { intitule: intituleParDefaut, modules: [] };
      ue.push(courante);
    }
    courante.modules.push(l.texte.replace(PUCE, "").trim());
    precedente = { ...l, cible: "module" };
  }

  return ue
    .map((u) => ({
      intitule: u.intitule,
      modules: u.modules.map((m) => m.replace(/\s+/g, " ").trim()).filter((m) => m.length > 2),
    }))
    .filter((u) => u.intitule && (u.modules.length || ue.length === 1));
}

function nettoyerIntitule(s) {
  return s
    .replace(/^\s*\*?\s*ue\s*[.*:–-]*\s*/i, "UE ")
    .replace(/\s+/g, " ")
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

/* ── Axes : comptage sur les modules, jamais sur la prose ─────── */

const LEXIQUE_AXES = {
  quantitatif:
    /(math|statis|probabilit|econometr|calcul|stochast|actuar|comptab|financ|budget|fiscal|audit|monnaie|econom|tresorerie|quantitat|analyse de donnees|analyse predictive|evaluation|diagnostic financier|marches? des capitaux|bourse|boursier|portefeuille)/,
  technique:
    /(informatiq|logiciel|programm|developp|reseau|systeme|base de donnees|linux|windows|web|javascript|php|symfony|angular|framework|algorithm|cyber|securite des|machine learning|\bdata\b|technolog|electroniq|telecom|embarque|api|uml|excel|erp|progiciel|saari|numeriq|digital|maintenance|production|architectur|devops|infrastructure)/,
  relationnel:
    /(management|ressources humaines|\brh\b|negocia|vente|commercial|client|communication|equipe|leadership|recrutement|relation|conseil|coaching|service|social|paie|personnel|entretien|mediation|animation|accompagn)/,
  creatif:
    /(creativ|design|graphi|redaction|contenu|publicit|marketing|evenement|image|typographi|illustrator|photoshop|video|audiovisuel|innovation|brand|\bux\b|\bui\b|motion|\bart\b|scenar|editorial|dataviz|data visualisation)/,
  cadre:
    /(droit|juridiq|norme|procedur|reglementa|conformite|qualite|securite|controle|contentieux|ethique|gouvernance|deontolog|\biso\b|certifica|protocol|penal|obligation|contrat|audit|fiscal|risque|prudentiel|compliance)/,
};

const LEXIQUE_QUANTITATIF =
  /(math|statis|probabilit|econometr|calcul|stochast|actuar|modelisation|quantitat|algebre|analyse numerique|suites numeriques|matriciel|combinatoire)/;

/** 1..5 depuis un taux de recouvrement des modules. Pas de note à la main. */
function noter(taux) {
  return Math.max(1, Math.min(5, 1 + Math.floor(taux / 0.1)));
}

export function compterAxes(modules) {
  const axes = { quantitatif: 3, technique: 3, relationnel: 3, creatif: 3, cadre: 3 };
  if (!modules.length) return { axes, calcules: false };
  const n = modules.map(normaliser);
  for (const [axe, re] of Object.entries(LEXIQUE_AXES)) {
    axes[axe] = noter(n.filter((m) => re.test(m)).length / n.length);
  }
  return { axes, calcules: true };
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
  gestion: /(gestion|administration des|management des organisations|organisation|pilotage|secretariat)/,
  "management-projet": /(management de projet|gestion de projet|chef de projet|cadre logique|passation de marche|suivi-evaluation)/,
  entrepreneuriat: /(entrepreneur|business plan|creation d'entreprise|incubat|startup|intrepreunariat)/,
  marketing: /(marketing|vente|commercial|merchandising|distribution|relation client|fidelisation)/,
  communication: /(communication|media|relations publiques|publicit|community manager)/,
  informatique: /(developpement|logiciel|programmation|genie logiciel|php|javascript|symfony|angular|application|informatique appliquee|web)/,
  reseaux: /(reseau|telecommunication|administration systeme|interconnexion|linux server|windows server)/,
  cybersecurite: /(cyber|securite des systemes|securite informatique|compliance informatique)/,
  data: /(\bdata\b|donnees massives|big data|intelligence artificielle|business intelligence|datascience|machine learning|dataviz)/,
  ingenierie: /(ingenieur|mecaniq|industriel|automatis|electrotechniq|process industriel)/,
  qualite: /(qhse|qualite|hygiene|securite au travail|environnement|iso|smi\b|smq)/,
  logistique: /(logistiq|transport|supply chain|approvisionnement|chaine logistique|aeroportuaire|aeronautique)/,
  rh: /(ressources humaines|\brh\b|recrutement|paie|gpec|bilan social|formation professionnelle)/,
  droit: /(droit|juridiq|contentieux|arbitrage|notarial|penal|obligations|societes commerciales)/,
  "science-politique": /(science politique|relations internationales|geopolitiq|diplomat|organisations internationales)/,
  rse: /(\brse\b|responsabilite sociale|developpement durable|ethique)/,
  assurance: /(assurance|actuar|souscripteur|prevoyance)/,
  agrobusiness: /(agrobusiness|agro-?alimentaire|agricole|agronom)/,
  "commerce-international": /(commerce international|import|export|douane|incoterm)/,
  journalisme: /(journalis|reportage|redaction de presse|information et media)/,
  "culture-evenementiel": /(evenementiel|culturel|spectacle|patrimoine|production des evenements)/,
  "administration-publique": /(administration publique|finances publiques|collectivites locales|marches publics|service public)/,
  "design-web": /(design|graphis|\bux\b|\bui\b|webdesign|photoshop|illustrator|typographi|identite visuelle)/,
  electronique: /(electroniq|systemes embarques|microcontroleur|automatique|signal)/,
  mathematiques: /(mathematiques appliquees|econometr|modelisation statistique|probabilit|stochast|analyse numerique)/,
};

export function inferDomaines(titre, modules, metiers, domainesAutorises) {
  const cible = [titre, ...modules, ...metiers].map(normaliser);
  const scores = [];
  for (const [id, re] of Object.entries(LEXIQUE_DOMAINES)) {
    if (!domainesAutorises.has(id)) continue;
    let n = cible.filter((s) => re.test(s)).length;
    if (re.test(normaliser(titre))) n += 4; // le titre pèse plus que les modules
    if (n) scores.push({ id, n });
  }
  scores.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id));
  const retenus = scores.filter((s) => s.n >= 2).slice(0, 3).map((s) => s.id);
  return retenus.length ? retenus : scores.slice(0, 1).map((s) => s.id);
}
