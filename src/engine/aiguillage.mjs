/**
 * aiguillage.mjs — réduire l'ensemble candidat, sans noter.
 *
 * Trois étages : famille → domaine → programme. Le prospect choisit une FAMILLE, jamais
 * un domaine : on ne peut pas lui demander de trancher parmi 28 domaines.
 *
 * La liste des domaines d'une famille est l'unique source de vérité — les fiches ne
 * portent pas de champ `famille`, il se déduit de la taxonomie. Une fiche à deux
 * domaines peut donc relever de deux familles, et c'est voulu : une licence Droit-Gestion
 * appartient bien aux deux.
 */

/** domaine → famille. `validate.mjs` garantit qu'un domaine n'a qu'une famille. */
export function familleParDomaine(taxonomie) {
  const m = new Map();
  for (const fam of taxonomie.familles || []) for (const d of fam.domaines) m.set(d, fam.id);
  return m;
}

/** Les familles d'une fiche, déduites de ses domaines. */
export function famillesDeFiche(fiche, index) {
  return [...new Set((fiche.domaines || []).map((d) => index.get(d)).filter(Boolean))];
}

/**
 * Les fiches d'une famille, puis éventuellement d'un sous-ensemble de ses domaines.
 *
 * `famille` nulle = pas d'aiguillage, tout reste candidat. `domaines` non vide restreint
 * une seconde fois, à l'intérieur de la famille : c'est le deuxième étage d'aiguillage,
 * posé seulement aux familles qui en ont besoin. Une famille qui porte 39 % du catalogue
 * ne réduit plus rien à elle seule.
 *
 * Le second étage **ne peut pas élargir** : il s'applique aux fiches déjà retenues par la
 * famille. Un domaine passé qui n'appartient pas à la famille serait donc sans effet, ce
 * qui se verrait comme un jeu candidat vide — d'où l'alerte.
 *
 * Un domaine hors famille ferait sortir sa fiche du parcours sans prévenir : on le remonte
 * en alerte plutôt que de le laisser disparaître.
 */
export function aiguiller(fiches, famille, taxonomie, domaines = null) {
  const index = familleParDomaine(taxonomie);
  const alertes = [];
  // Drapeau, PAS un texte à reconnaître : l'écran doit annoncer le retour à la famille, et
  // le lui faire déduire d'une chaîne d'alerte le casserait à la première reformulation.
  let retourFamille = false;
  const orphelins = new Set();
  for (const f of fiches) {
    for (const d of f.domaines || []) if (!index.has(d)) orphelins.add(d);
  }
  if (orphelins.size) alertes.push(`domaine(s) sans famille dans taxonomy.json : ${[...orphelins].join(", ")}`);

  if (!famille) return { retenues: fiches, alertes, retourFamille };

  let retenues = fiches.filter((f) => famillesDeFiche(f, index).includes(famille));

  if (domaines?.length) {
    const horsFamille = domaines.filter((d) => index.get(d) !== famille);
    if (horsFamille.length) {
      alertes.push(
        `aiguillage fin : domaine(s) ${horsFamille.join(", ")} n'appartiennent pas à la famille ${famille}, donc sans effet`
      );
    }
    const cible = new Set(domaines);
    const affinees = retenues.filter((f) => (f.domaines || []).some((d) => cible.has(d)));

    // L'aiguillage fin peut vider le jeu sur une combinaison parfaitement légitime : un
    // bachelier qui choisit un registre dont la famille ne propose que des masters. On
    // revient alors à la famille et ON LE DIT, au lieu de rendre un cul-de-sac. Un
    // élargissement silencieux serait pire : le prospect croirait avoir été entendu.
    if (!affinees.length) {
      retourFamille = true;
      alertes.push(
        `aiguillage fin (${domaines.join(", ")}) : aucune filière accessible, retour à la famille ${famille}`
      );
    } else {
      retenues = affinees;
    }
  }

  return { retenues, alertes, retourFamille };
}

/**
 * Les domaines d'une famille qu'aucune option d'aiguillage fin ne permet d'atteindre.
 *
 * Un domaine inatteignable retire ses fiches du parcours sans que rien ne le dise : le
 * prospect ne les verrait jamais, quelle que soit sa réponse. `validate.mjs` et `npm test`
 * s'appuient là-dessus.
 */
