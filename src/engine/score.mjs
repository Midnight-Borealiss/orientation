/**
 * score.mjs — la métrique du moteur : une CORRÉLATION DE FORME, jamais une distance.
 *
 * Fonctions pures, aucune lecture de fichier, aucun nom de filière. Le vocabulaire
 * (liste des axes) est passé en argument depuis config/taxonomy.json.
 *
 * POURQUOI PAS UNE DISTANCE EUCLIDIENNE — décision tranchée, à ne pas défaire.
 * Les notes d'axes sont une proportion de modules : un 5 exige 40 % des modules sur un
 * seul axe. Un programme dispose donc d'environ 1,0 à répartir sur cinq axes, et ses
 * vecteurs sont POINTUS par construction. Une euclidienne y couronne le programme tiède,
 * parce qu'un vecteur plat est proche de tout : sur un prospect à pic technique, elle
 * classe un programme de management généraliste (66 %) devant un programme de génie
 * logiciel (43 %). Le centrage de Pearson supprime ce biais et rend la comparaison
 * indépendante du niveau — ce qui neutralise aussi, gratuitement, la distribution des
 * filières centrée sur 2,4 au lieu de 3.
 *
 * Voir CLAUDE.md > Calcul du score.
 */

/** Les 5 axes comptés : ceux qui n'ont pas de `_niveau: "domaine"` dans la taxonomie. */
export function axesComptes(taxonomie) {
  return (taxonomie.axes || []).filter((a) => a._niveau !== "domaine").map((a) => a.id);
}

/** Les 2 axes de disposition : collectés par domaine, ils ne servent qu'au départage. */
export function axesDisposition(taxonomie) {
  return (taxonomie.axes || []).filter((a) => a._niveau === "domaine").map((a) => a.id);
}

/**
 * Le vecteur d'une filière : les PROPORTIONS BRUTES (`axes_parts`), jamais les notes
 * 1..5. L'arrondi de `noter()` écrase 10 points de proportion dans un entier et
 * fabriquait 10 égalités exactes à r = 1,00 sur 410 paires intra-domaine — un ex æquo
 * parfait n'est pas classable, l'ordre devient celui du système de fichiers.
 *
 * Repli sur `axes` si `axes_parts` manque (fiche saisie à la main avant l'ajout du
 * champ) : comparable, avec la précision dégradée que ce repli implique.
 */
export function vecteurFiliere(fiche, axes) {
  if (fiche.axes_parts && axes.every((a) => Number.isFinite(fiche.axes_parts[a]))) {
    return axes.map((a) => fiche.axes_parts[a]);
  }
  return axes.map((a) => (Number.isFinite(fiche.axes?.[a]) ? fiche.axes[a] : 0));
}

const moyenne = (v) => v.reduce((s, n) => s + n, 0) / v.length;

/**
 * Pearson : cosinus sur vecteurs centrés. Dans [-1, 1].
 * `null` quand l'un des deux vecteurs est plat — il n'a pas de forme, donc pas de
 * corrélation. Le cas n'est pas masqué, il est remonté à l'appelant.
 */
