import { builtInNetworks } from "../data/networks";
import type {
	AccountHD,
	BanjoAccount,
	Network,
	NsObject,
	SeedData,
	TinyAsset,
} from "../types";

export interface WalletState {
	accounts: BanjoAccount[];
	accountInfo: AccountHD[];
	namespaceRecords: NsObject;
	networkName: string;
	customNetworks: Network[];
	hotWalletEnabled: boolean;
	hotKeyAddresses: string[];
	seeds: SeedData[];
	debug: boolean;
	snoop: boolean;
	ledgerSelect: boolean;
	experimental: boolean;
	fallbackEnabled: boolean;
	signDataMode: boolean;
	tinyman?: TinyAsset[];
	sandboxRouter?: number;
}

export function createInitialWalletState(): WalletState {
	return {
		accounts: [],
		accountInfo: [],
		namespaceRecords: {},
		networkName: builtInNetworks[0]?.name ?? "MainNet",
		customNetworks: [],
		hotWalletEnabled: true,
		hotKeyAddresses: [],
		seeds: [],
		debug: false,
		snoop: false,
		ledgerSelect: false,
		experimental: false,
		fallbackEnabled: false,
		signDataMode: false,
	};
}
