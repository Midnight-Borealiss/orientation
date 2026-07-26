/**
 * moteur.mjs — le parcours, de la première question au résultat.
 *
 * AUCUN NOM DE FILIÈRE ICI, ni dans aucun fichier de src/engine/. Changer de contexte
 * d'orientation = changer config/ et data/, jamais ce dossier. Le moteur reçoit son
 * contexte (`{ taxonomie, questions, departages, domainesAxes, fiches }`) en argument :
 * il ne lit aucun fichier, ce qui le rend utilisable tel quel dans un navigateur.
 *
 * Le parcours est une MACHINE À ÉTATS sans effet de bord. `demarrer()` rend un état,
 * `repondre(etat, id, indice)` rend un nouvel état. L'interface n'a qu'à afficher
 * `etat.question` et renvoyer un indice d'option ; elle ne calcule rien.
 *
 * Quatre mécanismes, à ne jamais confondre :
 *   FILTRE        niveau, modalité — exclut du jeu, sans noter
 *   AIGUILLAGE    famille — réduit l'ensemble candidat
 *   SCORE         corrélation de forme sur les 5 axes comptés — classe les survivants
 *   AVERTISSEMENT exigence quantitative — informe, n'exclut ni ne note
 */

import { axesComptes, axesDisposition, classer } from "./score.mjs";
import { appliquerFiltres } from "./filtres.mjs";
import { aiguiller } from "./aiguillage.mjs";
import { cascadeDepartage, appliquerDepartage, tete } from "./departage.mjs";
import { reformuler, justifier, differenciateur } from "./reformulation.mjs";

/**
 * Plafond de questions, pas une longueur fixe. Un profil tranché se résout en moins,
 * un profil ambigu consomme tout.
 */
export const MAX_QUESTIONS = 12;

/** Combien d'alternatives on montre à côté de la recommandation. */
const NB_ALTERNATIVES = 2;

/**
 * Au-delà de ce multiple du seuil d'égalité, la tête est assez détachée pour qu'il soit
 * inutile de continuer à poser des questions de profil. C'est l'arrêt anticipé.
 */
const AVANCE_FRANCHE = 3;

/* ── État ─────────────────────────────────────────────────────── */

/**
 * Un état est un objet nu, sérialisable : on peut le stocker dans une URL ou un
 * localStorage et reprendre le parcours. Rien d'opaque, aucune fonction dedans.
 */
export function demarrer(contexte) {
  const axes = axesComptes(contexte.taxonomie);
  return {
    etape: "filtre",
    reponses: {},
    profil: Object.fromEntries(axes.map((a) => [a, 0])),
    profilDisposition: null,
    poses: 0,
    alertes: [],
    fini: false,
  };
}

const optionDe = (question, indice) => question.options?.[indice] ?? null;

/** Toutes les questions du parcours, dans l'ordre des blocs. */
function questionsDans(contexte) {
  return {
    filtres: contexte.questions.filtres || [],
    aiguillage: contexte.questions.aiguillage || [],
    profil: contexte.questions.profil || [],
  };
}

/**
 * La famille retenue par l'aiguillage, ou `null`. Sert aussi à savoir si une question
 * conditionnelle s'applique.
 */
function familleChoisie(etat, contexte) {
  for (const question of contexte.questions.aiguillage || []) {
    if (question.cible !== "famille") continue;
    const indice = etat.reponses[question.id];
    if (indice !== undefined) return optionDe(question, indice)?.valeur ?? null;
  }
  return null;
}

/**
 * Une question conditionnelle ne se pose qu'aux prospects concernés. Toute famille n'a
 * pas besoin d'un second étage d'aiguillage, et **les autres ne doivent pas le subir** :
 * une question sans effet sur le jeu candidat est du temps volé.
 *
 * `si: { famille: "…" }` est la seule condition reconnue. Une condition inconnue rend la
 * question NON applicable — ne jamais poser une question dont on n'a pas compris la garde.
 */
export function questionApplicable(question, etat, contexte) {
  if (!question.si) return true;
  const clesConnues = Object.keys(question.si).filter((k) => k !== "famille");
  if (clesConnues.length) return false;
  if (question.si.famille) return familleChoisie(etat, contexte) === question.si.famille;
  return true;
}

