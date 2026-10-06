// Validates syntax of every JS file, every JSON data file, and data honesty rules.
const fs = require("fs"), path = require("path"), cp = require("child_process");
const root = path.join(__dirname, "..");
const E = require(path.join(root, "engine.js"));
let errors = 0, warnings = 0;
const fail = (m) => { console.error("ERROR  " + m); errors++; };
const warn = (m) => { console.warn("WARN   " + m); warnings++; };

for (const f of ["engine.js", "store.js", "app.js", "otp.js", "scripts/serve.js", "scripts/build.js", "scripts/validate.js"]) {
  const r = cp.spawnSync(process.execPath, ["--check", path.join(root, f)]);
  if (r.status !== 0) fail("syntax: " + f + "\n" + r.stderr);
}
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(root, "data", f + ".json"), "utf8")); } catch (e) { fail("data/" + f + ".json: " + e.message); return []; } };
const sets = { trains: read("local-trains"), buses: read("buses"), metro: read("metro"), fares: read("fares"), ganpati: read("ganpati"), devi: read("devi") };
JSON.parse(fs.readFileSync(path.join(root, "data", "meta.json"), "utf8"));
JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));

for (const k of ["trains", "buses", "metro"]) E.validateDataset(k, sets[k]).forEach(fail);
for (const r of sets.fares) {
  if (r.verified === true && (!r.source || !isFinite(Number(r.fare)))) fail("fare needs numeric fare and source: " + JSON.stringify(r));
}
for (const k of ["ganpati", "devi"]) {
  const ids = new Set(), names = new Map();
  for (const m of sets[k]) {
    if (!m.name) fail(k + " " + m.id + ": empty name (placeholders are not allowed)");
    if (ids.has(m.id)) fail(k + ": duplicate id " + m.id); ids.add(m.id);
    if (!m.source) fail(k + " " + m.id + ": missing source");
    const n = (m.name || "").toLowerCase().replace(/[^a-z]/g, "");
    if (names.has(n)) fail(k + ": exact duplicate name " + m.name); names.set(n, m.id);
    if (!m.nearest) warn(k + " " + m.id + " (" + m.name + "): nearest station not verified");
    if (m.locationVerified === false) warn(k + " " + m.id + " (" + m.name + "): exact location not verified");
    if (m.possibleDuplicateOf) warn(k + " " + m.id + ": possible duplicate of " + m.possibleDuplicateOf);
  }
}
for (const k of ["trains", "buses", "metro"]) {
  const unverified = sets[k].filter((r) => r.verified !== true).length;
  if (unverified) warn(k + ": " + unverified + " placeholder rows (verified:false). They are hidden unless Demo mode is on.");
}
for (const f of ["index.html"]) {
  const html = fs.readFileSync(path.join(root, f), "utf8");
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (/^https?:/.test(m[1])) continue;
    if (!fs.existsSync(path.join(root, m[1]))) fail("broken link in " + f + ": " + m[1]);
  }
}
console.log(`\nvalidate: ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors ? 1 : 0);
