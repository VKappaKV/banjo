import { Buffer } from "buffer";
import { describe, expect, it } from "vitest";
import algosdk, { type Algodv2, type modelsv2 } from "algosdk";
import { createInitialWalletState, selectAccountInfo } from "../state";
import { addHdAccounts, addLedgerAccounts, addWatchAccount } from "../accounts";
import { MockCredentialProvider } from "../testing/mock-credential";
import { MockLedgerProvider } from "../testing/mock-ledger";
import { MockWalletStorage } from "../testing/mock-storage";
import type { AccountSubs } from "../types";
import {
	banjoPasskeyRpName,
	banjoPasskeyUserName,
	createAndStoreBip39Seed,
	decryptStoredSeed,
	deriveFalconKeyPair,
	deriveHdAddress,
	deriveHdAccounts,
	discoverLedgerAccounts,
	getFalconLsigTeal,
	hotSign,
	importKmdAccounts,
	importHotMnemonic,
	registerPasskeySeed,
	SeedError,
	signWithHdSeed,
	signWithLedger,
} from "./index";

function mockAlgod(addresses?: string[]): Algodv2 {
	const addressSet = addresses ?? [];

	return {
		accountInformation(address: string) {
			return {
				async do() {
					return { address, amount: 0, assets: [] } as unknown as modelsv2.Account;
				},
			};
		},
		compile() {
			return {
				async do() {
					return { result: Buffer.from(new Uint8Array([1, ...new Uint8Array(15)])).toString("base64") };
				},
			};
		},
		_getMockAddresses: () => addressSet,
	} as unknown as Algodv2;
}

describe("seed encryption", () => {
	it("stores and decrypts BIP39 seed data", async () => {
		const storage = new MockWalletStorage();
		const { seedId, seed } = await createAndStoreBip39Seed({ passphrase: "secret", storage });
		const stored = storage.seeds.get(seedId);

		expect(stored?.salt?.byteLength).toBe(12);
		expect(stored?.iv?.byteLength).toBe(12);
		expect(stored?.data).toBeInstanceOf(ArrayBuffer);

		const decrypted = await decryptStoredSeed({ passphrase: "secret", seedData: stored! });
		expect(decrypted.equals(seed)).toBe(true);
		seed.fill(0);
		decrypted.fill(0);
	});

	it("rejects bad password and bad seed data", async () => {
		const storage = new MockWalletStorage();
		const { seedId, seed } = await createAndStoreBip39Seed({ passphrase: "secret", storage });
		seed.fill(0);

		await expect(decryptStoredSeed({ passphrase: "wrong", seedData: storage.seeds.get(seedId)! })).rejects.toThrow();
		await expect(decryptStoredSeed({ passphrase: "secret", seedData: { id: 999 } })).rejects.toBeInstanceOf(
			SeedError,
		);
	});
});

describe("passkey seed flow", () => {
	it("uses Banjo-branded registration values and stores the credential id", async () => {
		const storage = new MockWalletStorage();
		const credentialProvider = new MockCredentialProvider();
		const result = await registerPasskeySeed({ storage, credentialProvider });

		expect(result.credentialId).toBe(credentialProvider.credentialId);
		expect(storage.seeds.get(result.seedId)?.credentialId).toBe(credentialProvider.credentialId);
		expect(credentialProvider.lastCreateOptions?.publicKey?.rp.name).toBe(banjoPasskeyRpName);
		expect(credentialProvider.lastCreateOptions?.publicKey?.user.name).toBe(banjoPasskeyUserName);
		result.seed.fill(0);
	});
});

describe("hot accounts", () => {
	it("imports a mnemonic, stores a non-extractable key, and signs", async () => {
		const storage = new MockWalletStorage();
		const state = createInitialWalletState();
		const generated = algosdk.generateAccount();
		const mnemonic = algosdk.secretKeyToMnemonic(generated.sk);
		const account = await importHotMnemonic({ mnemonic, state, storage });
		const key = await storage.getHotKey(account.addr);

		expect(key?.extractable).toBe(false);
		expect(state.accounts).toEqual([{ addr: account.addr }]);
		expect(state.hotKeyAddresses).toContain(account.addr);
		expect(selectAccountInfo(state).find((item) => item.addr === account.addr)?.canSign).toBe(true);

		const signature = await hotSign({ address: account.addr, bytesToSign: new Uint8Array([1, 2, 3]), storage });
		expect(signature.byteLength).toBe(64);
	});

	it("throws compatible account-not-found behavior for missing hot keys", async () => {
		const storage = new MockWalletStorage();

		await expect(
			hotSign({ address: algosdk.generateAccount().addr.toString(), bytesToSign: new Uint8Array([1]), storage }),
		).rejects.toMatchObject({ code: 4300 });
	});
});

