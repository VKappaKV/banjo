import algosdk, { type SuggestedParams } from "algosdk";
import { describe, expect, it } from "vitest";
import type { Arc59Client } from "../src/lib/core/clients/Arc59Client";
import { buildArc59SendAssetPlan, getArc59ReceiverBoxName } from "../src/lib/core/transactions";

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

type FakeArc59Call = { method: string; params?: unknown; signer?: unknown };

class FakeArc59Composer {
	readonly calls: FakeArc59Call[] = [];

	constructor(private readonly returns: unknown[] = []) {}

	arc59GetSendAssetInfo(params?: unknown) {
		this.calls.push({ method: "arc59GetSendAssetInfo", params });
		return this;
	}

	arc59GetInbox(params?: unknown) {
		this.calls.push({ method: "arc59GetInbox", params });
		return this;
	}

	arc59OptRouterIn(params?: unknown) {
		this.calls.push({ method: "arc59OptRouterIn", params });
		return this;
	}

	arc59SendAsset(params?: unknown) {
		this.calls.push({ method: "arc59SendAsset", params });
		return this;
	}

	addTransaction(params?: unknown, signer?: unknown) {
		this.calls.push({ method: "addTransaction", params, signer });
		return this;
	}

	async simulate() {
		return { returns: this.returns };
	}
}

function createFakeArc59Client(args: {
	routerAppId?: bigint;
	routerAddress: string;
	sendInfo: unknown;
	inboxAddress?: string;
}): { client: Arc59Client; groups: FakeArc59Composer[] } {
	const groups: FakeArc59Composer[] = [];
	const client = {
		appClient: {
			appId: args.routerAppId ?? 999n,
			appAddress: { toString: () => args.routerAddress },
		},
		newGroup() {
			const group = new FakeArc59Composer(
				groups.length === 0 ? [args.sendInfo] : groups.length === 1 ? [args.inboxAddress] : [],
			);
			groups.push(group);
			return group;
		},
	} as unknown as Arc59Client;

	return { client, groups };
}

describe("buildArc59SendAssetPlan", () => {
	it("returns a direct transfer when ARC-59 reports the receiver is opted in", async () => {
		const sender = accountAddress();
		const receiver = accountAddress();
		const routerAddress = accountAddress();
		const { client, groups } = createFakeArc59Client({
			routerAddress,
			sendInfo: [1n, 0n, true, true, 0n, 0n],
		});

		const plan = await buildArc59SendAssetPlan({
			arc59Client: client,
			sender,
			receiver,
			assetId: 123,
			assetDecimals: 0,
			amount: "2",
			suggestedParams,
		});

		expect(plan.type).toBe("direct");
		expect(plan.sendInfo.receiverOptedIn).toBe(true);
		if (plan.type === "direct") {
			expect(plan.transaction.assetTransfer?.receiver.toString()).toBe(receiver);
			expect(plan.transaction.assetTransfer?.amount).toBe(2n);
		}
		expect(groups).toHaveLength(1);
		expect(groups[0]?.calls[0]).toMatchObject({ method: "arc59GetSendAssetInfo" });
	});

	it("builds an ARC-59 composer with funding, router opt-in, resources, and fee summary", async () => {
		const sender = accountAddress();
		const receiver = accountAddress();
		const routerAddress = accountAddress();
		const inboxAddress = accountAddress();
		const signer = async () => [];
		const { client, groups } = createFakeArc59Client({
			routerAppId: 1234n,
			routerAddress,
			inboxAddress,
			sendInfo: [5n, 200_000n, false, false, 50_000n, 300_000n],
		});

		const plan = await buildArc59SendAssetPlan({
			arc59Client: client,
			sender,
			receiver,
			assetId: 777,
			assetDecimals: 2,
			amount: "3.45",
			note: "arc59",
			closeRemainderTo: accountAddress(),
			assetSender: accountAddress(),
			signer,
			suggestedParams,
		});

		expect(plan.type).toBe("arc59");
		if (plan.type !== "arc59") return;

		expect(plan.routerAppId).toBe(1234n);
		expect(plan.routerAddress).toBe(routerAddress);
		expect(plan.inboxAddress).toBe(inboxAddress);
		expect(plan.mbrPaymentAmount).toBe(250_000n);
		expect(plan.mbrPayment?.payment?.receiver.toString()).toBe(routerAddress);
		expect(plan.mbrPayment?.payment?.amount).toBe(250_000n);
		expect(plan.assetTransfer.assetTransfer?.receiver.toString()).toBe(routerAddress);
		expect(plan.assetTransfer.assetTransfer?.amount).toBe(345n);
		expect(new TextDecoder().decode(plan.assetTransfer.note)).toBe("arc59");
		expect(plan.totalInnerTransactionCount).toBe(6n);
		expect(plan.appCallFee).toBe(7_000n);
		expect(plan.recommendedSendParams).toEqual({ populateAppCallResources: false });
		expect(Array.from(plan.receiverBoxName)).toEqual(Array.from(getArc59ReceiverBoxName(receiver)));

		expect(groups).toHaveLength(3);
			expect(groups[0]?.calls[0]).toMatchObject({
			method: "arc59GetSendAssetInfo",
			params: expect.objectContaining({
				sender,
				args: { receiver, asset: 777n },
				accountReferences: [receiver],
				assetReferences: [777n],
			}),
		});
		expect(groups[1]?.calls[0]).toMatchObject({
			method: "arc59GetInbox",
			params: expect.objectContaining({ sender, args: { receiver } }),
		});
		expect(groups[2]?.calls.map((call) => call.method)).toEqual([
			"addTransaction",
			"arc59OptRouterIn",
			"arc59SendAsset",
		]);
		expect(groups[2]?.calls[0]?.signer).toBe(signer);
		expect(groups[2]?.calls[2]?.params).toMatchObject({
			sender,
			args: expect.objectContaining({ receiver, additionalReceiverFunds: 50_000n }),
			accountReferences: [receiver, inboxAddress],
			assetReferences: [777n],
		});
	});

	it("omits funding and router opt-in when they are not required", async () => {
		const sender = accountAddress();
		const receiver = accountAddress();
		const routerAddress = accountAddress();
		const inboxAddress = accountAddress();
		const { client, groups } = createFakeArc59Client({
			routerAddress,
			inboxAddress,
			sendInfo: [1n, 0n, true, false, 0n, 0n],
		});

		const plan = await buildArc59SendAssetPlan({
			arc59Client: client,
			sender,
			receiver,
			assetId: 777,
			assetDecimals: 0,
			amount: "1",
			suggestedParams,
		});

		expect(plan.type).toBe("arc59");
		if (plan.type !== "arc59") return;

		expect(plan.mbrPayment).toBeUndefined();
		expect(plan.mbrPaymentAmount).toBe(0n);
		expect(plan.totalInnerTransactionCount).toBe(1n);
		expect(plan.appCallFee).toBe(2_000n);
		expect(groups[2]?.calls.map((call) => call.method)).toEqual(["arc59SendAsset"]);
	});

	it("rejects malformed ARC-59 simulations", async () => {
		const { client } = createFakeArc59Client({
			routerAddress: accountAddress(),
			sendInfo: undefined,
		});

		await expect(
			buildArc59SendAssetPlan({
				arc59Client: client,
				sender: accountAddress(),
				receiver: accountAddress(),
				assetId: 777,
				assetDecimals: 0,
				amount: "1",
				suggestedParams,
			}),
		).rejects.toThrow("ARC-59 send asset info simulation did not return a value");
	});
});
