import { describe, expect, it, vi } from "vitest";
import { createMemoryLogger, redactLogFields } from "./index";

describe("structured logger", () => {
	it("redacts sensitive fields and summarizes binary payloads", () => {
		const address = "A".repeat(58);
		const fields = redactLogFields({
			address,
			mnemonic: "one two three",
			password: "secret",
			signedTxn: Uint8Array.from([1, 2, 3]),
			payload: Uint8Array.from([4, 5, 6]),
			nested: { secretKey: "super-secret", authData: "raw-auth" },
		});

		expect(fields).toMatchObject({
			address: "AAAAAA...AAAA",
			mnemonic: "[REDACTED]",
			password: "[REDACTED]",
			signedTxn: "[REDACTED]",
			payload: "[Uint8Array length=3]",
			nested: { secretKey: "[REDACTED]", authData: "[REDACTED]" },
		});
		expect(JSON.stringify(fields)).not.toContain("one two three");
		expect(JSON.stringify(fields)).not.toContain("raw-auth");
	});

	it("handles circular objects and truncates long arrays", () => {
		const circular: Record<string, unknown> = { label: "root" };
		circular.self = circular;
		const fields = redactLogFields({ circular, items: Array.from({ length: 22 }, (_, index) => index) });

		expect(fields?.circular).toMatchObject({ label: "root", self: "[Circular]" });
		expect(fields?.items).toHaveLength(21);
		expect((fields?.items as unknown[]).at(-1)).toBe("[truncated 2]");
	});

	it("keeps a bounded in-memory buffer", () => {
		const logger = createMemoryLogger({ maxEntries: 2 });

		logger.info({ namespace: "test", event: "one" });
		logger.warn({ namespace: "test", event: "two" });
		logger.error({ namespace: "test", event: "three", error: new Error("boom") });

		expect(logger.entries().map((entry) => entry.event)).toEqual(["two", "three"]);
		expect(logger.export()).toContain("boom");
	});

	it("gates console output behind debug mode", () => {
		let debug = false;
		const sink = {
			debug: vi.fn(),
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
		};
		const logger = createMemoryLogger({ consoleEnabled: () => debug, consoleSink: sink });

		logger.debug({ namespace: "test", event: "hidden" });
		expect(sink.debug).not.toHaveBeenCalled();

		debug = true;
		logger.debug({ namespace: "test", event: "visible" });
		expect(sink.debug).toHaveBeenCalledTimes(1);
		expect(sink.debug.mock.calls[0]?.[1]).toMatchObject({ event: "visible" });
	});
});
