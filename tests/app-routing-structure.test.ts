import { describe, expect, it } from "vitest";
import { routePathForExtensionAction, sidebarViewDefinitions, walletViewDefinitions } from "../src/lib/app/views";
import { routes } from "../src/lib/app/routes";

describe("app routing structure", () => {
	it("defines one route per wallet section", () => {
		for (const view of walletViewDefinitions) {
			expect(routes).toHaveProperty(view.path);
		}

		expect(routes).toHaveProperty("/");
		expect(routes).toHaveProperty("*");
	});

	it("keeps request-driven routes out of direct sidebar navigation", () => {
		expect(sidebarViewDefinitions.map((view) => view.value)).toEqual([
			"accounts",
			"send",
			"network-add",
			"swap",
			"settings",
		]);
	});

	it("maps extension side-panel actions to SPA routes", () => {
		expect(routePathForExtensionAction("connect")).toBe("/connect");
		expect(routePathForExtensionAction("sign")).toBe("/sign");
		expect(routePathForExtensionAction("auth")).toBe("/sign");
		expect(routePathForExtensionAction("network")).toBe("/network-add");
		expect(routePathForExtensionAction("swap")).toBe("/swap");
		expect(routePathForExtensionAction("unknown")).toBeUndefined();
	});
});
