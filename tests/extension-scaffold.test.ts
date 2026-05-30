import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRefererRules, buildSidePanelPath } from "../src/ext/background/routes";

describe("extension scaffold", () => {
	it("declares the built extension entrypoints in the Chrome MV3 manifest", () => {
		const manifest = JSON.parse(readFileSync(join(process.cwd(), "public", "manifest.chrome.json"), "utf8"));

		expect(manifest.manifest_version).toBe(3);
		expect(manifest.background.service_worker).toBe("assets/background.js");
		expect(manifest.side_panel.default_path).toBe("index.html");
		expect(manifest.content_scripts[0].js).toEqual(["assets/content-script.js"]);
		expect(manifest.web_accessible_resources[0].resources).toContain("assets/page-client.js");
		expect(manifest.permissions).toEqual(expect.arrayContaining(["sidePanel", "declarativeNetRequest"]));
	});

	it("declares Firefox browser_specific_settings in the Firefox manifest", () => {
		const manifest = JSON.parse(readFileSync(join(process.cwd(), "public", "manifest.firefox.json"), "utf8"));

		expect(manifest.manifest_version).toBe(3);
		expect(manifest.browser_specific_settings.gecko.id).toBe("banjo-wallet@banjo.algo");
		expect(manifest.browser_specific_settings.gecko.strict_min_version).toBe("109.0");
		expect(manifest.background.service_worker).toBe("assets/background.js");
	});

	it("builds side-panel paths from Banjo protocol requests", () => {
		const path = buildSidePanelPath({
			tabId: 9,
			origin: "https://dapp.example",
			request: {
				id: "request-1",
				action: "connect",
				name: "Example",
				genesisID: "testnet-v1.0",
			},
		});

		expect(path).toBe(
			"index.html?action=connect&requestId=request-1&tabId=9&origin=https%3A%2F%2Fdapp.example&name=Example&genesisID=testnet-v1.0",
		);
		expect(buildSidePanelPath({
			tabId: 1,
			request: { id: "auth-1", action: "data" },
		})).toBe("index.html?action=auth&requestId=auth-1&tabId=1");
	});

	it("preserves referer rules for selected IPFS and Nodely requests", () => {
		const rules = buildRefererRules("https://banjo.example/");

		expect(rules.map((rule) => rule.condition.urlFilter)).toEqual([
			"||ipfs.io/",
			"||nodely.io/",
			"||nodely.dev/",
		]);
		expect(rules.every((rule) => rule.action.requestHeaders[0]?.value === "https://banjo.example/")).toBe(true);
	});
});
