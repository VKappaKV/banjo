import { builtInNetworks } from "../data/networks";
import type { CryptoProvider } from "../runtime";
import type { WalletStorage } from "../storage";
import type { Network } from "../types";
import { createInitialWalletState, type WalletState } from "./wallet-state";
import { selectAllNetworks } from "./selectors";
import { walletSettingKeys } from "./settings";

export interface LoadWalletStateOptions {
	storage: WalletStorage;
	cryptoProvider: Pick<CryptoProvider, "supportsNonExtractableEd25519">;
	builtIns?: Network[];
}

export async function loadWalletState(options: LoadWalletStateOptions): Promise<WalletState> {
	const initialState = createInitialWalletState();
	const builtIns = options.builtIns ?? builtInNetworks;
	const customNetworks = (await options.storage.getAppValue<Network[]>(walletSettingKeys.customNetworks)) ?? [];
	const storedNetworkName = await options.storage.getAppValue<string>(walletSettingKeys.networkName);
	const knownNetwork = selectAllNetworks(builtIns, customNetworks).find(
		(network) => network.name === storedNetworkName,
	);
	const hotWalletSupported = await options.cryptoProvider.supportsNonExtractableEd25519();

	return {
		...initialState,
		accounts: await options.storage.getAccounts(),
		networkName: knownNetwork?.name ?? builtIns[0]?.name ?? initialState.networkName,
		customNetworks,
		hotWalletEnabled: hotWalletSupported,
		hotKeyAddresses: await options.storage.listHotKeyAddresses(),
		seeds: await options.storage.getAllSeeds(),
		debug: (await options.storage.getAppValue<boolean>(walletSettingKeys.debug)) ?? initialState.debug,
		snoop: (await options.storage.getAppValue<boolean>(walletSettingKeys.snoop)) ?? initialState.snoop,
		ledgerSelect:
			(await options.storage.getAppValue<boolean>(walletSettingKeys.ledgerSelect)) ?? initialState.ledgerSelect,
		experimental:
			(await options.storage.getAppValue<boolean>(walletSettingKeys.experimental)) ?? initialState.experimental,
		fallbackEnabled:
			(await options.storage.getAppValue<boolean>(walletSettingKeys.fallback)) ?? initialState.fallbackEnabled,
		sandboxRouter: await options.storage.getAppValue<number>(walletSettingKeys.sandboxRouter),
	};
}
