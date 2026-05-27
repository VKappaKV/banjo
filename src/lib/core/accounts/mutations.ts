import algosdk from "algosdk";
import type { WalletState } from "../state";
import type { WalletStorage } from "../storage";
import type { AccountSubs, BanjoAccount } from "../types";

export class AccountMutationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AccountMutationError";
	}
}

export function assertAccountNotExists(accounts: BanjoAccount[], address: string): void {
	if (accounts.some((account) => account.addr === address)) {
		throw new AccountMutationError("Account Already Exists In Wallet");
	}
}

export function filterNewAccounts<T extends { address?: string; addr?: string }>(
	accounts: BanjoAccount[],
	candidates: T[],
): T[] {
	const existing = new Set(accounts.map((account) => account.addr));

	return candidates.filter((candidate) => {
		const address = candidate.address ?? candidate.addr;

		return !!address && !existing.has(address);
	});
}

export async function saveAccounts(storage: WalletStorage, accounts: BanjoAccount[]): Promise<void> {
	await storage.setAccounts(accounts.map((account) => ({ ...account })));
}

export async function appendAccount(args: {
	state: WalletState;
	storage: WalletStorage;
	account: BanjoAccount;
}): Promise<BanjoAccount> {
	assertAccountNotExists(args.state.accounts, args.account.addr);
	const account = { ...args.account };
	const accounts = [...args.state.accounts, account];
	await saveAccounts(args.storage, accounts);
	args.state.accounts = accounts;

	return account;
}

export async function addWatchAccount(args: {
	address: string;
	state: WalletState;
	storage: WalletStorage;
}): Promise<BanjoAccount> {
	if (!algosdk.isValidAddress(args.address)) {
		throw new AccountMutationError("Invalid Address");
	}

	return appendAccount({ state: args.state, storage: args.storage, account: { addr: args.address } });
}

export async function addHdAccounts(args: {
	selected: AccountSubs[];
	allCandidates: AccountSubs[];
	seedId: number;
	state: WalletState;
	storage: WalletStorage;
	seedToZeroize?: Uint8Array;
}): Promise<BanjoAccount[]> {
	args.seedToZeroize?.fill(0);
	const newCandidates = filterNewAccounts(args.state.accounts, args.selected);
	const add = newCandidates.map((candidate) => ({
		addr: candidate.address,
		slot: args.allCandidates.findIndex((account) => account.address === candidate.address),
		seedId: args.seedId,
		xpub: candidate.xpub,
	}));
	const accounts = args.state.accounts.concat(add);
	await saveAccounts(args.storage, accounts);
	args.state.accounts = accounts;

	return add;
}

export async function addLedgerAccounts(args: {
	selected: AccountSubs[];
	allCandidates: AccountSubs[];
	state: WalletState;
	storage: WalletStorage;
}): Promise<BanjoAccount[]> {
	const newCandidates = filterNewAccounts(args.state.accounts, args.selected);
	const add = newCandidates.map((candidate) => ({
		addr: candidate.address,
		slot: args.allCandidates.findIndex((account) => account.address === candidate.address),
	}));
	const accounts = args.state.accounts.concat(add);
	await saveAccounts(args.storage, accounts);
	args.state.accounts = accounts;

	return add;
}
