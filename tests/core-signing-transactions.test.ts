import { Buffer } from "buffer";
import algosdk, { type Algodv2, type SuggestedParams } from "algosdk";
import { describe, expect, it, vi } from "vitest";
import { createAndStoreBip39Seed, deriveHdAccounts, saveHotAccount } from "../src/lib/core/keys";
import {
	createApprovalTransactionSigner,
	signTransactions,
	signWalletTransactionRequest,
	signingErrorCodes,
	walletTransactionsFromGroup,
} from "../src/lib/core/signing";
import { createInitialWalletState } from "../src/lib/core/state";
import { MockCredentialProvider } from "../src/lib/core/testing/mock-credential";
import { MockLedgerProvider } from "../src/lib/core/testing/mock-ledger";
import { MockWalletStorage } from "../src/lib/core/testing/mock-storage";
import type { AccountHD, Arc55App } from "../src/lib/core/types";

vi.mock("falcon-1024", () => ({
	generateKey: () => ({
		publicKey: new Uint8Array(1793).fill(3),
		privateKey: new Uint8Array(2305).fill(4),
	}),
	signCompressed: () => new Uint8Array([9, 8, 7, 6]),
}));

const suggestedParams: SuggestedParams = {
	fee: 1000,
	minFee: 1000,
	firstValid: 1,
	lastValid: 1000,
	genesisHash: new Uint8Array(32),
	genesisID: "unitnet-v1",
	flatFee: true,
};

function paymentTxn(sender: string): algosdk.Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender,
		receiver: algosdk.generateAccount().addr.toString(),
		amount: 1,
		suggestedParams,
	});
}

function mockAlgod(accountInfo?: Partial<AccountHD>, compileResult?: Uint8Array): Algodv2 {
	return {
		accountInformation: (address: string) => ({
			do: async () => ({ address, amount: 0n, minBalance: 0n, ...accountInfo }),
		}),
		compile: () => ({
			do: async () => ({ result: Buffer.from(compileResult ?? new Uint8Array([1, 128])).toString("base64") }),
		}),
	} as unknown as Algodv2;
}

function expectThrownCode(error: unknown, code: number): void {
	expect(error).toMatchObject({ code });
}

