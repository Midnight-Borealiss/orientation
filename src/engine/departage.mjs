/**
 * departage.mjs — que faire quand les deux premières filières sont à égalité.
 *
 * CE N'EST PAS UN CAS RARE. Sur cinq dimensions seulement, la corrélation est bruitée :
 * le départage se déclenche sur environ un tiers des profils. Le traiter comme une branche
 * exceptionnelle serait une erreur de conception.
 *
 * CINQ ÉTAGES, essayés dans cet ordre, on s'arrête au premier qui produit quelque chose :
 *
 *   1. question RÉDIGÉE          config/departages.json          après les entretiens
 *   2. question GÉNÉRÉE          distinctivite.metiers_exclusifs disponible maintenant
 *   3. question GÉNÉRÉE          distinctivite.modules_exclusifs disponible maintenant
 *   4. distance de DISPOSITION   config/domaines_axes.json       quand ce sera collecté
 *   5. afficher À ÉGALITÉ        —                               toujours
 *
 * Les étages 2 et 3 sont le mécanisme central du principe « le catalogue porte la
 * précision, les responsables portent l'orientation » : ils ne dépendent d'AUCUNE collecte.
 *
 * Pourquoi une question posée au prospect passe AVANT la disposition (étage 4) : une
 * réponse du prospect sur deux métiers réels est une observation directe, là où la
 * disposition est une moyenne de classements de domaines faits par des responsables. La
 * mesure la plus directe d'abord.
 *
 * L'étage 5 n'est PAS un échec. « Deux voies te correspondent également » est une réponse
 * honnête, et elle vaut mieux qu'un gagnant arbitraire.
 *
 * Les axes de disposition ne rejoignent JAMAIS les 5 axes comptés dans la corrélation :
 * les premiers sont des notations indépendantes, les seconds sont compositionnels — ils
 * se partagent un budget de modules. Les réunir dans un même vecteur centré mêlerait deux
 * natures de mesure et rendrait r ininterprétable.
 */

import { sontSoeurs } from "./parente.mjs";

/**
 * Les valeurs de disposition d'une fiche : la MOYENNE SIMPLE de celles de ses domaines.
 * Aucune pondération — rien ne dit que le premier domaine pèse plus que le second.
 *
 * `null` dès qu'un domaine n'a pas encore été classé par un responsable. Les 28 domaines
 * sont aujourd'hui à `null` dans config/domaines_axes.json : cet étage est donc inactif,
 * et le moteur le DIT au lieu de le masquer.
 */
export function dispositionDeFiche(fiche, domainesAxes, axes) {
  const entrees = (fiche.domaines || []).map((d) => domainesAxes.domaines?.[d]).filter(Boolean);
  if (!entrees.length) return null;
  const out = {};
  for (const axe of axes) {
    const valeurs = entrees.map((e) => e[axe]).filter((v) => Number.isFinite(v));
    if (valeurs.length !== entrees.length) return null; // un domaine non collecté suffit à invalider
    out[axe] = valeurs.reduce((s, n) => s + n, 0) / valeurs.length;
  }
  return out;
}

/**
 * Distance euclidienne sur les 2 axes de disposition. Ici une distance est légitime :
 * ce sont deux notations indépendantes sur la même échelle 1-5, pas un budget réparti.
 * C'est précisément la raison pour laquelle elles ne rejoignent pas la corrélation.
 */
export function distanceDisposition(a, b, axes) {
  if (!a || !b) return null;
  let d = 0;
  for (const axe of axes) {
    if (!Number.isFinite(a[axe]) || !Number.isFinite(b[axe])) return null;
    d += (a[axe] - b[axe]) ** 2;
  }
  return Math.sqrt(d);
}

/**
 * Étage 4 — réordonner les ex æquo par leur proximité de disposition avec le prospect.
 *
 * `profilDisposition` est `null` tant qu'aucune question ne porte de `poids_disposition` :
 * l'étage est alors inactif, et son motif est remonté. Rien n'est réordonné au hasard.
 */
export function departagerParDisposition(exAequo, profilDisposition, { domainesAxes, axes }) {
  if (!profilDisposition) {
    return { ordonnees: exAequo, actif: false, motif: "aucune question de disposition dans config/questions.json" };
  }
  const manquants = [];
  const avecDistance = exAequo.map((c) => {
    const dispo = dispositionDeFiche(c.fiche, domainesAxes, axes);
    if (!dispo) manquants.push(c.fiche.id);
    return { ...c, dispositionFiliere: dispo, distanceDisposition: distanceDisposition(profilDisposition, dispo, axes) };
  });

  if (avecDistance.some((c) => c.distanceDisposition == null)) {
    return {
      ordonnees: exAequo,
      actif: false,
      motif: `axes de disposition non collectés pour : ${[...new Set(manquants)].join(", ")} — voir config/domaines_axes.json`,
    };
  }

  const ordonnees = [...avecDistance].sort(
    (a, b) => a.distanceDisposition - b.distanceDisposition || a.fiche.id.localeCompare(b.fiche.id)
  );
  return { ordonnees, actif: true, motif: null };
}

