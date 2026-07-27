#!/usr/bin/env node
/**
 * test-contamination.mjs — la suite de tests altère-t-elle la donnée de production ?
 *
 *   node scripts/test-contamination.mjs      (aussi : npm run test:contamination)
 *
 * Pourquoi ce test existe, et pourquoi il est plus fort que tous les contrôles ciblés qui le
 * précèdent. Un test de fusion extrait un catalogue vers un bac à sable ; l'écriture du
 * manifeste d'affectation, elle, ignorait le dossier de sortie et pointait un chemin en dur.
 * Résultat : `npm test` remplaçait le manifeste des 84 fiches par celui de 26, en silence.
 *
 * La règle « les scripts n'écrivent jamais hors de `data/` » ne pouvait pas l'attraper : le
 * chemin fautif était DANS `data/`. La bonne règle est **écrire dans le répertoire de sortie
 * qu'on a reçu, jamais dans un chemin en dur** — et une règle ne vaut que si quelque chose la
 * vérifie. Ce que la suite de l'histoire démontre : un premier correctif a bien dérivé le
 * chemin du dossier reçu, **et n'a rien corrigé**, `data/filieres` et `data/_test-fusion` étant
 * deux dossiers frères dont `path.dirname()` rend le même parent. Le défaut a survécu à son
 * correctif ET au contrôle ciblé censé le couvrir.
 *
 * Ce test ne cherche donc aucune écriture en particulier : il exécute la suite complète et
 * vérifie que **tout fichier du dépôt est inchangé, octet pour octet**. Il attrape ainsi les
 * contaminations qu'on n'a pas encore imaginées, y compris celles qu'un futur script
 * introduira.
 *
 * Une limite à connaître, parce qu'elle a mordu : **il mesure un état, pas une intention.** Une
 * fois la production écrasée, la réécrire à l'identique se lit comme une absence d'écriture, et
 * ce test passe au vert sur une donnée déjà détruite. Il faut donc l'exécuter sur un dépôt sain,
 * et lui adjoindre les contrôles STRUCTURELS qui ne dépendent d'aucun état sur le disque — voir
 * « deux dossiers de fiches distincts donnent deux manifestes distincts » dans test-extract.mjs.
 *
 * « Tout fichier du dépôt » et non « tout fichier SUIVI », et la nuance n'est pas théorique : le
 * fichier que le défaut détruisait n'était pas encore commité quand ce test a été écrit. Un
 * contrôle limité à `git ls-files` serait donc passé au vert **sur le bug même qui l'a
 * motivé**. On relève donc aussi les fichiers non suivis et non ignorés :
 * un fichier destiné au dépôt est protégé dès sa création, pas à partir de son premier commit.
 * Un `data/_test-fusion/` laissé derrière par un test interrompu s'y voit du même coup — raison
 * de plus pour ne PAS l'ajouter à `.gitignore`, qui le rendrait invisible ici.
 *
 * Il n'entre pas dans `npm test` : il l'exécute. L'y mettre le ferait s'appeler lui-même.
 */

import fs from "node:fs";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });

/** Les fichiers du dépôt : suivis, plus les non suivis que `.gitignore` ne couvre pas. */
function inventaire() {
  const suivis = git("ls-files", "-z").split("\0").filter(Boolean);
  const nouveaux = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter(Boolean);
  return { suivis, tous: [...new Set([...suivis, ...nouveaux])].sort() };
}

/**
 * L'empreinte de chaque fichier, telle que git la calcule lui-même.
 *
 * `git status` ne suffirait pas : il compare à l'index, donc un fichier déjà modifié avant
 * l'exécution masquerait une modification supplémentaire pendant. On relève donc le hachage de
 * chaque fichier du répertoire de travail, et on compare les deux relevés.
 *
 * Un fichier ABSENT ne se hache pas — `hash-object` échouerait et emporterait tout le contrôle.
 * On le note `null` : une suppression est justement l'une des contaminations à signaler, et un
 * test qui plante sur le défaut qu'il cherche ne signale rien.
 */
function empreintes(chemins) {
  const out = new Map();
  const presents = chemins.filter((f) => fs.existsSync(path.join(ROOT, f)));
  for (const f of chemins) if (!presents.includes(f)) out.set(f, null);
  // `hash-object` accepte les chemins en lot, mais la ligne de commande de Windows est bornée
  // à ~32 ko : on découpe, sinon le contrôle tomberait le jour où le dépôt grossit.
  for (let i = 0; i < presents.length; i += 100) {
    const lot = presents.slice(i, i + 100);
    const hachages = git("hash-object", "--", ...lot).trim().split("\n");
    lot.forEach((f, j) => out.set(f, hachages[j]));
  }
  return out;
}

