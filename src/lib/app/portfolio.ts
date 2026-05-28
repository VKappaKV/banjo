import type { modelsv2 } from "algosdk";
import type { AccountInfo, Network } from "$core/types";

export interface PortfolioSummary {
	totalAccounts: number;
	signableAccounts: number;
	watchAccounts: number;
	totalMicroAlgos: bigint;
	totalAssets: number;
	distinctAssets: number;
	namedAccounts: number;
}

export function microAlgos(account: AccountInfo): bigint {
	const amount = account.info?.amount;

	if (typeof amount === "bigint") return amount;
	if (typeof amount === "number") return BigInt(amount);

	return 0n;
}

export function formatMicroAlgos(amount: bigint | number | undefined): string {
	const microAlgos = typeof amount === "bigint" ? amount : BigInt(Number(amount ?? 0));
	const whole = microAlgos / 1_000_000n;
	const fraction = (microAlgos % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");

	return `${whole.toString()}${fraction ? `.${fraction}` : ""} ALGO`;
}

export function accountKind(account: AccountInfo): string {
	if (account.subType === "rekey") return "Rekeyed";
	if (account.subType === "hd") return "HD child";
	if (account.appId) return "ARC-55";
	if (account.falcon) return "Falcon";
	if (account.slot !== undefined) return "Ledger/HD";
	if (account.isHot) return "Hot";
	if (account.canSign) return "Signer";
	return "Watch";
}

export function assetHoldingId(holding: modelsv2.AssetHolding): bigint {
	return BigInt(holding.assetId ?? 0);
}

export function assetHoldingAmount(holding: modelsv2.AssetHolding): bigint {
	const amount = holding.amount;

	if (typeof amount === "bigint") return amount;
	if (typeof amount === "number") return BigInt(amount);

	return 0n;
}

export function formatAssetAmount(amount: bigint | number | undefined, decimals = 0): string {
	const value = typeof amount === "bigint" ? amount : BigInt(Number(amount ?? 0));

	if (decimals <= 0) return value.toString();

	const divisor = 10n ** BigInt(decimals);
	const whole = value / divisor;
	const fraction = (value % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");

	return `${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function calculatePortfolioSummary(accounts: readonly AccountInfo[]): PortfolioSummary {
	const assets = new Set<string>();

	for (const account of accounts) {
		for (const holding of account.info?.assets ?? []) {
			assets.add(assetHoldingId(holding).toString());
		}
	}

	return {
		totalAccounts: accounts.length,
		signableAccounts: accounts.filter((account) => account.canSign).length,
		watchAccounts: accounts.filter((account) => !account.canSign).length,
		totalMicroAlgos: accounts.reduce((total, account) => total + microAlgos(account), 0n),
		totalAssets: accounts.reduce((total, account) => total + (account.info?.assets?.length ?? 0), 0),
		distinctAssets: assets.size,
		namedAccounts: accounts.filter((account) => account.ns).length,
	};
}

export function explorerAccountUrl(network: Network, address: string): string | undefined {
	return network.explorer ? `${network.explorer.replace(/\/$/, "")}/account/${address}` : undefined;
}

export function explorerAssetUrl(network: Network, assetId: bigint | number | string): string | undefined {
	return network.explorer ? `${network.explorer.replace(/\/$/, "")}/asset/${assetId.toString()}` : undefined;
}