/**
 * La prochaine question à poser, ou `null` s'il n'y en a plus. Ne modifie rien.
 *
 * L'ordre est celui de la spec : filtres durs d'abord — ils font passer 84 fiches à
 * ~40 sans rien noter —, puis l'aiguillage, puis le profil. Poser les questions de profil
 * avant les filtres reviendrait à noter des filières que le prospect ne peut pas suivre.
 */
export function prochaineQuestion(etat, contexte) {
  const q = questionsDans(contexte);
  for (const bloc of ["filtres", "aiguillage", "profil"]) {
    for (const question of q[bloc]) {
      if (etat.reponses[question.id] !== undefined) continue;
      if (!questionApplicable(question, etat, contexte)) continue;
      return { bloc, question };
    }
  }
  return null;
}

/* ── Progression ──────────────────────────────────────────────── */

/**
 * Enregistre une réponse et rend un nouvel état. Fonction pure : l'état d'entrée n'est
 * jamais modifié.
 *
 * `indice` est la position de l'option choisie. Un indice hors bornes est une erreur de
 * l'appelant, pas une réponse par défaut : on le refuse au lieu de choisir à sa place.
 */
export function repondre(etat, idQuestion, indice, contexte) {
  const q = questionsDans(contexte);
  const toutes = [...q.filtres, ...q.aiguillage, ...q.profil];
  const question = toutes.find((x) => x.id === idQuestion);
  if (!question) throw new Error(`question inconnue : ${idQuestion}`);
  const option = optionDe(question, indice);
  if (!option) throw new Error(`option ${indice} hors bornes pour ${idQuestion}`);

  const suivant = {
    ...etat,
    reponses: { ...etat.reponses, [idQuestion]: indice },
    profil: { ...etat.profil },
    profilDisposition: etat.profilDisposition ? { ...etat.profilDisposition } : null,
    poses: etat.poses + 1,
    alertes: [...etat.alertes],
  };

  for (const [axe, poids] of Object.entries(option.poids || {})) {
    suivant.profil[axe] = (suivant.profil[axe] || 0) + poids;
  }

  // Les 2 axes de disposition, si une option en porte. Aucune question n'en porte
  // aujourd'hui : l'étage de départage correspondant reste inactif et le signale.
  for (const [axe, poids] of Object.entries(option.poids_disposition || {})) {
    suivant.profilDisposition = suivant.profilDisposition || {};
    suivant.profilDisposition[axe] = (suivant.profilDisposition[axe] || 0) + poids;
  }

  return suivant;
}

/**
 * Le bouton « Ce n'est pas ça ? Reprendre » : rouvre les SEULES questions de profil, en
 * conservant les filtres et l'aiguillage.
 *
 * La reformulation porte sur le profil ; refaire les filtres serait punir le prospect
 * d'avoir corrigé. L'état étant immuable, il suffit d'en rendre un nouveau — aucune remise
 * à zéro, et les réponses de profil sont rendues à part pour que l'interface puisse les
 * PRÉ-SÉLECTIONNER. Ne jamais les réappliquer d'office : ce serait choisir à sa place.
 */
export function reprendreProfil(etat, contexte) {
  const q = questionsDans(contexte);
  const idsProfil = new Set(q.profil.map((x) => x.id));
  const axes = axesComptes(contexte.taxonomie);

  const reponses = {};
  const precedentes = {};
  for (const [id, indice] of Object.entries(etat.reponses)) {
    if (idsProfil.has(id)) precedentes[id] = indice;
    else reponses[id] = indice;
  }

  return {
    etat: {
      ...etat,
      etape: "profil",
      reponses,
      // Le profil repart de zéro : ses poids ont été accumulés par les réponses effacées.
      profil: Object.fromEntries(axes.map((a) => [a, 0])),
      profilDisposition: null,
      poses: Object.keys(reponses).length,
      alertes: [...etat.alertes],
      fini: false,
      motifArret: undefined,
    },
    precedentes,
  };
}

/* ── Sélection du jeu candidat ────────────────────────────────── */

