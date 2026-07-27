/**
 * affectations.mjs — Quelle fiche est dans quelle famille, et qu'est-ce qui a changé ?
 *
 * Le problème. L'appartenance d'une fiche à une FAMILLE n'est pas déclarée : elle se déduit de
 * ses domaines, qui se déduisent eux-mêmes du titre, de l'objectif et des modules. Une fiche
 * peut donc changer d'entonnoir à la ré-extraction **sans que personne l'ait demandé** — c'est
 * arrivé : huit modules retrouvés ont fait passer une licence d'`entreprise-management` à
 * `chiffres-finance`, et rien ne l'a dit. Le prospect qui répond « Entreprise, management »
 * ne la voit plus, celui qui répond « Chiffres, finance » la découvre.
 *
 * Le remède : consigner l'affectation de chaque fiche dans un fichier **suivi par git**, et la
 * comparer à celle de l'exécution précédente. Une migration devient alors deux choses qu'elle
 * n'était pas : une ligne de journal à la ré-extraction, et un diff lisible dans la revue.
 *
 * Pourquoi un fichier distinct de `data/_fraicheur.json` — qui fournit pourtant déjà le
 * mécanisme du manifeste committé. Les deux ont des diffs de nature opposée : `_fraicheur.json`
 * ne contient que des empreintes opaques, illisibles par construction, et elles changent au
 * moindre octet modifié dans n'importe quelle fiche. Y mêler les affectations noierait la seule
 * chose qu'on veut pouvoir lire — « cette fiche a changé de famille » — dans un bruit permanent.
 * Un fichier, un usage.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoresDomaines, modulesDe, MAX_DOMAINES } from "./fiche.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..", "..");

/** Le dossier de fiches de la production. Tout le reste s'en déduit. */
export const DOSSIER_FICHES = path.join(ROOT, "data", "filieres");

const familleParDomaine = (taxonomie) => {
  const m = new Map();
  for (const f of taxonomie.familles || []) for (const d of f.domaines) m.set(d, f.id);
  return m;
};

/**
 * L'affectation d'une fiche, plus ce qu'il faut pour surveiller sa stabilité.
 *
 * `modules` sert à ATTRIBUER une migration : sans lui, on saurait qu'une fiche a changé de
 * famille sans pouvoir dire pourquoi. C'est un compte, pas la liste — le manifeste doit rester
 * lisible en revue.
 */
function affectationDe(fiche, taxonomie, autorises) {
  const famDe = familleParDomaine(taxonomie);
  const modules = modulesDe(fiche.unites_enseignement || []);
  const classement = scoresDomaines(
    fiche.nom || "",
    fiche.vitrine?.description || "",
    modules,
    fiche.debouches?.metiers || [],
    autorises
  );

  const domaines = fiche.domaines || [];
  const familles = [...new Set(domaines.map((d) => famDe.get(d)).filter(Boolean))].sort();

  /* La frontière : le dernier domaine retenu et le premier écarté. Une ÉGALITÉ EXACTE de score
   * y est le seul cas réellement arbitraire — `scoresDomaines` départage alors sur l'ordre
   * alphabétique de l'`id`, donc par convention et non par mesure. C'est là qu'un module de
   * plus ne « fait pas gagner » un domaine : il rompt une égalité que rien ne justifiait. */
  const dedans = classement[MAX_DOMAINES - 1];
  const dehors = classement[MAX_DOMAINES];
  const frontiere =
    dedans && dehors
      ? {
          retenu: dedans.id,
          ecarte: dehors.id,
          scores: [dedans.n, dehors.n],
          egalite: dedans.n === dehors.n,
          // Ne compte que si le basculement déplacerait la fiche dans le parcours.
          familles_differentes: famDe.get(dedans.id) !== famDe.get(dehors.id),
        }
      : null;

  return { domaines, familles, modules: modules.length, frontiere };
}

