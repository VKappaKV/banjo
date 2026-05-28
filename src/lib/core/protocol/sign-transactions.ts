import type { Transaction } from "algosdk";
import type { Network, WalletTransaction } from "../types";
import {
	prepareDecodedWalletTransactions,
	signWalletTransactionRequest,
	transactionRequestNeedsPassword,
	type DecodedWalletTransaction,
	type SigningContext,
} from "../signing";
import type { SignTransactionsProtocolResponse } from "./models";

export interface PreparedSigningProtocolRequest {
	walletTransactions: WalletTransaction[];
	decoded: DecodedWalletTransaction[];
	transactions: Transaction[];
	network: Network;
	networkName: string;
	groupWarn: boolean;
}

export function prepareSignTransactionsProtocolRequest(args: {
	walletTransactions: WalletTransaction[];
	networks: Network[];
}): PreparedSigningProtocolRequest {
	const prepared = prepareDecodedWalletTransactions({
		walletTransactions: args.walletTransactions,
		networks: args.networks,
	});

	return {
		...prepared,
		walletTransactions: args.walletTransactions,
		transactions: prepared.decoded.map((item) => item.transaction),
	};
}

export function preparedSignTransactionsRequestNeedsPassword(args: {
	prepared: PreparedSigningProtocolRequest;
	context: Pick<SigningContext, "state">;
}): boolean {
	return transactionRequestNeedsPassword({
		walletTransactions: args.prepared.walletTransactions,
		transactions: args.prepared.transactions,
		context: args.context,
	});
}

export async function completeSignTransactionsProtocolRequest(args: {
	walletTransactions: WalletTransaction[];
	context: SigningContext;
}): Promise<SignTransactionsProtocolResponse> {
	const response = await signWalletTransactionRequest({
		walletTransactions: args.walletTransactions,
		context: args.context,
	});

	return { action: "signed", txns: response.signedTransactions };
}
