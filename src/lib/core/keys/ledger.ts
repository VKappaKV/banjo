import { type Algodv2, type Indexer } from "algosdk";
import type { LedgerProvider } from "../runtime";
import type { AccountSubs } from "../types";
import { getAuthorizedAccounts as getAuthorizedAccountsDefault } from "../network";

export const defaultLedgerDiscoveryCount = 4;

export class LedgerError extends Error {
	constructor(
		message: string,
		public readonly code?: number,
	) {
		super(message);
		this.name = "LedgerError";
	}
}

export async function discoverLedgerAccounts(args: {
	ledgerProvider: LedgerProvider;
	startIndex?: number;
	count?: number;
	algod: Algodv2;
	indexer?: Indexer;
	getAuthorizedAccounts?: (address: string, indexer?: Indexer) => Promise<string[]>;
}): Promise<AccountSubs[]> {
	if (!args.ledgerProvider.getAddressAndPublicKey) {
		throw new LedgerError("Ledger provider does not support address discovery");
	}

	const accounts: AccountSubs[] = [];
	const startIndex = args.startIndex ?? 0;
	const count = args.count ?? defaultLedgerDiscoveryCount;
	const getAuthorizedAccounts = args.getAuthorizedAccounts ?? getAuthorizedAccountsDefault;

	try {
		for (let i = startIndex; i < startIndex + count; i++) {
			const { address } = await args.ledgerProvider.getAddressAndPublicKey(i);
			const accountInfo = (await args.algod.accountInformation(address).do()) as AccountSubs;
			accountInfo.subs = await getAuthorizedAccounts(address, args.indexer);
			accounts.push(accountInfo);
		}
	} finally {
		await args.ledgerProvider.close?.();
	}

	return accounts;
}

export async function signWithLedger(args: {
	ledgerProvider: LedgerProvider;
	accountSlot: number;
	transactionBytes: Uint8Array;
}): Promise<Uint8Array> {
	if (!args.ledgerProvider.signTransaction) {
		throw new LedgerError("Ledger provider does not support transaction signing");
	}

	try {
		return await args.ledgerProvider.signTransaction(args.accountSlot, args.transactionBytes);
	} catch (error) {
		if (error instanceof Error && error.message.toLowerCase().includes("rejected")) {
			throw new LedgerError("User Rejected Request", 4001);
		}

		throw error;
	}
}
