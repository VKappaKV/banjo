import type { SigningApprovalController, WalletSignedTransaction } from "$core/signing";
import type { WalletStorage } from "$core/storage";
import type { CredentialProvider, CryptoProvider, FetchJson, LedgerProvider, WalletRuntime } from "$core/runtime";
import type { WalletTransaction } from "$core/types";
import {
	BrowserCredentialProvider,
	BrowserCryptoProvider,
	browserFetchJson,
	createBrowserWalletRuntime,
	createInternalModalSigningAdapter,
} from "$core/adapters";
import { createIndexedDbWalletStorage } from "$core/storage";

export interface WalletCoreCallbacks {
	onNotify?: WalletRuntime["notify"];
	onLoading?: NonNullable<WalletRuntime["setLoading"]>;
	onOverlay?: NonNullable<WalletRuntime["setOverlay"]>;
	onConfirm?: NonNullable<WalletRuntime["confirm"]>;
	onSendMessage?: NonNullable<WalletRuntime["sendMessage"]>;
	requestWalletTransactionApproval?: (walletTxns: WalletTransaction[]) => Promise<WalletSignedTransaction[]>;
}

export interface WalletCoreServices {
	storage: WalletStorage;
	runtime: WalletRuntime;
	cryptoProvider: CryptoProvider;
	credentialProvider: CredentialProvider;
	ledgerProvider: LedgerProvider;
	fetchJson: FetchJson;
	approvalController?: SigningApprovalController;
}

class BrowserLedgerProvider implements LedgerProvider {
	async listLedgerDevices(): Promise<[]> {
		return [];
	}
}

export function createWalletCore(callbacks: WalletCoreCallbacks = {}): WalletCoreServices {
	return {
		storage: createIndexedDbWalletStorage(),
		runtime: createBrowserWalletRuntime({
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
		approvalController: callbacks.requestWalletTransactionApproval
			? createInternalModalSigningAdapter({
					requestWalletTransactionApproval: callbacks.requestWalletTransactionApproval,
				})
			: undefined,
	};
}
