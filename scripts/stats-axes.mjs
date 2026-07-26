import fs from "node:fs";
const DIR = "data/filieres";
const fiches = fs.readdirSync(DIR)
  .filter(f => f.endsWith(".json"))
  .map(f => JSON.parse(fs.readFileSync(`${DIR}/${f}`, "utf8")));

const AXES = ["quantitatif", "technique", "relationnel", "creatif", "cadre"];
console.log(`\n${fiches.length} fiches\n`);
console.log("axe            1   2   3   4   5   moy  écart");

for (const axe of AXES) {
  const v = fiches.map(f => f.axes?.[axe]).filter(Number.isFinite);
  const h = [1,2,3,4,5].map(n => v.filter(x => x === n).length);
  const moy = v.reduce((s,n) => s+n, 0) / v.length;
  const ec = Math.sqrt(v.reduce((s,n) => s + (n-moy)**2, 0) / v.length);
  console.log(
    axe.padEnd(14) +
    h.map(c => String(c).padStart(3)).join(" ") +
    "  " + moy.toFixed(1) + "  " + ec.toFixed(2)
  );
}

const q = fiches.map(f => f.exigence_quantitative?.modules_comptes).filter(Number.isFinite);
if (q.length) {
  q.sort((a,b) => a-b);
  console.log(`\nmodules quantitatifs : min ${q[0]} · médiane ${q[Math.floor(q.length/2)]} · max ${q.at(-1)}`);
}