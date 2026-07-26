/**
 * rendu.mjs — l'écran de résultat, en fonctions pures qui rendent du HTML.
 *
 * AUCUN DOM ICI, aucun `document`, aucun `fetch`. Chaque bloc est une fonction qui prend
 * une part du résultat du moteur et rend une chaîne. C'est ce qui permet de TESTER le rendu
 * en Node — « aucun nombre de score dans le DOM produit » se vérifie en parcourant la
 * chaîne, sans embarquer une bibliothèque de DOM, donc sans dépendance.
 *
 * L'interface AFFICHE, elle ne calcule pas. Tout vient du résultat du moteur :
 *   - aucun nom de filière, d'école, de domaine ou de famille en dur ;
 *   - aucun texte inventé sur un programme — ce qui n'est pas dans les données ne s'affiche pas ;
 *   - aucun pourcentage, aucune valeur de score, nulle part, attributs et commentaires compris.
 *
 * Les seuls textes écrits ici sont ceux de l'écran lui-même : titres de blocs, posture,
 * mentions. Ils ne parlent d'aucun programme en particulier.
 */

/* ── Sécurité d'affichage ─────────────────────────────────────── */

/**
 * Les libellés viennent du catalogue via l'extraction d'un PDF : ils peuvent porter
 * n'importe quel caractère. On échappe TOUT ce qui vient des données, sans exception —
 * une seule interpolation brute suffirait à casser la page sur une apostrophe typographique
 * mal placée ou une esperluette.
 */