export function domainesInatteignables(questions, taxonomie) {
  const problemes = [];
  for (const q of questions.aiguillage || []) {
    const famille = q.si?.famille;
    if (q.cible !== "domaines" || !famille) continue;
    const declaree = (taxonomie.familles || []).find((f) => f.id === famille);
    if (!declaree) {
      problemes.push(`${q.id} : famille ${famille} absente de taxonomy.json`);
      continue;
    }
    const couverts = new Set((q.options || []).flatMap((o) => o.valeur || []));
    const manquants = declaree.domaines.filter((d) => !couverts.has(d));
    if (manquants.length) problemes.push(`${q.id} : domaine(s) inatteignable(s) — ${manquants.join(", ")}`);
    const intrus = [...couverts].filter((d) => !declaree.domaines.includes(d));
    if (intrus.length) problemes.push(`${q.id} : domaine(s) hors de la famille ${famille} — ${intrus.join(", ")}`);
  }
  return problemes;
}

/**
 * Les fiches qu'AUCUNE combinaison de réponses d'aiguillage ne peut atteindre.
 *
 * `domainesInatteignables` ci-dessus contrôle la question : chaque domaine d'une famille doit
 * être désigné par une option. Ce contrôle-ci porte sur les **fiches**, et ce n'est pas le
 * même invariant : une fiche peut porter deux domaines tous deux atteignables et se retrouver
 * pourtant hors de portée si aucune famille ne la revendique — cas d'un domaine sans famille,
 * ou d'une fiche sans domaine du tout.
 *
 * Pourquoi ce contrôle existe. L'appartenance à une famille se DÉDUIT des domaines, et les
 * domaines se déduisent du titre, de l'objectif et des modules. Une correction d'extraction
 * peut donc déplacer une fiche d'une famille à l'autre sans que personne l'ait demandé — c'est
 * arrivé. Rien ne garantit a priori que la nouvelle famille soit atteignable par le parcours,
 * et une fiche hors de portée ne se signale jamais d'elle-même : elle se contente de ne
 * jamais apparaître.
 *
 * On énumère A1 × A2 comme le prospect les rencontre, en respectant la garde `si` de la
 * question fine : une fiche atteignable seulement par une réponse qu'on ne lui pose pas ne
 * serait pas atteignable.
 */
export function fichesInatteignables(fiches, questions, taxonomie) {
  const parFamille = (questions.aiguillage || []).find((q) => q.cible === "famille");
  if (!parFamille) return { inatteignables: [], combinaisons: 0 };

  const fines = (questions.aiguillage || []).filter((q) => q.cible === "domaines");
  const atteintes = new Set();
  let combinaisons = 0;

  for (const opt of parFamille.options || []) {
    const famille = opt.valeur ?? null;
    // Les questions fines qui s'appliquent à CETTE réponse. Aucune → une seule combinaison.
    const applicables = fines.filter((q) => !q.si?.famille || q.si.famille === famille);
    const jeux = applicables.length
      ? applicables.flatMap((q) => (q.options || []).map((o) => o.valeur || []))
      : [null];

    for (const domaines of jeux) {
      combinaisons++;
      const { retenues } = aiguiller(fiches, famille, taxonomie, domaines);
      for (const f of retenues) atteintes.add(f.id);
    }
  }

  return { inatteignables: fiches.filter((f) => !atteintes.has(f.id)), combinaisons };
}

/**
 * Répartition des fiches par famille — la mesure qui dit si une branche est engorgée.
 *
 * Une famille qui porte 40 % du catalogue met 40 % des programmes derrière une seule
 * réponse : l'aiguillage n'aiguille plus. Il faut alors la scinder, ou lui ajouter une
 * deuxième question. Exposé ici pour que `simuler.mjs` le MESURE au lieu qu'on l'estime.
 */
export function chargeParFamille(fiches, taxonomie) {
  const index = familleParDomaine(taxonomie);
  const compte = new Map((taxonomie.familles || []).map((f) => [f.id, 0]));
  for (const f of fiches) {
    for (const fam of famillesDeFiche(f, index)) compte.set(fam, (compte.get(fam) || 0) + 1);
  }
  return [...compte.entries()].sort((a, b) => b[1] - a[1]);
}
