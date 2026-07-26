/**
 * avis.mjs — le signalement des testeurs, au moment où ils butent.
 *
 * Un retour donné **pendant** la gêne vaut beaucoup plus qu'un retour reconstitué après coup :
 * la personne se souvient de ce qui l'a arrêtée, et le parcours exact est encore là pour être
 * rejoué.
 *
 * DEUX NIVEAUX, et le premier est un BOUTON À TAPER. Sur mobile, écrire trois phrases est un
 * effort que peu font ; toucher un bouton n'en est pas un. C'est ce premier geste qui produira
 * le volume. Le champ libre n'apparaît qu'après, facultatif — le retour est déjà enregistré si
 * la personne n'écrit rien.
 *
 * MÊME PIÈGE NETLIFY QUE LA VALIDATION : le formulaire de détection est écrit littéralement
 * dans `web/index.html`. Netlify analyse le HTML déployé ; un second formulaire dynamique
 * échouerait silencieusement, exactement comme le premier l'aurait fait. Et le POST va vers
 * `/web/`, pas vers `/` — voir `cibleEnvoi` dans `collecte.mjs`.
 */

/** Le nom du formulaire, identique dans `web/index.html` et dans l'envoi. */
export const NOM_FORMULAIRE = "avis";

export const CHAMP_PIEGE = "bot-field-avis";

/**
 * Le contexte joint automatiquement, sans que le testeur ait à le décrire.
 *
 * `etat` est le fragment d'URL du parcours : il permet de **rejouer exactement** ce qui a
 * produit la gêne. C'est lui qui rend un retour exploitable plutôt qu'anecdotique — sans lui on
 * saurait qu'une question dérange, sans savoir laquelle ni après quel enchaînement.
 *
 * AUCUNE DONNÉE PERSONNELLE, comme pour la validation. `agent` est la chaîne du navigateur,
 * pour reproduire un défaut d'affichage ; ce n'est pas une identité.
 */
export const CHAMPS = [CHAMP_PIEGE, "ecran", "etat", "niveau", "commentaire", "agent"];

/**
 * Le libellé du bouton dépend de l'écran : « quelque chose ne va pas » sur une question de
 * profil serait vague, alors que « cette question n'est pas claire » dit quoi signaler.
 *
 * `ecran` vaut l'identifiant de la question (`F1`, `P3`…), `resultat`, ou `accueil`.
 */
export function libelleBouton(ecran) {
  if (ecran === "resultat") return "Ce résultat me surprend";
  if (ecran === "accueil" || !ecran) return "Quelque chose ne va pas";
  return "Cette question n'est pas claire";
}

export const TEXTES = {
  ouvrir: "Qu'est-ce qui te gêne ?",
  aide: "Facultatif — ton signalement est déjà enregistré.",
  envoyer: "Envoyer",
  merci: "Noté, merci.",
  // L'échec ne bloque jamais le parcours : le testeur continue, on perd un retour.
  echec: "Le signalement n'est pas parti. Continue, ce n'est pas grave.",
};

/**
 * Le corps de la requête. `form-name` est IMPÉRATIF, sinon Netlify ignore l'envoi.
 *
 * `commentaire` part même vide : c'est le premier geste qui compte, et un envoi conditionné au
 * texte perdrait la quasi-totalité des retours.
 */
export function corpsAvis({ ecran, etat = "", niveau = "", commentaire = "", agent = "" }) {
  const corps = new URLSearchParams();
  corps.set("form-name", NOM_FORMULAIRE);
  corps.set("ecran", ecran || "");
  corps.set("etat", etat || "");
  corps.set("niveau", niveau || "");
  corps.set("commentaire", commentaire || "");
  // Tronqué : une chaîne d'agent peut être très longue, et le quota d'envois est limité.
  corps.set("agent", String(agent || "").slice(0, 200));
  return corps.toString();
}

/**
 * UN SEUL ENVOI PAR ÉCRAN ET PAR SESSION.
 *
 * Ce n'est pas cosmétique : l'offre gratuite de Netlify plafonne le nombre d'envois de
 * formulaires par mois — de l'ordre de la centaine, et ces limites changent, donc à vérifier
 * dans le tableau de bord. Entre les signalements des testeurs et les trente réponses de
 * validation, la marge est mince : un double clic qui compte deux fois se paie en réponses
 * perdues à la fin du mois.
 *
 * L'état est porté par un `Set` fourni par l'appelant — aucun stockage, rien qui survive à la
 * session, conformément à « aucun localStorage, aucun cookie ».
 */
export function dejaEnvoye(envoyes, ecran) {
  return envoyes.has(ecran);
}

/**
 * Le bloc, en deux niveaux. Rend une chaîne : testable sans DOM, comme tout le rendu.
 *
 * `phase` : `ferme` (le bouton seul) · `ouvert` (le champ libre) · `envoye` (l'accusé).
 * L'échappement est celui du rendu — la fonction est passée en argument pour ne pas dupliquer
 * une seconde implémentation qui divergerait.
 */
export function blocAvis({ ecran, phase = "ferme", message = null }, echapper) {
  const enTete = `<section class="bloc bloc--avis" data-avis="${echapper(phase)}" data-ecran="${echapper(ecran || "")}">`;

  if (phase === "envoye") {
    return `${enTete}<p class="avis-merci">${echapper(TEXTES.merci)}</p></section>`;
  }

  if (phase === "ouvert") {
    return `${enTete}
<label class="avis-label" for="avis-commentaire">${echapper(TEXTES.ouvrir)}</label>
<p class="aide">${echapper(TEXTES.aide)}</p>
<textarea id="avis-commentaire" name="commentaire" rows="3"></textarea>
<button type="button" class="avis-envoyer" data-action="avis-envoyer">${echapper(TEXTES.envoyer)}</button>
${message ? `<p class="message-envoi">${echapper(message)}</p>` : ""}
</section>`;
  }

  return `${enTete}
<button type="button" class="avis-signaler" data-action="avis-signaler">${echapper(libelleBouton(ecran))}</button>
${message ? `<p class="message-envoi">${echapper(message)}</p>` : ""}
</section>`;
}