/** Le manifeste complet, trié pour que deux exécutions identiques donnent le même fichier. */
export function construireManifeste(fiches, taxonomie) {
  const autorises = new Set(taxonomie.domaines.map((d) => d.id));
  const affectations = {};
  const egalites = [];
  const surveiller = [];

  for (const f of [...fiches].sort((a, b) => a.id.localeCompare(b.id))) {
    const a = affectationDe(f, taxonomie, autorises);
    affectations[f.id] = { domaines: a.domaines, familles: a.familles, modules: a.modules };
    if (!a.frontiere) continue;

    const entree = {
      id: f.id,
      nom: f.nom,
      retenu: a.frontiere.retenu,
      ecarte: a.frontiere.ecarte,
      scores: a.frontiere.scores,
      famille_retenu: [...new Set([familleParDomaine(taxonomie).get(a.frontiere.retenu)])][0] || null,
      famille_ecarte: familleParDomaine(taxonomie).get(a.frontiere.ecarte) || null,
    };
    if (a.frontiere.egalite) egalites.push(entree);
    if (a.frontiere.familles_differentes) surveiller.push(entree);
  }

  return {
    _lire:
      "Affectation de chaque fiche en domaines et en familles, consignée à chaque extraction. " +
      "Une fiche qui change de famille change d'entonnoir : elle doit se voir dans un diff. " +
      "Régénéré par npm run extract — ne pas modifier à la main.",
    _surveillance: {
      _lire:
        "egalite_frontiere : le 2e et le 3e domaine ont le MÊME score, départagés par l'ordre " +
        "alphabétique de leur id. Un seul module de plus peut donc les échanger. " +
        "familles_differentes : le 2e et le 3e domaine ne relèvent pas de la même famille, donc " +
        "un échange déplacerait la fiche dans le parcours. Ce sont les fiches à revérifier en " +
        "priorité après toute mise à jour de catalogue.",
      egalite_frontiere: egalites,
      familles_differentes: surveiller,
    },
    affectations,
  };
}

/**
 * Ce qui a changé depuis l'exécution précédente. Deux natures, et la seconde est celle qui
 * compte : un domaine qui bouge sans changer la famille ne déplace personne dans le parcours.
 *
 * `cause` n'est renseignée que si elle est IDENTIFIABLE dans le manifeste. Une cause inventée
 * serait pire qu'une case vide : elle orienterait la vérification au mauvais endroit.
 */
export function comparerManifestes(ancien, nouveau) {
  const avant = ancien?.affectations || {};
  const apres = nouveau.affectations || {};
  const egalites = new Set((nouveau._surveillance?.egalite_frontiere || []).map((e) => e.id));

  const migrations = [];
  const deplacementsDomaine = [];

  for (const [id, a] of Object.entries(apres)) {
    const b = avant[id];
    if (!b) continue; // fiche nouvelle : rien à comparer, l'extraction la signale déjà

    const memesFamilles = JSON.stringify(b.familles) === JSON.stringify(a.familles);
    const memesDomaines = JSON.stringify(b.domaines) === JSON.stringify(a.domaines);
    if (memesFamilles && memesDomaines) continue;

    const causes = [];
    if (b.modules !== a.modules) {
      causes.push(`le nombre de modules est passé de ${b.modules} à ${a.modules}`);
    }
    if (egalites.has(id)) {
      causes.push("son 2e et son 3e domaine sont à égalité de score, départagés par l'ordre alphabétique");
    }

    const entree = {
      id,
      domaines_avant: b.domaines,
      domaines_apres: a.domaines,
      familles_avant: b.familles,
      familles_apres: a.familles,
      cause: causes.length ? causes.join(" ; ") : null,
    };
    if (memesFamilles) deplacementsDomaine.push(entree);
    else migrations.push(entree);
  }

  const disparues = Object.keys(avant).filter((id) => !apres[id]);
  return { migrations, deplacementsDomaine, disparues };
}

/**
 * Le manifeste vit à côté des fiches qu'il décrit, et **son nom porte celui de leur dossier**.
 *
 * Ce dernier point est tout le mécanisme, et il a coûté deux corrections. Une écriture en chemin
 * fixe dans une fonction qui reçoit pourtant son répertoire cible est ce qui a fait qu'un test,
 * en extrayant un seul catalogue vers un bac à sable, remplaçait le manifeste des 84 fiches par
 * celui de 26. Mais dériver le chemin ne suffisait PAS : `data/filieres` et `data/_test-fusion`
 * sont deux dossiers **frères**, donc `path.dirname()` rend `data/` pour les deux et le manifeste
 * du bac à sable retombait exactement sur celui de la production. Le défaut survivait à son
 * propre correctif, et il se cachait derrière un contrôle avant/après : une fois la production
 * écrasée, la réécrire à l'identique passe pour une absence d'écriture.
 *
 * D'où la règle : **deux dossiers de fiches distincts donnent deux manifestes distincts, par
 * construction.** Pas une garde spéciale sur le nom du bac à sable, qui ne protégerait que le
 * cas connu ; une collision doit être impossible, pas improbable.
 */
export const cheminPour = (dossierFiches) =>
  path.join(path.dirname(dossierFiches), `_affectations-${path.basename(dossierFiches)}.json`);

/** Le manifeste de la production : `data/_affectations-filieres.json`. */
export const CHEMIN = cheminPour(DOSSIER_FICHES);

export const lireManifeste = (chemin = CHEMIN) =>
  fs.existsSync(chemin) ? JSON.parse(fs.readFileSync(chemin, "utf8")) : null;

export const ecrireManifeste = (manifeste, chemin = CHEMIN) =>
  fs.writeFileSync(chemin, JSON.stringify(manifeste, null, 2) + "\n");
