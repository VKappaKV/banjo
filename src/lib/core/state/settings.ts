import type { Network } from "../types";
import type { WalletStorage } from "../storage";

export const walletSettingKeys = {
	networkName: "networkName",
	customNetworks: "customNetworks",
	debug: "debug",
	snoop: "snoop",
	ledgerSelect: "ledgerSelect",
	experimental: "experimental",
	fallback: "fallback",
	sandboxRouter: "sandboxRouter",
} as const;

export async function setSelectedNetworkName(storage: WalletStorage, networkName: string): Promise<void> {
	await storage.setAppValue(walletSettingKeys.networkName, networkName);
}

export async function setCustomNetworks(storage: WalletStorage, networks: Network[]): Promise<void> {
	await storage.setAppValue(walletSettingKeys.customNetworks, networks);
}

export async function setDebugEnabled(storage: WalletStorage, enabled: boolean): Promise<void> {
	await storage.setAppValue(walletSettingKeys.debug, enabled);
}

export async function setSnoopEnabled(storage: WalletStorage, enabled: boolean): Promise<void> {
	await storage.setAppValue(walletSettingKeys.snoop, enabled);
}

export async function setLedgerSelectEnabled(storage: WalletStorage, enabled: boolean): Promise<void> {
	await storage.setAppValue(walletSettingKeys.ledgerSelect, enabled);
}

export async function setExperimentalEnabled(storage: WalletStorage, enabled: boolean): Promise<void> {
	await storage.setAppValue(walletSettingKeys.experimental, enabled);
}

export async function setFallbackEnabled(storage: WalletStorage, enabled: boolean): Promise<void> {
	await storage.setAppValue(walletSettingKeys.fallback, enabled);
}

export async function setSandboxRouter(storage: WalletStorage, router: number | undefined): Promise<void> {
	if (router == null) {
		await storage.deleteAppValue(walletSettingKeys.sandboxRouter);
		return;
	}

	await storage.setAppValue(walletSettingKeys.sandboxRouter, router);
}
