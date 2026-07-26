/**
 * charger.mjs — la SEULE porte d'entrée du moteur vers le disque.
 *
 * Tout le reste de src/engine/ est constitué de fonctions pures qui reçoivent leur
 * contexte en argument. Cette séparation n'est pas cosmétique : elle permet d'utiliser le
 * moteur tel quel dans un navigateur, où il n'y a pas de `fs`, en lui passant un contexte
 * chargé autrement (un fetch, un bundle JSON).
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { domainesInatteignables } from "./aiguillage.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, "..", "..");

const lireJson = (...morceaux) => JSON.parse(fs.readFileSync(path.join(RACINE, ...morceaux), "utf8"));

/**
 * Charge config/ et data/filieres/ en un contexte prêt pour le moteur.
 *
 * Les fiches sont triées par `id` : le classement départage les scores égaux par `id`,
 * donc l'ordre de lecture du dossier ne doit jamais pouvoir changer un résultat.
 */
export function chargerContexte({ racine = RACINE } = {}) {
  const dossier = path.join(racine, "data", "filieres");
  if (!fs.existsSync(dossier)) {
    throw new Error("data/filieres/ absent. Lance d'abord : npm run extract");
  }
  const fiches = fs
    .readdirSync(dossier)
    .filter((n) => n.endsWith(".json"))
    .map((n) => JSON.parse(fs.readFileSync(path.join(dossier, n), "utf8")))
    .sort((a, b) => a.id.localeCompare(b.id));

  if (!fiches.length) throw new Error("aucune fiche dans data/filieres/. Lance d'abord : npm run extract");

  const contexte = {
    taxonomie: lireJson("config", "taxonomy.json"),
    questions: lireJson("config", "questions.json"),
    departages: lireJson("config", "departages.json"),
    domainesAxes: lireJson("config", "domaines_axes.json"),
    // Les fragments de la phrase « Si je comprends bien… ». C'est de la donnée : le moteur
    // n'en porte aucun en dur, et leur vocabulaire viendra des admissions.
    reformulation: lireJson("config", "reformulation.json"),
    fiches,
  };

  return contexte;
}

/**
 * Contrôles de cohérence du contexte, à lancer avant de servir un prospect.
 *
 * Ce ne sont pas des tests : ce sont les conditions sans lesquelles un résultat serait
 * faux sans que rien ne le dise. Chacune remonte un texte, jamais une exception — c'est à
 * l'appelant de décider s'il refuse de démarrer ou s'il affiche un avertissement.
 */
export function verifierContexte(contexte) {
  const problemes = [];
  const seuils = contexte.departages?._seuils || {};

  for (const cle of ["correspondance_forte", "correspondance_bonne", "ecart_declenchant_departage"]) {
    const v = seuils[cle];
    if (!Number.isFinite(v) || v < -1 || v > 1) {
      problemes.push(`config/departages.json > _seuils.${cle} doit être un nombre dans [-1, 1] : le score est une corrélation, pas un pourcentage`);
    }
  }
  if (seuils.correspondance_forte <= seuils.correspondance_bonne) {
    problemes.push("_seuils.correspondance_forte doit dépasser _seuils.correspondance_bonne");
  }

  const axes = (contexte.taxonomie.axes || []).filter((a) => a._niveau !== "domaine").map((a) => a.id);
  if (axes.length !== 5) problemes.push(`${axes.length} axes comptés dans la taxonomie, 5 attendus`);

  // Un poids de question qui viserait un axe inexistant serait silencieusement perdu.
  const connus = new Set([...axes, ...(contexte.taxonomie.axes || []).map((a) => a.id)]);
  for (const q of contexte.questions.profil || []) {
    for (const o of q.options || []) {
      for (const axe of Object.keys(o.poids || {})) {
        if (!connus.has(axe)) problemes.push(`${q.id} : poids sur un axe inconnu « ${axe} »`);
      }
    }
  }

  // Une famille absente de la taxonomie rendrait une option d'aiguillage sans effet :
  // le prospect choisirait un univers et n'obtiendrait aucune filière.
  const familles = new Set((contexte.taxonomie.familles || []).map((f) => f.id));
  const domainesTaxo = new Set((contexte.taxonomie.domaines || []).map((d) => d.id));
  for (const q of contexte.questions.aiguillage || []) {
    if (q.si?.famille && !familles.has(q.si.famille)) {
      problemes.push(`${q.id} : conditionnée par une famille inconnue « ${q.si.famille} »`);
    }
    for (const o of q.options || []) {
      if (q.cible === "domaines") {
        // Le second étage vise une LISTE de domaines, pas une famille.
        for (const d of o.valeur || []) {
          if (!domainesTaxo.has(d)) problemes.push(`${q.id} : domaine inconnu « ${d} »`);
        }
      } else if (o.valeur && !familles.has(o.valeur)) {
        problemes.push(`${q.id} : famille inconnue « ${o.valeur} »`);
      }
    }
  }

  // Un domaine de la famille qu'aucune option ne permet d'atteindre retirerait ses fiches
  // du parcours sans que rien ne le dise, quelle que soit la réponse du prospect.
  problemes.push(...domainesInatteignables(contexte.questions, contexte.taxonomie));

  // La reformulation est OBLIGATOIRE avant le résultat : c'est elle qui transforme un
  // verdict en proposition. Un axe marqué sans fragment amputerait la phrase en silence.
  const fragments = contexte.reformulation?.fragments;
  if (!fragments) {
    problemes.push("config/reformulation.json absent ou sans bloc `fragments` : la reformulation ne pourrait rien afficher");
  } else {
    for (const axe of axes) {
      for (const sens of ["fort", "faible"]) {
        if (!fragments[axe]?.[sens]) {
          problemes.push(`config/reformulation.json : fragment « ${sens} » manquant pour l'axe ${axe}`);
        }
      }
    }
  }

  const sansParts = contexte.fiches.filter((f) => !f.axes_parts);
  if (sansParts.length) {
    problemes.push(
      `${sansParts.length} fiche(s) sans axes_parts : le score tomberait sur les notes arrondies. Relance npm run extract`
    );
  }
  const sansFiabilite = contexte.fiches.filter((f) => typeof f.axes_fiables !== "boolean");
  if (sansFiabilite.length) {
    problemes.push(
      `${sansFiabilite.length} fiche(s) sans axes_fiables : elles seront écartées du classement. Relance npm run distinctivite`
    );
  }

  // Avertissements — pas des erreurs, mais ils changent ce que le moteur peut faire.
  const avertissements = [];
  if (/provisoire/i.test(seuils._statut || "")) {
    avertissements.push("les seuils sont provisoires : lance npm run simuler pour les calibrer sur la distribution réelle");
  }
  const dispo = Object.values(contexte.domainesAxes.domaines || {});
  const collectes = dispo.filter((d) => Number.isFinite(d.ancrage) && Number.isFinite(d.abstraction)).length;
  if (collectes < dispo.length) {
    avertissements.push(
      `axes de disposition collectés pour ${collectes} domaine(s) sur ${dispo.length} : le premier étage du départage est inactif`
    );
  }
  const aDisposition = (contexte.questions.profil || []).some((q) =>
    (q.options || []).some((o) => o.poids_disposition)
  );
  if (!aDisposition) {
    avertissements.push(
      "aucune question ne porte de poids_disposition : le prospect n'a pas de profil de disposition, le départage passe directement à la question de paire"
    );
  }

  return { problemes, avertissements, ok: !problemes.length };
}
