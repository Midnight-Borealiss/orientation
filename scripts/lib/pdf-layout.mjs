/**
 * pdf-layout.mjs — géométrie d'une page PDF : items → colonnes → lignes.
 *
 * Aucune connaissance des brochures ISM ici. Ce module ne sait que deux choses :
 * regrouper des items par colonne (coordonnée X) puis par ligne (coordonnée Y).
 *
 * Pourquoi les colonnes d'abord : le catalogue Master pose deux programmes par
 * page, côte à côte. Un regroupement par Y seul recolle les deux titres
 * (« Master en Marché  MBA en Banque ») et rend le texte inexploitable.
 */

/** Largeur minimale d'un creux vertical pour valoir césure de colonne (points). */
const CREUX_MIN = 6;
/** Largeur minimale d'une colonne retenue (points). */
const BANDE_MIN = 60;
/**
 * Un item plus large que ce ratio de la page enjambe les colonnes : ignoré pour
 * la détection. Le ratio est essayé du plus permissif au plus strict — certaines
 * pages Bachelor ont un paragraphe d'objectifs assez large pour boucher à lui
 * seul la gouttière. Les passes de repli exigent un creux nettement plus large,
 * pour ne pas confondre un interligne avec une césure de colonne.
 */
const PASSES = [
  { ratio: 0.4, creuxMin: CREUX_MIN },
  { ratio: 0.32, creuxMin: 20 },
  { ratio: 0.25, creuxMin: 20 },
];
/** Tolérance verticale pour considérer deux items sur la même ligne (points). */
const TOL_LIGNE = 2.5;

export async function lirePdf(cheminFichier, fs) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(fs.readFileSync(cheminFichier));
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const pages = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const vue = page.getViewport({ scale: 1 });
    const contenu = await page.getTextContent();

    const items = [];
    for (const it of contenu.items) {
      if (!it.str || !it.str.trim()) continue;
      items.push({
        x: it.transform[4],
        y: it.transform[5],
        l: it.width || 0,
        h: it.height || 0,
        texte: it.str,
      });
    }

    pages.push({
      numero: n,
      largeur: vue.width,
      hauteur: vue.height,
      colonnes: decouperColonnes(items, vue.width),
    });
  }
  return { pages, nbPages: doc.numPages };
}

/**
 * Découpe les items en colonnes par coordonnée X.
 *
 * Méthode : on projette sur l'axe X les seuls items étroits (les items larges,
 * titres pleine page et paragraphes, enjambent les colonnes et masqueraient le
 * creux central). Tout creux interne d'au moins CREUX_MIN points est une césure.
 * Les items larges sont ensuite rattachés à la colonne où ils commencent.
 */
export function decouperColonnes(items, largeur) {
  if (!items.length) return [];

  const PAS = 1;
  const nb = Math.ceil(largeur / PAS) + 1;

  let cesures = [];
  let premier = 0;
  let dernier = nb - 1;
  for (const passe of PASSES) {
    const occupe = new Array(nb).fill(false);
    for (const it of items) {
      if (it.l >= largeur * passe.ratio) continue;
      const d = Math.max(0, Math.floor(it.x / PAS));
      const f = Math.min(nb - 1, Math.ceil((it.x + it.l) / PAS));
      for (let i = d; i <= f; i++) occupe[i] = true;
    }
    premier = occupe.indexOf(true);
    dernier = occupe.lastIndexOf(true);
    if (premier === -1) break;

    cesures = [];
    let i = premier;
    while (i <= dernier) {
      if (occupe[i]) { i++; continue; }
      let j = i;
      while (j <= dernier && !occupe[j]) j++;
      if ((j - i) * PAS >= passe.creuxMin) cesures.push(((i + j) / 2) * PAS);
      i = j;
    }
    if (cesures.length) break;
  }

  // Bornes de colonnes, césures trop rapprochées écartées
  const bornes = [-Infinity];
  let precedente = premier === -1 ? 0 : premier * PAS;
  for (const c of cesures) {
    if (c - precedente < BANDE_MIN) continue;
    bornes.push(c);
    precedente = c;
  }
  bornes.push(Infinity);

  const colonnes = bornes.slice(0, -1).map((x0, i) => ({ x0, x1: bornes[i + 1], items: [] }));
  for (const it of items) {
    const col = colonnes.find((c) => it.x >= c.x0 && it.x < c.x1) || colonnes[0];
    col.items.push(it);
  }

  // Une colonne quasi vide est un artefact de détection : on la fusionne à gauche.
  const retenues = [];
  for (const c of colonnes) {
    if (!c.items.length) continue;
    if (c.items.length < 3 && retenues.length) {
      const p = retenues[retenues.length - 1];
      p.items.push(...c.items);
      p.x1 = c.x1;
      continue;
    }
    retenues.push(c);
  }

  // Second passage : certaines colonnes se touchent, sans gouttière blanche
  // (listes de modules sur deux colonnes serrées). La projection ne les voit pas,
  // mais les abscisses de DÉBUT des items y forment deux modes très nets.
  const affinees = retenues.flatMap((c) => affinerParModes(c));

  return affinees.map((c, i) => ({
    index: i,
    x0: c.x0 === -Infinity ? 0 : c.x0,
    x1: c.x1 === Infinity ? largeur : c.x1,
    lignes: assemblerLignes(c.items),
  }));
}

