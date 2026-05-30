import type { SigningApprovalController, WalletSignedTransaction } from "$core/signing";
import type { WalletStorage } from "$core/storage";
import type { CredentialProvider, CryptoProvider, FetchJson, LedgerProvider, WalletRuntime } from "$core/runtime";
import type { WalletTransaction } from "$core/types";
import {
	BrowserCredentialProvider,
	BrowserCryptoProvider,
	browserFetchJson,
	createBrowserLogger,
	createBrowserWalletRuntime,
	createInternalModalSigningAdapter,
} from "$core/adapters";
import type { BanjoLogger } from "$core/logging";
import { createIndexedDbWalletStorage } from "$core/storage";

export interface WalletCoreCallbacks {
	onNotify?: WalletRuntime["notify"];
	onLoading?: NonNullable<WalletRuntime["setLoading"]>;
	onOverlay?: NonNullable<WalletRuntime["setOverlay"]>;
	onConfirm?: NonNullable<WalletRuntime["confirm"]>;
	onSendMessage?: NonNullable<WalletRuntime["sendMessage"]>;
	isDebugEnabled?: () => boolean;
	requestWalletTransactionApproval?: (walletTxns: WalletTransaction[]) => Promise<WalletSignedTransaction[]>;
}

export interface WalletCoreServices {
	storage: WalletStorage;
	runtime: WalletRuntime;
	cryptoProvider: CryptoProvider;
	credentialProvider: CredentialProvider;
	ledgerProvider: LedgerProvider;
	fetchJson: FetchJson;
	logger: BanjoLogger;
	approvalController?: SigningApprovalController;
}

class BrowserLedgerProvider implements LedgerProvider {
	async listLedgerDevices(): Promise<[]> {
		return [];
	}
}

export function createWalletCore(callbacks: WalletCoreCallbacks = {}): WalletCoreServices {
	const logger = createBrowserLogger({ isDebugEnabled: callbacks.isDebugEnabled });

	return {
		storage: createIndexedDbWalletStorage(),
		runtime: createBrowserWalletRuntime({
			logger,
			onNotify: callbacks.onNotify,
			onLoading: callbacks.onLoading,
			onOverlay: callbacks.onOverlay,
			onConfirm: callbacks.onConfirm,
			onSendMessage: callbacks.onSendMessage,
		}),
		cryptoProvider: new BrowserCryptoProvider(),
		credentialProvider: new BrowserCredentialProvider(),
		ledgerProvider: new BrowserLedgerProvider(),
		fetchJson: browserFetchJson,
		logger,
		approvalController: callbacks.requestWalletTransactionApproval
			? createInternalModalSigningAdapter({
					requestWalletTransactionApproval: callbacks.requestWalletTransactionApproval,
				})
			: undefined,
	};
}
