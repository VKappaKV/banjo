import type { Algodv2, Indexer } from "algosdk";
import type { WalletState } from "../state";
import type { AccountHD, NsObject } from "../types";
import { getAuthorizedAccounts as getAuthorizedAccountsDefault } from "../network";

export interface RefreshWalletDataOptions {
	state: WalletState;
	algod: Algodv2;
	indexer?: Indexer;
	getAuthorizedAccounts?: (address: string, indexer?: Indexer) => Promise<string[]>;
	deriveHdAddress?: (xpub: string, index: number) => Promise<string>;
	reverseLookup?: (addresses: string[]) => Promise<NsObject>;
}

export interface RefreshWalletDataResult {
	accountInfo: AccountHD[];
	namespaceRecords: NsObject;
}

function accountAddress(accountInfo: AccountHD, fallback: string): string {
	return accountInfo.address?.toString() ?? fallback;
}

async function fetchAccountInfo(
	algod: Algodv2,
	address: string,
	extra: Partial<AccountHD> = {},
): Promise<AccountHD> {
	const accountInfo = (await algod.accountInformation(address).do()) as AccountHD;

	return {
		...accountInfo,
		address: accountAddress(accountInfo, address),
		...extra,
	} as AccountHD;
}

export async function refreshWalletData({
	state,
	algod,
	indexer,
	getAuthorizedAccounts = getAuthorizedAccountsDefault,
	deriveHdAddress,
	reverseLookup,
}: RefreshWalletDataOptions): Promise<RefreshWalletDataResult> {
	const accountInfo: AccountHD[] = [];
	const seenAddresses = new Set<string>();
	const storedAddresses = new Set(state.accounts.map((account) => account.addr));
	const accounts = state.accounts.filter(
		(account) => !account.network || account.network === state.networkName,
	);

	async function appendAccount(address: string, extra: Partial<AccountHD> = {}) {
		if (seenAddresses.has(address)) {
			return;
		}

		const info = await fetchAccountInfo(algod, address, extra);
		seenAddresses.add(info.address);
		accountInfo.push(info);
	}

	for (const account of accounts) {
		await appendAccount(account.addr);

		const authorizedAccounts = await getAuthorizedAccounts(account.addr, indexer);

		for (const authorizedAddress of authorizedAccounts) {
			if (!storedAddresses.has(authorizedAddress)) {
				await appendAccount(authorizedAddress);
			}
		}

		if (account.xpub && account.idxs && deriveHdAddress) {
			for (const index of account.idxs) {
				const siblingAddress = await deriveHdAddress(account.xpub, index);
				await appendAccount(siblingAddress, { sibling: account.addr, addrIdx: index });
			}
		}
	}

	const addresses = accountInfo.map((account) => account.address);
	let namespaceRecords: NsObject = {};

	if (reverseLookup && addresses.length > 0) {
		try {
			namespaceRecords = await reverseLookup(addresses);
		} catch {
			// NFD reverse lookup is optional metadata; missing names must not block account refresh.
			namespaceRecords = Object.fromEntries(
				addresses
					.map((address) => [address, state.namespaceRecords[address]] as const)
					.filter(([, record]) => !!record)
			);
		}
	}

	return { accountInfo, namespaceRecords };
}
