import { microAlgos } from "@algorandfoundation/algokit-utils";
import type { SendParams } from "@algorandfoundation/algokit-utils/types/transaction";
import algosdk, { type SuggestedParams, type Transaction, type TransactionSigner } from "algosdk";
import type { Arc59Client, Arc59Composer, Arc59Returns } from "../clients/Arc59Client";
import { buildAssetTransferTransaction, type TransactionNote } from "./builders";

type Arc59SendAssetInfoTuple =
	Arc59Returns["arc59_getSendAssetInfo(address,uint64)(uint64,uint64,bool,bool,uint64,uint64)"];

export interface Arc59SendAssetInfo {
	innerTransactionCount: bigint;
	mbr: bigint;
	routerOptedIn: boolean;
	receiverOptedIn: boolean;
	receiverAlgoNeededForClaim: bigint;
	receiverAlgoNeededForWorstCaseClaim: bigint;
}

export interface BuildArc59SendAssetPlanInput {
	arc59Client: Arc59Client;
	sender: string;
	receiver: string;
	assetId: number | bigint;
	assetDecimals: number;
	amount: string;
	suggestedParams: SuggestedParams;
	note?: TransactionNote;
	closeRemainderTo?: string;
	assetSender?: string;
	signer?: TransactionSigner;
}

export type Arc59SendAssetPlan =
	| {
			type: "direct";
			sendInfo: Arc59SendAssetInfo;
			transaction: Transaction;
		}
	| {
			type: "arc59";
			sendInfo: Arc59SendAssetInfo;
			composer: Arc59Composer;
			routerAppId: bigint;
			routerAddress: string;
			inboxAddress: string;
			receiverBoxName: Uint8Array;
			mbrPaymentAmount: bigint;
			mbrPayment?: Transaction;
			assetTransfer: Transaction;
			appCallFee: bigint;
			totalInnerTransactionCount: bigint;
			recommendedSendParams: SendParams;
		};

function parseSendAssetInfo(value: unknown): Arc59SendAssetInfo {
	if (!Array.isArray(value) || value.length < 5) {
		throw new Error("ARC-59 send asset info simulation did not return the expected tuple");
	}

	const [
		innerTransactionCount,
		mbr,
		routerOptedIn,
		receiverOptedIn,
		receiverAlgoNeededForClaim,
		receiverAlgoNeededForWorstCaseClaim = 0n,
	] = value as Arc59SendAssetInfoTuple;

	return {
		innerTransactionCount: BigInt(innerTransactionCount),
		mbr: BigInt(mbr),
		routerOptedIn: Boolean(routerOptedIn),
		receiverOptedIn: Boolean(receiverOptedIn),
		receiverAlgoNeededForClaim: BigInt(receiverAlgoNeededForClaim),
		receiverAlgoNeededForWorstCaseClaim: BigInt(receiverAlgoNeededForWorstCaseClaim),
	};
}

function assetReference(assetId: number | bigint): bigint {
	const value = BigInt(assetId);

	if (value < 0n) {
		throw new Error("Asset ID must be non-negative for app call resources");
	}

	return value;
}

function firstReturn(result: { returns?: unknown[] }, description: string): unknown {
	const value = result.returns?.[0];

	if (value === undefined) {
		throw new Error(`${description} simulation did not return a value`);
	}

	return value;
}

function buildPaymentToRouter(args: {
	sender: string;
	routerAddress: string;
	amount: bigint;
	suggestedParams: SuggestedParams;
}): Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: args.sender,
		receiver: args.routerAddress,
		amount: args.amount,
		suggestedParams: args.suggestedParams,
	});
}

export function getArc59ReceiverBoxName(receiver: string): Uint8Array {
	return algosdk.decodeAddress(receiver).publicKey;
}

export async function buildArc59SendAssetPlan(
	input: BuildArc59SendAssetPlanInput,
): Promise<Arc59SendAssetPlan> {
	const assetId = BigInt(input.assetId);
	const appCallAssetReference = assetReference(input.assetId);
	const routerAddress = input.arc59Client.appClient.appAddress.toString();
	const receiverBoxName = getArc59ReceiverBoxName(input.receiver);
	const sendInfoResult = await input.arc59Client
		.newGroup()
		.arc59GetSendAssetInfo({
			sender: input.sender,
			args: { receiver: input.receiver, asset: assetId },
			accountReferences: [input.receiver],
			assetReferences: [appCallAssetReference],
		})
		.simulate();
	const sendInfo = parseSendAssetInfo(firstReturn(sendInfoResult, "ARC-59 send asset info"));

	if (sendInfo.receiverOptedIn) {
		return {
			type: "direct",
			sendInfo,
			transaction: buildAssetTransferTransaction(input),
		};
	}

	const inboxResult = await input.arc59Client
		.newGroup()
		.arc59GetInbox({
			sender: input.sender,
			args: { receiver: input.receiver },
			boxReferences: [receiverBoxName],
		})
		.simulate();
	const inboxAddress = firstReturn(inboxResult, "ARC-59 inbox") as string;
	const composer = input.arc59Client.newGroup();
	const mbrPaymentAmount = sendInfo.mbr + sendInfo.receiverAlgoNeededForClaim;
	let mbrPayment: Transaction | undefined;

	if (mbrPaymentAmount > 0n) {
		mbrPayment = buildPaymentToRouter({
			sender: input.sender,
			routerAddress,
			amount: mbrPaymentAmount,
			suggestedParams: input.suggestedParams,
		});
		composer.addTransaction(mbrPayment, input.signer);
	}

	if (!sendInfo.routerOptedIn) {
		composer.arc59OptRouterIn({ sender: input.sender, args: { asa: assetId } });
	}

	const assetTransfer = buildAssetTransferTransaction({
		...input,
		receiver: routerAddress,
	});
	const totalInnerTransactionCount =
		sendInfo.innerTransactionCount + (sendInfo.receiverAlgoNeededForClaim === 0n ? 0n : 1n);
	const appCallFee = 1000n + 1000n * totalInnerTransactionCount;

	composer.arc59SendAsset({
		sender: input.sender,
		args: {
			axfer: assetTransfer,
			receiver: input.receiver,
			additionalReceiverFunds: sendInfo.receiverAlgoNeededForClaim,
		},
		staticFee: microAlgos(appCallFee),
		boxReferences: [receiverBoxName],
		accountReferences: [input.receiver, inboxAddress],
		assetReferences: [appCallAssetReference],
	});

	return {
		type: "arc59",
		sendInfo,
		composer,
		routerAppId: input.arc59Client.appClient.appId,
		routerAddress,
		inboxAddress,
		receiverBoxName,
		mbrPaymentAmount,
		mbrPayment,
		assetTransfer,
		appCallFee,
		totalInnerTransactionCount,
		recommendedSendParams: { populateAppCallResources: false },
	};
}
