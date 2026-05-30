import { createServer } from "http";
import { readFileSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "dist");
const port = process.env.PORT ?? 3000;

const mimeTypes = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wasm": "application/wasm",
};

createServer((req, res) => {
  let urlPath = new URL(req.url, `http://localhost:${port}`).pathname;
  let filePath = join(dist, urlPath === "/" ? "index.html" : urlPath);

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": mimeTypes[ext] ?? "application/octet-stream" });
    res.end(readFileSync(filePath));
  } else {
    const indexPath = join(dist, "index.html");
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(readFileSync(indexPath));
  }
}).listen(port, () => {
  console.log(`Banjo server listening on http://localhost:${port}`);
});
