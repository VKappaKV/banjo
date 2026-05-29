import { createAlgodClient } from "$core/network";
import { getAssetInfo } from "$core/assets";
import {
	base64ToBytes,
	completeSignDataProtocolRequest,
	completeSignTransactionsProtocolRequest,
	prepareSignDataProtocolRequest,
	preparedSignDataRequestNeedsPassword,
	prepareSignTransactionsProtocolRequest,
	preparedSignTransactionsRequestNeedsPassword,
	type PreparedSignDataProtocolRequest,
	type PreparedSigningProtocolRequest,
	type SignDataProtocolRequest,
} from "$core/protocol";
import type { WalletTransaction } from "$core/types";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { DappRequestState } from "$lib/app/dapp-request-state.svelte";

function isWalletTransactionArray(value: unknown): value is WalletTransaction[] {
	return Array.isArray(value) && value.every((item) => !!item && typeof item === "object" && typeof (item as WalletTransaction).txn === "string");
}

function authenticatorData(value: unknown): Uint8Array {
	if (value instanceof Uint8Array) return value;
	if (typeof value === "string") return base64ToBytes(value);
	if (Array.isArray(value)) return Uint8Array.from(value as number[]);
	throw new Error("Invalid authenticator data.");
}

export class SignPageState {
	request = new DappRequestState();
	preparedSign = $state<PreparedSigningProtocolRequest | undefined>();
	preparedData = $state<PreparedSignDataProtocolRequest | undefined>();
	password = $state("");
	error = $state("");
	preparing = $state(false);
	assetLabels = $state.raw<Record<string, string>>({});

	constructor(readonly app: WalletAppState) {}

	get needsPassword() {
		if (this.preparedSign) {
			return preparedSignTransactionsRequestNeedsPassword({ prepared: this.preparedSign, context: { state: this.app.state } });
		}

		if (this.preparedData) {
			return preparedSignDataRequestNeedsPassword({ prepared: this.preparedData, state: this.app.state });
		}

		return false;
	}

	get mode() {
		return this.request.request?.action;
	}

	get hasGroupWarning() {
		return this.preparedSign?.groupWarn ?? false;
	}

	get hasStandardMultisigMetadata() {
		return this.preparedSign?.walletTransactions.some((txn) => !!txn.msig) ?? false;
	}

	get hasArc55Account() {
		return this.preparedSign?.transactions.some((transaction) => (
			this.app.state.accounts.some((account) => account.addr === transaction.sender.toString() && account.appId)
		)) ?? false;
	}

	get hasFalconSigner() {
		return this.preparedSign?.transactions.some((transaction) => (
			this.app.state.accounts.some((account) => account.addr === transaction.sender.toString() && account.falcon)
		)) ?? false;
	}

	load = async (): Promise<void> => {
		this.preparing = true;
		this.error = "";
		await this.app.initialize();
		await this.request.load();

		try {
			if (this.request.request?.action === "sign") {
				if (!isWalletTransactionArray(this.request.request.txns)) throw new Error("Sign request has invalid transactions.");
				this.preparedSign = prepareSignTransactionsProtocolRequest({
					walletTransactions: this.request.request.txns,
					networks: this.app.allNetworks,
				});
				await this.loadAssetLabels();
			} else if (this.request.request?.action === "data") {
				if (typeof this.request.request.data !== "string") throw new Error("Sign-data request has invalid data.");
				if (!this.request.request.metadata || typeof this.request.request.metadata !== "object") throw new Error("Sign-data request has invalid metadata.");

				this.preparedData = await prepareSignDataProtocolRequest({
					request: {
						action: "data",
						data: this.request.request.data,
						metadata: this.request.request.metadata as SignDataProtocolRequest["metadata"],
						authenticatorData: authenticatorData(this.request.request.authenticatorData),
					},
				});
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : "Failed to prepare signing request.";
		} finally {
			this.preparing = false;
		}
	};

	private async loadAssetLabels(): Promise<void> {
		if (!this.preparedSign || !this.app.core) return;

		const assetIds = [...new Set(this.preparedSign.transactions.flatMap((transaction) => (
			transaction.assetTransfer ? [transaction.assetTransfer.assetIndex] : []
		)))];
		const algod = createAlgodClient(this.preparedSign.network, this.app.state.fallbackEnabled);
		const entries = await Promise.all(assetIds.map(async (assetId) => {
			try {
				const asset = await getAssetInfo({
					assetId,
					networkName: this.preparedSign!.networkName,
					algod,
					storage: this.app.core!.storage,
					fetchJson: this.app.core!.fetchJson,
				});

				return [assetId.toString(), asset?.params.unitName ?? asset?.params.name ?? `Asset ${assetId.toString()}`] as const;
			} catch {
				return [assetId.toString(), `Asset ${assetId.toString()}`] as const;
			}
		}));

		this.assetLabels = Object.fromEntries(entries);
	}

	approve = async (): Promise<void> => {
		this.error = "";
		try {
			if (this.needsPassword && !this.password) throw new Error("Password is required.");

			if (this.preparedSign && this.request.request?.action === "sign") {
				const response = await completeSignTransactionsProtocolRequest({
					walletTransactions: this.preparedSign.walletTransactions,
					context: {
						state: this.app.state,
						storage: this.app.core!.storage,
						ledgerProvider: this.app.core!.ledgerProvider,
						credentialProvider: this.app.core!.credentialProvider,
						cryptoProvider: this.app.core!.cryptoProvider,
						algod: createAlgodClient(this.preparedSign.network, this.app.state.fallbackEnabled),
						password: this.password || undefined,
					},
				});
				await this.request.respond(response);
				return;
			}

			if (this.preparedData && this.request.request?.action === "data") {
				const response = await completeSignDataProtocolRequest({
					prepared: this.preparedData,
					state: this.app.state,
					storage: this.app.core!.storage,
					password: this.password || undefined,
					ledgerProvider: this.app.core!.ledgerProvider,
					credentialProvider: this.app.core!.credentialProvider,
					cryptoProvider: this.app.core!.cryptoProvider,
				});
				await this.request.respond(response);
				return;
			}

			throw new Error("No signing request is ready.");
		} catch (error) {
			this.error = error instanceof Error ? error.message : "Failed to approve signing request.";
		}
	};
}
