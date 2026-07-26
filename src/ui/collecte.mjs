/**
 * collecte.mjs — la validation par les étudiants actuels, via Netlify Forms.
 *
 * À quoi ça sert, et pourquoi ce n'est pas optionnel : avec une seule personne par école,
 * aucune vérification croisée institutionnelle n'est possible. La cohorte étudiante est le
 * seul garde-fou du modèle. Vingt à trente étudiants de 2e ou 3e année passent le quiz ; s'il
 * recommande la finance à un étudiant de finance content de son choix, le modèle tient.
 *
 * LA CONTRAINTE TECHNIQUE À CONNAÎTRE AVANT DE TOUCHER À CECI. Netlify détecte les
 * formulaires en analysant le HTML **déployé**, pas à l'exécution. Un formulaire créé par
 * JavaScript n'est jamais enregistré, et les envois retournent 404 sans message clair. Le
 * formulaire de détection est donc écrit LITTÉRALEMENT dans `web/index.html`, masqué, et ce
 * module ne fait que composer le corps de la requête. `npm run test:interface` vérifie que
 * les champs déclarés dans le HTML statique et ceux envoyés ici sont exactement les mêmes.
 */

/** Le nom du formulaire. Il doit être identique dans `web/index.html` et dans l'envoi. */
export const NOM_FORMULAIRE = "validation";

/**
 * Le piège à robots. Netlify écarte un envoi qui le remplit — pas de captcha à imposer à un
 * étudiant qui nous rend service.
 */
export const CHAMP_PIEGE = "bot-field";

/** Ce que le répondant renseigne. */
export const CHAMPS_REPONDANT = ["filiere_suivie", "annee", "satisfait"];

/** Ce que le moteur renseigne seul : le répondant n'a rien à recopier. */
export const CHAMPS_AUTOMATIQUES = ["etat", "recommande", "niveau_correspondance"];

/**
 * Tous les champs, dans l'ordre du formulaire statique.
 *
 * AUCUN CHAMP PERSONNEL — ni nom, ni adresse, ni téléphone. Rien à déclarer, rien à protéger,
 * et un répondant nettement plus franc sur la dernière question. Le test refuse l'ajout d'un
 * champ dont le nom évoque une identité.
 */
export const CHAMPS = [CHAMP_PIEGE, ...CHAMPS_AUTOMATIQUES, ...CHAMPS_REPONDANT];

export const ANNEES = ["1re année", "2e année", "3e année", "Plus"];

/**
 * La dernière question est INDISPENSABLE. Un étudiant qui regrette sa filière ne peut pas
 * servir de vérité terrain : sans elle, impossible de distinguer un modèle qui se trompe d'un
 * étudiant mal orienté. Les quatre réponses sont également honorables.
 */
export const SATISFACTION = ["Oui", "Plutôt", "Pas vraiment", "Non"];

/**
 * La liste des programmes proposée au répondant, `{ id, nom }`, triée par intitulé.
 *
 * LA MODALITÉ FAIT PARTIE DU NOM. Deux écoles publient le même intitulé de programme : sans
 * elle, la liste affiche deux fois la même ligne et le répondant choisit au hasard — ce qui
 * fausse silencieusement la seule vérité terrain dont on dispose. C'est le même problème que
 * sur l'écran de résultat, et il se règle de la même façon.
 *
 * Les libellés viennent du contexte, jamais d'une table écrite ici : l'interface ne porte
 * aucun mot du vocabulaire des données.
 */
export function listeProgrammes(contexte) {
  const libelles = contexte?.taxonomie?.modalites_libelles || {};
  return (contexte?.fiches || [])
    .map((f) => {
      const modalites = (f.modalites || []).map((m) => libelles[m] || m);
      return { id: f.id, nom: modalites.length ? `${f.nom} — ${modalites.join(", ")}` : f.nom };
    })
    .sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}

/**
 * Les trois champs que le moteur remplit. `niveau_correspondance` est le LIBELLÉ du palier —
 * jamais une valeur numérique : elle n'a rien à faire dans une réponse de formulaire non plus.
 */
export function champsAutomatiques(resultat) {
  return {
    etat: resultat?.niveau || "",
    recommande: resultat?.recommandation?.id || "",
    niveau_correspondance: resultat?.recommandation?.correspondance || "",
  };
}

/** Les trois réponses attendues sont-elles là ? On ne choisit jamais à la place du répondant. */
export function validerReponses(reponses) {
  const manquants = CHAMPS_REPONDANT.filter((c) => !reponses?.[c]);
  return { ok: !manquants.length, manquants };
}

/**
 * Le corps de la requête, en `application/x-www-form-urlencoded`.
 *
 * `form-name` est IMPÉRATIF : sans lui, Netlify ignore l'envoi, et l'échec est silencieux.
 * C'est le premier champ, et le test le vérifie.
 */
export function corpsValidation(resultat, reponses) {
  const corps = new URLSearchParams();
  corps.set("form-name", NOM_FORMULAIRE);
  for (const [cle, valeur] of Object.entries(champsAutomatiques(resultat))) corps.set(cle, valeur);
  for (const cle of CHAMPS_REPONDANT) corps.set(cle, reponses?.[cle] ?? "");
  return corps.toString();
}

/**
 * Où poster.
 *
 * PAS vers `/` : `netlify.toml` y redirige vers `/web/` en 302, et la redirection s'applique
 * aussi au POST — l'envoi partirait dans le vide sans le dire. On poste vers le chemin de la
 * page qui PORTE le formulaire, ce qui est de toute façon l'usage documenté par Netlify.
 */
export function cibleEnvoi(chemin) {
  const p = String(chemin || "/");
  return p.endsWith("/") ? p : p.replace(/[^/]*$/, "");
}
