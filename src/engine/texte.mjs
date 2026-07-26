/**
 * texte.mjs — normalisation de chaînes, unique implémentation du dépôt.
 *
 * Elle vit dans le moteur et non dans `scripts/lib/`, parce que le moteur ne doit
 * dépendre d'aucun script — et surtout pas d'un module de géométrie PDF. La dépendance
 * va donc dans l'autre sens : `scripts/lib/pdf-layout.mjs` réexporte cette fonction.
 *
 * Deux implémentations divergeraient, et une comparaison de titres cesserait de donner
 * le même résultat selon l'appelant.
 */

const DIACRITIQUES = new RegExp("[\\u0300-\\u036f]", "g");

/**
 * Minuscules, sans accents, apostrophes et tirets uniformisés, espaces réduits.
 *
 * Les brochures écrivent `DéBOUCHéS` — des `é` accentués au milieu d'un mot en
 * capitales, artefact InDesign. Tout motif doit donc être testé sur du texte normalisé,
 * jamais sur le texte brut.
 */
export function normaliser(s) {
  return (s || "")
    .normalize("NFD")
    .replace(DIACRITIQUES, "")
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
