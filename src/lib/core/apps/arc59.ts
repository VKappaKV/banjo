import { AlgorandClient } from "@algorandfoundation/algokit-utils";
import type { Algodv2, TransactionSigner } from "algosdk";
import { Arc59Client, Arc59Factory } from "../clients/Arc59Client";
import type { Arc59SendAssetPlan } from "../transactions";

export class Arc59Error extends Error {
	constructor(message: string) {
		super(message);
		this.name = "Arc59Error";
	}
}

function createAlgorandClient(args: {
	algod: Algodv2;
	signer?: TransactionSigner;
	defaultSender?: string;
}): AlgorandClient {
	const algorand = AlgorandClient.fromClients({ algod: args.algod }).setDefaultValidityWindow(1000);

	if (args.signer) {
		algorand.setDefaultSigner(args.signer);

		if (args.defaultSender) {
			algorand.setSigner(args.defaultSender, args.signer);
		}
	}

	return algorand;
}

export function createArc59AppClient(args: {
	appId: bigint | number;
	sender: string;
	algod: Algodv2;
	signer: TransactionSigner;
}): Arc59Client {
	const factory = new Arc59Factory({
		algorand: createAlgorandClient({ algod: args.algod, signer: args.signer, defaultSender: args.sender }),
		defaultSender: args.sender,
		defaultSigner: args.signer,
	});

	return factory.getAppClientById({ appId: BigInt(args.appId) });
}

export async function createArc59Router(args: {
	sender: string;
	algod: Algodv2;
	signer: TransactionSigner;
}): Promise<bigint> {
	const factory = new Arc59Factory({
		algorand: createAlgorandClient({ algod: args.algod, signer: args.signer, defaultSender: args.sender }),
		defaultSender: args.sender,
		defaultSigner: args.signer,
	});
	const result = await factory.send.create.createApplication({ args: [] });
	const appId = BigInt(result.appClient.appId ?? result.result.appId ?? 0n);

	if (appId === 0n) {
		throw new Arc59Error("ARC-59 router creation did not return an app ID");
	}

	return appId;
}

export async function executeArc59SendAssetPlan(plan: Arc59SendAssetPlan): Promise<unknown> {
	if (plan.type !== "arc59") {
		throw new Arc59Error("Direct ARC-59 plan does not require ARC-59 execution");
	}

	return plan.composer.send(plan.recommendedSendParams);
}
