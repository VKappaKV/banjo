export type AssetStoreName =
	| "assets-betanet"
	| "assets-mainnet"
	| "assets-testnet";

const assetStoresByNetwork = new Map<string, AssetStoreName>([
	["betanet", "assets-betanet"],
	["mainnet", "assets-mainnet"],
	["testnet", "assets-testnet"],
]);

export function getAssetStoreName(networkName: string): AssetStoreName | undefined {
	return assetStoresByNetwork.get(networkName.toLowerCase());
}
