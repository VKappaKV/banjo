import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, "..", "dist", "assets");

let failures = 0;

const files = readdirSync(dist).filter((f) => f.endsWith(".js"));

for (const file of files) {
  const filePath = join(dist, file);
  if (!statSync(filePath).isFile()) continue;

  const content = readFileSync(filePath, "utf8");

  // Vite replaces import.meta.env.VITE_* at build time.
  // If the literal string appears, something went wrong.
  if (content.includes("import.meta.env")) {
    console.warn(`⚠  ${file}: contains unresolved import.meta.env — possible leak`);
    failures++;
  }
}

if (failures > 0) {
  console.error(`\n❌ Found unresolved import.meta.env references in dist/`);
  process.exit(1);
} else {
  console.log("✅ No unresolved import.meta.env in dist/.");
}