/* ── Étage 1 : la question de paire rédigée en entretien ────────── */

const clePaire = (a, b) => [a, b].sort().join("|");

/** Index des questions de départage par paire. Une question appartient à un COUPLE. */
export function indexDepartages(departages) {
  const m = new Map();
  for (const p of departages.paires || []) {
    if (!p.question || !Array.isArray(p.entre) || p.entre.length !== 2) continue;
    m.set(clePaire(p.entre[0], p.entre[1]), p);
  }
  return m;
}

/**
 * La question qui sépare deux filières, si elle a été récoltée en entretien.
 *
 * Elle vit dans config/departages.json, indexée par paire, et JAMAIS dans les fiches :
 * une question appartient à un couple, la dupliquer des deux côtés garantit qu'elles
 * divergeront. Le champ `voisines` d'une fiche ne contient donc que des `id`.
 */
export function questionDeDepartage(idA, idB, index) {
  return index.get(clePaire(idA, idB)) || null;
}

/**
 * Applique la réponse à une question de départage : la filière visée passe devant.
 * On ne supprime pas l'autre — le prospect a choisi une orientation, pas éliminé un
 * programme, et les alternatives restent affichées.
 */
export function appliquerDepartage(classees, versId) {
  if (!versId) return classees;
  const gagnante = classees.filter((c) => c.fiche.id === versId);
  if (!gagnante.length) return classees;
  return [...gagnante, ...classees.filter((c) => c.fiche.id !== versId)];
}

/* ── Étages 2 et 3 : la question générée depuis le catalogue ──────
 * Le catalogue a déjà produit, pour 76 des 84 programmes, ce qui les distingue de leurs
 * voisins de domaine. Ces libellés sont imprimés dans la brochure : les utiliser ne
 * suppose aucune collecte et n'invente rien.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Un libellé est-il utilisable dans une phrase posée à un prospect ?
 *
 * Les tableaux d'exclusivités viennent de l'extraction : ils contiennent quelques
 * artefacts — une phrase d'introduction terminée par deux points, plusieurs intitulés
 * concaténés par une puce mal détectée, un libellé tronqué. Les critères ci-dessous sont
 * GÉNÉRIQUES, aucune liste de mots interdits : un deux-points introduit une liste et non
 * un métier, et au-delà de huit mots on n'a plus un intitulé mais une phrase.
 *
 * On ne reformule JAMAIS un libellé. Le catalogue écrit « Concepteur de systèmes
 * embarqués » ; le réécrire serait inventer de la donnée.
 */
export function libelleUtilisable(s) {
  const t = (s || "").trim();
  if (t.length < 5 || t.length > 60) return false;
  if (t.includes(":")) return false; // introduit une liste, ce n'est pas un intitulé
  // Points de suspension : la brochure a elle-même abrégé, le libellé est incomplet.
  // C'est ce qui écartait « Aministrations… École de Droit », où l'extraction a recollé
  // un intitulé tronqué et un titre de section.
  if (/…|\.\.\./.test(t)) return false;
  if (t.split(/\s+/).length > 8) return false; // une phrase, ou plusieurs intitulés collés
  if (!/^[A-ZÀ-Þ]/.test(t)) return false; // un fragment commence en minuscule
  return true;
}

/**
 * Les libellés utilisables, du plus lisible au moins lisible. On prend le MEILLEUR, pas le
 * premier : l'ordre du tableau vient de l'ordre de la brochure, qui n'a aucune raison de
 * placer le libellé le plus parlant en tête.
 */
export function libellesUtilisables(valeurs) {
  // Nommé `lisibilite` : le mot auquel on pense d'abord est un identifiant de domaine de
  // la taxonomie, et le moteur ne doit contenir aucun mot du vocabulaire des données.
  const lisibilite = (s) => {
    const mots = s.trim().split(/\s+/).length;
    let note = 0;
    if (mots >= 2 && mots <= 5) note += 3; // un intitulé de poste typique
    if (!/[()\[\]\/]/.test(s)) note += 2; // ni parenthèse ni alternative
    if (!/\d/.test(s)) note += 1;
    return note;
  };
  return (valeurs || [])
    .filter(libelleUtilisable)
    .map((s) => s.trim())
    .sort((a, b) => lisibilite(b) - lisibilite(a) || a.localeCompare(b));
}

/** Les deux gabarits. Situationnels, jamais une liste affichée telle quelle. */
const GABARITS = {
  metiers: (a, b) => `Un mardi ordinaire, tu te vois plutôt ${a} ou ${b} ?`,
  modules: (a, b) => `Tu préfères passer un semestre sur « ${a} » ou sur « ${b} » ?`,
};

