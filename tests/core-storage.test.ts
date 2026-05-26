import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import type { modelsv2 } from "algosdk";
import { createIndexedDbWalletStorage } from "../src/lib/core/storage";

function databaseName() {
	return `banjo-test-${crypto.randomUUID()}`;
}

describe("indexeddb wallet storage", () => {
	it("reads, writes, and deletes app values", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });

		await storage.setAppValue("debug", true);
		expect(await storage.getAppValue("debug")).toBe(true);

		await storage.deleteAppValue("debug");
		expect(await storage.getAppValue("debug")).toBeUndefined();
	});

	it("reads and writes accounts", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });
		const accounts = [{ addr: "ACCOUNT" }];

		await storage.setAccounts(accounts);

		expect(await storage.getAccounts()).toEqual(accounts);
	});

	it("inserts and reads seed metadata", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });
		const id = await storage.putSeed({ salt: new Uint8Array([1, 2, 3]) });

		expect(id).toBe(1);
		expect(await storage.getAllSeeds()).toEqual([{ id, salt: new Uint8Array([1, 2, 3]) }]);
	});

	it("stores hot keys and lists hot key addresses", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });
		const key = { type: "private" } as CryptoKey;

		await storage.putHotKey("HOT", key);

		expect(await storage.getHotKey("HOT")).toEqual(key);
		expect(await storage.listHotKeyAddresses()).toEqual(["HOT"]);
	});

	it("stores cached assets for supported network stores", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });
		const asset = { index: 123n, params: { name: "Asset" } } as modelsv2.Asset;

		await storage.putAsset("MainNet", asset);

		expect(await storage.getAsset("MainNet", 123)).toEqual(asset);
	});

	it("ignores asset cache writes for unsupported networks", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });
		const asset = { index: 123n, params: { name: "Asset" } } as modelsv2.Asset;

		await storage.putAsset("CustomNet", asset);

		expect(await storage.getAsset("CustomNet", 123)).toBeUndefined();
	});
});
