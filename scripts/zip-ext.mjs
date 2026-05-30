import { mkdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const target = process.argv[2];
if (!target || !["chrome", "firefox"].includes(target)) {
  console.error("Usage: node scripts/zip-ext.mjs <chrome|firefox>");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const releaseDir = join(root, "releases");
const zipName = `banjo-${target}-v${pkg.version}.zip`;
const zipPath = join(releaseDir, zipName);

mkdirSync(releaseDir, { recursive: true });

execSync(
  `powershell -Command "Compress-Archive -Path 'dist\\*' -DestinationPath '${zipPath}' -Force"`,
  { cwd: root, stdio: "inherit" },
);

console.log(`Created ${zipPath}`);
