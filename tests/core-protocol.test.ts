import algosdk, { type Algodv2, type SuggestedParams } from "algosdk";
import { describe, expect, it } from "vitest";
import { saveHotAccount } from "../src/lib/core/keys";
import {
	approveDappNetworkRequest,
	base64ToBytes,
	base64UrlToBytes,
	buildConnectResponse,
	buildSwapProtocolAcceptancePlan,
	bytesToBase64,
	bytesToBase64Url,
	completeSignDataProtocolRequest,
	completeSignTransactionsProtocolRequest,
	completeSwapProtocolAcceptance,
	deserializeSignDataResponseFromExtension,
	deserializeSignTransactionsResponseFromExtension,
	hashDomainForAuthenticatorData,
	normalizeProtocolError,
	prepareSignDataProtocolRequest,
	prepareSignTransactionsProtocolRequest,
	prepareSwapProtocolRequest,
	ProtocolError,
	protocolErrorCodes,
	resolveConnectNetwork,
	serializeSignDataResponseForExtension,
	serializeSignTransactionsResponseForExtension,
	validateDappNetworkRequest,
} from "../src/lib/core/protocol";
import { createInitialWalletState, walletSettingKeys } from "../src/lib/core/state";
import { MockCredentialProvider } from "../src/lib/core/testing/mock-credential";
import { MockLedgerProvider } from "../src/lib/core/testing/mock-ledger";
import { MockWalletStorage } from "../src/lib/core/testing/mock-storage";
import { buildAtomicSwapProposal, serializeSwapProposal } from "../src/lib/core/transactions";
import type { Network, SignDataMetadata, Siwa, WalletTransaction } from "../src/lib/core";

const genesisHash = Uint8Array.from({ length: 32 }, (_, index) => index + 1);
const suggestedParams: SuggestedParams = {
	fee: 1000,
	minFee: 1000,
	firstValid: 10,
	lastValid: 1000,
	genesisHash,
	genesisID: "unitnet-v1",
	flatFee: true,
};
const network: Network = {
	name: "UnitNet",
	algod: { url: "https://algod.example", port: "443", token: "" },
	genesisID: "unitnet-v1",
	genesisHash: algosdk.bytesToBase64(genesisHash),
	explorer: "https://explorer.example",
};
const dockernet: Network = { ...network, name: "DockerNet", genesisID: "dockernet-v1" };
const metadata: SignDataMetadata = { scope: 1, encoding: "base64" };

function paymentTxn(sender: string): algosdk.Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender,
		receiver: algosdk.generateAccount().addr,
		amount: 1,
		suggestedParams,
	});
}

function walletTransaction(transaction: algosdk.Transaction): WalletTransaction {
	return { txn: algosdk.bytesToBase64(algosdk.encodeUnsignedTransaction(transaction)) };
}

