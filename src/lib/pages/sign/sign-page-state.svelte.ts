import algosdk from "algosdk";
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
import {
	createBanjoTransactionSigner,
	type SigningContext,
} from "$core/signing";
import {
	buildArc55TransactionGroupCreationPlan,
	createArc55AppClient,
	detectArc55SigningMode,
	loadArc55App,
} from "$core/apps";
import type { BanjoMsig, WalletTransaction } from "$core/types";
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
	msig = $state<BanjoMsig | undefined>();
	storedGroupMessage = $state("");

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

	get isBypassMode() {
		return this.msig?.bypass === true;
	}

	get isStoredGroupMode() {
		return this.msig != null && !this.msig.bypass;
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
				await this.detectArc55Mode();
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

	private async detectArc55Mode(): Promise<void> {
		if (!this.preparedSign || !this.app.core) return;

		for (const transaction of this.preparedSign.transactions) {
			const sender = transaction.sender.toString();
			const arc55Account = this.app.state.accounts.find(
				(account) => account.addr === sender && account.appId != null,
			);
			if (!arc55Account || arc55Account.appId == null) continue;

			const algod = createAlgodClient(this.preparedSign.network, this.app.state.fallbackEnabled);
			const app = await loadArc55App({ appId: Number(arc55Account.appId), algod, ignore404: true });
			if (!app) continue;

			const signingAccounts = this.app.state.accounts
				.filter((a) => a.seedId != null || a.slot != null || a.hot)
				.map((account) => ({
					addr: account.addr,
					canSign: true,
					title: "",
					isHot: !!account.hot,
					globalIdx: 0,
				}));

			const mode = detectArc55SigningMode({
				account: arc55Account,
				app,
				signingAccounts,
			});
			if (!mode) continue;

			this.msig = mode;
			break;
		}
	}

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

	private buildSigningContext(): SigningContext {
		return {
			state: this.app.state,
			storage: this.app.core!.storage,
			ledgerProvider: this.app.core!.ledgerProvider,
			credentialProvider: this.app.core!.credentialProvider,
			cryptoProvider: this.app.core!.cryptoProvider,
			algod: createAlgodClient(this.preparedSign!.network, this.app.state.fallbackEnabled),
			password: this.password || undefined,
			msig: this.msig,
		};
	}

	approve = async (): Promise<void> => {
		this.error = "";
		try {
			if (this.needsPassword && !this.password) throw new Error("Password is required.");

			if (this.preparedSign && this.request.request?.action === "sign") {
				if (this.isStoredGroupMode && this.msig) {
					await this.approveStoredGroup(this.msig);
					return;
				}

				const response = await completeSignTransactionsProtocolRequest({
					walletTransactions: this.preparedSign.walletTransactions,
					context: this.buildSigningContext(),
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

	private async approveStoredGroup(msig: BanjoMsig): Promise<void> {
		if (!this.preparedSign) throw new Error("No signing request is ready.");

		const algod = createAlgodClient(this.preparedSign.network, this.app.state.fallbackEnabled);
		const ctx = this.buildSigningContext();
		const signer = createBanjoTransactionSigner(ctx);
		const appId = Number(msig.app.info.id);
		const params = await algod.getTransactionParams().do() as algosdk.SuggestedParams;
		const sender = msig.signerAddr;

		const client = createArc55AppClient({ appId, sender, algod, signer });

		const plan = buildArc55TransactionGroupCreationPlan({
			app: msig.app,
			transactions: this.preparedSign.transactions,
			client,
			suggestedParams: params,
			sender,
			signer,
		});

		await plan.composer.send({ populateAppCallResources: true });

		const signedBlobs = await signer(
			this.preparedSign.transactions,
			this.preparedSign.transactions.map((_, i) => i),
		);

		const rawSignatures: Uint8Array[] = signedBlobs.map((blob) => {
			const decoded = algosdk.decodeSignedTransaction(blob);
			if (!decoded.sig) throw new Error("Expected a single signature from ARC-55 stored-group signing");
			return decoded.sig;
		});

		const appAddress = algosdk.getApplicationAddress(appId);
		const sigMbr = 2500n + 400n * BigInt(40 + rawSignatures.reduce((total, s) => total + s.length, 0));
		const sigPayment = algosdk.makePaymentTxnWithSuggestedParamsFromObject({
			sender,
			receiver: appAddress,
			amount: sigMbr,
			suggestedParams: params,
		});

		await client.send.arc55SetSignatures({
			args: {
				costs: sigPayment,
				transactionGroup: plan.nonce,
				signatures: rawSignatures,
			},
			populateAppCallResources: true,
		});

		const emptyTxns: (Uint8Array | null)[] = this.preparedSign.transactions.map(() => null);
		this.storedGroupMessage = `Signature contributed to ARC-55 group #${plan.nonce}. The transaction will be submitted when the threshold is met.`;
		await this.request.respond({ action: "signed", txns: emptyTxns });
	}
}
