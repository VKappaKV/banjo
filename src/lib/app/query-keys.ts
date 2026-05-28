export const queryKeys = {
	all: ["banjo"] as const,
	appState: () => [...queryKeys.all, "app-state"] as const,
	accounts: (networkName: string) => [...queryKeys.all, "accounts", networkName] as const,
	account: (networkName: string, address: string) => [...queryKeys.accounts(networkName), address] as const,
	assets: (networkName: string, address: string) => [...queryKeys.all, "assets", networkName, address] as const,
	assetMetadata: (networkName: string, assetId: string | number | bigint) =>
		[...queryKeys.all, "asset-metadata", networkName, assetId.toString()] as const,
	names: (networkName: string, addresses: readonly string[]) =>
		[...queryKeys.all, "names", networkName, ...addresses] as const,
	networkStatus: (networkName: string) => [...queryKeys.all, "network-status", networkName] as const,
	settings: () => [...queryKeys.all, "settings"] as const,
};