/**
 * Construit une question de départage depuis les exclusivités de deux filières. Rend
 * `null` si l'un des deux côtés n'a aucun libellé utilisable — l'appelant descend d'un
 * étage. Une question à un seul côté renseigné n'en est pas une.
 */
export function questionGeneree(ficheA, ficheB, source) {
  const champ = source === "metiers" ? "metiers_exclusifs" : "modules_exclusifs";
  const a = libellesUtilisables(ficheA.distinctivite?.[champ])[0];
  const b = libellesUtilisables(ficheB.distinctivite?.[champ])[0];
  if (!a || !b) return null;

  return {
    entre: [ficheA.id, ficheB.id],
    question: GABARITS[source](a, b),
    reponses: [
      { label: a, vers: ficheA.id },
      { label: b, vers: ficheB.id },
    ],
    source: `catalogue-${source}`,
    genere: true,
  };
}

/**
 * Deux options d'un même programme : pas de question générée. Ce qui les sépare est le nom
 * de l'option, déjà imprimé — fabriquer une question sur leurs rares modules propres
 * masquerait la vraie information. On affiche les deux intitulés et on laisse choisir.
 */
export function choixEntreSoeurs(ficheA, ficheB) {
  const nommer = (f) => f.option || f.nom;
  return {
    entre: [ficheA.id, ficheB.id],
    question: "Ces deux parcours partagent le même tronc commun. Lequel vises-tu ?",
    reponses: [
      { label: nommer(ficheA), vers: ficheA.id },
      { label: nommer(ficheB), vers: ficheB.id },
    ],
    source: "option-soeurs",
    genere: true,
  };
}

/* ── La cascade ───────────────────────────────────────────────── */

/** Les étages, dans l'ordre d'essai. Exposé pour que la simulation les compte. */
export const ETAGES = ["question-redigee", "option-soeurs", "metiers", "modules", "disposition", "egalite"];

/**
 * Essaie les étages dans l'ordre et rend le premier qui produit quelque chose.
 *
 * Retour : `{ etage, question, ordonnees, essais }`.
 *   `question`  à poser au prospect (étages 1 à 3, et le cas des sœurs)
 *   `ordonnees` nouvel ordre des ex æquo (étage disposition seulement)
 *   `essais`    ce que chaque étage franchi a répondu, et pourquoi il n'a rien produit.
 *               C'est ce qui empêche un étage inerte de se taire.
 *
 * Si plus de deux filières sont à égalité, la question porte sur les DEUX PREMIÈRES, puis
 * on réévalue : poser une question à quatre branches serait illisible.
 */
export function cascadeDepartage(exAequo, { departages, profilDisposition, domainesAxes, axesDispo }) {
  const essais = [];
  if (exAequo.length < 2) return { etage: null, question: null, ordonnees: exAequo, essais };

  const a = exAequo[0].fiche;
  const b = exAequo[1].fiche;

  // 1. Question rédigée en entretien : elle bat tout le reste, c'est un humain qui l'a écrite.
  const redigee = questionDeDepartage(a.id, b.id, indexDepartages(departages));
  if (redigee) return { etage: "question-redigee", question: redigee, ordonnees: exAequo, essais };
  essais.push({ etage: "question-redigee", motif: `aucune entrée pour ${a.id} / ${b.id} dans config/departages.json` });

  // Cas particulier, avant les questions générées : deux options du même programme.
  if (sontSoeurs(a, b)) {
    return { etage: "option-soeurs", question: choixEntreSoeurs(a, b), ordonnees: exAequo, essais };
  }

  // 2 puis 3. Générées depuis le catalogue. Aucune collecte requise.
  for (const source of ["metiers", "modules"]) {
    const question = questionGeneree(a, b, source);
    if (question) return { etage: source, question, ordonnees: exAequo, essais };
    essais.push({ etage: source, motif: `pas de ${source} exclusifs utilisables des deux côtés` });
  }

  // 4. Disposition : inerte tant que les responsables n'ont pas classé leurs domaines.
  const parDispo = departagerParDisposition(exAequo, profilDisposition, { domainesAxes, axes: axesDispo });
  if (parDispo.actif) return { etage: "disposition", question: null, ordonnees: parDispo.ordonnees, essais };
  essais.push({ etage: "disposition", motif: parDispo.motif });

  // 5. À égalité. Réponse honnête, pas un échec.
  return { etage: "egalite", question: null, ordonnees: exAequo, essais };
}

/**
 * Deux filières sont-elles à égalité ? Le seuil vient de config/departages.json, où il
 * est calibré par simulation, pas posé à l'intuition.
 */
export function egalite(classees, seuils) {
  if (classees.length < 2) return false;
  return classees[0].score - classees[1].score < seuils.ecart_declenchant_departage;
}

/** Toutes les filières à égalité avec la tête, dans l'ordre du classement. */
export function tete(classees, seuils) {
  if (!classees.length) return [];
  const plafond = classees[0].score;
  return classees.filter((c) => plafond - c.score < seuils.ecart_declenchant_departage);
}