export function echapper(valeur) {
  return String(valeur ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const morceaux = (...parts) => parts.filter(Boolean).join("\n");

/* ── Textes de l'écran ────────────────────────────────────────────
 * Regroupés pour être relus d'un coup : c'est le seul endroit de l'interface qui parle.
 * Aucun ne nomme un programme.
 * ─────────────────────────────────────────────────────────────── */

export const TEXTES = {
  badge: {
    forte: "Correspondance forte",
    bonne: "Bonne correspondance",
    // Imposé par la spec : en `possible`, le badge ne doit pas ressembler à un échec.
    // « correspondance faible » ferait lire un verdict là où il y a une direction.
    possible: "Une piste à explorer",
    egalite: "Deux voies, à égalité",
    impasse: "Aucun programme ne combine tes réponses",
  },
  posture: {
    forte: "Voici la formation qui correspond le mieux à ce que tu as décrit.",
    bonne: "Voici la formation qui correspond le mieux, et deux autres à regarder de près.",
    possible: "Ce n'est pas une réponse, c'est une direction. Prends-la comme un point de départ.",
    egalite: "Ces deux formations te correspondent également. Rien ne permet de les séparer sur ton profil, et c'est une information en soi : le choix t'appartient.",
    impasse: "Aucun programme ne réunit à la fois ton niveau d'études et le domaine que tu as choisi. Ta réponse n'a pas été ignorée pour autant : voici l'ensemble de l'univers que tu as retenu.",
  },
  titres: {
    recommandation: "Notre recommandation",
    deuxCartes: "Deux formations à égalité",
    pourquoi: "Pourquoi cette formation",
    contenu: "Ce que tu y étudies",
    metiers: "Ce que ça mène à faire",
    deconseille: "À savoir avant de te lancer",
    // Ni ce titre ni le texte ci-dessous ne nomment un domaine de la taxonomie : le
    // vocabulaire des données n'a rien à faire dans les textes de l'écran, même en prose.
    quantitatif: "Il y a du calcul",
    alternatives: "À regarder aussi",
    nonClasses: "D'autres programmes de cet univers",
    conseiller: "Parler à quelqu'un",
  },
  quantitatif:
    "Ce programme comporte des enseignements de calcul et de statistiques. C'est une information à connaître avant de t'inscrire, pas une mise en garde.",
  // Formulation imposée : le défaut est DOCUMENTAIRE, il vient de la brochure. Ne jamais
  // laisser entendre que ces programmes sont moins bons.
  nonClasses:
    "Le contenu publié de ces programmes ne permet pas de les comparer à ton profil. C'est un manque de la brochure, pas du programme.",
  conseiller:
    "Ce résultat est une piste, pas une décision. Un conseiller ISM peut la confronter à ton dossier, à tes notes et à ce que tu veux faire ensuite — ce qu'un questionnaire ne saura jamais faire.",
  conseillerAction: "Être rappelé par un conseiller",
  aucuneReformulation: "Tes réponses sont trop partagées pour qu'on les résume en une phrase.",
};

/* ── Ordre des blocs par état ─────────────────────────────────────
 * Un même gabarit pour les cinq états serait malhonnête : une recommandation affirmée et
 * une direction à explorer ne se lisent pas de la même façon.
 *
 * Écrit en LISTES ORDONNÉES et non en numéros, parce que la table de la spec porte deux
 * fois le rang 4 sur l'état `bonne` — les alternatives y passent « avant le contenu », ce
 * que la liste dit sans ambiguïté et qu'un numéro laisserait à interpréter.
 * ─────────────────────────────────────────────────────────────── */

export const ORDRE_BLOCS = {
  forte: ["reformulation", "recommandation", "contenu", "quantitatif", "alternatives", "non-classes", "conseiller"],
  bonne: ["reformulation", "recommandation", "alternatives", "contenu", "quantitatif", "non-classes", "conseiller"],
  // Le conseiller passe en HAUT : quand le moteur n'est pas sûr, un humain vaut mieux qu'un écran.
  possible: ["reformulation", "conseiller", "recommandation", "contenu", "quantitatif", "alternatives", "non-classes"],
  egalite: ["reformulation", "deux-cartes", "contenu", "quantitatif", "alternatives", "non-classes", "conseiller"],
  impasse: ["reformulation", "conseiller", "alternatives", "non-classes"],
};

/* ── Blocs ────────────────────────────────────────────────────── */

/**
 * Reformulation — obligatoire, en tête, sur les cinq états. Elle transforme un verdict en
 * proposition : le prospect voit ce que le quiz a compris de lui, et peut le contredire.
 *
 * Le bouton de reprise a le MÊME POIDS VISUEL que la phrase ; il compte autant qu'elle. Son
 * libellé vient du moteur pour que l'interface ne puisse pas l'oublier.
 */
export function blocReformulation(reformulation) {
  const phrase = reformulation?.phrase
    ? `<p class="reformulation">${echapper(reformulation.phrase)}</p>`
    : `<p class="reformulation reformulation--absente">${echapper(TEXTES.aucuneReformulation)}</p>`;

  return `<section class="bloc bloc--reformulation" aria-label="Ce que nous avons compris">
${phrase}
<button type="button" class="reprendre" data-action="reprendre">${echapper(reformulation?.reprise || "Reprendre")}</button>
</section>`;
}

/**
 * L'identité d'une filière : nom, école, niveau délivré, modalité, diplôme requis.
 *
 * On affiche les LIBELLÉS quand le moteur en fournit — « sur le campus » et non
 * « presentiel ». À défaut, l'identifiant brut : c'est laid, donc visible, donc corrigé.
 * L'interface ne porte aucune table de traduction ; elle vivrait alors en double.
 *
 * La MODALITÉ est toujours affichée. Deux écoles du catalogue publient le même intitulé de
 * programme : sans elle, le prospect voit un doublon inexpliqué.
 */
function identite(f) {
  const lignes = [];
  const ecole = f.ecole_label || f.ecole;
  if (ecole) lignes.push(`<span class="ecole">${echapper(ecole)}</span>`);
  const niveau = f.niveau_label || f.niveau;
  if (niveau) lignes.push(`<span class="niveau">${echapper(niveau)}</span>`);
  const modalites = f.modalites_labels?.length ? f.modalites_labels : f.modalites || [];
  for (const m of modalites) lignes.push(`<span class="modalite">${echapper(m)}</span>`);
  const acces = f.niveau_acces_label || (f.niveau_acces ? `avec ${f.niveau_acces}` : null);
  if (acces) lignes.push(`<span class="acces">accessible ${echapper(acces)}</span>`);

  return `<h3 class="nom">${echapper(f.nom)}</h3>
<p class="meta">${lignes.join(" ")}</p>`;
}

/**
 * Le « pourquoi », en trois lignes numérotées, chacune tirée de `chaine`. La troisième
 * change de formulation selon l'étage qui a tranché — c'est elle qui rend la justification
 * spécifique ; sans elle, elle serait générique et perdrait son intérêt.
 *
 * Chaque ligne est OMISE si sa donnée manque. Une ligne inventée serait pire qu'absente.
 */
export function lignesPourquoi(chaine) {
  if (!chaine) return [];
  const lignes = [];

  if (chaine.famille_label) {
    lignes.push(
      chaine.sous_famille
        ? `Tu as retenu ${echapper(chaine.famille_label)}, et plus précisément « ${echapper(chaine.sous_famille)} ».`
        : `Tu as retenu ${echapper(chaine.famille_label)}.`
    );
  }

  if (Number.isFinite(chaine.candidats_apres_filtres)) {
    const apres = Number.isFinite(chaine.candidats_apres_aiguillage) ? chaine.candidats_apres_aiguillage : null;
    lignes.push(
      apres === null
        ? `${chaine.candidats_apres_filtres} programmes correspondaient à ton niveau et à ta façon d'étudier.`
        : `${chaine.candidats_apres_filtres} programmes correspondaient à ton niveau et à ta façon d'étudier ; ton choix d'univers en a laissé ${apres}.`
    );
  }

  const el = chaine.element_tranchant;
  if (el && el.valeurs?.length) {
    // Les libellés sont ceux de la brochure. On ne les reformule jamais : le catalogue
    // écrit « Concepteur de systèmes embarqués », le réécrire serait inventer une donnée.
    const cites = el.valeurs.map((v) => `« ${echapper(v)} »`);
    if (el.source === "metiers") {
      lignes.push(`Entre ${cites.join(" et ")}, c'est le premier qui te ressemble le plus.`);
    } else if (el.source === "modules") {
      lignes.push(`Ce qu'elle enseigne et que les autres n'enseignent pas : ${cites.join(", ")}.`);
    } else if (el.source === "option-soeurs") {
      lignes.push(`Ces parcours partagent le même tronc commun ; c'est l'option qui les sépare : ${cites.join(" ou ")}.`);
    } else if (el.source === "question-redigee") {
      lignes.push(`Ce qui les distingue : ${cites.join(" ou ")}.`);
    } else {
      lignes.push(`Ce qui la distingue : ${cites.join(", ")}.`);
    }
  }

  return lignes;
}

function blocPourquoi(chaine) {
  const lignes = lignesPourquoi(chaine);
  if (!lignes.length) return "";
  return `<div class="pourquoi">
<h4>${echapper(TEXTES.titres.pourquoi)}</h4>
<ol>${lignes.map((l) => `<li>${l}</li>`).join("")}</ol>
</div>`;
}

/** Recommandation — nom, école, modalité, diplôme requis, puis le « pourquoi ». */
export function blocRecommandation(resultat) {
  const f = resultat.recommandation;
  if (!f) return "";
  return `<section class="bloc bloc--reco" aria-label="${echapper(TEXTES.titres.recommandation)}">
<p class="badge badge--${echapper(resultat.niveau)}">${echapper(TEXTES.badge[resultat.niveau] || "")}</p>
<h2>${echapper(TEXTES.titres.recommandation)}</h2>
${identite(f)}
${blocPourquoi(resultat.chaine)}
</section>`;
}

/**
 * État `egalite` — deux cartes de MÊME POIDS, aucun gagnant. La première n'est pas
 * présentée comme la recommandation : le moteur n'a rien trouvé pour les séparer, et
 * désigner arbitrairement un vainqueur serait mentir sur ce qu'il sait.
 */
export function blocDeuxCartes(resultat) {
  const fiches = cartesAEgalite(resultat);
  if (fiches.length < 2) return blocRecommandation(resultat);

  return `<section class="bloc bloc--egalite" aria-label="${echapper(TEXTES.titres.deuxCartes)}">
<p class="badge badge--egalite">${echapper(TEXTES.badge.egalite)}</p>
<h2>${echapper(TEXTES.titres.deuxCartes)}</h2>
<p class="posture">${echapper(TEXTES.posture.egalite)}</p>
<div class="cartes">
${fiches.map((f) => `<article class="carte">${identite(f)}</article>`).join("\n")}
</div>
${blocPourquoi(resultat.chaine)}
</section>`;
}

/**
 * Les filières à égalité avec la tête, dans l'ordre du classement. On s'appuie sur les `id`
 * remontés par le moteur, jamais sur une comparaison de scores refaite ici : l'interface ne
 * calcule pas, et elle n'a de toute façon aucun score à comparer.
 */
export function cartesAEgalite(resultat) {
  const toutes = [resultat.recommandation, ...(resultat.alternatives || [])].filter(Boolean);
  const ids = new Set(resultat.departage?.aEgalite || []);
  if (!ids.size) return toutes.slice(0, 2);
  return toutes.filter((f) => ids.has(f.id));
}

/**
 * Contenu et débouchés — DÉGRADATION OBLIGATOIRE. `vitrine.accroche` est vide sur les
 * 84 fiches et arrivera par les entretiens : le bloc doit fonctionner sans elle.
 *
 *   accroche + modules  →  accroche puis modules
 *   accroche vide       →  modules seuls
 *   modules absents     →  métiers seuls
 *   les deux absents    →  AUCUN BLOC, pas un cadre vide
 */
export function blocContenu(fiches) {
  const liste = (Array.isArray(fiches) ? fiches : [fiches]).filter(Boolean);
  // Le nom n'est rappelé que s'il y a plusieurs cartes — en égalité. Sur une seule, il
  // vient d'être affiché juste au-dessus, et le répéter donne à lire un doublon.
  const cartes = liste.map((f) => contenuDUneFiche(f, liste.length > 1)).filter(Boolean);
  if (!cartes.length) return "";
  return `<section class="bloc bloc--contenu" aria-label="${echapper(TEXTES.titres.contenu)}">
${cartes.join("\n")}
</section>`;
}

function contenuDUneFiche(f, rappelerLeNom = false) {
  const parts = [];

  if (f.vitrine?.accroche) parts.push(`<p class="accroche">${echapper(f.vitrine.accroche)}</p>`);

  const modules = f.modules_distinctifs || [];
  if (modules.length) {
    parts.push(`<h4>${echapper(TEXTES.titres.contenu)}</h4>
<ul class="modules">${modules.map((m) => `<li>${echapper(m)}</li>`).join("")}</ul>`);
  } else if (f.metiers?.length) {
    // Ni accroche ni module : les métiers portent seuls le bloc.
    parts.push(`<h4>${echapper(TEXTES.titres.metiers)}</h4>
<ul class="metiers">${f.metiers.map((m) => `<li>${echapper(m)}</li>`).join("")}</ul>`);
  }

  // Les métiers en complément, quand les modules ont déjà rempli le bloc.
  if (modules.length && f.metiers?.length) {
    parts.push(`<h4>${echapper(TEXTES.titres.metiers)}</h4>
<ul class="metiers">${f.metiers.map((m) => `<li>${echapper(m)}</li>`).join("")}</ul>`);
  }

  // Même règle pour `deconseille_si` : affiché quand il existe, absent sinon, SANS
  // réorganiser l'écran — il ne fait jamais apparaître ni disparaître un autre bloc.
  if (f.deconseille_si?.length) {
    parts.push(`<h4>${echapper(TEXTES.titres.deconseille)}</h4>
<ul class="deconseille">${f.deconseille_si.map((d) => `<li>${echapper(d)}</li>`).join("")}</ul>`);
  }

  if (!parts.length) return "";
  const rappel = rappelerLeNom ? `<p class="contenu-de">${echapper(f.nom)}</p>\n` : "";
  return `<article class="contenu">${rappel}${parts.join("\n")}</article>`;
}

/**
 * Avertissement quantitatif — affiché SEULEMENT si des modules ont été comptés. La médiane
 * du catalogue est à zéro : le bloc sera souvent absent, et c'est normal.
 *
 * Ton informatif, jamais dissuasif : c'est un avertissement, il informe — il n'exclut ni ne
 * note. Le nombre affiché est un COMPTE DE MODULES, pas un score : le compter est un fait.
 */
export function blocQuantitatif(fiches) {
  const concernees = (Array.isArray(fiches) ? fiches : [fiches])
    .filter(Boolean)
    .filter((f) => (f.exigence_quantitative?.modules_comptes || 0) > 0);
  if (!concernees.length) return "";

  const detail = (f) => {
    const ex = f.exigence_quantitative;
    const exemples = ex.modules_exemples?.length
      ? ` <span class="exemples">${ex.modules_exemples.map((m) => echapper(m)).join(" · ")}</span>`
      : "";
    return `<li>${echapper(f.nom)} — ${ex.modules_comptes} module(s)${exemples}</li>`;
  };

  return `<section class="bloc bloc--quanti" aria-label="${echapper(TEXTES.titres.quantitatif)}">
<h4>${echapper(TEXTES.titres.quantitatif)}</h4>
<p>${echapper(TEXTES.quantitatif)}</p>
<ul>${concernees.map(detail).join("")}</ul>
</section>`;
}

/**
 * Alternatives — des voisins, SANS aucun score comparatif entre eux ni avec la
 * recommandation. Le `differenciateur` est GÉNÉRÉ par le moteur depuis un module ou un
 * métier exclusif ; quand il manque, on affiche le nom seul. Une phrase fausse est pire
 * qu'une phrase absente.
 */
export function blocAlternatives(alternatives, titre = TEXTES.titres.alternatives) {
  const liste = (alternatives || []).filter(Boolean);
  if (!liste.length) return "";

  const ligne = (f) => {
    const d = f.differenciateur;
    const distinction = d
      ? `<p class="differenciateur">${
          d.source === "metiers"
            ? `mène aussi à « ${echapper(d.valeur)} »`
            : `enseigne « ${echapper(d.valeur)} »`
        }</p>`
      : "";
    return `<article class="alternative">${identite(f)}${distinction}</article>`;
  };

  return `<section class="bloc bloc--alternatives" aria-label="${echapper(titre)}">
<h4>${echapper(titre)}</h4>
${liste.map(ligne).join("\n")}
</section>`;
}

/**
 * Non classés — les programmes que le moteur rend accessibles sans les noter. Le défaut est
 * DOCUMENTAIRE : la brochure n'en publie pas assez le contenu. Ne jamais laisser entendre
 * que le programme est moins bon. Les masquer priverait le prospect de programmes réels.
 */
export function blocNonClasses(nonClasses) {
  const liste = (nonClasses || []).filter(Boolean);
  if (!liste.length) return "";

  const ligne = (f) => `<article class="non-classe">${identite(f)}</article>`;

  return `<section class="bloc bloc--non-classes" aria-label="${echapper(TEXTES.titres.nonClasses)}">
<h4>${echapper(TEXTES.titres.nonClasses)}</h4>
<p>${echapper(TEXTES.nonClasses)}</p>
${liste.map(ligne).join("\n")}
</section>`;
}

/**
 * Conseiller — position variable selon l'état. Le texte affirme que le résultat est une
 * piste et non une décision : c'est plus honnête, et c'est aussi l'intérêt d'ISM, puisque ça
 * mène à un humain plutôt que de prétendre le remplacer.
 *
 * L'ACTION reste à câbler — lien WhatsApp pré-rempli portant le programme recommandé, ou
 * formulaire, à trancher avec les admissions. Le bouton porte donc le nom du programme en
 * donnée, prêt à être repris, et aucune destination.
 */
export function blocConseiller(resultat) {
  const nom = resultat?.recommandation?.nom || "";
  return `<section class="bloc bloc--conseiller" aria-label="${echapper(TEXTES.titres.conseiller)}">
<h4>${echapper(TEXTES.titres.conseiller)}</h4>
<p>${echapper(TEXTES.conseiller)}</p>
<button type="button" class="conseiller" data-action="conseiller" data-programme="${echapper(nom)}">${echapper(TEXTES.conseillerAction)}</button>
</section>`;
}

/**
 * Les alertes du moteur : repli sur les parts, niveau d'accès non confirmé, retour à la
 * famille. Elles ne sont pas décoratives — chacune dit que le résultat est moins sûr qu'il
 * n'y paraît, et les taire ferait passer un classement dégradé pour un classement normal.
 */
export function blocAlertes(resultat) {
  const messages = [];
  if (resultat.repli_parts) {
    messages.push("Tes réponses sont très équilibrées : le classement ci-dessus est approximatif.");
  }
  if (resultat.parcours?.niveau_incertain) {
    messages.push(
      `${resultat.parcours.niveau_incertain} programme(s) retenus sans que leur diplôme d'entrée soit confirmé : à vérifier auprès des admissions.`
    );
  }
  if (!messages.length) return "";
  return `<section class="bloc bloc--alertes" aria-label="À savoir">
${messages.map((m) => `<p>${echapper(m)}</p>`).join("\n")}
</section>`;
}

/* ── L'écran ──────────────────────────────────────────────────── */

/**
 * L'écran complet, dans l'ordre imposé par l'état. Rend une chaîne : c'est ce qui rend le
 * rendu testable sans DOM.
 *
 * Un bloc dont la donnée manque rend la chaîne vide et disparaît, sans que l'ordre des
 * autres change. C'est la règle de dégradation : jamais un cadre vide, jamais un écran
 * réorganisé parce qu'un champ est arrivé.
 */
export function rendreResultat(resultat) {
  const etat = ORDRE_BLOCS[resultat.niveau] ? resultat.niveau : "possible";
  const enEgalite = etat === "egalite";
  const cartes = enEgalite ? cartesAEgalite(resultat) : [resultat.recommandation].filter(Boolean);
  // En égalité, les « alternatives » sont ce qui reste après les cartes à égalité : les
  // reproposer plus bas donnerait à voir deux fois les mêmes programmes.
  const idsCartes = new Set(cartes.map((f) => f.id));
  const autres = (resultat.alternatives || []).filter((f) => !idsCartes.has(f.id));

  const construire = {
    reformulation: () => blocReformulation(resultat.reformulation),
    conseiller: () => blocConseiller(resultat),
    recommandation: () => blocRecommandation(resultat),
    "deux-cartes": () => blocDeuxCartes(resultat),
    contenu: () => blocContenu(cartes),
    quantitatif: () => blocQuantitatif(cartes),
    alternatives: () => blocAlternatives(autres),
    "non-classes": () => blocNonClasses(resultat.sans_classement),
  };

  const posture =
    etat !== "egalite" && TEXTES.posture[etat]
      ? `<p class="posture posture--${echapper(etat)}">${echapper(TEXTES.posture[etat])}</p>`
      : "";

  const blocs = ORDRE_BLOCS[etat].map((nom) => construire[nom]?.() || "").filter(Boolean);

  return morceaux(
    `<div class="resultat" data-etat="${echapper(etat)}">`,
    etat === "impasse" ? `<p class="badge badge--impasse">${echapper(TEXTES.badge.impasse)}</p>` : "",
    posture,
    ...blocs,
    blocAlertes(resultat),
    `</div>`
  );
}

/* ── L'écran de question ──────────────────────────────────────────
 * L'interface affiche `etat.question` et renvoie un INDICE d'option. Elle ne connaît ni les
 * axes, ni les seuils, ni les filières.
 * ─────────────────────────────────────────────────────────────── */

/**
 * Une question, ses options, et la progression.
 *
 * `choisie` pré-sélectionne une réponse précédente — c'est ce dont le bouton Reprendre a
 * besoin. Elle est PRÉ-SÉLECTIONNÉE, pas appliquée : rien n'avance tant que le prospect n'a
 * pas cliqué. Ne jamais choisir une réponse par défaut à sa place.
 */
export function rendreQuestion({ question, posees, plafond, choisie = null }) {
  const option = (o, i) =>
    `<li><button type="button" class="option${choisie === i ? " option--choisie" : ""}" data-indice="${i}"${
      choisie === i ? ' aria-pressed="true"' : ""
    }>${echapper(o.label)}</button></li>`;

  return `<div class="question" data-question="${echapper(question.id)}">
<p class="progression">Question ${posees + 1} sur ${plafond} au plus</p>
<h2>${echapper(question.question)}</h2>
${question.aide ? `<p class="aide">${echapper(question.aide)}</p>` : ""}
<ul class="options">${(question.options || []).map(option).join("")}</ul>
</div>`;
}

/**
 * La question de départage, quand la cascade en a produit une. Elle est SITUATIONNELLE,
 * comme les questions de profil — jamais une liste de métiers affichée telle quelle — et
 * ses libellés sont ceux de la brochure, non reformulés.
 */
export function rendreDepartage(departage) {
  const q = departage?.question;
  if (!q) return "";
  const option = (r) =>
    `<li><button type="button" class="option" data-vers="${echapper(r.vers)}">${echapper(r.label)}</button></li>`;
  return `<div class="question question--departage">
<h2>${echapper(q.question)}</h2>
<ul class="options">${(q.reponses || []).map(option).join("")}</ul>
</div>`;
}