describe("account mutations", () => {
	it("adds watch accounts and rejects duplicates", async () => {
		const storage = new MockWalletStorage();
		const state = createInitialWalletState();
		const address = algosdk.generateAccount().addr.toString();

		await addWatchAccount({ address, state, storage });
		await expect(addWatchAccount({ address, state, storage })).rejects.toThrow("Account Already Exists");
	});
});

describe("HD derivation", () => {
	it("discovers accounts in chunks, derives child addresses, and zeroizes consumed signing seed", async () => {
		const storage = new MockWalletStorage();
		const { seed } = await createAndStoreBip39Seed({ passphrase: "secret", storage });
		const accounts = await deriveHdAccounts({
			seed,
			algod: mockAlgod(),
			getAuthorizedAccounts: async () => [algosdk.generateAccount().addr.toString()],
		});

		expect(accounts).toHaveLength(4);
		expect(accounts[0]?.subs).toHaveLength(1);
		expect(accounts[0]?.xpub).toEqual(expect.any(String));
		await expect(deriveHdAddress(accounts[0]!.xpub!, 1)).resolves.toHaveLength(58);

		const signingSeed = Buffer.from(seed);
		const signature = await signWithHdSeed({ accountSlot: 0, seed: signingSeed, bytesToSign: new Uint8Array([1]) });
		expect(signature.byteLength).toBe(64);
		expect([...signingSeed]).toEqual(new Array(signingSeed.length).fill(0));
		seed.fill(0);
	});

	it("preserves HD slot mapping across candidates", async () => {
		const storage = new MockWalletStorage();
		const state = createInitialWalletState();
		const candidates = [
			{ address: algosdk.generateAccount().addr.toString(), xpub: "a" },
			{ address: algosdk.generateAccount().addr.toString(), xpub: "b" },
			{ address: algosdk.generateAccount().addr.toString(), xpub: "c" },
		] as AccountSubs[];

		const added = await addHdAccounts({
			selected: [candidates[2]!],
			allCandidates: candidates,
			seedId: 10,
			state,
			storage,
		});

		expect(added[0]).toMatchObject({ slot: 2, seedId: 10, xpub: "c" });
	});
});

describe("Ledger", () => {
	it("discovers ledger accounts and preserves selected slot mapping", async () => {
		const storage = new MockWalletStorage();
		const state = createInitialWalletState();
		const ledger = new MockLedgerProvider();
		ledger.addresses.set(0, algosdk.generateAccount().addr.toString());
		ledger.addresses.set(1, algosdk.generateAccount().addr.toString());

		const candidates = await discoverLedgerAccounts({
			ledgerProvider: ledger,
			algod: mockAlgod(),
			count: 2,
			getAuthorizedAccounts: async () => [],
		});
		const added = await addLedgerAccounts({
			selected: [candidates[1]!],
			allCandidates: candidates,
			state,
			storage,
		});

		expect(ledger.closed).toBe(true);
		expect(added[0]).toMatchObject({ slot: 1 });
	});

	it("maps user rejection to 4001", async () => {
		const ledger = new MockLedgerProvider();
		ledger.rejectMessage = "Transaction rejected by user";

		await expect(
			signWithLedger({ ledgerProvider: ledger, accountSlot: 0, transactionBytes: new Uint8Array([1]) }),
		).rejects.toMatchObject({ code: 4001 });
	});
});

describe("KMD import", () => {
	it("stores selected exported keys as hot accounts", async () => {
		const storage = new MockWalletStorage();
		const state = createInitialWalletState();
		const account = algosdk.generateAccount();
		const added = await importKmdAccounts({
			selectedAddresses: [account.addr.toString()],
			privateAccounts: [account],
			state,
			storage,
		});

		expect(added).toEqual([{ addr: account.addr.toString(), hot: true }]);
		expect(await storage.getHotKey(account.addr.toString())).toBeDefined();
	});
});

describe("Falcon", () => {
	it("derives deterministic keypairs and fills the lsig template", async () => {
		const seed = new Uint8Array(32).fill(3);
		const mockGenerateKey = (derivedSeed: Uint8Array) => ({
			publicKey: derivedSeed.slice(0, 16),
			privateKey: derivedSeed.slice(16, 32),
		});
		const first = await deriveFalconKeyPair(seed, mockGenerateKey);
		const second = await deriveFalconKeyPair(seed, mockGenerateKey);

		expect(Buffer.from(first.publicKey).equals(Buffer.from(second.publicKey))).toBe(true);
		expect(getFalconLsigTeal(1, first.publicKey)).toContain("bytecblock 0x01");
		expect(getFalconLsigTeal(1, first.publicKey)).toContain(Buffer.from(first.publicKey).toString("hex"));
	});
});
