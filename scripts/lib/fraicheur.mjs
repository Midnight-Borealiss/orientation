/**
 * fraicheur.mjs — Un artefact généré est-il encore à jour ?
 *
 * Le problème que ce module résout, et pourquoi une consigne ne suffisait pas. Quatre des
 * sorties du dépôt sont **ignorées par git** : `data/_paires.csv`, `data/_comparaisons/`,
 * `data/_manques.csv`, `data/_impasses.md`. Une correction d'extraction les périme toutes,
 * et `git status` reste vide — donc rien ne le dit. C'est arrivé : les 80 fiches de
 * comparaison ont continué de citer des modules exclusifs d'avant une correction, et ce
 * sont précisément les documents qui partent aux responsables.
 *
 * La péremption se mesure par le CONTENU, pas par l'horodatage. Une date de modification
 * serait ininterprétable : `git clone` les réécrit toutes à la même seconde, et un script
 * qui écrit ses fiches puis son CSV rendrait son propre CSV « plus vieux » que ses entrées.
 * On enregistre donc l'empreinte des sources au moment où l'artefact est produit, dans
 * `data/_fraicheur.json`, et on la recompare.
 *
 * `data/_fraicheur.json` **se commite**, et c'est volontaire : le manifeste rend la
 * péremption visible dans `git diff` alors que les artefacts, eux, ne le sont pas. Il ne
 * contient donc aucune date — sinon il changerait à chaque exécution et ne dirait plus rien.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.join(__dirname, "..", "..");
const MANIFESTE = path.join(ROOT, "data", "_fraicheur.json");

/**
 * Ce que chaque artefact consomme, et la commande qui le régénère.
 *
 * `sources` désigne des dossiers ou des fichiers, jamais un autre artefact : une chaîne
 * d'empreintes en cascade ferait qu'une seule péremption en signalerait cinq, et on ne
 * saurait plus laquelle relancer. Tous dépendent de la même matière première — les fiches et
 * les configs —, donc tous se périment ensemble, et chacun nomme sa propre commande.
 */
export const ARTEFACTS = {
  "data/_paires.csv": {
    sources: ["data/filieres", "config/taxonomy.json"],
    commande: "npm run distinctivite",
  },
  "data/_comparaisons": {
    sources: ["data/filieres", "config/taxonomy.json", "config/departages.json"],
    commande: "npm run comparaisons",
  },
  "data/_manques.csv": {
    sources: ["data/filieres", "config/taxonomy.json", "config/domaines_axes.json", "config/departages.json"],
    commande: "npm run report -- --csv",
  },
  "data/_impasses.md": {
    sources: ["data/filieres", "config/taxonomy.json", "config/questions.json", "config/departages.json"],
    commande: "npm run impasses",
  },
  "data/_contexte.json": {
    sources: ["data/filieres", "config"],
    commande: "npm run contexte:web",
  },
};

const sha = (buf) => crypto.createHash("sha256").update(buf).digest("hex");

/** Les fichiers d'une source, à plat et triés : un parcours de dossier n'a pas d'ordre garanti. */
function fichiersDe(source) {
  const abs = path.join(ROOT, source);
  if (!fs.existsSync(abs)) return [];
  if (fs.statSync(abs).isFile()) return [source];
  return fs
    .readdirSync(abs)
    .filter((n) => n.endsWith(".json") || n.endsWith(".csv") || n.endsWith(".md"))
    // Les artefacts ne sont jamais sources d'eux-mêmes ni les uns des autres : sans cette
    // exclusion, `config`/`data` finiraient par embarquer un fichier généré et l'empreinte
    // changerait à chaque exécution.
    .filter((n) => !n.startsWith("_"))
    .map((n) => path.posix.join(source, n))
    .sort();
}

/** L'empreinte des sources d'un artefact : le contenu, jamais les dates. */
export function empreinteSources(nom) {
  const decl = ARTEFACTS[nom];
  if (!decl) throw new Error(`artefact inconnu : ${nom}`);
  const morceaux = [];
  for (const source of decl.sources) {
    for (const rel of fichiersDe(source)) {
      morceaux.push(`${rel}:${sha(fs.readFileSync(path.join(ROOT, rel)))}`);
    }
  }
  return sha(morceaux.sort().join("\n"));
}

const lireManifeste = () => (fs.existsSync(MANIFESTE) ? JSON.parse(fs.readFileSync(MANIFESTE, "utf8")) : {});

/**
 * À appeler par un script APRÈS avoir écrit son artefact — et après avoir écrit les fiches,
 * s'il en écrit aussi : l'empreinte doit porter sur l'état final, sinon elle se déclare
 * périmée dès la fin de sa propre exécution.
 */
export function noterFraicheur(nom) {
  const manifeste = lireManifeste();
  manifeste[nom] = empreinteSources(nom);
  const ordonne = Object.fromEntries(Object.keys(manifeste).sort().map((k) => [k, manifeste[k]]));
  fs.writeFileSync(MANIFESTE, JSON.stringify(ordonne, null, 2) + "\n");
}

/**
 * L'état de chaque artefact déclaré :
 *
 *   `absent`  — pas généré. Ce n'est PAS une erreur : quatre des cinq sont gitignorés, donc
 *               absents d'un clone neuf. Il n'y a rien de périmé dans ce qui n'existe pas.
 *   `inconnu` — l'artefact est là mais le manifeste ne le connaît pas : produit par une
 *               version du script qui ne notait pas sa fraîcheur. Impossible de conclure.
 *   `perime`  — l'artefact est là et ses sources ont changé depuis. C'est le seul cas qui
 *               doit faire échouer un contrôle.
 *   `a_jour`  — les deux empreintes concordent.
 */
export function etatFraicheur() {
  const manifeste = lireManifeste();
  const actuel = empreinteActuelle();
  return Object.entries(ARTEFACTS).map(([nom, decl]) => {
    const existe = fs.existsSync(path.join(ROOT, nom));
    let etat = "a_jour";
    if (!existe) etat = "absent";
    else if (!manifeste[nom]) etat = "inconnu";
    else if (manifeste[nom] !== actuel[nom]) etat = "perime";
    return { nom, etat, commande: decl.commande };
  });
}

/** Les empreintes courantes, calculées une fois par artefact. */
function empreinteActuelle() {
  const out = {};
  for (const nom of Object.keys(ARTEFACTS)) out[nom] = empreinteSources(nom);
  return out;
}
