import { execSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

process.env.BANJO_WEB_ONLY = "true";

execSync("vite build", { cwd: root, stdio: "inherit" });
