import algosdk, { type Algodv2, type modelsv2, type SuggestedParams, type Transaction } from "algosdk";
import type { Network } from "../types";
import { buildAssetTransferTransaction, buildPaymentTransaction } from "./builders";

const NATIVE_ASSET_ID = 0n;
const ALGO_DECIMALS = 6;

export interface SwapAssetInput {
	index: number | bigint;
	params?: {
		decimals?: number;
	};
}

export interface BuildAtomicSwapProposalInput {
	sender: string;
	receiver: string;
	senderAsset: SwapAssetInput | modelsv2.Asset;
	senderAmount: string;
	receiverAsset: SwapAssetInput | modelsv2.Asset;
	receiverAmount: string;
	suggestedParams: SuggestedParams;
}

export interface AtomicSwapProposal {
	txn1: Transaction;
	txn2: Transaction;
}

export interface SerializedSwapProposal {
	tx1: string;
	tx2: string;
}

export interface ValidateSwapProposalInput {
	tx1: string;
	tx2: string;
	networks: Network[];
	algodForNetwork: (network: Network) => Algodv2;
}

export interface ValidatedSwapProposal {
	network: Network;
	signedTxn1: Uint8Array;
	txn1: Transaction;
	txn2: Transaction;
	assetsToLoad: bigint[];
}

export interface SwapAcceptancePlan {
	signedTxn1: Uint8Array;
	transactions: [Transaction, Transaction];
	indexesToSign: [1];
}

function assetId(asset: SwapAssetInput | modelsv2.Asset): bigint {
	return BigInt(asset.index);
}

function assetDecimals(asset: SwapAssetInput | modelsv2.Asset): number {
	return assetId(asset) === NATIVE_ASSET_ID ? ALGO_DECIMALS : (asset.params?.decimals ?? 0);
}

function buildSwapTransaction(args: {
	sender: string;
	receiver: string;
	asset: SwapAssetInput | modelsv2.Asset;
	amount: string;
	suggestedParams: SuggestedParams;
}): Transaction {
	const id = assetId(args.asset);

	if (id === NATIVE_ASSET_ID) {
		return buildPaymentTransaction({
			sender: args.sender,
			receiver: args.receiver,
			amount: args.amount,
			suggestedParams: args.suggestedParams,
		});
	}

	return buildAssetTransferTransaction({
		sender: args.sender,
		receiver: args.receiver,
		assetId: id,
		assetDecimals: assetDecimals(args.asset),
		amount: args.amount,
		suggestedParams: args.suggestedParams,
	});
}

function bytesEqual(left: Uint8Array | undefined, right: Uint8Array | undefined): boolean {
	if (!left || !right || left.length !== right.length) {
		return false;
	}

	return left.every((value, index) => value === right[index]);
}

function toBase64Url(bytes: Uint8Array): string {
	return algosdk.bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

	return algosdk.base64ToBytes(padded);
}

function transferReceiver(txn: Transaction): string | undefined {
	return txn.payment?.receiver.toString() ?? txn.assetTransfer?.receiver.toString();
}

function genesisHashBase64(txn: Transaction): string {
	if (!txn.genesisHash) {
		throw new Error("Swap transactions must include a genesis hash");
	}

	return algosdk.bytesToBase64(txn.genesisHash);
}

function findSwapNetwork(txn: Transaction, networks: Network[]): Network {
	const genesisHash = genesisHashBase64(txn);
	const network = networks.find(
		(candidate) =>
			candidate.genesisID === txn.genesisID &&
			(candidate.genesisHash === undefined || candidate.genesisHash === genesisHash),
	);

	if (!network) {
		throw new Error("Swap network is not configured");
	}

	return network;
}

function assetTransfersToLoad(txns: Transaction[]): bigint[] {
	return [...new Set(txns.flatMap((txn) => (txn.assetTransfer ? [txn.assetTransfer.assetIndex] : [])))];
}

export function buildAtomicSwapProposal(input: BuildAtomicSwapProposalInput): AtomicSwapProposal {
	const txns = [
		buildSwapTransaction({
			sender: input.sender,
			receiver: input.receiver,
			asset: input.senderAsset,
			amount: input.senderAmount,
			suggestedParams: input.suggestedParams,
		}),
		buildSwapTransaction({
			sender: input.receiver,
			receiver: input.sender,
			asset: input.receiverAsset,
			amount: input.receiverAmount,
			suggestedParams: input.suggestedParams,
		}),
	];
	const [txn1, txn2] = algosdk.assignGroupID(txns) as [Transaction, Transaction];

	return { txn1, txn2 };
}

export function serializeSwapProposal(args: {
	signedTxn1: Uint8Array;
	unsignedTxn2: Transaction;
}): SerializedSwapProposal {
	return {
		tx1: toBase64Url(args.signedTxn1),
		tx2: toBase64Url(algosdk.encodeUnsignedTransaction(args.unsignedTxn2)),
	};
}

export async function validateSwapProposal(
	input: ValidateSwapProposalInput,
): Promise<ValidatedSwapProposal> {
	const signedTxn1 = fromBase64Url(input.tx1);
	const txn1 = algosdk.decodeSignedTransaction(signedTxn1).txn;
	const txn2 = algosdk.decodeUnsignedTransaction(fromBase64Url(input.tx2));

	if (!bytesEqual(txn1.group, txn2.group)) {
		throw new Error("Swap transactions must share the same group ID");
	}

	const txn1Receiver = transferReceiver(txn1);
	const txn2Receiver = transferReceiver(txn2);

	if (!txn1Receiver || !txn2Receiver) {
		throw new Error("Swap transactions must be payments or asset transfers");
	}

	if (txn1Receiver !== txn2.sender.toString() || txn2Receiver !== txn1.sender.toString()) {
		throw new Error("Swap transaction addresses are not reciprocal");
	}

	if (txn1.genesisID !== txn2.genesisID || genesisHashBase64(txn1) !== genesisHashBase64(txn2)) {
		throw new Error("Swap transactions are for different networks");
	}

	const network = findSwapNetwork(txn1, input.networks);
	const algod = input.algodForNetwork(network);
	const status = (await algod.status().do()) as { lastRound: number | bigint };
	const lastRound = BigInt(status.lastRound);

	if (lastRound > txn1.lastValid || lastRound > txn2.lastValid) {
		throw new Error("Swap proposal has expired");
	}

	return {
		network,
		signedTxn1,
		txn1,
		txn2,
		assetsToLoad: assetTransfersToLoad([txn1, txn2]),
	};
}

export function buildSwapAcceptancePlan(args: {
	signedTxn1: Uint8Array;
	txn1: Transaction;
	txn2: Transaction;
}): SwapAcceptancePlan {
	return {
		signedTxn1: args.signedTxn1,
		transactions: [args.txn1, args.txn2],
		indexesToSign: [1],
	};
}

export function assembleSwapSignedTransactions(args: {
	signedTxn1: Uint8Array;
	signedTxn2: Uint8Array;
}): [Uint8Array, Uint8Array] {
	return [args.signedTxn1, args.signedTxn2];
}
