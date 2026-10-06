// Tiny static server for local use: npm start  ->  http://localhost:5173
const http = require("http"), fs = require("fs"), path = require("path");
const dir = fs.existsSync(path.join(__dirname, "..", "dist")) && process.argv[2] === "dist" ? path.join(__dirname, "..", "dist") : path.join(__dirname, "..");
const port = Number(process.env.PORT) || 5173;
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json" };
http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split("?")[0]);
  const file = path.normalize(path.join(dir, p === "/" ? "index.html" : p));
  if (!file.startsWith(dir) || /[\\/](tests|scripts|node_modules)[\\/]/.test(file)) { res.writeHead(403); return res.end("Forbidden"); }
  fs.readFile(file, (e, buf) => {
    if (e) { res.writeHead(404); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": (types[path.extname(file)] || "application/octet-stream") + "; charset=utf-8" }); res.end(buf);
  });
}).listen(port, () => console.log("Mr Mushakk running at http://localhost:" + port));