/** Filtres puis aiguillage, dans cet ordre. Aucune note n'intervient ici. */
export function candidates(etat, contexte) {
  const q = questionsDans(contexte);
  const critere = {};
  for (const question of q.filtres) {
    const indice = etat.reponses[question.id];
    if (indice === undefined) continue;
    critere[question.filtre] = optionDe(question, indice)?.valeur ?? null;
  }

  const { retenues, exclues, incertaines } = appliquerFiltres(contexte.fiches, critere);

  const famille = familleChoisie(etat, contexte);

  // Deuxième étage, posé seulement aux familles qui en ont besoin. Une réponse à une
  // question non applicable est ignorée : sinon un état bricolé à la main pourrait
  // restreindre les domaines d'une famille qui n'a jamais reçu la question.
  let domaines = null;
  // Le LIBELLÉ de la réponse, pas seulement les domaines : c'est lui que l'écran cite pour
  // dire ce qui a réduit. Le recalculer côté interface l'obligerait à lire questions.json.
  let sousFamille = null;
  for (const question of q.aiguillage) {
    if (question.cible !== "domaines") continue;
    const indice = etat.reponses[question.id];
    if (indice === undefined || !questionApplicable(question, etat, contexte)) continue;
    const option = optionDe(question, indice);
    domaines = option?.valeur ?? null;
    sousFamille = option?.label ?? null;
  }

  const aig = aiguiller(retenues, famille, contexte.taxonomie, domaines);

  return {
    retenues: aig.retenues,
    apresFiltres: retenues.length,
    famille,
    domaines,
    sousFamille,
    // L'aiguillage fin a vidé le jeu et on est revenu à la famille : l'écran doit le DIRE.
    retourFamille: aig.retourFamille,
    exclues,
    incertaines,
    alertes: aig.alertes,
  };
}

/**
 * Faut-il s'arrêter avant d'avoir posé les 12 questions ?
 *
 * Deux cas, et un seul plafond :
 *   - une seule filière survit aux filtres : plus rien à classer ;
 *   - la tête est franchement détachée : les questions restantes ne changeront pas l'ordre.
 *
 * Le second cas exige que TOUTES les questions de profil aient été posées ? Non — c'est
 * justement l'intérêt de l'arrêt anticipé. Mais il exige un minimum : sous la moitié des
 * questions de profil, un écart apparent n'est que le hasard des premières réponses.
 */
export function doitSArreter(etat, contexte) {
  const q = questionsDans(contexte);
  if (etat.poses >= MAX_QUESTIONS) return { arret: true, motif: "plafond de questions atteint" };
  if (prochaineQuestion(etat, contexte) === null) return { arret: true, motif: "toutes les questions posées" };

  const filtresRepondus = q.filtres.every((x) => etat.reponses[x.id] !== undefined);
  if (!filtresRepondus) return { arret: false, motif: null };

  const jeu = candidates(etat, contexte);
  if (jeu.retenues.length === 1) return { arret: true, motif: "une seule filière survit aux filtres" };
  if (!jeu.retenues.length) return { arret: true, motif: "aucune filière ne survit aux filtres" };

  const profilRepondus = q.profil.filter((x) => etat.reponses[x.id] !== undefined).length;
  if (profilRepondus < Math.ceil(q.profil.length / 2)) return { arret: false, motif: null };

  const axes = axesComptes(contexte.taxonomie);
  const seuils = contexte.departages._seuils;
  const { classees } = classer(etat.profil, jeu.retenues, { axes, seuils });
  if (classees.length >= 2) {
    const avance = classees[0].score - classees[1].score;
    if (avance > seuils.ecart_declenchant_departage * AVANCE_FRANCHE) {
      return { arret: true, motif: "la tête est franchement détachée, les questions restantes n'y changeraient rien" };
    }
  }
  return { arret: false, motif: null };
}

/* ── Résultat ─────────────────────────────────────────────────── */

/**
 * L'état de l'écran, en un mot : `forte` · `bonne` · `possible` · `egalite` · `impasse`.
 *
 * C'est le moteur qui le tranche, et pas l'interface : il se déduit de trois champs, une
 * interface le déduirait à sa façon, et deux interfaces divergeraient sans qu'un test le
 * voie. Il commande la POSTURE de l'écran — une recommandation affirmée n'a pas le même
 * texte qu'une direction à explorer, et un même gabarit pour les cinq serait malhonnête.
 *
 * Ordre de priorité, du plus grave au plus favorable :
 *   impasse   rien à recommander, ou l'aiguillage fin a vidé le jeu et on est revenu à
 *             la famille. On le DIT : un prospect qui croit avoir été entendu alors qu'on
 *             a ignoré sa réponse est plus mal traité qu'un prospect à qui l'on dit la vérité.
 *   egalite   la cascade est allée jusqu'au bout sans rien trouver pour trancher. Ce n'est
 *             PAS un échec : deux voies se valent, et l'écran montre deux cartes de même poids.
 *   sinon     le palier de correspondance de la tête.
 */
