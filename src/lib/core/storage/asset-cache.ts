export type AssetStoreName =
	| "assets-betanet"
	| "assets-mainnet"
	| "assets-testnet"
	| "assets-voi mainnet"
	| "assets-voi testnet";

const assetStoresByNetwork = new Map<string, AssetStoreName>([
	["betanet", "assets-betanet"],
	["mainnet", "assets-mainnet"],
	["testnet", "assets-testnet"],
	["voi mainnet", "assets-voi mainnet"],
	["voi testnet", "assets-voi testnet"],
]);

export function getAssetStoreName(networkName: string): AssetStoreName | undefined {
	return assetStoresByNetwork.get(networkName.toLowerCase());
}
