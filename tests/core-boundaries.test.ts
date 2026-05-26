import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const coreRoot = join(process.cwd(), "src", "lib", "core");
const sourceExtensions = new Set([".ts", ".js", ".svelte"]);

function collectSourceFiles(directory: string): string[] {
	return readdirSync(directory).flatMap((entry) => {
		const path = join(directory, entry);
		const stat = statSync(path);

		if (stat.isDirectory()) {
			return collectSourceFiles(path);
		}

		for (const extension of sourceExtensions) {
			if (path.endsWith(extension)) {
				return [path];
			}
		}

		return [];
	});
}

describe("core import boundaries", () => {
	it("keeps Svelte and app UI imports out of core modules", () => {
		const forbiddenPatterns = [
			/\.svelte(?:['"]|$)/,
			/from\s+['"]svelte(?:\/store)?['"]/,
			/from\s+['"]\$lib\/(?:routes|app)(?:\/|['"])/,
			/from\s+['"]\.\.\/(?:routes|app)(?:\/|['"])/,
			/from\s+['"]\.\.\/\.\.\/(?:routes|app)(?:\/|['"])/,
		];

		const violations = collectSourceFiles(coreRoot).flatMap((file) => {
			const source = readFileSync(file, "utf8");
			const matched = forbiddenPatterns.some((pattern) => pattern.test(source));

			return matched ? [relative(process.cwd(), file)] : [];
		});

		expect(violations).toEqual([]);
	});
});
