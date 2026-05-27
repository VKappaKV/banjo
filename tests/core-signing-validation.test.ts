import algosdk, { type SuggestedParams, type Transaction } from "algosdk";
import { describe, expect, it } from "vitest";
import { builtInNetworks } from "../src/lib/core/data/networks";
import {
	decodeWalletTransactions,
	prepareDecodedWalletTransactions,
	shouldSignWalletTransaction,
	signingErrorCodes,
	validateTransactionGroups,
	validateTransactionNetwork,
} from "../src/lib/core/signing";
import type { WalletTransaction } from "../src/lib/core/types";

const mainnet = builtInNetworks.find((network) => network.name === "MainNet")!;
const testnet = builtInNetworks.find((network) => network.name === "TestNet")!;
const localnet = builtInNetworks.find((network) => network.name === "LocalNet")!;

function accountAddress(): string {
	return algosdk.generateAccount().addr.toString();
}

function suggestedParams(genesisID = mainnet.genesisID, genesisHash = mainnet.genesisHash): SuggestedParams {
	return {
		fee: 1000,
		minFee: 1000,
		firstValid: 1,
		lastValid: 1000,
		genesisHash: genesisHash ? algosdk.base64ToBytes(genesisHash) : new Uint8Array(32),
		genesisID,
		flatFee: true,
	};
}

function paymentTxn(params = suggestedParams()): Transaction {
	const sender = accountAddress();

	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender,
		receiver: accountAddress(),
		amount: 1,
		suggestedParams: params,
	});
}

function walletTxn(transaction: Transaction, extra?: Omit<WalletTransaction, "txn">): WalletTransaction {
	return {
		txn: algosdk.bytesToBase64(algosdk.encodeUnsignedTransaction(transaction)),
		...extra,
	};
}

function expectThrownCode(fn: () => unknown, code: number): void {
	try {
		fn();
	} catch (error) {
		expect(error).toMatchObject({ code });
		return;
	}

	throw new Error("Expected function to throw");
}

describe("signing transaction validation", () => {
	it("decodes wallet transaction payloads", () => {
		const transaction = paymentTxn();
		const [decoded] = decodeWalletTransactions([walletTxn(transaction)]);

		expect(decoded?.index).toBe(0);
		expect(decoded?.transaction.txID()).toBe(transaction.txID());
	});

	it("maps malformed wallet transactions to compatible invalid request errors", () => {
		expectThrownCode(() => decodeWalletTransactions([{ txn: "not-base64" }]), signingErrorCodes.invalidRequest);
	});

	it("preserves signers empty array no-sign semantics", () => {
		expect(shouldSignWalletTransaction({ txn: "txn" })).toBe(true);
		expect(shouldSignWalletTransaction({ txn: "txn", signers: [accountAddress()] })).toBe(true);
		expect(shouldSignWalletTransaction({ txn: "txn", signers: [] })).toBe(false);
	});

	it("rejects empty and oversized transaction requests with compatible codes", () => {
		expectThrownCode(
			() => prepareDecodedWalletTransactions({ walletTransactions: [], networks: builtInNetworks }),
			signingErrorCodes.invalidRequest,
		);

		const transactions = Array.from({ length: 513 }, () => ({ txn: "" }));

		expectThrownCode(
			() => prepareDecodedWalletTransactions({ walletTransactions: transactions, networks: builtInNetworks }),
			signingErrorCodes.tooManyTransactions,
		);
	});

	it("validates transaction networks and preserves sandnet localnet mapping", () => {
		const matched = validateTransactionNetwork({
			transactions: [paymentTxn()],
			networks: builtInNetworks,
		});

		expect(matched.networkName).toBe(mainnet.name);

		const sandnet = validateTransactionNetwork({
			transactions: [paymentTxn(suggestedParams("sandnet-v1", undefined))],
			networks: [localnet],
		});

		expect(sandnet.networkName).toBe(localnet.name);
	});

	it("rejects mixed transaction networks", () => {
		expectThrownCode(
			() =>
			validateTransactionNetwork({
				transactions: [paymentTxn(), paymentTxn(suggestedParams(testnet.genesisID, testnet.genesisHash))],
				networks: builtInNetworks,
			}),
			signingErrorCodes.invalidRequest,
		);
	});

	it("validates transaction groups", () => {
		const txns = [paymentTxn(), paymentTxn()];
		algosdk.assignGroupID(txns);

		expect(validateTransactionGroups(txns)).toEqual({ groupWarn: false });
	});

	it("rejects invalid transaction groups", () => {
		const txns = [paymentTxn(), paymentTxn()];
		algosdk.assignGroupID(txns);
		txns[0]!.group = new Uint8Array(txns[0]!.group!).fill(7);

		expectThrownCode(() => validateTransactionGroups(txns), signingErrorCodes.invalidRequest);
	});

	it("sets group warnings for multiple ungrouped or mixed requests", () => {
		expect(validateTransactionGroups([paymentTxn(), paymentTxn()])).toEqual({ groupWarn: true });

		const grouped = [paymentTxn(), paymentTxn()];
		algosdk.assignGroupID(grouped);

		expect(validateTransactionGroups([...grouped, paymentTxn()])).toEqual({ groupWarn: true });
	});
});
