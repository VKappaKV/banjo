import { describe, expect, it } from "vitest";
import * as arc59Client from "../src/lib/core/clients/Arc59Client";
import * as msigClient from "../src/lib/core/clients/MsigApp.client";
import { msigAbiContract } from "../src/lib/core/data/msig-abi";
import { builtInNetworks } from "../src/lib/core/data/networks";
import type {
	AccountInfo,
	Arc55App,
	BanjoAccount,
	BanjoMsig,
	Network,
	SeedData,
	WalletTransaction,
} from "../src/lib/core/types";

describe("core static artifacts", () => {
	it("includes the expected built-in networks", () => {
		const networkNames = builtInNetworks.map((network) => network.name);

		expect(networkNames).toEqual([
			"MainNet",
			"TestNet",
			"BetaNet",
			"FNet",
			"LocalNet",
		]);
	});

	it("preserves network metadata needed by later wallet services", () => {
		const byName = new Map(builtInNetworks.map((network) => [network.name, network]));
		const mainnet = byName.get("MainNet");
		const testnet = byName.get("TestNet");
		const localnet = byName.get("LocalNet");

		expect(mainnet?.algod.url).toBe("https://mainnet-api.4160.nodely.dev");
		expect(mainnet?.indexer?.url).toBe("https://mainnet-idx.4160.nodely.dev");
		expect(mainnet?.fallback?.algod.url).toBe("https://mainnet-api.algonode.network");
		expect(mainnet?.nfdUrl).toBe("https://api.nf.domains");
		expect(mainnet?.inboxRouter).toBe(2449590623);

		expect(testnet?.nfdUrl).toBe("https://api.testnet.nf.domains");
		expect(testnet?.inboxRouter).toBe(643020148);

		expect(localnet?.kmd).toEqual({
			url: "http://localhost",
			port: "4002",
			token: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
		});

	});

	it("constructs the ARC-55 ABI contract", () => {
		const methodNames = msigAbiContract.methods.map((method) => method.name);

		expect(methodNames).toContain("arc55_getThreshold");
		expect(methodNames).toContain("arc55_setup");
		expect(methodNames).toContain("destroy");
	});

	it("imports generated ARC clients", () => {
		expect(arc59Client.APP_SPEC.name).toBe("ARC59");
		expect(msigClient.APP_SPEC.name).toBe("MsigApp");
		expect(arc59Client).toHaveProperty("Arc59Client");
		expect(msigClient).toHaveProperty("MsigAppClient");
	});

	it("exports the Milestone 2 type vocabulary", () => {
		const account = { addr: "ADDR" } satisfies BanjoAccount;
		const seed = { id: 1 } satisfies SeedData;
		const walletTransaction = { txn: "base64" } satisfies WalletTransaction;
		const network = builtInNetworks[0] satisfies Network;

		expect(account.addr).toBe("ADDR");
		expect(seed.id).toBe(1);
		expect(walletTransaction.txn).toBe("base64");
		expect(network.name).toBe("MainNet");

		void (undefined as AccountInfo | Arc55App | BanjoMsig | undefined);
	});
});
