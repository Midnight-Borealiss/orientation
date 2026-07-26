#!/usr/bin/env node
/**
 * servir.mjs — servir le dépôt en local, le temps de regarder l'écran.
 *
 *   npm run web        puis  http://localhost:8080/web/
 *
 * Pourquoi c'est nécessaire : `file://` interdit les modules ES et `fetch`. Ce n'est PAS une
 * dépendance de déploiement — en production, n'importe quel hébergement statique suffit, et
 * `git push` reste le seul geste. D'où `node:http` et rien d'autre.
 *
 * Aucune écriture, aucun état : il lit le dépôt et le rend tel quel.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RACINE = path.join(__dirname, "..");
const PORT = Number(process.env.PORT) || 8080;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

http
  .createServer((requete, reponse) => {
    const url = decodeURIComponent((requete.url || "/").split("?")[0]);
    let cible = path.join(RACINE, url === "/" ? "web/index.html" : url);
    // Aucun accès hors du dépôt : `..` dans une URL ne doit pas remonter le disque.
    if (!cible.startsWith(RACINE)) {
      reponse.writeHead(403).end("interdit");
      return;
    }
    if (fs.existsSync(cible) && fs.statSync(cible).isDirectory()) cible = path.join(cible, "index.html");
    if (!fs.existsSync(cible)) {
      reponse.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("introuvable : " + url);
      return;
    }
    reponse.writeHead(200, { "content-type": TYPES[path.extname(cible)] || "application/octet-stream" });
    fs.createReadStream(cible).pipe(reponse);
  })
  .listen(PORT, () => {
    const contexte = path.join(RACINE, "data", "_contexte.json");
    if (!fs.existsSync(contexte)) {
      console.log(`\n  ⚠ data/_contexte.json absent — lance d'abord : npm run contexte:web`);
    }
    console.log(`\n  http://localhost:${PORT}/web/\n`);
  });
