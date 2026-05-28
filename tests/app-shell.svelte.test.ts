// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { mount, unmount } from "svelte";
import { describe, expect, it } from "vitest";
import App from "../src/App.svelte";

describe("Banjo app shell", () => {
	it("renders the wallet shell", () => {
		const host = document.createElement("div");
		document.body.append(host);
		const app = mount(App, { target: host });

		expect(host.textContent).toContain("Banjo");
		expect(host.textContent).toContain("Wallet Shell");

		unmount(app);
		host.remove();
	});
});
