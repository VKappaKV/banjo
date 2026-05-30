import { describe, expect, it } from "vitest";
import type { WalletCoreServices } from "../src/lib/app/wallet-core";
import { WalletAppState } from "../src/lib/app/wallet-app-state.svelte";
import { builtInNetworks } from "../src/lib/core/data/networks";
import { noopLogger } from "../src/lib/core/logging";
import type { CredentialProvider, CryptoProvider, FetchJson, LedgerProvider, WalletRuntime } from "../src/lib/core/runtime";
import { walletSettingKeys } from "../src/lib/core/state";
import { MockWalletStorage } from "../src/lib/core/testing/mock-storage";

function createTestCore(storage = new MockWalletStorage()): WalletCoreServices {
	return {
		storage,
		runtime: { notify() {} } satisfies WalletRuntime,
		cryptoProvider: { supportsNonExtractableEd25519: async () => true } as CryptoProvider,
		credentialProvider: {} as CredentialProvider,
		ledgerProvider: { listLedgerDevices: async () => [] } satisfies LedgerProvider,
		fetchJson: (async () => ({})) as FetchJson,
		logger: noopLogger,
	};
}

describe("wallet app state", () => {
	it("initializes core state from storage", async () => {
		const storage = new MockWalletStorage();
		await storage.setAccounts([{ addr: "ACCOUNT" }]);
		const app = new WalletAppState({ core: createTestCore(storage) });

		await app.initialize();

		expect(app.initialized).toBe(true);
		expect(app.state.accounts).toEqual([{ addr: "ACCOUNT" }]);
		expect(app.state.networkName).toBe(builtInNetworks[0]?.name);
	});

	it("keeps UI notifications separate from wallet state", () => {
		const app = new WalletAppState({ core: createTestCore() });

		app.notify("Hello", "info", 0);

		expect(app.notifications).toHaveLength(1);
		expect(app.state.accounts).toEqual([]);
	});

	it("persists network switching through core storage", async () => {
		const storage = new MockWalletStorage();
		const app = new WalletAppState({ core: createTestCore(storage) });
		await app.initialize();
		const target = builtInNetworks.find((network) => network.name !== app.state.networkName)!;

		await app.switchNetwork(target.name);

		expect(app.state.networkName).toBe(target.name);
		expect(await storage.getAppValue(walletSettingKeys.networkName)).toBe(target.name);
	});

	it("resolves confirmation and modal signing promises", async () => {
		const app = new WalletAppState({ core: createTestCore() });
		const confirmation = app.requestConfirmation("Continue?");

		expect(app.confirmation?.message).toBe("Continue?");
		app.resolveConfirmation(true);
		await expect(confirmation).resolves.toBe(true);

		const signing = app.requestWalletTransactionApproval([{ txn: "abc" }]);

		expect(app.signingRequest?.walletTxns).toEqual([{ txn: "abc" }]);
		app.resolveSigningRequest(false);
		await expect(signing).resolves.toEqual([]);
	});
});
