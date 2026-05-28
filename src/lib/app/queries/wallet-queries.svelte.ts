import { createMutation, createQuery, useQueryClient } from "@tanstack/svelte-query";
import type { modelsv2 } from "algosdk";
import { getAssetInfo } from "$core/assets";
import { appendAccount, refreshWalletData } from "$core/accounts";
import { builtInNetworks } from "$core/data/networks";
import { createAlgodClient, createIndexerClient, reverseLookupNames } from "$core/network";
import { selectAccountInfo, selectNetwork, setSelectedNetworkName } from "$core/state";
import type { WalletState } from "$core/state";
import type { AccountInfo, BanjoAccount } from "$core/types";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { queryKeys } from "$lib/app/query-keys";

async function ensureInitialized(app: WalletAppState): Promise<void> {
	if (!app.core) {
		await app.initialize();
	}

	if (!app.core) {
		throw new Error("Wallet not initialized.");
	}
}

async function refreshAccountState(app: WalletAppState): Promise<AccountInfo[]> {
	await ensureInitialized(app);

	const state = app.state;
	const network = selectNetwork(state, builtInNetworks);
	const algod = createAlgodClient(network, state.fallbackEnabled);
	const indexer = createIndexerClient(network, state.fallbackEnabled);
	const result = await refreshWalletData({
		state,
		algod,
		indexer,
		reverseLookup: (addresses) => reverseLookupNames({ addresses, network, fetchJson: app.core!.fetchJson }),
	});
	const nextState = {
		...state,
		accountInfo: result.accountInfo,
		namespaceRecords: result.namespaceRecords,
	};

	app.state = nextState;

	return selectAccountInfo(nextState);
}

export function useAccountsQuery(app: WalletAppState) {
	return createQuery(() => ({
		queryKey: queryKeys.accounts(app.state.networkName),
		queryFn: () => refreshAccountState(app),
		enabled: app.initialized,
		retry: false,
		placeholderData: app.accounts,
	}));
}

export function useAccountQuery(app: WalletAppState, address: () => string) {
	return createQuery(() => ({
		queryKey: queryKeys.account(app.state.networkName, address()),
		queryFn: async () => {
			const accounts = await refreshAccountState(app);
			return accounts.find((account) => account.addr === address()) ?? null;
		},
		enabled: app.initialized && !!address(),
		placeholderData: app.accounts.find((account) => account.addr === address()) ?? null,
	}));
}

export function useAssetMetadataQuery(app: WalletAppState, assetId: () => bigint | number | undefined) {
	return createQuery(() => ({
		queryKey: queryKeys.assetMetadata(app.state.networkName, assetId() ?? "missing"),
		queryFn: async () => {
			await ensureInitialized(app);

			const id = assetId();
			if (id === undefined) return undefined;

			const network = selectNetwork(app.state, builtInNetworks);
			const algod = createAlgodClient(network, app.state.fallbackEnabled);

			return getAssetInfo({
				assetId: id,
				networkName: app.state.networkName,
				algod,
				storage: app.core!.storage,
				fetchJson: app.core!.fetchJson,
			});
		},
		enabled: app.initialized && assetId() !== undefined,
	}));
}

export function useAssetsQuery(app: WalletAppState, address: () => string) {
	return createQuery(() => ({
		queryKey: queryKeys.assets(app.state.networkName, address()),
		queryFn: async () => {
			const accounts = await refreshAccountState(app);
			return accountAssets(accounts.find((account) => account.addr === address()) ?? null);
		},
		enabled: app.initialized && !!address(),
		placeholderData: accountAssets(app.accounts.find((account) => account.addr === address())),
	}));
}

export function useNamesQuery(app: WalletAppState, addresses: () => readonly string[]) {
	return createQuery(() => ({
		queryKey: queryKeys.names(app.state.networkName, addresses()),
		queryFn: async () => {
			await ensureInitialized(app);

			const network = selectNetwork(app.state, builtInNetworks);
			return reverseLookupNames({ addresses: [...addresses()], network, fetchJson: app.core!.fetchJson });
		},
		enabled: app.initialized && addresses().length > 0,
		placeholderData: Object.fromEntries(
			addresses()
				.map((address) => [address, app.state.namespaceRecords[address]] as const)
				.filter(([, record]) => !!record)
		),
	}));
}

export function useNetworkStatusQuery(app: WalletAppState) {
	return createQuery(() => ({
		queryKey: queryKeys.networkStatus(app.state.networkName),
		queryFn: async () => {
			await ensureInitialized(app);

			const network = selectNetwork(app.state, builtInNetworks);
			return createAlgodClient(network, app.state.fallbackEnabled).status().do();
		},
		enabled: app.initialized,
		refetchInterval: 30_000,
	}));
}

export interface AddAccountVariables {
	account: BanjoAccount;
}

export function useAddAccountMutation(app: WalletAppState) {
	const client = useQueryClient();

	return createMutation<BanjoAccount, Error, AddAccountVariables>(() => ({
		mutationFn: async ({ account }) => {
			await ensureInitialized(app);
			const added = await appendAccount({ state: app.state, storage: app.core!.storage, account });
			app.state = { ...app.state, accounts: [...app.state.accounts] };
			return added;
		},
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: queryKeys.accounts(app.state.networkName) });
		},
	}));
}

export interface RemoveAccountVariables {
	address: string;
}

export interface RemoveAccountContext {
	state: WalletState;
}

export function useRemoveAccountMutation(app: WalletAppState) {
	const client = useQueryClient();

	return createMutation<void, Error, RemoveAccountVariables, RemoveAccountContext>(() => ({
		mutationFn: async ({ address }) => {
			await ensureInitialized(app);
			await app.core!.storage.setAccounts(app.state.accounts.filter((account) => account.addr !== address));
		},
		onMutate: async ({ address }) => {
			await client.cancelQueries({ queryKey: queryKeys.accounts(app.state.networkName) });
			const previousState = app.state;

			app.state = {
				...app.state,
				accounts: app.state.accounts.filter((account) => account.addr !== address),
				accountInfo: app.state.accountInfo.filter((account) => account.address !== address),
				namespaceRecords: Object.fromEntries(
					Object.entries(app.state.namespaceRecords).filter(([key]) => key !== address)
				),
			};

			return { state: previousState };
		},
		onError: (_error, _variables, context) => {
			if (context) {
				app.state = context.state;
			}
		},
		onSettled: async (_data, _error, variables) => {
			await client.invalidateQueries({ queryKey: queryKeys.accounts(app.state.networkName) });
			await client.invalidateQueries({ queryKey: queryKeys.account(app.state.networkName, variables.address) });
		},
	}));
}

export function useSwitchNetworkMutation(app: WalletAppState) {
	const client = useQueryClient();

	return createMutation<void, Error, string>(() => ({
		mutationFn: async (networkName) => {
			await ensureInitialized(app);

			const network = app.allNetworks.find((item) => item.name === networkName);
			if (!network) throw new Error(`Unknown network: ${networkName}`);

			await setSelectedNetworkName(app.core!.storage, networkName);
			app.state = {
				...app.state,
				networkName,
				accountInfo: [],
				namespaceRecords: {},
			};
		},
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: queryKeys.all });
		},
	}));
}

export function accountAssets(account: AccountInfo | null | undefined): modelsv2.AssetHolding[] {
	return account?.info?.assets ?? [];
}