function canonicalJson(value: unknown): string {
	if (value === null || typeof value !== "object") {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map(canonicalJson).join(",")}]`;
	}

	const object = value as Record<string, unknown>;

	return `{${Object.keys(object)
		.sort()
		.map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
		.join(",")}}`;
}

function siwa(accountAddress: string): Siwa {
	return {
		account_address: accountAddress,
		chain_id: "283",
		domain: "example.com",
		type: "ed25519",
		uri: "https://example.com/login",
		version: "1",
	};
}

function createAlgod(lastRound: bigint): Algodv2 {
	return {
		status: () => ({ do: async () => ({ lastRound }) }),
	} as unknown as Algodv2;
}

describe("wallet protocol core", () => {
	it("serializes base64, base64url, and extension response payloads", () => {
		const bytes = Uint8Array.from([251, 255, 238, 1]);
		const encoded = bytesToBase64(bytes);
		const urlEncoded = bytesToBase64Url(bytes);
		const signResponse = { action: "signed" as const, txns: [bytes, null] };
		const extensionSignResponse = serializeSignTransactionsResponseForExtension(signResponse);

		expect(Array.from(base64ToBytes(encoded))).toEqual(Array.from(bytes));
		expect(urlEncoded).not.toContain("+");
		expect(urlEncoded).not.toContain("/");
		expect(urlEncoded).not.toContain("=");
		expect(Array.from(base64UrlToBytes(urlEncoded))).toEqual(Array.from(bytes));
		expect(extensionSignResponse).toEqual({ action: "signed", txns: [encoded, null] });
		expect(deserializeSignTransactionsResponseFromExtension(extensionSignResponse).txns).toEqual([bytes, null]);
	});

	it("normalizes protocol-compatible errors", () => {
		const response = normalizeProtocolError(
			new ProtocolError("No thanks", protocolErrorCodes.userRejected, { requestId: 7 }),
		);

		expect(response).toEqual({
			action: "error",
			code: 4001,
			error: "No thanks",
			data: { requestId: 7 },
		});
	});

	it("resolves connect networks and builds connect responses", () => {
		const account = algosdk.generateAccount();

		expect(resolveConnectNetwork({ genesisID: "sandnet-v1", networks: [dockernet] })).toBe(dockernet);
		expect(buildConnectResponse([account.addr.toString()], true)).toEqual({
			action: "connect",
			addrs: [account.addr.toString()],
			debug: true,
		});
		expect(() => resolveConnectNetwork({ genesisID: "unknown-v1", networks: [network] })).toThrow("Unknown Network");
		expect(() => buildConnectResponse(["bad-address"])).toThrow("Invalid Address");
	});

	it("prepares and completes transaction signing protocol requests", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });
		const transaction = paymentTxn(account.addr.toString());
		const txns = [walletTransaction(transaction)];
		const prepared = prepareSignTransactionsProtocolRequest({ walletTransactions: txns, networks: [network] });

		expect(prepared.network).toBe(network);
		expect(prepared.groupWarn).toBe(false);

		const response = await completeSignTransactionsProtocolRequest({
			walletTransactions: txns,
			context: {
				state,
				storage,
				ledgerProvider: new MockLedgerProvider(),
				credentialProvider: new MockCredentialProvider(),
			},
		});

		expect(response.action).toBe("signed");
		expect(algosdk.decodeSignedTransaction(response.txns[0]!).txn.txID()).toBe(transaction.txID());
	});

	it("prepares and completes sign-data protocol requests", async () => {
		const state = createInitialWalletState();
		const storage = new MockWalletStorage();
		const account = algosdk.generateAccount();
		await saveHotAccount({ account, state, storage, markHot: true });
		const jsonString = canonicalJson(siwa(account.addr.toString()));
		const prepared = await prepareSignDataProtocolRequest({
			request: {
				action: "data",
				data: algosdk.bytesToBase64(new TextEncoder().encode(jsonString)),
				metadata,
				authenticatorData: hashDomainForAuthenticatorData("example.com"),
			},
		});

		expect(prepared.title).toBe("Sign in to example.com");

		const response = await completeSignDataProtocolRequest({
			prepared,
			state,
			storage,
			ledgerProvider: new MockLedgerProvider(),
			credentialProvider: new MockCredentialProvider(),
		});
		const extensionResponse = serializeSignDataResponseForExtension(response);
		const pageResponse = deserializeSignDataResponseFromExtension(extensionResponse);

		expect(response.action).toBe("signed");
		expect(response.signer).toBe(account.addr.toString());
		expect(response.signature.byteLength).toBe(64);
		expect(Array.from(pageResponse.signature)).toEqual(Array.from(response.signature));
		expect(Array.from(pageResponse.authenticatorData)).toEqual(Array.from(response.authenticatorData));
		expect(pageResponse.signer.byteLength).toBe(32);
	});

	it("validates and approves add-network protocol requests", async () => {
		const storage = new MockWalletStorage();
		const newNetwork = { ...network, name: "NewNet", genesisID: "new-v1" };

		expect(validateDappNetworkRequest(newNetwork, [network])).toBe(newNetwork);

		const response = await approveDappNetworkRequest({ storage, network: newNetwork, knownNetworks: [network] });

		expect(response).toEqual({ action: "added", network: newNetwork, networks: [newNetwork] });
		expect(await storage.getAppValue(walletSettingKeys.customNetworks)).toEqual([newNetwork]);
		expect(() => validateDappNetworkRequest(network, [network])).toThrow("already configured");
	});

	it("prepares and completes swap protocol acceptance", async () => {
		const sender = algosdk.generateAccount();
		const receiver = algosdk.generateAccount();
		const proposal = buildAtomicSwapProposal({
			sender: sender.addr.toString(),
			receiver: receiver.addr.toString(),
			senderAsset: { index: 123n, params: { decimals: 2 } },
			senderAmount: "4.56",
			receiverAsset: { index: 0n, params: { decimals: 6 } },
			receiverAmount: "7.89",
			suggestedParams,
		});
		const signedTxn1 = proposal.txn1.signTxn(sender.sk);
		const serialized = serializeSwapProposal({ signedTxn1, unsignedTxn2: proposal.txn2 });
		const prepared = await prepareSwapProtocolRequest({
			request: { action: "swap", tx1: serialized.tx1, tx2: serialized.tx2 },
			networks: [network],
			algodForNetwork: () => createAlgod(500n),
		});
		const plan = buildSwapProtocolAcceptancePlan(prepared);
		const signedTxn2 = Uint8Array.from([1, 2, 3]);

		expect(plan.indexesToSign).toEqual([1]);
		expect(completeSwapProtocolAcceptance({ signedTxn1: plan.signedTxn1, signedTxn2 })).toEqual([
			signedTxn1,
			signedTxn2,
		]);
	});
});
