/**
 * etat-url.mjs — le parcours dans le fragment d'URL.
 *
 * Aucun `localStorage`, aucun cookie, aucun serveur : le fragment suffit, et il ne quitte
 * jamais le navigateur — il n'est même pas envoyé dans la requête HTTP. Un prospect peut
 * reprendre plus tard, ou envoyer le lien à un parent. Rien à déclarer, rien à protéger.
 *
 * ON NE SÉRIALISE PAS L'ÉTAT DU MOTEUR, seulement les RÉPONSES. L'état porte le profil
 * accumulé, qui se recalcule intégralement en rejouant les réponses : le sérialiser en
 * entier allongerait l'URL et, surtout, permettrait de forger un profil qu'aucune
 * combinaison de réponses ne peut produire. Les réponses sont la seule vérité.
 */

/**
 * `{ F1: 2, P3: 0 }` + un identifiant de départage → `r=F1:2,P3:0&d=…`
 *
 * L'ordre des clés est trié : deux parcours identiques doivent produire la même URL, sinon
 * un lien partagé change à chaque rendu et l'historique du navigateur se remplit de doublons.
 */
export function versFragment(reponses, departage = null) {
  const paires = Object.keys(reponses || {})
    .sort()
    .filter((id) => Number.isInteger(reponses[id]))
    .map((id) => `${id}:${reponses[id]}`);

  const morceaux = [];
  if (paires.length) morceaux.push(`r=${paires.join(",")}`);
  if (departage) morceaux.push(`d=${encodeURIComponent(departage)}`);
  return morceaux.join("&");
}

/**
 * L'inverse. Tolérant par nécessité : un fragment tronqué par un copier-coller ne doit pas
 * casser la page. Une entrée illisible est IGNORÉE et signalée dans `ignorees` — pas
 * remplacée par un défaut, ce qui reviendrait à répondre à la place du prospect.
 */
export function depuisFragment(fragment) {
  const reponses = {};
  const ignorees = [];
  let departage = null;

  const brut = String(fragment || "").replace(/^#/, "");
  if (!brut) return { reponses, departage, ignorees };

  for (const part of brut.split("&")) {
    const [cle, valeur = ""] = part.split("=");
    if (cle === "d") {
      departage = decodeURIComponent(valeur) || null;
      continue;
    }
    if (cle !== "r") {
      if (part) ignorees.push(part);
      continue;
    }
    for (const paire of valeur.split(",")) {
      if (!paire) continue;
      const [id, indice] = paire.split(":");
      const n = Number(indice);
      // Un identifiant vide ou un indice non entier ne se devine pas.
      if (!id || !Number.isInteger(n) || n < 0) {
        ignorees.push(paire);
        continue;
      }
      reponses[id] = n;
    }
  }

  return { reponses, departage, ignorees };
}