export function correlation(va, vb) {
  if (va.length !== vb.length || !va.length) return null;
  const ma = moyenne(va);
  const mb = moyenne(vb);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < va.length; i++) {
    num += (va[i] - ma) * (vb[i] - mb);
    da += (va[i] - ma) ** 2;
    db += (vb[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null;
  return num / Math.sqrt(da * db);
}

/**
 * Repli quand le prospect a répondu de façon parfaitement équilibrée : son vecteur est
 * plat et n'a aucune forme. On compare alors les PARTS DE BUDGET — chaque vecteur ramené
 * à des proportions de sa somme — par une euclidienne, ramenée dans [-1, 1] pour rester
 * sur la même échelle que la corrélation.
 *
 * C'est un classement dégradé, et il DOIT être signalé : un repli silencieux ferait
 * passer un ordre sans signification pour un vrai.
 */
export function scoreParParts(va, vb) {
  const sa = va.reduce((s, n) => s + n, 0);
  const sb = vb.reduce((s, n) => s + n, 0);
  if (!sa || !sb) return null;
  const pa = va.map((x) => x / sa);
  const pb = vb.map((x) => x / sb);
  let d = 0;
  for (let i = 0; i < pa.length; i++) d += (pa[i] - pb[i]) ** 2;
  // Deux distributions de parts sont au plus à sqrt(2) l'une de l'autre.
  return 1 - (2 * Math.sqrt(d)) / Math.SQRT2;
}

/**
 * Le niveau, en CODE — trois valeurs, jamais un nombre. C'est sur lui que l'interface
 * choisit sa posture ; le libellé, lui, peut changer sans qu'aucun test ne le remarque.
 *
 * `possible` ne doit pas se lire comme un échec côté écran : c'est une piste à explorer.
 * Le code ne porte donc aucun jugement, il nomme le palier.
 */
export function codeCorrespondance(r, seuils) {
  if (r == null) return "possible";
  if (r >= seuils.correspondance_forte) return "forte";
  if (r >= seuils.correspondance_bonne) return "bonne";
  return "possible";
}

/**
 * Le libellé des trois paliers. Aucun autre endroit ne doit les réécrire.
 *
 * `unique` n'est pas un palier de score : c'est le cas où un seul programme a survécu aux
 * filtres, donc où aucune comparaison n'a eu lieu. Il vit ici parce que tout vocabulaire de
 * correspondance doit se lire au même endroit — pas parce qu'il se calcule.
 */
const LIBELLES = {
  forte: "correspondance forte",
  bonne: "bonne correspondance",
  possible: "correspondance possible",
  unique: "seule formation possible",
};

export const LIBELLE_UNIQUE = LIBELLES.unique;

/**
 * Le niveau AFFICHÉ. Le score exact ne sort jamais de l'écran : l'écart entre 0,78 et
 * 0,74 est du bruit de calcul, mais un prospect le lit comme une différence réelle.
 */
export function niveauCorrespondance(r, seuils) {
  return LIBELLES[codeCorrespondance(r, seuils)];
}

/**
 * Classe des filières pour un profil de prospect.
 *
 * Retourne `{ classees, ecartees, repli, alertes }` :
 *   classees  triées par score décroissant, chacune avec `score` (interne) et `niveau`
 *   ecartees  les `axes_fiables: false`, NON classées mais conservées — voir plus bas
 *   repli     true si le vecteur du prospect est plat et qu'on a basculé sur les parts
 *   alertes   anomalies à remonter, jamais à avaler
 *
 * `axes_fiables: false` marque un programme dont les axes ne décrivent pas le contenu :
 * aucun module, moins de six modules, ou trop de modules qu'aucun lexique ne reconnaît.
 * Leur donner un rang reviendrait à afficher un classement indiscernable d'un vrai. Ils
 * ressortent donc à part, pour être rendus accessibles avec mention. **Absent se lit
 * comme `false`** : cela veut dire que la distinctivité n'a pas tourné, donc que rien
 * n'a été évalué.
 */
export function classer(profil, fiches, { axes, seuils }) {
  const vp = axes.map((a) => profil[a] ?? 0);
  // Un vecteur plat n'a pas de forme : toutes ses composantes sont égales.
  const repli = new Set(vp).size === 1;
  const alertes = [];
  if (repli && vp.every((x) => !x)) {
    return {
      classees: [],
      ecartees: fiches.map((f) => ({ fiche: f, raison: "profil vide, aucun classement possible" })),
      repli: true,
      alertes: ["profil vide : aucune réponse de profil exploitable, rien n'a été classé"],
    };
  }

  const notables = [];
  const ecartees = [];
  for (const f of fiches) {
    if (f.axes_fiables !== true) {
      ecartees.push({
        fiche: f,
        raison: f.axes_fiables === false ? "axes non fiables" : "axes non évalués (distinctivité non calculée)",
      });
      continue;
    }
    notables.push(f);
  }

  const classees = [];
  for (const f of notables) {
    const vf = vecteurFiliere(f, axes);
    let score = repli ? scoreParParts(vp, vf) : correlation(vp, vf);
    if (score == null && !repli) {
      // Côté filière, un vecteur plat ne devrait pas arriver : les fiches concernées
      // portent axes_fiables: false. Si on tombe ici, c'est une incohérence de données.
      alertes.push(`${f.id} : vecteur d'axes plat alors que axes_fiables vaut true`);
      score = scoreParParts(vp, vf);
    }
    if (score == null) continue;
    classees.push({
      fiche: f,
      score,
      niveau: niveauCorrespondance(score, seuils),
      code: codeCorrespondance(score, seuils),
    });
  }

  // Ordre déterministe : à score égal, l'id tranche. Sans cela, deux exécutions
  // pourraient inverser deux filières et personne ne saurait pourquoi.
  classees.sort((a, b) => b.score - a.score || a.fiche.id.localeCompare(b.fiche.id));

  if (repli) {
    alertes.push(
      "profil sans forme (tous les axes à la même valeur) : classement dégradé, calculé sur les parts de budget"
    );
  }

  return { classees, ecartees, repli, alertes };
}
