import algosdk, { type Algodv2, type SuggestedParams } from "algosdk";
import { describe, expect, it } from "vitest";
import type { Network } from "../src/lib/core";
import {
	assembleSwapSignedTransactions,
	buildAtomicSwapProposal,
	buildSwapAcceptancePlan,
	serializeSwapProposal,
	validateSwapProposal,
} from "../src/lib/core/transactions";

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

function createAlgod(lastRound: bigint): Algodv2 {
	return {
		status: () => ({ do: async () => ({ lastRound }) }),
	} as unknown as Algodv2;
}

function buildSignedSerializedSwap(args: { lastValid?: number; receiverAssetId?: bigint } = {}) {
	const sender = algosdk.generateAccount();
	const receiver = algosdk.generateAccount();
	const proposal = buildAtomicSwapProposal({
		sender: sender.addr.toString(),
		receiver: receiver.addr.toString(),
		senderAsset: { index: 123n, params: { decimals: 2 } },
		senderAmount: "4.56",
		receiverAsset: { index: args.receiverAssetId ?? 0n, params: { decimals: 6 } },
		receiverAmount: "7.89",
		suggestedParams: {
			...suggestedParams,
			lastValid: args.lastValid ?? suggestedParams.lastValid,
		},
	});
	const signedTxn1 = proposal.txn1.signTxn(sender.sk);

	return {
		sender,
		receiver,
		proposal,
		signedTxn1,
		serialized: serializeSwapProposal({ signedTxn1, unsignedTxn2: proposal.txn2 }),
	};
}

describe("atomic swap transaction helpers", () => {
	it("builds grouped reciprocal native and ASA swap transactions", () => {
		const sender = algosdk.generateAccount().addr.toString();
		const receiver = algosdk.generateAccount().addr.toString();
		const proposal = buildAtomicSwapProposal({
			sender,
			receiver,
			senderAsset: { index: 0n, params: { decimals: 6 } },
			senderAmount: "1.25",
			receiverAsset: { index: 999n, params: { decimals: 3 } },
			receiverAmount: "2.5",
			suggestedParams,
		});

		expect(proposal.txn1.type).toBe("pay");
		expect(proposal.txn1.sender.toString()).toBe(sender);
		expect(proposal.txn1.payment?.receiver.toString()).toBe(receiver);
		expect(proposal.txn1.payment?.amount).toBe(1_250_000n);
		expect(proposal.txn2.type).toBe("axfer");
		expect(proposal.txn2.sender.toString()).toBe(receiver);
		expect(proposal.txn2.assetTransfer?.receiver.toString()).toBe(sender);
		expect(proposal.txn2.assetTransfer?.assetIndex).toBe(999n);
		expect(proposal.txn2.assetTransfer?.amount).toBe(2_500n);
		expect(Array.from(proposal.txn1.group ?? [])).toEqual(Array.from(proposal.txn2.group ?? []));
	});

	it("serializes and validates swap proposals", async () => {
		const { sender, receiver, proposal, signedTxn1, serialized } = buildSignedSerializedSwap();

		expect(serialized.tx1).not.toContain("+");
		expect(serialized.tx1).not.toContain("/");
		expect(serialized.tx1).not.toContain("=");

		const validated = await validateSwapProposal({
			...serialized,
			networks: [network],
			algodForNetwork: () => createAlgod(500n),
		});

		expect(validated.network).toBe(network);
		expect(Array.from(validated.signedTxn1)).toEqual(Array.from(signedTxn1));
		expect(validated.txn1.sender.toString()).toBe(sender.addr.toString());
		expect(validated.txn2.sender.toString()).toBe(receiver.addr.toString());
		expect(validated.assetsToLoad).toEqual([123n]);
		expect(validated.txn1.txID()).toBe(proposal.txn1.txID());
		expect(validated.txn2.txID()).toBe(proposal.txn2.txID());
	});

	it("returns acceptance plans and assembles signed transactions without submitting", async () => {
		const { serialized } = buildSignedSerializedSwap();
		const validated = await validateSwapProposal({
			...serialized,
			networks: [network],
			algodForNetwork: () => createAlgod(500n),
		});
		const plan = buildSwapAcceptancePlan(validated);
		const signedTxn2 = Uint8Array.from([1, 2, 3]);

		expect(plan.transactions).toEqual([validated.txn1, validated.txn2]);
		expect(plan.indexesToSign).toEqual([1]);
		expect(assembleSwapSignedTransactions({ signedTxn1: plan.signedTxn1, signedTxn2 })).toEqual([
			plan.signedTxn1,
			signedTxn2,
		]);
	});

	it("rejects swaps with mismatched group IDs", async () => {
		const first = buildSignedSerializedSwap();
		const second = buildSignedSerializedSwap();

		await expect(
			validateSwapProposal({
				tx1: first.serialized.tx1,
				tx2: second.serialized.tx2,
				networks: [network],
				algodForNetwork: () => createAlgod(500n),
			}),
		).rejects.toThrow("Swap transactions must share the same group ID");
	});

	it("rejects swaps with nonreciprocal addresses", async () => {
		const sender = algosdk.generateAccount();
		const receiver = algosdk.generateAccount();
		const thirdParty = algosdk.generateAccount().addr.toString();
		const txns = algosdk.assignGroupID([
			algosdk.makePaymentTxnWithSuggestedParamsFromObject({
				sender: sender.addr,
				receiver: receiver.addr,
				amount: 1,
				suggestedParams,
			}),
			algosdk.makePaymentTxnWithSuggestedParamsFromObject({
				sender: receiver.addr,
				receiver: thirdParty,
				amount: 1,
				suggestedParams,
			}),
		]);
		const serialized = serializeSwapProposal({
			signedTxn1: txns[0].signTxn(sender.sk),
			unsignedTxn2: txns[1],
		});

		await expect(
			validateSwapProposal({
				...serialized,
				networks: [network],
				algodForNetwork: () => createAlgod(500n),
			}),
		).rejects.toThrow("Swap transaction addresses are not reciprocal");
	});

	it("rejects swaps for unconfigured networks", async () => {
		const { serialized } = buildSignedSerializedSwap();

		await expect(
			validateSwapProposal({
				...serialized,
				networks: [],
				algodForNetwork: () => createAlgod(500n),
			}),
		).rejects.toThrow("Swap network is not configured");
	});

	it("rejects expired swap proposals", async () => {
		const { serialized } = buildSignedSerializedSwap({ lastValid: 20 });

		await expect(
			validateSwapProposal({
				...serialized,
				networks: [network],
				algodForNetwork: () => createAlgod(21n),
			}),
		).rejects.toThrow("Swap proposal has expired");
	});
});
