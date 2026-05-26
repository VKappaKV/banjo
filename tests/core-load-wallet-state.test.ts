import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { builtInNetworks } from "../src/lib/core/data/networks";
import { loadWalletState, setDebugEnabled, setSandboxRouter, walletSettingKeys } from "../src/lib/core/state";
import { createIndexedDbWalletStorage } from "../src/lib/core/storage";

function databaseName() {
	return `banjo-load-test-${crypto.randomUUID()}`;
}

describe("loadWalletState", () => {
	it("loads persisted accounts, seeds, hot keys, and settings", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });
		const key = { type: "private" } as CryptoKey;

		await storage.setAccounts([{ addr: "ACCOUNT" }]);
		await storage.putSeed({ credentialId: "credential" });
		await storage.putHotKey("ACCOUNT", key);
		await storage.setAppValue(walletSettingKeys.networkName, "TestNet");
		await storage.setAppValue(walletSettingKeys.snoop, true);
		await storage.setAppValue(walletSettingKeys.ledgerSelect, true);
		await storage.setAppValue(walletSettingKeys.experimental, true);
		await storage.setAppValue(walletSettingKeys.fallback, true);
		await setDebugEnabled(storage, true);
		await setSandboxRouter(storage, 123);

		const loaded = await loadWalletState({
			storage,
			cryptoProvider: { supportsNonExtractableEd25519: async () => true },
		});

		expect(loaded.accounts).toEqual([{ addr: "ACCOUNT" }]);
		expect(loaded.networkName).toBe("TestNet");
		expect(loaded.hotKeyAddresses).toEqual(["ACCOUNT"]);
		expect(loaded.seeds).toEqual([{ id: 1, credentialId: "credential" }]);
		expect(loaded.debug).toBe(true);
		expect(loaded.snoop).toBe(true);
		expect(loaded.ledgerSelect).toBe(true);
		expect(loaded.experimental).toBe(true);
		expect(loaded.fallbackEnabled).toBe(true);
		expect(loaded.sandboxRouter).toBe(123);
	});

	it("defaults selected network when stored network is invalid", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });

		await storage.setAppValue(walletSettingKeys.networkName, "Unknown");

		const loaded = await loadWalletState({
			storage,
			cryptoProvider: { supportsNonExtractableEd25519: async () => true },
		});

		expect(loaded.networkName).toBe(builtInNetworks[0]?.name);
	});

	it("disables hot wallet when non-extractable Ed25519 is unsupported", async () => {
		const storage = createIndexedDbWalletStorage({ databaseName: databaseName() });

		const loaded = await loadWalletState({
			storage,
			cryptoProvider: { supportsNonExtractableEd25519: async () => false },
		});

		expect(loaded.hotWalletEnabled).toBe(false);
	});
});
