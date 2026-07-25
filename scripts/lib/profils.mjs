/**
 * profils.mjs — un profil de parsing par catalogue.
 *
 * Les trois brochures ISM n'emploient PAS les mêmes en-têtes ni la même mise en
 * page. Un profil est sélectionné par fichier ; il n'y a jamais de liste unique
 * de motifs valable partout.
 *
 * Tous les motifs sont testés sur du texte NORMALISÉ (minuscules, sans accents) :
 * la brochure Bachelor écrit « DéBOUCHéS » — des é minuscules au milieu d'un mot
 * en capitales, artefact InDesign. /DÉBOUCHÉS/ ne matcherait jamais.
 */

import { normaliser } from "./pdf-layout.mjs";

/** Hauteur de police à partir de laquelle une ligne est un titre de programme. */
const H_TITRE_MASTER = 18;
const H_TITRE_PAGE = 20;

export const PROFILS = {
  "master-2024": {
    nom: "master-2024",
    // 2 colonnes, 2 programmes par page : un programme = une colonne.
    segmentation: "colonne",
    hauteurTitre: H_TITRE_MASTER,
    entetes: {
      objectif: /^objectifs? (de la formation|du programme)\b/,
      contenu: /^contenus? (pedagogiques|des enseignements|du programme)\b/,
      debouches: /^(futurs metiers|metiers|debouches)\b/,
      autre: /^(public cible|criteres d'eligibilite|formations proposees|frais|contacts?)\b/,
    },
    separateurMetiers: /\s*\|\s*/,
    modalitesBase: ["presentiel"],
    // Le pied de page des pages impaires porte le nom de l'école.
    ecoleDepuisPied: [
      [/ecole de management/, "ism-management"],
      [/ecole de droit/, "ism-droit"],
      [/ecole (de )?d'ingenieurs/, "ism-ingenieurs"],
      [/digital campus/, "ism-digital-campus"],
      // La brochure écrit « Madiba Leadearship Institute » (coquille conservée).
      [/madiba leade[ar]*ship institute/, "madiba"],
      [/programme executive education/, "ism-executive"],
    ],
    // Titres de section, en secours quand aucun pied de page ne porte l'école.
    ecoleDepuisSection: [
      [/rejoignez l'ecole de management/, "ism-management"],
      [/integrez l'ecole de droit/, "ism-droit"],
      [/optez pour l'ecole d'ingenieurs/, "ism-ingenieurs"],
      [/choisissez le madiba/, "madiba"],
      [/programme executive education/, "ism-executive"],
    ],
    // Aucune condition d'admission par programme dans la brochure : niveau déduit.
    accesParNiveau: { master: "bac+3", mba: "bac+3", dba: "bac+5", bachelor: "bac+2", licence: "bac" },
    sourceAcces: "inference",
  },

  "bachelor-2024": {
    nom: "bachelor-2024",
    // 1 programme par page, mais le bloc CONTENU est lui-même sur 2 sous-colonnes.
    segmentation: "page",
    hauteurTitre: H_TITRE_PAGE,
    // Les pages d'accroche (« 3 ANS pour révéler son talent ») portent aussi un
    // « OBJECTIFS : ». Exiger le bloc CONTENU les écarte sans liste noire de pages.
    exigeContenu: true,
    entetes: {
      objectif: /^objectifs?\s*:?\s*$|^objectifs?\s*:/,
      contenu: /^contenu (de la formation|des enseignements|et organisation)/,
      debouches: /^debouches\s*:?/,
      autre: /^(admission|frais|bourses?|paroles d'alumni)\b/,
    },
    separateurMetiers: null, // une ligne = un métier
    modalitesBase: ["presentiel"],
    // L'école vient du sommaire (page 13), source la plus fiable de la brochure.
    sommaire: {
      page: 13,
      hauteurSection: 13,
      sections: [
        [/^ecole de management$/, "ism-management"],
        [/^ecole de droit$/, "ism-droit"],
        [/^ecole d'ingenieurs$/, "ism-ingenieurs"],
        [/^ism digital campus$/, "ism-digital-campus"],
        [/^madiba leadership institute$/, "madiba"],
      ],
      entree: /^(licence|bachelor|option)\b/,
    },
    accesParNiveau: { licence: "bac", bachelor: "bac+2", master: "bac+3", mba: "bac+3" },
    sourceAcces: "inference",
  },

  "online-2425": {
    nom: "online-2425",
    segmentation: "page",
    hauteurTitre: H_TITRE_PAGE,
    exigeContenu: true,
    entetes: {
      objectif: /^objectifs?\s*:?\s*$/,
      contenu: /^contenus? (de la formation|des enseignements)/,
      debouches: /^metiers et debouches\s*:?\s*$/,
      autre: /^(conditions? d'admission|duree de la formation|inscription|scolarite|tarifs?)\b/,
    },
    separateurMetiers: /\s*;\s*/,
    modalitesBase: ["en-ligne"],
    ecoleDepuisSection: [
      [/decouvrez ism online/, "ism-online"],
      [/decouvrez l'institut des savoir-faire/, "isf"],
    ],
    ecoleParDefaut: "ism-online",
    // La brochure énonce ses propres voies d'accès p.6-7 : L3 par un bac+2,
    // M1 par un bac+3, M2 par un bac+4. C'est donc une donnée de brochure.
    accesParNiveau: { bachelor: "bac+2", licence: "bac+2", master: "bac+3", mba: "bac+3" },
    sourceAcces: "brochure",
    suffixeId: "-en-ligne", // même intitulé qu'en présentiel : la modalité tranche
  },
};

/** Choisit le profil d'après le nom du fichier. */
export function choisirProfil(nomFichier) {
  const n = normaliser(nomFichier);
  if (/online|isf/.test(n)) return PROFILS["online-2425"];
  if (/bachelor|licence/.test(n)) return PROFILS["bachelor-2024"];
  if (/master|mba|dba/.test(n)) return PROFILS["master-2024"];
  return null;
}

/** Type d'en-tête d'une ligne, ou null si ce n'est pas un en-tête. */
export function typeEntete(ligne, profil) {
  const t = normaliser(ligne.texte).replace(/\s*\(\s*\d+\s*(ans?|semestres?)\s*\)\s*$/, "").trim();
  for (const [type, re] of Object.entries(profil.entetes)) {
    if (re.test(t)) return type;
  }
  return null;
}

/**
 * Numéro de page, pied de page, appel de note : du bruit qui se glisserait
 * sinon dans les listes de modules (« 19 UE. Langues – Civilisations »).
 */
export function estBruitDePage(ligne, hauteurPage) {
  const t = normaliser(ligne.texte);
  if (/^[\d\s.,;:*+•-]*$/.test(t)) return true;
  if (ligne.y < hauteurPage * 0.08) {
    if (/^p?\.?\s*\d+\b/.test(t)) return true;
    if (/groupe ism *-|^ism online$|^isf$/.test(t)) return true;
  }
  if (/^\*+ *unite d'enseignement/.test(t)) return true;
  return false;
}

/**
 * Rattache chaque ligne d'une page à une section.
 *
 * Règle : l'en-tête le plus proche AU-DESSUS dans la même colonne. Si la colonne
 * n'a aucun en-tête au-dessus de la ligne, on emprunte celui de la colonne la
 * plus proche qui en a un.
 *
 * Les deux niveaux sont nécessaires. Sur le catalogue Master, chaque colonne
 * porte ses propres en-têtes : une recherche globale mélangerait les deux
 * programmes de la page. Sur le Bachelor, la 3e colonne d'UE n'a aucun en-tête
 * et dépend de la 2e — et une recherche simplement « au-dessus, toutes colonnes
 * confondues » y verrait le DéBOUCHéS de la 1re colonne, versant la moitié des
 * modules dans les métiers.
 */
export function rattacherSections(colonnes, profil, hauteurPage = Infinity) {
  const entetes = [];
  for (const col of colonnes) {
    for (const l of col.lignes) {
      const type = typeEntete(l, profil);
      if (type) entetes.push({ type, y: l.y, colonne: col.index });
    }
  }

  const plusProcheAuDessus = (y, colonne) =>
    entetes
      .filter((e) => e.colonne === colonne && e.y > y)
      .sort((a, b) => a.y - b.y)[0] || null;

  // Un en-tête sans aucune ligne sous lui dans sa propre colonne coiffe un bloc
  // qui court sous toute la page : le « Métiers et débouchés » du catalogue Online
  // est parfois posé dans la colonne de droite au-dessus d'un texte pleine largeur.
  const terminaux = entetes.filter((e) => {
    const col = colonnes.find((c) => c.index === e.colonne);
    return !col.lignes.some(
      (l) => l.y < e.y && !typeEntete(l, profil) && !estBruitDePage(l, hauteurPage)
    );
  });

  const resultat = [];
  for (const col of colonnes) {
    for (const l of col.lignes) {
      if (typeEntete(l, profil)) continue;
      if (estBruitDePage(l, hauteurPage)) continue;

      let e = plusProcheAuDessus(l.y, col.index);
      if (!e) {
        const voisines = [...new Set(entetes.map((x) => x.colonne))]
          .filter((c) => plusProcheAuDessus(l.y, c))
          .sort((a, b) => Math.abs(a - col.index) - Math.abs(b - col.index) || a - b);
        if (voisines.length) e = plusProcheAuDessus(l.y, voisines[0]);
      }
      const terminal = terminaux.filter((t) => t.y > l.y).sort((a, b) => a.y - b.y)[0];
      if (terminal && (!e || terminal.y < e.y)) e = terminal;
      resultat.push({ ...l, colonne: col.index, section: e ? e.type : null });
    }
  }
  return { lignes: resultat, entetes };
}