let echecs = 0;

console.log(`\n  Non-contamination — la suite de tests ne doit rien écrire en production\n`);

const { suivis, tous } = inventaire();
const avant = empreintes(tous);
console.log(
  `  ${avant.size} fichier(s) relevés — ${suivis.length} suivi(s) par git, ` +
    `${tous.length - suivis.length} non suivi(s) et non ignoré(s)`
);

/* On lance les fichiers de test avec le node courant, sans passer par npm : sous Windows,
 * `spawnSync("npm.cmd")` échoue en EINVAL sans shell, et un lanceur en panne annoncerait
 * « suite en échec » alors qu'elle n'a même pas tourné — donc « aucune contamination » sur des
 * tests jamais exécutés. Un test de non-contamination qui n'exécute rien passe toujours. */
const SUITES = ["test-extract.mjs", "test-moteur.mjs", "test-interface.mjs"];
const LIMITE_MS = 300_000; // l'extraction relit les trois PDF : ~15 s en temps normal

let executees = 0;
for (const fichier of SUITES) {
  // `stdio: "ignore"` et non `"pipe"` : seul le code de sortie nous intéresse, et un enfant
  // bavard qui remplit le tampon du tube bloquerait `spawnSync` indéfiniment. La limite de
  // temps couvre l'autre blocage possible — une suite qui tourne en rond. Sans elle, ce test
  // ne rendrait jamais la main, et un test qui ne finit pas ne signale rien.
  const r = spawnSync(process.execPath, [path.join(__dirname, fichier)], {
    cwd: ROOT,
    stdio: "ignore",
    timeout: LIMITE_MS,
  });
  if (r.error) {
    echecs++;
    const cause = r.error.code === "ETIMEDOUT" ? `bloquée au-delà de ${LIMITE_MS / 1000} s` : r.error.message;
    console.log(`  ✗ ${fichier} n'a pas pu être menée à terme : ${cause}`);
    continue;
  }
  executees++;
  // Une suite en échec n'est PAS l'objet de ce test : on le dit et on continue, sinon un test
  // rouge masquerait la contamination, qui est le vrai sujet ici.
  console.log(r.status === 0 ? `  ✓ ${fichier} exécutée` : `  ! ${fichier} est en échec (la contamination reste mesurée)`);
}

if (executees !== SUITES.length) {
  echecs++;
  console.log(`  ✗ ${SUITES.length - executees} suite(s) non exécutée(s) — la mesure ne vaut rien`);
}

// Le second relevé porte sur la MÊME liste, plus ce qui serait apparu entre-temps : un fichier
// créé par un test est une contamination au même titre qu'un fichier modifié.
const apparus = inventaire().tous.filter((f) => !avant.has(f));
const apres = empreintes([...tous, ...apparus]);

const modifies = [...avant.entries()]
  .filter(([f, h]) => h !== null && apres.get(f) !== null && apres.get(f) !== h)
  .map(([f]) => f);
const supprimes = [...avant.entries()].filter(([f, h]) => h !== null && apres.get(f) === null).map(([f]) => f);

if (modifies.length || supprimes.length) {
  echecs++;
  console.log(`\n  ✗ la suite de tests a TOUCHÉ des fichiers du dépôt :`);
  for (const f of modifies) console.log(`      modifié  ${f}`);
  for (const f of supprimes) console.log(`      supprimé ${f}`);
  console.log(`\n      Un test écrit dans le répertoire de sortie qu'il reçoit, jamais dans un chemin`);
  console.log(`      en dur. Chercher un writeFileSync dont le chemin ne dérive pas d'un paramètre.`);
} else {
  console.log(`\n  ✓ aucun fichier du dépôt n'a été modifié ni supprimé`);
}

/* Un fichier apparu pendant les tests est soit une écriture en production, soit un bac à sable
 * qu'un test interrompu n'a pas nettoyé. Les deux se signalent : le second laisse dans le dépôt
 * une donnée qui ressemble à de la production sans en être. */
if (apparus.length) {
  echecs++;
  console.log(`  ✗ des fichiers sont APPARUS pendant les tests :`);
  for (const f of apparus) console.log(`      ${f}`);
  console.log(`      Écriture en production, ou bac à sable laissé derrière par un test interrompu.`);
}

console.log(echecs ? `\n  ${echecs} problème(s) de contamination\n` : `\n  Suite de tests sans effet sur la production.\n`);
process.exit(echecs ? 1 : 0);
