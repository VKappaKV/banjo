import algosdk, { type modelsv2, type SuggestedParams } from "algosdk";
import { describe, expect, it } from "vitest";
import {
	amountToBaseUnits,
	buildAssetTransferPlan,
	buildAssetTransferTransaction,
	buildPaymentTransaction,
	buildRekeyTransaction,
	formatBaseUnits,
	receiverIsOptedInToAsset,
} from "../src/lib/core/transactions";

const suggestedParams: SuggestedParams = {
	fee: 1000,
	minFee: 1000,
	firstValid: 1,
	lastValid: 1000,
	genesisHash: new Uint8Array(32),
	genesisID: "unitnet-v1",
	flatFee: true,
};

function accountAddress(): string {
	return algosdk.generateAccount().addr.toString();
}

function accountWithAssets(assetIds: Array<number | bigint>): modelsv2.Account {
	return {
		assets: assetIds.map((assetId) => ({ assetId: BigInt(assetId), amount: 0n, isFrozen: false })),
	} as modelsv2.Account;
}

describe("amount helpers", () => {
	it("converts decimal strings to base units with padded and truncated decimals", () => {
		expect(amountToBaseUnits("1", 6)).toBe(1_000_000n);
		expect(amountToBaseUnits("1.2", 6)).toBe(1_200_000n);
		expect(amountToBaseUnits("1.2345678", 6)).toBe(1_234_567n);
		expect(amountToBaseUnits(".5", 3)).toBe(500n);
		expect(amountToBaseUnits("42.9", 0)).toBe(42n);
	});

	it("rejects malformed amount strings", () => {
		expect(() => amountToBaseUnits("", 6)).toThrow("Amount must be a non-negative decimal string");
		expect(() => amountToBaseUnits("-1", 6)).toThrow("Amount must be a non-negative decimal string");
		expect(() => amountToBaseUnits("1.2.3", 6)).toThrow("Amount must be a non-negative decimal string");
		expect(() => amountToBaseUnits("1", -1)).toThrow("Decimals must be a non-negative integer");
	});

	it("formats base units as plain decimal strings", () => {
		expect(formatBaseUnits(1_234_500n, 6)).toBe("1.234500");
		expect(formatBaseUnits(1_234_500n, 6, { trimTrailingZeros: true })).toBe("1.2345");
		expect(formatBaseUnits(42n, 0)).toBe("42");
		expect(formatBaseUnits(-123n, 2)).toBe("-1.23");
	});
});

describe("transaction builders", () => {
	it("builds native Algo payment transactions with amount, note, and close remainder", () => {
		const sender = accountAddress();
		const receiver = accountAddress();
		const closeRemainderTo = accountAddress();

		const txn = buildPaymentTransaction({
			sender,
			receiver,
			amount: "1.5",
			closeRemainderTo,
			note: "hello",
			suggestedParams,
		});

		const expected = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender,
			receiver,
			amount: 1_500_000n,
			closeRemainderTo,
			note: new TextEncoder().encode("hello"),
			suggestedParams,
		});

		expect(txn.type).toBe("pay");
		expect(txn.payment?.amount).toBe(expected.payment?.amount);
		expect(txn.payment?.receiver.toString()).toBe(expected.payment?.receiver.toString());
		expect(txn.payment?.closeRemainderTo?.toString()).toBe(closeRemainderTo);
		expect(Array.from(txn.note)).toEqual(Array.from(expected.note));
	});

	it("builds ASA transfers with amount, note, close asset, and clawback sender", () => {
		const sender = accountAddress();
		const receiver = accountAddress();
		const closeRemainderTo = accountAddress();
		const assetSender = accountAddress();

		const txn = buildAssetTransferTransaction({
			sender,
			receiver,
			assetId: 123n,
			assetDecimals: 2,
			amount: "7.89",
			closeRemainderTo,
			assetSender,
			note: new Uint8Array([1, 2, 3]),
			suggestedParams,
		});

		const expected = algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
			sender,
			receiver,
			assetIndex: 123n,
			amount: 789n,
			closeRemainderTo,
			assetSender,
			note: new Uint8Array([1, 2, 3]),
			suggestedParams,
		});

		expect(txn.type).toBe("axfer");
		expect(txn.assetTransfer?.assetIndex).toBe(expected.assetTransfer?.assetIndex);
		expect(txn.assetTransfer?.amount).toBe(expected.assetTransfer?.amount);
		expect(txn.assetTransfer?.receiver.toString()).toBe(receiver);
		expect(txn.assetTransfer?.closeRemainderTo?.toString()).toBe(closeRemainderTo);
		expect(txn.assetTransfer?.assetSender?.toString()).toBe(assetSender);
		expect(Array.from(txn.note)).toEqual([1, 2, 3]);
	});

	it("builds rekey transactions as zero payment transactions to self", () => {
		const sender = accountAddress();
		const rekeyTo = accountAddress();

		const txn = buildRekeyTransaction({ sender, rekeyTo, note: "rekey", suggestedParams });

		expect(txn.type).toBe("pay");
		expect(txn.sender.toString()).toBe(sender);
		expect(txn.payment?.receiver.toString()).toBe(sender);
		expect(txn.payment?.amount).toBe(0n);
		expect(txn.rekeyTo?.toString()).toBe(rekeyTo);
		expect(new TextDecoder().decode(txn.note)).toBe("rekey");
	});
});

describe("ASA transfer planning", () => {
	it("detects receiver ASA opt-in from account holdings", () => {
		expect(receiverIsOptedInToAsset(accountWithAssets([123n]), 123)).toBe(true);
		expect(receiverIsOptedInToAsset(accountWithAssets([123n]), 456)).toBe(false);
	});

	it("returns direct plans for opted-in receivers", () => {
		const plan = buildAssetTransferPlan({
			sender: accountAddress(),
			receiver: accountAddress(),
			assetId: 123,
			assetDecimals: 0,
			amount: "1",
			suggestedParams,
			receiverAccount: accountWithAssets([123]),
			network: { inboxRouter: 999 },
		});

		expect(plan.type).toBe("direct");
	});

	it("returns ARC-59-required plans when receiver is not opted in and router exists", () => {
		const plan = buildAssetTransferPlan({
			sender: accountAddress(),
			receiver: accountAddress(),
			assetId: 123,
			assetDecimals: 0,
			amount: "1",
			suggestedParams,
			receiverAccount: accountWithAssets([]),
			network: { inboxRouter: 999 },
		});

		expect(plan).toMatchObject({
			type: "requires-arc59",
			routerAppId: 999,
			reason: "receiver-not-opted-in",
		});
	});

	it("returns unsupported plans when receiver is not opted in and no router exists", () => {
		const plan = buildAssetTransferPlan({
			sender: accountAddress(),
			receiver: accountAddress(),
			assetId: 123,
			assetDecimals: 0,
			amount: "1",
			suggestedParams,
			receiverAccount: accountWithAssets([]),
			network: {},
		});

		expect(plan).toMatchObject({ type: "unsupported", reason: "receiver-not-opted-in" });
	});
});
