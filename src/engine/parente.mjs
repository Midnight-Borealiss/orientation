/**
 * parente.mjs — reconnaître deux options d'un même programme.
 *
 * Unique implémentation, utilisée par le moteur ET par `scripts/distinctivite.mjs`, qui la
 * réexporte. Deux copies divergeraient, et une paire serait « sœur » d'un côté et
 * « ambiguë » de l'autre : on enverrait à un responsable une question que le code sait
 * déjà trancher.
 *
 * Pourquoi ça compte au départage : deux options du même programme partagent leur tronc
 * commun par construction — la Licence de Gestion option Comptabilité-Finance et l'option
 * RH ont 43 modules identiques. Générer une question sur leurs rares différences serait
 * artificiel, alors que **le nom de l'option dit déjà la distinction**. On affiche donc les
 * deux intitulés et on laisse choisir.
 */

import { normaliser } from "./texte.mjs";

/** Titre débarrassé de sa mention d'option, pour rapprocher deux sœurs. */
export function racineTitre(fiche) {
  return normaliser(fiche?.nom || "")
    .replace(/\boption\b.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function sontSoeurs(a, b) {
  if (!a || !b || a.id === b.id) return false;
  // Même programme parent déclaré.
  if (a.programme_parent && a.programme_parent === b.programme_parent) return true;
  // Parent et enfant.
  if (a.programme_parent === b.id || b.programme_parent === a.id) return true;
  // Deux options du même intitulé, même quand la fiche parente n'existe pas : un
  // catalogue peut décliner un programme en options sans publier de page pour le
  // programme lui-même, donc sans `programme_parent` à quoi se raccrocher.
  if (a.option && b.option && racineTitre(a) && racineTitre(a) === racineTitre(b)) return true;
  return false;
}