describe("transaction signing core", () => {
	it("signs transactions with stored hot keys", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const ledgerProvider = new MockLedgerProvider();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });

		const transaction = paymentTxn(account.addr.toString());
		const [signed] = await signTransactions({
			transactions: [transaction],
			state,
			storage,
			ledgerProvider,
			credentialProvider: new MockCredentialProvider(),
		});

		const decoded = algosdk.decodeSignedTransaction(signed!);
		expect(decoded.txn.txID()).toBe(transaction.txID());
		expect(decoded.sig?.byteLength).toBe(64);
		expect(decoded.sgnr).toBeUndefined();
	});

	it("uses refreshed auth address before transaction sender", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const signer = algosdk.generateAccount();
		const sender = algosdk.generateAccount().addr.toString();
		await saveHotAccount({ account: signer, state, storage, markHot: true });
		state.accountInfo = [{ address: sender, authAddr: signer.addr } as AccountHD];

		const transaction = paymentTxn(sender);
		const [signed] = await signTransactions({
			transactions: [transaction],
			state,
			storage,
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
		});

		const decoded = algosdk.decodeSignedTransaction(signed!);
		expect(decoded.txn.sender.toString()).toBe(sender);
		expect(decoded.sgnr?.toString()).toBe(signer.addr.toString());
	});

	it("maps missing hot keys to account-not-found compatible errors", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const address = algosdk.generateAccount().addr.toString();
		state.accounts = [{ addr: address, hot: true }];

		try {
			await signTransactions({
				transactions: [paymentTxn(address)],
				state,
				storage,
				ledgerProvider: new MockLedgerProvider(),
				credentialProvider: new MockCredentialProvider(),
			});
		} catch (error) {
			expectThrownCode(error, signingErrorCodes.invalidRequest);
			return;
		}

		throw new Error("Expected signing to fail");
	});

	it("signs Ledger transactions and closes the provider", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const ledgerProvider = new MockLedgerProvider();
		const address = algosdk.generateAccount().addr.toString();
		state.accounts = [{ addr: address, slot: 2 }];

		const [signed] = await signTransactions({
			transactions: [paymentTxn(address)],
			state,
			storage,
			ledgerProvider,
			credentialProvider: new MockCredentialProvider(),
		});

		expect(algosdk.decodeSignedTransaction(signed!).sig?.byteLength).toBe(64);
		expect(ledgerProvider.closed).toBe(true);
	});

	it("maps Ledger rejection to 4001 and closes the provider", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const ledgerProvider = new MockLedgerProvider();
		const address = algosdk.generateAccount().addr.toString();
		state.accounts = [{ addr: address, slot: 2 }];
		ledgerProvider.rejectMessage = "User rejected on device";

		try {
			await signTransactions({
				transactions: [paymentTxn(address)],
				state,
				storage,
				ledgerProvider,
				credentialProvider: new MockCredentialProvider(),
			});
		} catch (error) {
			expectThrownCode(error, signingErrorCodes.userRejected);
			expect(ledgerProvider.closed).toBe(true);
			return;
		}

		throw new Error("Expected signing to fail");
	});

	it("signs password-protected HD seed transactions", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const { seedId, seed } = await createAndStoreBip39Seed({ passphrase: "secret", storage });
		const [accountInfo] = await deriveHdAccounts({
			seed: Buffer.from(seed),
			count: 1,
			algod: mockAlgod(),
			getAuthorizedAccounts: async () => [],
		});
		state.seeds = await storage.getAllSeeds();
		state.accounts = [{ addr: accountInfo!.address, seedId, slot: 0 }];

		await expect(signTransactions({
			transactions: [paymentTxn(accountInfo!.address)],
			state,
			storage,
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
		})).rejects.toMatchObject({ code: signingErrorCodes.invalidRequest });

		const [signed] = await signTransactions({
			transactions: [paymentTxn(accountInfo!.address)],
			state,
			storage,
			password: "secret",
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
		});

		expect(algosdk.decodeSignedTransaction(signed!).sig?.byteLength).toBe(64);
	});

	it("emits signed logic signature transactions for Falcon accounts", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const program = new Uint8Array([1, 128]);
		const logicSigAccount = new algosdk.LogicSigAccount(program);
		const address = logicSigAccount.address().toString();
		const { seedId } = await createAndStoreBip39Seed({ passphrase: "secret", storage });
		state.seeds = await storage.getAllSeeds();
		state.accounts = [{
			addr: address,
			seedId,
			falcon: { counter: 1, publicKey: Buffer.from(new Uint8Array(1793).fill(3)).toString("base64") },
		}];

		const [signed] = await signTransactions({
			transactions: [paymentTxn(address)],
			state,
			storage,
			password: "secret",
			algod: mockAlgod(undefined, program),
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
		});

		const decoded = algosdk.decodeSignedTransaction(signed!);
		expect(decoded.txn.sender.toString()).toBe(address);
		expect(decoded.lsig?.logic).toEqual(program);
		expect(decoded.lsig?.args).toEqual([new Uint8Array([9, 8, 7, 6])]);
		expect(decoded.sig).toBeUndefined();
	});

	it("attaches ARC-55 multisig bypass signatures", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const signer = algosdk.generateAccount();
		const secondSigner = algosdk.generateAccount().addr.toString();
		await saveHotAccount({ account: signer, state, storage, markHot: true });
		const metadata = {
			version: 1,
			threshold: 1,
			addrs: [signer.addr.toString(), secondSigner],
		};
		const multisigAddress = algosdk.multisigAddress(metadata).toString();
		const msig = {
			app: { addrs: metadata.addrs, arc55_threshold: metadata.threshold } as Arc55App,
			signerAddr: signer.addr.toString(),
			bypass: true,
		};

		const [signed] = await signTransactions({
			transactions: [paymentTxn(multisigAddress)],
			state,
			storage,
			msig,
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
		});

		const decoded = algosdk.decodeSignedTransaction(signed!);
		expect(decoded.txn.sender.toString()).toBe(multisigAddress);
		expect(decoded.msig?.v).toBe(1);
		expect(decoded.msig?.thr).toBe(1);
		expect(decoded.msig?.subsig).toHaveLength(2);
		expect(decoded.msig?.subsig[0]?.s?.byteLength).toBe(64);
		expect(decoded.msig?.subsig[1]?.s).toBeUndefined();
	});

	it("assembles wallet request responses with null for no-sign transactions", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });
		const signTxn = paymentTxn(account.addr.toString());
		const noSignTxn = paymentTxn(algosdk.generateAccount().addr.toString());

		const response = await signWalletTransactionRequest({
			walletTransactions: [
				...walletTransactionsFromGroup([signTxn]),
				...walletTransactionsFromGroup([noSignTxn], []),
			],
			context: {
				state,
				storage,
				ledgerProvider: new MockLedgerProvider(),
				credentialProvider: new MockCredentialProvider(),
			},
		});

		expect(response.signedTransactions[0]).toBeInstanceOf(Uint8Array);
		expect(response.signedTransactions[1]).toBeNull();
	});

	it("uses accepted signed transactions for no-sign request entries", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		const transaction = paymentTxn(account.addr.toString());
		const signed = transaction.signTxn(account.sk);

		const response = await signWalletTransactionRequest({
			walletTransactions: [{
				txn: algosdk.bytesToBase64(algosdk.encodeUnsignedTransaction(transaction)),
				stxn: algosdk.bytesToBase64(signed),
				signers: [],
			}],
			context: {
				state,
				storage,
				ledgerProvider: new MockLedgerProvider(),
				credentialProvider: new MockCredentialProvider(),
			},
		});

		expect(response.signedTransactions[0]).toEqual(signed);
	});

	it("rejects explicit signer constraints that do not include the resolved signer", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });

		try {
			await signWalletTransactionRequest({
				walletTransactions: walletTransactionsFromGroup([paymentTxn(account.addr.toString())]).map((item) => ({
					...item,
					signers: [algosdk.generateAccount().addr.toString()],
				})),
				context: {
					state,
					storage,
					ledgerProvider: new MockLedgerProvider(),
					credentialProvider: new MockCredentialProvider(),
				},
			});
		} catch (error) {
			expectThrownCode(error, signingErrorCodes.invalidRequest);
			return;
		}

		throw new Error("Expected signing to fail");
	});

	it("creates an approval-controller transaction signer", async () => {
		const account = algosdk.generateAccount();
		const txns = [paymentTxn(account.addr.toString()), paymentTxn(account.addr.toString())];
		const signed = txns[1]!.signTxn(account.sk);
		const signer = createApprovalTransactionSigner({
			async requestSignatureReview(request) {
				expect(request[0]?.signers).toEqual([]);
				expect(request[1]?.signers).toBeUndefined();

				return [null, signed];
			},
		});

		await expect(signer(txns, [1])).resolves.toEqual([signed]);
	});
});
