import algosdk, { type modelsv2, type SuggestedParams, type Transaction } from "algosdk";
import type { Network } from "../types";
import { amountToBaseUnits } from "./amounts";

const ALGO_DECIMALS = 6;

export type TransactionNote = string | Uint8Array;

export interface CommonTransactionBuilderInput {
	sender: string;
	suggestedParams: SuggestedParams;
	note?: TransactionNote;
}

export interface BuildPaymentTransactionInput extends CommonTransactionBuilderInput {
	receiver: string;
	amount: string;
	closeRemainderTo?: string;
}

export interface BuildAssetTransferTransactionInput extends CommonTransactionBuilderInput {
	receiver: string;
	assetId: number | bigint;
	assetDecimals: number;
	amount: string;
	closeRemainderTo?: string;
	assetSender?: string;
}

export interface BuildRekeyTransactionInput extends CommonTransactionBuilderInput {
	rekeyTo: string;
}

export type AssetTransferPlan =
	| { type: "direct"; transaction: Transaction }
	| {
			type: "requires-arc59";
			transaction: Transaction;
			routerAppId: number;
			reason: "receiver-not-opted-in";
		}
	| {
			type: "unsupported";
			transaction: Transaction;
			reason: "receiver-not-opted-in";
		};

export interface BuildAssetTransferPlanInput extends BuildAssetTransferTransactionInput {
	receiverAccount: modelsv2.Account;
	network: Pick<Network, "inboxRouter">;
}

function encodeNote(note: TransactionNote | undefined): Uint8Array | undefined {
	if (typeof note === "string") {
		return new TextEncoder().encode(note);
	}

	return note;
}

export function buildPaymentTransaction(input: BuildPaymentTransactionInput): Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: input.sender,
		receiver: input.receiver,
		amount: amountToBaseUnits(input.amount, ALGO_DECIMALS),
		closeRemainderTo: input.closeRemainderTo,
		note: encodeNote(input.note),
		suggestedParams: input.suggestedParams,
	});
}

export function buildAssetTransferTransaction(input: BuildAssetTransferTransactionInput): Transaction {
	return algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
		sender: input.sender,
		receiver: input.receiver,
		assetIndex: input.assetId,
		assetSender: input.assetSender,
		amount: amountToBaseUnits(input.amount, input.assetDecimals),
		closeRemainderTo: input.closeRemainderTo,
		note: encodeNote(input.note),
		suggestedParams: input.suggestedParams,
	});
}

export function buildRekeyTransaction(input: BuildRekeyTransactionInput): Transaction {
	return algosdk.makePaymentTxnWithSuggestedParamsFromObject({
		sender: input.sender,
		receiver: input.sender,
		amount: 0,
		rekeyTo: input.rekeyTo,
		note: encodeNote(input.note),
		suggestedParams: input.suggestedParams,
	});
}

export function receiverIsOptedInToAsset(
	account: Pick<modelsv2.Account, "assets">,
	assetId: number | bigint,
): boolean {
	const expectedAssetId = BigInt(assetId);

	return account.assets?.some((asset) => asset.assetId === expectedAssetId) ?? false;
}

export function buildAssetTransferPlan(input: BuildAssetTransferPlanInput): AssetTransferPlan {
	const transaction = buildAssetTransferTransaction(input);

	if (receiverIsOptedInToAsset(input.receiverAccount, input.assetId)) {
		return { type: "direct", transaction };
	}

	if (input.network.inboxRouter !== undefined) {
		return {
			type: "requires-arc59",
			transaction,
			routerAppId: input.network.inboxRouter,
			reason: "receiver-not-opted-in",
		};
	}

	return { type: "unsupported", transaction, reason: "receiver-not-opted-in" };
}