export function niveauEcran({ recommandation, departage, jeu }) {
  if (!recommandation) return "impasse";
  if (jeu?.retourFamille) return "impasse";
  if (departage?.declenche && departage.etage === "egalite") return "egalite";
  return recommandation.correspondance_code;
}

/**
 * Le rang numéroté d'un étage de la cascade, tel que la spec le numérote.
 *
 * Le cas des options sœurs partage le rang 1 : comme la question rédigée, c'est une
 * distinction qu'un humain a déjà écrite — ici le nom de l'option. Le NOM de l'étage reste
 * donc le discriminant pour l'écran ; le rang ne sert qu'à dire à quelle profondeur la
 * cascade s'est arrêtée.
 */
const RANG_ETAGE = {
  "question-redigee": 1,
  "option-soeurs": 1,
  metiers: 2,
  modules: 3,
  disposition: 4,
  egalite: 5,
};

/**
 * La chaîne de décision : de quoi écrire le « pourquoi » en trois lignes, sans qu'aucune
 * ne soit inventée.
 *
 *   1. la famille retenue, et la sous-famille si le second étage d'aiguillage a été posé
 *   2. combien de candidats après les filtres, et ce qui a réduit ensuite
 *   3. `element_tranchant` — le métier, le module ou le nom d'option qui a départagé
 *
 * Sans la troisième, la justification devient générique et perd son intérêt. Quand aucun
 * départage ne s'est déclenché — la tête était détachée —, elle vient de la distinctivité
 * de la recommandation elle-même : c'est encore un libellé de la brochure, pas une phrase
 * fabriquée. `null` seulement quand le catalogue ne fournit rien, et l'écran omet la ligne.
 */
export function chaineDeDecision({ contexte, jeu, departage, recommandation, ordre }) {
  const familles = new Map((contexte.taxonomie.familles || []).map((f) => [f.id, f.label]));

  let element = null;
  if (departage?.declenche && departage.question) {
    element = {
      // Le nom de l'étage, pas son rang : c'est lui qui commande la formulation.
      source: departage.etage,
      valeurs: (departage.question.reponses || []).map((r) => r.label),
    };
  } else if (recommandation) {
    const diff = differenciateur(ordre[0].fiche);
    if (diff) element = { source: diff.source, valeurs: [diff.valeur] };
  }

  return {
    famille: jeu.famille,
    famille_label: familles.get(jeu.famille) || null,
    // Le libellé de la réponse au second étage, ou `null` s'il n'a pas été posé.
    sous_famille: jeu.sousFamille,
    candidats_apres_filtres: jeu.apresFiltres,
    candidats_apres_aiguillage: jeu.retenues.length,
    etage: departage?.etage || null,
    etage_resolveur: departage?.etage ? RANG_ETAGE[departage.etage] ?? null : null,
    element_tranchant: element,
  };
}

/**
 * Le résultat : 1 recommandation, 2 alternatives, la reformulation, et tout ce qui
 * qualifie la fiabilité de ce classement.
 *
 * `score` n'est JAMAIS destiné à l'écran — il reste dans la sortie pour les tests et la
 * simulation, sous une clé `_score` qui le dit. L'interface affiche `niveau`, trois
 * valeurs possibles : l'écart entre 0,78 et 0,74 est du bruit de calcul, mais un prospect
 * le lit comme une différence réelle.
 */
