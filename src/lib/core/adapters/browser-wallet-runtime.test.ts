import { describe, expect, it } from "vitest";
import { createMemoryLogger } from "$core/logging";
import { createBrowserWalletRuntime } from "./browser-wallet-runtime";

describe("browser wallet runtime", () => {
	it("delegates legacy debug logs to the structured logger", () => {
		const logger = createMemoryLogger();
		const runtime = createBrowserWalletRuntime({ logger });

		runtime.logDebug?.("sign-request", { seed: "never", payload: Uint8Array.from([1, 2]) });

		expect(logger.entries()).toHaveLength(1);
		expect(logger.entries()[0]).toMatchObject({ namespace: "legacy", event: "sign-request" });
		expect(JSON.stringify(logger.entries()[0])).not.toContain("never");
		expect(JSON.stringify(logger.entries()[0])).toContain("[Uint8Array length=2]");
	});
});
