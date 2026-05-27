import type { Indexer } from "algosdk";

interface SearchAccountsResponse {
	accounts?: Array<{ address?: string }>;
}

export async function getAuthorizedAccounts(address: string, indexer?: Indexer): Promise<string[]> {
	if (!indexer) {
		return [];
	}

	const response = (await indexer.searchAccounts().authAddr(address).do()) as SearchAccountsResponse;

	return (response.accounts ?? [])
		.map((account) => account.address)
		.filter((accountAddress): accountAddress is string => !!accountAddress);
}