export function resultat(etat, contexte, { reponseDepartage = null } = {}) {
  const axes = axesComptes(contexte.taxonomie);
  const dispo = axesDisposition(contexte.taxonomie);
  const seuils = contexte.departages._seuils;

  const jeu = candidates(etat, contexte);
  const alertes = [...etat.alertes, ...jeu.alertes];

  const { classees, ecartees, repli, alertes: alertesScore } = classer(etat.profil, jeu.retenues, { axes, seuils });
  alertes.push(...alertesScore);

  /* ── Départage : la cascade à cinq étages ───────────────────────
   * On s'arrête au premier étage qui produit quelque chose. Les étages 2 et 3 génèrent
   * la question depuis le catalogue et ne dépendent d'aucune collecte : c'est ce qui
   * évite qu'un prospect sur trois arrive à un point mort en attendant les entretiens.
   * ─────────────────────────────────────────────────────────── */
  let ordre = classees;
  let departage = { declenche: false, etage: null, question: null, motif: null, essais: [], aEgalite: [] };
  const aEgalite = tete(classees, seuils);

  if (aEgalite.length >= 2) {
    const casc = cascadeDepartage(aEgalite, {
      departages: contexte.departages,
      profilDisposition: etat.profilDisposition,
      domainesAxes: contexte.domainesAxes,
      axesDispo: dispo,
    });
    departage = {
      declenche: true,
      etage: casc.etage,
      question: casc.question,
      // Ce que chaque étage franchi a répondu : un étage inerte ne se tait jamais.
      essais: casc.essais,
      motif: casc.essais.map((e) => `${e.etage} : ${e.motif}`).join(" ; ") || null,
      aEgalite: aEgalite.map((c) => c.fiche.id),
    };
    ordre = [...casc.ordonnees, ...classees.slice(aEgalite.length)];
    // Une réponse à la question de départage fait passer la filière visée devant. On ne
    // supprime pas l'autre : le prospect a choisi une orientation, pas éliminé un programme.
    if (reponseDepartage) ordre = appliquerDepartage(ordre, reponseDepartage);
  }

  // Le nom d'une école, jamais son identifiant technique : un slug ne veut rien dire à un
  // prospect. Il vient de la taxonomie, comme tout le vocabulaire — rien en dur ici.
  const ecoles = new Map((contexte.taxonomie.ecoles || []).map((e) => [e.id, e.nom]));
  const libelles = {
    modalites: contexte.taxonomie.modalites_libelles || {},
    niveaux: contexte.taxonomie.niveaux_libelles || {},
    acces: contexte.taxonomie.niveaux_acces_libelles || {},
  };
  // Un identifiant sans libellé s'affiche tel quel : c'est visible à l'écran, donc
  // corrigeable. Le remplacer par un vide masquerait le trou de vocabulaire.
  const dire = (table, cle) => (cle == null ? null : table[cle] || cle);

  const presenter = (c) => ({
    id: c.fiche.id,
    nom: c.fiche.nom,
    ecole: c.fiche.ecole,
    ecole_label: ecoles.get(c.fiche.ecole) || null,
    niveau: c.fiche.niveau,
    niveau_label: dire(libelles.niveaux, c.fiche.niveau),
    niveau_acces: c.fiche.niveau_acces,
    niveau_acces_label: dire(libelles.acces, c.fiche.niveau_acces),
    // Deux écoles du catalogue sont distinctes mais publient le même intitulé : sans la
    // modalité affichée, le prospect voit un doublon inexpliqué.
    modalites: c.fiche.modalites || [],
    modalites_labels: (c.fiche.modalites || []).map((m) => dire(libelles.modalites, m)),
    correspondance: c.niveau,
    correspondance_code: c.code,
    _score: c.score,
    justification: justifier(c.fiche),
    // Ce qui distingue cette filière de ses voisines, en un libellé. `null` quand rien
    // n'est utilisable : l'écran n'affiche alors que le nom. Renseigné plus bas pour les
    // alternatives, qui doivent éviter les libellés déjà cités par la recommandation.
    differenciateur: differenciateur(c.fiche),
    modules_distinctifs: (c.fiche.distinctivite?.modules_exclusifs || []).slice(0, 5),
    metiers: (c.fiche.debouches?.metiers || []).slice(0, 6),
    // Avertissement : informe, n'exclut ni ne note. `modules_comptes` décide de
    // l'affichage du bloc — la médiane du catalogue est à 0, il sera souvent absent.
    exigence_quantitative: {
      niveau: c.fiche.exigence_quantitative?.niveau ?? null,
      modules_comptes: c.fiche.exigence_quantitative?.modules_comptes ?? 0,
      modules_exemples: (c.fiche.exigence_quantitative?.modules_exemples || []).slice(0, 4),
    },
    // Souvent vides sur les 84 fiches : l'écran doit dégrader, pas laisser un cadre vide.
    vitrine: {
      accroche: c.fiche.vitrine?.accroche || null,
      description: c.fiche.vitrine?.description || null,
    },
    deconseille_si: c.fiche.deconseille_si || [],
  });

  const recommandation = ordre.length ? presenter(ordre[0]) : null;
  const chaine = chaineDeDecision({ contexte, jeu, departage, recommandation, ordre });

  /* ── Ce que la recommandation a déjà dit ────────────────────────
   * Une alternative ne doit pas se présenter par un libellé que la recommandation vient
   * d'annoncer comme lui étant propre : le prospect lirait deux fois la même exclusivité,
   * et l'écran se contredirait tout seul.
   * ─────────────────────────────────────────────────────────── */
  const dejaCites = new Set([
    ...(chaine.element_tranchant?.valeurs || []),
    ...(recommandation?.modules_distinctifs || []),
    ...(recommandation?.differenciateur ? [recommandation.differenciateur.valeur] : []),
  ]);

  const presenterAlternative = (c) => {
    const vue = presenter(c);
    vue.differenciateur = differenciateur(c.fiche, dejaCites);
    if (vue.differenciateur) dejaCites.add(vue.differenciateur.valeur);
    return vue;
  };

  return {
    // L'état de l'écran, en un mot. C'est le moteur qui le tranche : l'interface le
    // déduirait de plusieurs champs, et deux interfaces le déduiraient différemment.
    niveau: niveauEcran({ recommandation, departage, jeu }),
    // Le vecteur du prospect, pour la reformulation. Ce ne sont pas des scores de
    // correspondance : ce sont ses propres réponses agrégées.
    profil: { ...etat.profil },
    reformulation: reformuler(etat.profil, axes, contexte.reformulation),
    recommandation,
    chaine,
    alternatives: ordre.slice(1, 1 + NB_ALTERNATIVES).map(presenterAlternative),
    departage,
    // Accessibles par les filtres et l'aiguillage, avec mention — jamais classés.
    // Leurs axes ne décrivent pas leur contenu ; leur donner un rang afficherait un
    // classement indiscernable d'un vrai.
    sans_classement: ecartees.map((e) => ({
      id: e.fiche.id,
      nom: e.fiche.nom,
      ecole: e.fiche.ecole,
      ecole_label: ecoles.get(e.fiche.ecole) || null,
      niveau: e.fiche.niveau,
      niveau_label: dire(libelles.niveaux, e.fiche.niveau),
      modalites: e.fiche.modalites || [],
      modalites_labels: (e.fiche.modalites || []).map((m) => dire(libelles.modalites, m)),
      mention: "Ce programme n'a pas pu être comparé à ton profil : le catalogue n'en détaille pas assez le contenu.",
      raison: e.raison,
    })),
    parcours: {
      questions_posees: etat.poses,
      filieres_au_depart: contexte.fiches.length,
      apres_filtres: jeu.apresFiltres,
      apres_aiguillage: jeu.retenues.length,
      classees: classees.length,
      famille: jeu.famille,
      domaines: jeu.domaines,
      retour_famille: jeu.retourFamille,
      niveau_incertain: jeu.incertaines.length,
    },
    // Le classement est dégradé : le dire, ne jamais le masquer.
    repli_parts: repli,
    alertes,
  };
}

/**
 * Parcours complet non interactif : utile aux tests et à la simulation. `reponses` est un
 * objet `{ P1: 0, P2: 3, … }`. Les questions sans réponse ne sont simplement pas posées.
 */
export function jouer(reponses, contexte) {
  let etat = demarrer(contexte);
  const q = questionsDans(contexte);
  for (const question of [...q.filtres, ...q.aiguillage, ...q.profil]) {
    const indice = reponses[question.id];
    if (indice === undefined) continue;
    // Une question conditionnelle non applicable ne se pose pas, même si `reponses`
    // en porte une : le jeu de réponses d'un test ne doit pas contourner la garde.
    if (!questionApplicable(question, etat, contexte)) continue;
    etat = repondre(etat, question.id, indice, contexte);
    const stop = doitSArreter(etat, contexte);
    if (stop.arret) {
      etat = { ...etat, fini: true, motifArret: stop.motif };
      break;
    }
  }
  if (!etat.fini) etat = { ...etat, fini: true, motifArret: "questions épuisées" };
  return { etat, resultat: resultat(etat, contexte) };
}
