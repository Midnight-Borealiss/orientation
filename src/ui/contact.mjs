/**
 * contact.mjs — la destination du bouton « parler à un conseiller ».
 *
 * Fonction pure, aucun DOM : elle prend `config/contact.json` et la filière recommandée, et
 * rend une URL. C'est ce qui permet de tester que basculer `canal` change la destination
 * SANS toucher au code — le test le vérifie en passant les deux configurations.
 *
 * Pourquoi ici et pas dans `src/engine/` : construire un `mailto:` est de la présentation. Le
 * moteur décide quoi recommander ; l'écran décide comment on écrit à quelqu'un.
 */

/** Les canaux reconnus. Une valeur hors de cette liste ne produit AUCUN lien. */
export const CANAUX = ["email", "whatsapp"];

/**
 * Remplace `{programme}`, `{ecole}` et `{modalite}` dans un gabarit.
 *
 * Un jeton sans valeur est laissé VIDE, jamais rendu tel quel et jamais rempli d'un
 * « undefined » : le message part vers une vraie boîte d'une vraie école. Les jetons
 * effectivement vides sont remontés à l'appelant.
 */
export function substituer(gabarit, valeurs) {
  const vides = [];
  const texte = String(gabarit || "").replace(/\{(\w+)\}/g, (_, cle) => {
    const v = valeurs[cle];
    if (v == null || v === "") {
      vides.push(cle);
      return "";
    }
    return String(v);
  });
  return { texte, vides };
}

/**
 * Les valeurs de substitution, tirées de la filière recommandée telle que le moteur la
 * présente. On emploie les LIBELLÉS — « sur le campus » et non « presentiel » : ce texte est
 * lu par un humain aux admissions.
 */
export function valeursDe(fiche) {
  if (!fiche) return { programme: "", ecole: "", modalite: "" };
  const modalites = fiche.modalites_labels?.length ? fiche.modalites_labels : fiche.modalites || [];
  return {
    programme: fiche.nom || "",
    ecole: fiche.ecole_label || fiche.ecole || "",
    modalite: modalites.join(", "),
  };
}

/**
 * Le lien à poser sur le bouton, ou `null`.
 *
 * `null` quand le canal est inconnu ou sa configuration incomplète : **mieux vaut un bouton
 * absent qu'un bouton qui ne mène nulle part.** Le motif est remonté, jamais avalé.
 *
 * L'encodage passe par `encodeURIComponent` sur chaque valeur : les retours à la ligne
 * (`%0A`) et les accents cassent un `mailto:` mal échappé, et le corps du courriel en
 * contient des deux.
 */
export function lienContact(config, fiche) {
  const canal = config?.canal;
  if (!CANAUX.includes(canal)) {
    return { href: null, canal: canal ?? null, libelle: config?.libelle || null, motif: `canal inconnu « ${canal ?? "absent"} » dans config/contact.json` };
  }

  const valeurs = valeursDe(fiche);
  const bloc = config[canal] || {};
  const libelle = config.libelle || null;

  if (canal === "email") {
    if (!bloc.adresse) {
      return { href: null, canal, libelle, motif: "config/contact.json > email.adresse manquante" };
    }
    const objet = substituer(bloc.objet, valeurs);
    const corps = substituer(bloc.corps, valeurs);
    const parametres = [];
    if (objet.texte) parametres.push(`subject=${encodeURIComponent(objet.texte)}`);
    if (corps.texte) parametres.push(`body=${encodeURIComponent(corps.texte)}`);
    return {
      href: `mailto:${bloc.adresse}${parametres.length ? "?" + parametres.join("&") : ""}`,
      canal,
      libelle,
      motif: jetonsVides([...objet.vides, ...corps.vides]),
    };
  }

  // WhatsApp. Le numéro se nettoie de tout ce qui n'est pas un chiffre : wa.me refuse les
  // espaces, les `+` et les tirets, et l'échec serait une page d'erreur chez WhatsApp.
  const numero = String(bloc.numero || "").replace(/\D/g, "");
  if (!numero) return { href: null, canal, libelle, motif: "config/contact.json > whatsapp.numero manquant" };
  const message = substituer(bloc.message, valeurs);
  return {
    href: `https://wa.me/${numero}${message.texte ? `?text=${encodeURIComponent(message.texte)}` : ""}`,
    canal,
    libelle,
    motif: jetonsVides(message.vides),
  };
}

const jetonsVides = (vides) =>
  vides.length ? `jeton(s) sans valeur laissé(s) vide(s) : ${[...new Set(vides)].join(", ")}` : null;