/** Écart minimal entre deux modes d'abscisse de début pour valoir sous-colonne. */
const ECART_MODES = 40;

function affinerParModes(colonne) {
  const items = colonne.items;
  if (items.length < 8) return [colonne];

  const PAS = 6;
  const support = Math.max(3, Math.round(items.length * 0.05));
  const paniers = new Map();
  for (const it of items) {
    const b = Math.floor(it.x / PAS) * PAS;
    paniers.set(b, (paniers.get(b) || 0) + 1);
  }
  const modes = [...paniers.entries()].filter(([, n]) => n >= support).map(([b]) => b).sort((a, b) => a - b);
  if (modes.length < 2) return [colonne];

  const coupes = [];
  for (let i = 1; i < modes.length; i++) {
    if (modes[i] - modes[i - 1] >= ECART_MODES) coupes.push(modes[i] - 8);
  }
  if (!coupes.length) return [colonne];

  const bornes = [colonne.x0, ...coupes, colonne.x1];
  return bornes.slice(0, -1).map((x0, i) => ({
    x0,
    x1: bornes[i + 1],
    items: items.filter((it) => it.x >= x0 && it.x < bornes[i + 1]),
  })).filter((c) => c.items.length);
}

/**
 * Regroupe les items d'une colonne en lignes.
 *
 * L'espace n'est pas inséré entre deux items voisins : il est déduit de l'écart
 * horizontal. Sans cela, les brochures InDesign rendent « sp é cialistes » —
 * chaque lettre accentuée arrive comme un item distinct.
 */
export function assemblerLignes(items) {
  const parY = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const derniere = parY[parY.length - 1];
    if (derniere && Math.abs(derniere.y - it.y) <= TOL_LIGNE) derniere.items.push(it);
    else parY.push({ y: it.y, items: [it] });
  }

  return parY.map(({ y, items: brut }) => {
    const tries = [...brut].sort((a, b) => a.x - b.x);
    let texte = "";
    let finPrec = null;
    for (const it of tries) {
      if (finPrec !== null) {
        const ecart = it.x - finPrec;
        const seuil = Math.min(3, Math.max(0.8, 0.25 * it.h));
        if (ecart > seuil && !/\s$/.test(texte) && !/^\s/.test(it.texte)) texte += " ";
      }
      texte += it.texte;
      finPrec = it.x + it.l;
    }
    return {
      y: Math.round(y * 10) / 10,
      x: Math.round(tries[0].x * 10) / 10,
      h: Math.max(...tries.map((i) => i.h)),
      texte: texte.replace(/\s+/g, " ").trim(),
    };
  }).filter((l) => l.texte);
}

/** Comparaison insensible à la casse ET aux accents (la brochure Bachelor écrit « DéBOUCHéS »). */
// Marques diacritiques Unicode, écrites en échappement : elles seraient invisibles en clair.
// Unique implémentation : elle vit dans src/engine/texte.mjs, parce que le moteur ne doit
// dépendre d'aucun script — et surtout pas d'un module de géométrie PDF. Réexportée ici
// pour que tout ce qui l'importait de ce fichier continue de fonctionner.
export { normaliser } from "../../src/engine/texte.mjs";
