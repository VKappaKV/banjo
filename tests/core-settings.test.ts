import { describe, it, expect, vi, afterEach } from "vitest";
import { MockWalletStorage } from "../src/lib/core/testing/mock-storage";
import {
	setSelectedNetworkName,
	setCustomNetworks,
	setDebugEnabled,
	setSnoopEnabled,
	setLedgerSelectEnabled,
	setExperimentalEnabled,
	setFallbackEnabled,
	setSandboxRouter,
	walletSettingKeys,
} from "../src/lib/core/state/settings";
import type { Network } from "../src/lib/core/types";

describe("settings setters", () => {
	it("setSelectedNetworkName persists and retrieves", async () => {
		const storage = new MockWalletStorage();

		await setSelectedNetworkName(storage, "TestNet");
		expect(await storage.getAppValue(walletSettingKeys.networkName)).toBe("TestNet");
	});

	it("setDebugEnabled persists true", async () => {
		const storage = new MockWalletStorage();

		await setDebugEnabled(storage, true);
		expect(await storage.getAppValue(walletSettingKeys.debug)).toBe(true);
	});

	it("setSnoopEnabled persists false", async () => {
		const storage = new MockWalletStorage();

		await setSnoopEnabled(storage, false);
		expect(await storage.getAppValue(walletSettingKeys.snoop)).toBe(false);
	});

	it("setLedgerSelectEnabled persists", async () => {
		const storage = new MockWalletStorage();

		await setLedgerSelectEnabled(storage, true);
		expect(await storage.getAppValue(walletSettingKeys.ledgerSelect)).toBe(true);
	});

	it("setExperimentalEnabled persists", async () => {
		const storage = new MockWalletStorage();

		await setExperimentalEnabled(storage, true);
		expect(await storage.getAppValue(walletSettingKeys.experimental)).toBe(true);
	});

	it("setFallbackEnabled persists", async () => {
		const storage = new MockWalletStorage();

		await setFallbackEnabled(storage, true);
		expect(await storage.getAppValue(walletSettingKeys.fallback)).toBe(true);
	});

	it("setFallbackEnabled toggles off", async () => {
		const storage = new MockWalletStorage();
		await setFallbackEnabled(storage, true);

		await setFallbackEnabled(storage, false);
		expect(await storage.getAppValue(walletSettingKeys.fallback)).toBe(false);
	});

	it("setSandboxRouter persists a number", async () => {
		const storage = new MockWalletStorage();

		await setSandboxRouter(storage, 12345);
		expect(await storage.getAppValue(walletSettingKeys.sandboxRouter)).toBe(12345);
	});

	it("setSandboxRouter deletes when undefined", async () => {
		const storage = new MockWalletStorage();
		await setSandboxRouter(storage, 12345);

		await setSandboxRouter(storage, undefined);
		expect(await storage.getAppValue(walletSettingKeys.sandboxRouter)).toBeUndefined();
	});

	it("setCustomNetworks persists a list", async () => {
		const storage = new MockWalletStorage();
		const networks: Network[] = [
			{
				name: "MyNet",
				algod: { url: "http://localhost", port: "4001", token: "aaa" },
				genesisID: "my-genesis",
				explorer: "http://explorer",
			},
		];

		await setCustomNetworks(storage, networks);
		const stored = await storage.getAppValue<Network[]>(walletSettingKeys.customNetworks);
		expect(stored).toHaveLength(1);
		expect(stored![0].name).toBe("MyNet");
	});

	it("multiple settings coexist", async () => {
		const storage = new MockWalletStorage();

		await setDebugEnabled(storage, true);
		await setSnoopEnabled(storage, true);
		await setExperimentalEnabled(storage, false);

		expect(await storage.getAppValue(walletSettingKeys.debug)).toBe(true);
		expect(await storage.getAppValue(walletSettingKeys.snoop)).toBe(true);
		expect(await storage.getAppValue(walletSettingKeys.experimental)).toBe(false);
	});
});

describe("settings overwrite", () => {
	it("overwrites previous value", async () => {
		const storage = new MockWalletStorage();

		await setSelectedNetworkName(storage, "MainNet");
		await setSelectedNetworkName(storage, "TestNet");
		expect(await storage.getAppValue(walletSettingKeys.networkName)).toBe("TestNet");
	});
});

describe("IndexedDB settings round-trip", () => {
	it("writes and reads debug setting through real storage", async () => {
		// Dynamic import to avoid fake-indexeddb interference with other tests
		const mod = await import("fake-indexeddb/auto");
		const { createIndexedDbWalletStorage } = await import(
			"../src/lib/core/storage/indexeddb-storage"
		);
		const dbName = `banjo-test-settings-${crypto.randomUUID()}`;
		const storage = createIndexedDbWalletStorage({ databaseName: dbName });

		await setDebugEnabled(storage, true);
		expect(await storage.getAppValue(walletSettingKeys.debug)).toBe(true);
	});
});
