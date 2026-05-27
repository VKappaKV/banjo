import algosdk, { type Transaction, type TransactionSigner } from "algosdk";
import type { WalletTransaction } from "../types";
import { SigningError, signingErrorCodes } from "./errors";
import { signTransactions, type SignTransactionsOptions, resolveTransactionSigner } from "./signer";
import {
	decodeWalletTransactions,
	shouldSignWalletTransaction,
	validateWalletTransactionCount,
} from "./transactions";

export type WalletSignedTransaction = Uint8Array | null;

export interface WalletSignedResponse {
	signedTransactions: WalletSignedTransaction[];
}

export interface SigningApprovalController {
	requestSignatureReview(request: WalletTransaction[]): Promise<WalletSignedTransaction[]>;
}

export type SigningContext = Omit<SignTransactionsOptions, "transactions" | "indexesToSign" | "authAddresses">;

function encodeWalletTransaction(transaction: Transaction): string {
	return algosdk.bytesToBase64(algosdk.encodeUnsignedTransaction(transaction));
}

function decodeSignedTransactionBytes(stxn: string): algosdk.SignedTransaction {
	try {
		return algosdk.decodeSignedTransaction(algosdk.base64ToBytes(stxn));
	} catch (error) {
		throw new SigningError("Invalid Signed Transaction", signingErrorCodes.invalidRequest, error);
	}
}

function validateSignedTransactionMatch(walletTransaction: WalletTransaction, transaction: Transaction): Uint8Array | undefined {
	if (!walletTransaction.stxn) {
		return undefined;
	}

	const signedBytes = algosdk.base64ToBytes(walletTransaction.stxn);
	const signedTransaction = decodeSignedTransactionBytes(walletTransaction.stxn);

	if (signedTransaction.txn.txID() !== transaction.txID()) {
		throw new SigningError("Signed Transaction Mismatch", signingErrorCodes.invalidRequest);
	}

	return signedBytes;
}

export function transactionRequestNeedsPassword(args: {
	walletTransactions: WalletTransaction[];
	transactions: Transaction[];
	context: Pick<SigningContext, "state">;
}): boolean {
	return args.walletTransactions.some((walletTransaction, index) => {
		if (!shouldSignWalletTransaction(walletTransaction)) {
			return false;
		}

		const resolved = resolveTransactionSigner({
			transaction: args.transactions[index]!,
			index,
			state: args.context.state,
			authAddresses: args.walletTransactions.map((item) => item.authAddr),
		});
		const seedId = resolved.account.seedId;

		if (seedId == null) {
			return false;
		}

		const seedData = args.context.state.seeds.find((seed) => seed.id === seedId);

		return !!seedData && !seedData.credentialId;
	});
}

export async function signWalletTransactionRequest(args: {
	walletTransactions: WalletTransaction[];
	context: SigningContext;
}): Promise<WalletSignedResponse> {
	validateWalletTransactionCount(args.walletTransactions);
	const decoded = decodeWalletTransactions(args.walletTransactions);
	const authAddresses = args.walletTransactions.map((walletTransaction) => walletTransaction.authAddr);
	const indexesToSign: number[] = [];
	const signedTransactions: WalletSignedTransaction[] = new Array(args.walletTransactions.length).fill(null);

	for (const { walletTransaction, transaction, index } of decoded) {
		const acceptedSignedTransaction = validateSignedTransactionMatch(walletTransaction, transaction);

		if (!shouldSignWalletTransaction(walletTransaction)) {
			signedTransactions[index] = acceptedSignedTransaction ?? null;
			continue;
		}

		const resolved = resolveTransactionSigner({
			transaction,
			index,
			state: args.context.state,
			authAddresses,
			msig: args.context.msig,
		});

		if (walletTransaction.signers?.length && !walletTransaction.signers.includes(resolved.signingAddress)) {
			throw new SigningError("Invalid Signer", signingErrorCodes.invalidRequest);
		}

		indexesToSign.push(index);
	}

	const signed = await signTransactions({
		...args.context,
		transactions: decoded.map((item) => item.transaction),
		indexesToSign,
		authAddresses,
	});

	indexesToSign.forEach((index, signedIndex) => {
		signedTransactions[index] = signed[signedIndex]!;
	});

	return { signedTransactions };
}

export function walletTransactionsFromGroup(
	transactionGroup: Transaction[],
	indexesToSign?: number[],
): WalletTransaction[] {
	const indexes = indexesToSign ? new Set(indexesToSign) : undefined;

	return transactionGroup.map((transaction, index) => ({
		txn: encodeWalletTransaction(transaction),
		...(indexes && !indexes.has(index) ? { signers: [] } : {}),
	}));
}

export function createApprovalTransactionSigner(
	approvalController: SigningApprovalController,
): TransactionSigner {
	return async (transactionGroup, indexesToSign) => {
		const response = await approvalController.requestSignatureReview(
			walletTransactionsFromGroup(transactionGroup, indexesToSign),
		);

		return indexesToSign.map((index) => {
			const signed = response[index];

			if (!signed) {
				throw new SigningError("Missing Signed Transaction", signingErrorCodes.invalidRequest);
			}

			return signed;
		});
	};
}

export function createBanjoTransactionSigner(context: SigningContext): TransactionSigner {
	return async (transactionGroup, indexesToSign) => {
		return signTransactions({ ...context, transactions: transactionGroup, indexesToSign });
	};
}
