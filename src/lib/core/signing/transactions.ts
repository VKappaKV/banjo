import algosdk, { type Transaction } from "algosdk";
import type { Network, WalletTransaction } from "../types";
import { SigningError, signingErrorCodes } from "./errors";

const maxWalletTransactions = 512;

function bytesEqual(left?: Uint8Array, right?: Uint8Array): boolean {
	if (!left || !right || left.length !== right.length) {
		return false;
	}

	return left.every((value, index) => value === right[index]);
}

function groupKey(group?: Uint8Array): string {
	return group && group.length ? algosdk.bytesToBase64(group) : "";
}

function networkGenesisId(genesisID?: string): string | undefined {
	return genesisID === "sandnet-v1" ? "dockernet-v1" : genesisID;
}

function transactionGenesisHash(transaction: Transaction): string | undefined {
	return transaction.genesisHash ? algosdk.bytesToBase64(transaction.genesisHash) : undefined;
}

function cloneWithoutGroup(transaction: Transaction): Transaction {
	const clone = algosdk.decodeUnsignedTransaction(algosdk.encodeUnsignedTransaction(transaction));
	clone.group = undefined;

	return clone;
}

export interface DecodedWalletTransaction {
	walletTransaction: WalletTransaction;
	transaction: Transaction;
	index: number;
}

export interface TransactionNetworkValidationResult {
	network: Network;
	networkName: string;
}

export interface TransactionGroupValidationResult {
	groupWarn: boolean;
}

export function shouldSignWalletTransaction(walletTransaction: WalletTransaction): boolean {
	return walletTransaction.signers == null || walletTransaction.signers.length > 0;
}

export function decodeWalletTransactions(
	walletTransactions: WalletTransaction[],
): DecodedWalletTransaction[] {
	return walletTransactions.map((walletTransaction, index) => {
		try {
			return {
				walletTransaction,
				transaction: algosdk.decodeUnsignedTransaction(algosdk.base64ToBytes(walletTransaction.txn)),
				index,
			};
		} catch (error) {
			throw new SigningError("Invalid Transaction", signingErrorCodes.invalidRequest, {
				index,
				cause: error,
			});
		}
	});
}

export function validateWalletTransactionCount(walletTransactions: WalletTransaction[]): void {
	if (!walletTransactions.length) {
		throw new SigningError("Invalid Request", signingErrorCodes.invalidRequest);
	}

	if (walletTransactions.length > maxWalletTransactions) {
		throw new SigningError("Too Many Transactions", signingErrorCodes.tooManyTransactions);
	}
}

export function validateTransactionNetwork(args: {
	transactions: Transaction[];
	networks: Network[];
}): TransactionNetworkValidationResult {
	if (!args.transactions.length) {
		throw new SigningError("Invalid Request", signingErrorCodes.invalidRequest);
	}

	const firstGenesisId = networkGenesisId(args.transactions[0]?.genesisID);
	const firstGenesisHash = transactionGenesisHash(args.transactions[0]);

	for (const transaction of args.transactions) {
		if (
			networkGenesisId(transaction.genesisID) !== firstGenesisId ||
			transactionGenesisHash(transaction) !== firstGenesisHash
		) {
			throw new SigningError("Mixed Networks", signingErrorCodes.invalidRequest);
		}
	}

	const network = args.networks.find(
		(item) =>
			item.genesisID === firstGenesisId &&
			(!item.genesisHash || !firstGenesisHash || item.genesisHash === firstGenesisHash),
	);

	if (!network) {
		throw new SigningError("Unknown Network", signingErrorCodes.invalidRequest);
	}

	return { network, networkName: network.name };
}

export function validateTransactionGroups(
	transactions: Transaction[],
): TransactionGroupValidationResult {
	if (!transactions.length) {
		throw new SigningError("Invalid Request", signingErrorCodes.invalidRequest);
	}

	if (transactions.length > maxWalletTransactions) {
		throw new SigningError("Too Many Transactions", signingErrorCodes.tooManyTransactions);
	}

	const hasGroup = transactions.some((transaction) => !!transaction.group?.length);

	if (transactions.length === 1 && !hasGroup) {
		return { groupWarn: false };
	}

	const segments: Array<{ key: string; transactions: Transaction[] }> = [];
	let ungroupedCount = 0;

	for (const transaction of transactions) {
		const key = groupKey(transaction.group);
		const last = segments.at(-1);

		if (!key) {
			ungroupedCount++;
		}

		if (last && last.key === key) {
			last.transactions.push(transaction);
			continue;
		}

		segments.push({ key, transactions: [transaction] });
	}

	for (const segment of segments) {
		if (!segment.key) {
			continue;
		}

		const transactionsWithoutGroup = segment.transactions.map(cloneWithoutGroup);
		const expectedGroup = algosdk.computeGroupID(transactionsWithoutGroup);

		if (!bytesEqual(segment.transactions[0]?.group, expectedGroup)) {
			throw new SigningError("Invalid Group", signingErrorCodes.invalidRequest);
		}
	}

	const groupedKeys = new Set(segments.map((segment) => segment.key).filter(Boolean));

	return { groupWarn: groupedKeys.size > 1 || ungroupedCount > 1 || segments.length > 1 };
}

export function prepareDecodedWalletTransactions(args: {
	walletTransactions: WalletTransaction[];
	networks: Network[];
}): {
	decoded: DecodedWalletTransaction[];
	network: Network;
	networkName: string;
	groupWarn: boolean;
} {
	validateWalletTransactionCount(args.walletTransactions);
	const decoded = decodeWalletTransactions(args.walletTransactions);
	const transactions = decoded.map((item) => item.transaction);
	const { network, networkName } = validateTransactionNetwork({ transactions, networks: args.networks });
	const { groupWarn } = validateTransactionGroups(transactions);

	return { decoded, network, networkName, groupWarn };
}
