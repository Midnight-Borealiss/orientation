/**
 * filtres.mjs — les deux mécanismes qui EXCLUENT, sans jamais noter.
 *
 * Un filtre est binaire. Il ne pondère pas, il ne pénalise pas : soit la filière est
 * accessible, soit elle ne l'est pas. Noter l'éligibilité laisserait remonter une
 * filière inaccessible au bas d'un classement, où le prospect la lirait quand même.
 *
 * Fonctions pures, aucun nom de filière.
 */

/**
 * Ordre des niveaux d'accès. C'est du vocabulaire, pas de la logique métier : il vient
 * de l'énumération `niveau_acces` du schéma.
 */
const ORDRE_NIVEAUX = ["bac", "bac+2", "bac+3", "bac+4", "bac+5"];

const rang = (niveau) => ORDRE_NIVEAUX.indexOf(niveau);

/**
 * Le prospect peut entrer si son diplôme atteint le niveau exigé. Un bac+3 accède donc
 * aussi aux programmes qui n'exigent que le bac.
 *
 * `niveau_acces: null` — la brochure ne le dit pas et les admissions n'ont pas répondu.
 * On NE DEVINE PAS et on n'exclut pas : la filière reste candidate et porte un
 * avertissement. Exclure sur une donnée manquante retirerait silencieusement du jeu des
 * programmes peut-être accessibles ; c'est le prospect qui paierait notre trou de données.
 */
export function accessible(fiche, niveauProspect) {
  if (!niveauProspect) return { ok: true, incertain: false };
  if (!fiche.niveau_acces) return { ok: true, incertain: true };
  const r = rang(fiche.niveau_acces);
  const rp = rang(niveauProspect);
  if (r < 0 || rp < 0) return { ok: true, incertain: true };
  return { ok: rp >= r, incertain: false };
}

/**
 * La modalité demandée doit figurer dans celles du programme. `null` = le prospect est
 * flexible, rien n'est exclu.
 *
 * `modalites` vide se traite comme `niveau_acces` absent : candidate et incertaine.
 */
export function compatibleModalite(fiche, modalite) {
  if (!modalite) return { ok: true, incertain: false };
  const m = fiche.modalites || [];
  if (!m.length) return { ok: true, incertain: true };
  return { ok: m.includes(modalite), incertain: false };
}

/**
 * Applique les deux filtres durs. Retourne les survivantes et le détail des exclusions,
 * pour que l'écran de résultat puisse dire « 40 programmes écartés parce que tu vises
 * du présentiel » plutôt que d'escamoter la réduction.
 */
export function appliquerFiltres(fiches, { niveau_acces = null, modalites = null } = {}) {
  const retenues = [];
  const exclues = [];
  const incertaines = [];

  for (const f of fiches) {
    const acc = accessible(f, niveau_acces);
    const mod = compatibleModalite(f, modalites);
    if (!acc.ok) {
      exclues.push({ fiche: f, motif: "niveau_acces", exige: f.niveau_acces });
      continue;
    }
    if (!mod.ok) {
      exclues.push({ fiche: f, motif: "modalites", exige: (f.modalites || []).join(", ") });
      continue;
    }
    retenues.push(f);
    if (acc.incertain) incertaines.push({ fiche: f, champ: "niveau_acces" });
    if (mod.incertain) incertaines.push({ fiche: f, champ: "modalites" });
  }

  return { retenues, exclues, incertaines };
}
