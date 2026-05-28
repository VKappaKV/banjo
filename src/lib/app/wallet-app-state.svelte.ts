import type { WalletSignedTransaction } from "$core/signing";
import type { WalletState } from "$core/state";
import type { WalletTransaction } from "$core/types";
import {
	createAlgodClient,
	createIndexerClient,
	reverseLookupNames,
} from "$core/network";
import { refreshWalletData } from "$core/accounts";
import {
	createInitialWalletState,
	loadWalletState,
	selectAccountInfo,
	selectAllNetworks,
	selectNetwork,
	setSelectedNetworkName,
} from "$core/state";
import { builtInNetworks } from "$core/data/networks";
import { createWalletCore, type WalletCoreCallbacks, type WalletCoreServices } from "./wallet-core";
import type { WalletView } from "./views";

export interface AppNotification {
	id: number;
	message: string;
	color: "info" | "success" | "warning" | "error";
}

export interface AppConfirmation {
	id: number;
	message: string;
}

export interface InternalSigningRequest {
	id: number;
	walletTxns: WalletTransaction[];
}

export interface WalletAppStateOptions {
	core?: WalletCoreServices;
	createCore?: (callbacks: WalletCoreCallbacks) => WalletCoreServices;
	initialView?: WalletView;
}

export class WalletAppState {
	state = $state.raw<WalletState>(createInitialWalletState());
	view = $state<WalletView>("accounts");
	initialized = $state(false);
	initializing = $state(false);
	startupError = $state<string | undefined>();
	loadingCount = $state(0);
	notifications = $state.raw<AppNotification[]>([]);
	confirmation = $state.raw<AppConfirmation | undefined>();
	signingRequest = $state.raw<InternalSigningRequest | undefined>();
	core = $state.raw<WalletCoreServices | undefined>();

	private notificationId = 0;
	private confirmationId = 0;
	private signingRequestId = 0;
	private confirmResolver?: (confirmed: boolean) => void;
	private signingResolver?: (signed: WalletSignedTransaction[]) => void;

	constructor(private readonly options: WalletAppStateOptions = {}) {
		this.view = options.initialView ?? "accounts";
	}

	get allNetworks() {
		return selectAllNetworks(builtInNetworks, this.state.customNetworks);
	}

	get selectedNetwork() {
		return selectNetwork(this.state, builtInNetworks);
	}

	get accounts() {
		return selectAccountInfo(this.state);
	}

	get isLoading() {
		return this.loadingCount > 0 || this.initializing;
	}

	initialize = async (): Promise<void> => {
		if (this.initialized || this.initializing) {
			return;
		}

		this.initializing = true;
		this.startupError = undefined;

		try {
			this.core = this.options.core ?? (this.options.createCore ?? createWalletCore)({
				onNotify: this.notify,
				onLoading: this.setLoading,
				onConfirm: this.requestConfirmation,
				requestWalletTransactionApproval: this.requestWalletTransactionApproval,
			});
			this.state = await loadWalletState({
				storage: this.core.storage,
				cryptoProvider: this.core.cryptoProvider,
			});
			this.initialized = true;
		} catch (error) {
			this.startupError = error instanceof Error ? error.message : "Failed to load wallet state";
			this.notify(this.startupError, "error");
		} finally {
			this.initializing = false;
		}
	};

	refreshWallet = async (): Promise<void> => {
		if (!this.core) {
			await this.initialize();
		}

		if (!this.core) {
			return;
		}

		this.setLoading(1);

		try {
			const state = this.state;
			const network = selectNetwork(state, builtInNetworks);
			const algod = createAlgodClient(network, state.fallbackEnabled);
			const indexer = createIndexerClient(network, state.fallbackEnabled);
			const result = await refreshWalletData({
				state,
				algod,
				indexer,
				reverseLookup: (addresses) =>
					reverseLookupNames({ addresses, network, fetchJson: this.core!.fetchJson }),
			});

			this.state = {
				...state,
				accountInfo: result.accountInfo,
				namespaceRecords: result.namespaceRecords,
			};
			this.notify("Wallet refreshed", "success");
		} catch (error) {
			this.notify(error instanceof Error ? error.message : "Failed to refresh wallet", "error");
		} finally {
			this.setLoading(-1);
		}
	};

	switchNetwork = async (networkName: string): Promise<void> => {
		if (!this.core || networkName === this.state.networkName) {
			return;
		}

		const network = this.allNetworks.find((item) => item.name === networkName);

		if (!network) {
			this.notify(`Unknown network: ${networkName}`, "error");
			return;
		}

		await setSelectedNetworkName(this.core.storage, networkName);
		this.state = {
			...this.state,
			networkName,
			accountInfo: [],
			namespaceRecords: {},
		};
		this.notify(`Switched to ${networkName}`, "success");

		if (this.state.accounts.length) {
			await this.refreshWallet();
		}
	};

	setView = (view: WalletView): void => {
		this.view = view;
	};

	notify = (message: string, color: AppNotification["color"] = "info", timeout = 4000): void => {
		const notification = { id: ++this.notificationId, message, color };
		this.notifications = [notification, ...this.notifications].slice(0, 4);

		if (timeout > 0) {
			globalThis.setTimeout(() => this.dismissNotification(notification.id), timeout);
		}
	};

	dismissNotification = (id: number): void => {
		this.notifications = this.notifications.filter((notification) => notification.id !== id);
	};

	setLoading = (delta: number): void => {
		this.loadingCount = Math.max(0, this.loadingCount + delta);
	};

	requestConfirmation = (message: string): Promise<boolean> => {
		this.confirmation = { id: ++this.confirmationId, message };

		return new Promise((resolve) => {
			this.confirmResolver = resolve;
		});
	};

	resolveConfirmation = (confirmed: boolean): void => {
		this.confirmResolver?.(confirmed);
		this.confirmResolver = undefined;
		this.confirmation = undefined;
	};

	requestWalletTransactionApproval = (walletTxns: WalletTransaction[]): Promise<WalletSignedTransaction[]> => {
		this.signingRequest = { id: ++this.signingRequestId, walletTxns };

		return new Promise((resolve) => {
			this.signingResolver = resolve;
		});
	};

	resolveSigningRequest = (approved: boolean): void => {
		const count = this.signingRequest?.walletTxns.length ?? 0;
		const signed = approved ? new Array<WalletSignedTransaction>(count).fill(null) : [];

		this.signingResolver?.(signed);
		this.signingResolver = undefined;
		this.signingRequest = undefined;
	};
}
