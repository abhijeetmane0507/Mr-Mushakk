// Production build: copies the static site into dist/. No bundler needed.
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, ".."), dist = path.join(root, "dist");
fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });
const include = ["index.html", "data-manager.html", "styles.css", "engine.js", "store.js", "app.js", "otp.js", "manifest.webmanifest", "data"];
for (const f of include) {
  const src = path.join(root, f);
  if (!fs.existsSync(src)) { console.error("missing " + f); process.exit(1); }
  fs.cpSync(src, path.join(dist, f), { recursive: true, filter: (s) => !s.endsWith("README.md") && !s.endsWith("pending-verification.json") });
}
const n = fs.readdirSync(dist, { recursive: true }).length;
console.log("build: wrote " + n + " entries to dist/");
