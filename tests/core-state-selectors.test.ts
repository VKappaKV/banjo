import { describe, expect, it } from "vitest";
import type { AccountHD, Arc55App, WalletState } from "../src/lib/core";
import { builtInNetworks } from "../src/lib/core/data/networks";
import {
	createInitialWalletState,
	getNativeAsset,
	isVoiNetwork,
	selectAccountInfo,
	selectAllNetworks,
	selectMsigSigner,
	selectNetwork,
	selectSendAccounts,
	selectSigningAccounts,
} from "../src/lib/core/state";

const hotAddress = "HOT0000000000000000000000000000000000000000000000000000000";
const watchAddress = "WATCH000000000000000000000000000000000000000000000000000";
const rekeyAddress = "REKEY000000000000000000000000000000000000000000000000000";
const hdRootAddress = "HDROOT00000000000000000000000000000000000000000000000000";
const hdChildAddress = "HDCHILD0000000000000000000000000000000000000000000000000";
const appAddress = "APP000000000000000000000000000000000000000000000000000000";
const ledgerAddress = "LEDGER00000000000000000000000000000000000000000000000000";
const falconAddress = "FALCON00000000000000000000000000000000000000000000000000";

function accountInfo(address: string, extra: Partial<AccountHD> = {}): AccountHD {
	return { address, ...extra } as AccountHD;
}

function state(patch: Partial<WalletState> = {}): WalletState {
	return { ...createInitialWalletState(), ...patch };
}

describe("wallet state selectors", () => {
	it("builds account display records with namespace metadata", () => {
		const selected = selectAccountInfo(
			state({
				accounts: [{ addr: hotAddress }],
				hotKeyAddresses: [hotAddress],
				namespaceRecords: { [hotAddress]: { name: "hot.algo" } },
			}),
		);

		expect(selected).toMatchObject([
			{ addr: hotAddress, isHot: true, canSign: true, ns: { name: "hot.algo" } },
		]);
	});

	it("hides hot accounts when hot wallet support is disabled", () => {
		const selected = selectAccountInfo(
			state({ accounts: [{ addr: hotAddress }], hotKeyAddresses: [hotAddress], hotWalletEnabled: false }),
		);

		expect(selected).toEqual([]);
	});

	it("includes rekeyed subaccounts for signable authorizing accounts", () => {
		const selected = selectAccountInfo(
			state({
				accounts: [{ addr: hotAddress }],
				hotKeyAddresses: [hotAddress],
				accountInfo: [accountInfo(rekeyAddress, { authAddr: hotAddress })],
			}),
		);

		expect(selected).toEqual(
		expect.arrayContaining([expect.objectContaining({ addr: rekeyAddress, subType: "rekey", canSign: true })]),
		);
	});

	it("includes HD sibling accounts", () => {
		const selected = selectAccountInfo(
			state({
				accounts: [{ addr: hdRootAddress, xpub: "xpub", seedId: 7 }],
				accountInfo: [accountInfo(hdChildAddress, { sibling: hdRootAddress, addrIdx: 1 })],
			}),
		);

		expect(selected).toEqual(
		expect.arrayContaining([expect.objectContaining({ addr: hdChildAddress, subType: "hd", seedId: 7 })]),
		);
	});

	it("filters sendable and signable accounts separately", () => {
		const selectedState = state({
			accounts: [{ addr: hotAddress }, { addr: appAddress, appId: 99n }, { addr: watchAddress }],
			hotKeyAddresses: [hotAddress],
		});

		expect(selectSendAccounts(selectedState).map((account) => account.addr)).toEqual([hotAddress, appAddress]);
		expect(selectSigningAccounts(selectedState).map((account) => account.addr)).toEqual([hotAddress]);
	});

	it("marks Ledger slot and Falcon accounts as signable", () => {
		const selectedState = state({
			accounts: [
				{ addr: ledgerAddress, slot: 0 },
				{ addr: falconAddress, falcon: { counter: 1, publicKey: "public-key" } },
			],
		});

		expect(selectSigningAccounts(selectedState).map((account) => account.addr)).toEqual([
			ledgerAddress,
			falconAddress,
		]);
	});

	it("selects multisig signer by voting power", () => {
		const signer = selectMsigSigner(
			{ addrs: [watchAddress, hotAddress, hotAddress], groups: [] } as unknown as Arc55App,
			[
				{ addr: watchAddress, title: "watch", isHot: false, canSign: true, globalIdx: 0 },
				{ addr: hotAddress, title: "hot", isHot: true, canSign: true, globalIdx: 1 },
			],
		);

		expect(signer).toBe(hotAddress);
	});

	it("builds custom network overrides by genesis ID", () => {
		const networks = selectAllNetworks(builtInNetworks, [
			{
				name: "MainNet Override",
				algod: { url: "https://override", port: "", token: "" },
				genesisID: "mainnet-v1.0",
				explorer: "https://explorer",
			},
		]);

		expect(networks.find((network) => network.name === "MainNet")?.algod.url).toBe("https://override");
	});

	it("injects LocalNet sandbox router without mutating static data", () => {
		const before = builtInNetworks.find((network) => network.name === "LocalNet")?.inboxRouter;
		const selected = selectNetwork(state({ networkName: "LocalNet", sandboxRouter: 123 }), builtInNetworks);
		const after = builtInNetworks.find((network) => network.name === "LocalNet")?.inboxRouter;

		expect(selected.inboxRouter).toBe(123);
		expect(after).toBe(before);
	});

	it("produces native asset metadata for Algo and Voi", () => {
		expect(getNativeAsset("MainNet").params.name).toBe("Algo");
		expect(getNativeAsset("Voi MainNet").params.name).toBe("Voi");
		expect(isVoiNetwork("Voi MainNet")).toBe(true);
	});
});
