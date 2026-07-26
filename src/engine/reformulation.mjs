/**
 * reformulation.mjs — « Si je comprends bien… », construit depuis les axes les plus
 * marqués du prospect.
 *
 * Obligatoire avant le résultat. Elle transforme un verdict en proposition : le prospect
 * peut voir ce que le quiz a compris de lui, et le contredire.
 *
 * FRAGMENTS PRÉ-ÉCRITS, aucun appel réseau — le site doit rester statique. Ce sont des
 * bouts de phrase à la deuxième personne, un par axe et par sens, jamais des étiquettes :
 * « tu es à l'aise avec les chiffres » se lit, « quantitatif : 4/5 » se subit.
 *
 * Ils vivent dans `config/reformulation.json` et arrivent par le contexte, comme les
 * questions : c'est de la donnée, et son vocabulaire définitif viendra des admissions. Le
 * moteur n'en porte aucun en dur — un fragment écrit ici finirait par contredire le fichier
 * sans que personne ne sache lequel s'affiche.
 *
 * Le bouton « Ce n'est pas ça ? Reprendre » compte autant que la phrase. Il est produit
 * ici sous forme de donnée (`reprise`) pour que l'interface ne puisse pas l'oublier.
 */

import { libellesUtilisables } from "./departage.mjs";

const REPRISE_DEFAUT = "Reprendre";

/** Combien de traits on retient. Au-delà de trois, la phrase cesse d'être une phrase. */
const MAX_TRAITS = 3;

/**
 * Les axes les plus marqués d'un profil, en écart à sa propre moyenne — pas en valeur
 * absolue. Un profil dont tous les axes sont hauts n'est pas « fort partout » : il est
 * fort là où il dépasse son propre niveau. C'est la même logique de FORME que le score.
 */
export function traitsMarquants(profil, axes, max = MAX_TRAITS) {
  const valeurs = axes.map((a) => profil[a] ?? 0);
  const moyenne = valeurs.reduce((s, n) => s + n, 0) / valeurs.length;
  const ecart = Math.sqrt(valeurs.reduce((s, n) => s + (n - moyenne) ** 2, 0) / valeurs.length);
  if (!ecart) return [];

  return axes
    .map((a) => ({ axe: a, z: ((profil[a] ?? 0) - moyenne) / ecart }))
    // Sous 0,6 écart-type, le trait n'est pas marqué : l'affirmer serait inventer.
    .filter((t) => Math.abs(t.z) >= 0.6)
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, max);
}

/**
 * La phrase de reformulation, et son bouton de reprise.
 *
 * `config` est le contenu de `config/reformulation.json`. Absent, ou muet sur les axes
 * marqués, la phrase est VIDE et le motif le dit : on ne fabrique pas une reformulation à
 * partir de rien. Un texte de repli codé ici passerait pour une donnée relue.
 *
 * Retourne `{ phrase, traits, reprise, motif }`.
 */
export function reformuler(profil, axes, config = null) {
  const fragments = config?.fragments || null;
  const reprise = config?.reprise || REPRISE_DEFAUT;

  const traits = traitsMarquants(profil, axes);
  if (!traits.length) {
    return {
      phrase: "",
      traits: [],
      reprise,
      motif: "profil sans trait marqué : aucune reformulation honnête n'est possible",
    };
  }
  if (!fragments) {
    return {
      phrase: "",
      traits,
      reprise,
      motif: "config/reformulation.json absent du contexte : aucun fragment à assembler",
    };
  }

  const manquants = [];
  const morceaux = [];
  for (const t of traits) {
    const morceau = fragments[t.axe]?.[t.z > 0 ? "fort" : "faible"];
    if (morceau) morceaux.push(morceau);
    else manquants.push(`${t.axe}/${t.z > 0 ? "fort" : "faible"}`);
  }

  if (!morceaux.length) {
    return {
      phrase: "",
      traits,
      reprise,
      motif: `aucun fragment pour les axes marqués (${manquants.join(", ")}) dans config/reformulation.json`,
    };
  }

  return {
    phrase: `Si je comprends bien : ${morceaux.join(", ")}.`,
    traits,
    reprise,
    // Un axe marqué sans fragment ne se tait pas : la phrase serait amputée en silence.
    motif: manquants.length ? `fragment manquant pour ${manquants.join(", ")}` : null,
  };
}

/**
 * Justification d'une recommandation, dans les mots de la brochure. Elle vient de
 * `distinctivite`, calculée depuis le catalogue : ce sont des modules et des métiers
 * réellement imprimés, pas une phrase générée.
 */
/**
 * Ce qui distingue une filière, en un seul libellé — le meilleur, pas le premier : l'ordre
 * des tableaux d'exclusivités est celui de la brochure, qui n'a aucune raison de placer le
 * plus parlant en tête. Les artefacts d'extraction sont écartés par `libellesUtilisables`.
 *
 * `null` quand rien n'est utilisable, et l'appelant doit alors n'afficher que le nom. Une
 * phrase fausse est pire qu'une phrase absente.
 */
export function differenciateur(fiche, dejaCites = null) {
  // Un libellé déjà cité ailleurs à l'écran ne distingue plus rien : présenter le même
  // module comme propre à deux programmes se contredit sous les yeux du prospect. Le cas
  // arrive quand deux fiches n'ont pas le même ensemble de comparaison — leurs domaines
  // diffèrent —, donc qu'un module peut être exclusif dans l'une ET dans l'autre.
  const exclus = new Set([...(dejaCites || [])].map((s) => String(s).trim().toLowerCase()));

  for (const source of ["modules", "metiers"]) {
    const champ = source === "modules" ? "modules_exclusifs" : "metiers_exclusifs";
    for (const valeur of libellesUtilisables(fiche.distinctivite?.[champ])) {
      if (!exclus.has(valeur.toLowerCase())) return { source, valeur };
    }
  }
  return null;
}

export function justifier(fiche, max = 3) {
  const modules = (fiche.distinctivite?.modules_exclusifs || []).slice(0, max);
  const metiers = (fiche.distinctivite?.metiers_exclusifs || []).slice(0, max);
  return {
    modules,
    metiers,
    // Aucun de ces deux tableaux n'est garanti : une filière peut n'avoir aucune
    // exclusivité dans son domaine, et c'est une information en soi.
    suffisante: Boolean(modules.length || metiers.length),
  };
}
