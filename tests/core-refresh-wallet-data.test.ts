import type { Algodv2 } from "algosdk";
import { describe, expect, it, vi } from "vitest";
import { refreshWalletData } from "../src/lib/core/accounts";
import { createInitialWalletState, type WalletState } from "../src/lib/core/state";
import type { AccountHD } from "../src/lib/core/types";

function state(patch: Partial<WalletState> = {}): WalletState {
	return { ...createInitialWalletState(), ...patch };
}

function createAlgod(records: Record<string, Partial<AccountHD>>): Algodv2 {
	return {
		accountInformation: (address: string) => ({
			do: async () => ({ address, amount: 1n, ...records[address] }),
		}),
	} as unknown as Algodv2;
}

describe("refreshWalletData", () => {
	it("refreshes stored accounts for the selected network and reverse looks up names", async () => {
		const reverseLookup = vi.fn(async (addresses: string[]) => ({
			A: { name: "a.algo" },
			C: { name: "c.algo" },
		}));

		const result = await refreshWalletData({
			state: state({
				networkName: "TestNet",
				accounts: [
					{ addr: "A", network: "TestNet" },
					{ addr: "B", network: "MainNet" },
					{ addr: "C" },
				],
			}),
			algod: createAlgod({ A: {}, C: {} }),
			getAuthorizedAccounts: async () => [],
			reverseLookup,
		});

		expect(result.accountInfo.map((account) => account.address)).toEqual(["A", "C"]);
		expect(reverseLookup).toHaveBeenCalledWith(["A", "C"]);
		expect(result.namespaceRecords).toEqual({ A: { name: "a.algo" }, C: { name: "c.algo" } });
	});

	it("includes accounts rekeyed to local signers without duplicating stored accounts", async () => {
		const getAuthorizedAccounts = vi.fn(async (address: string) =>
			address === "SIGNER" ? ["REKEYED", "STORED"] : [],
		);

		const result = await refreshWalletData({
			state: state({ accounts: [{ addr: "SIGNER" }, { addr: "STORED" }] }),
			algod: createAlgod({ SIGNER: {}, REKEYED: { authAddr: "SIGNER" }, STORED: { authAddr: "SIGNER" } }),
			getAuthorizedAccounts,
		});

		expect(result.accountInfo.map((account) => account.address)).toEqual(["SIGNER", "REKEYED", "STORED"]);
		expect(getAuthorizedAccounts).toHaveBeenCalledWith("SIGNER", undefined);
	});

	it("derives and refreshes HD sibling account information", async () => {
		const deriveHdAddress = vi.fn(async (_xpub: string, index: number) => `CHILD${index}`);

		const result = await refreshWalletData({
			state: state({ accounts: [{ addr: "ROOT", xpub: "xpub", idxs: [1, 2] }] }),
			algod: createAlgod({ ROOT: {}, CHILD1: {}, CHILD2: {} }),
			getAuthorizedAccounts: async () => [],
			deriveHdAddress,
		});

		expect(result.accountInfo).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ address: "CHILD1", sibling: "ROOT", addrIdx: 1 }),
				expect.objectContaining({ address: "CHILD2", sibling: "ROOT", addrIdx: 2 }),
			]),
		);
		expect(deriveHdAddress).toHaveBeenCalledTimes(2);
	});

	it("returns empty namespace records when no reverse lookup is supplied", async () => {
		const result = await refreshWalletData({
			state: state({ accounts: [{ addr: "A" }] }),
			algod: createAlgod({ A: {} }),
			getAuthorizedAccounts: async () => [],
		});

		expect(result.namespaceRecords).toEqual({});
	});
});
