import { copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const target = process.argv[2];
if (!target || !["chrome", "firefox"].includes(target)) {
  console.error("Usage: node scripts/build-ext.mjs <chrome|firefox>");
  process.exit(1);
}

const manifestSrc = join(root, "public", `manifest.${target}.json`);
const manifestDst = join(root, "dist", "manifest.json");

console.log(`Building extension for ${target}...`);

execSync("vite build", { cwd: root, stdio: "inherit" });

copyFileSync(manifestSrc, manifestDst);
console.log(`Copied manifest.${target}.json → dist/manifest.json`);

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const manifest = JSON.parse(readFileSync(manifestDst, "utf8"));
manifest.version = pkg.version;
writeFileSync(manifestDst, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Version set to ${pkg.version} in dist/manifest.json`);
