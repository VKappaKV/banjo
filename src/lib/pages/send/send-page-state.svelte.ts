import algosdk, { type modelsv2, type SuggestedParams, type Transaction } from "algosdk";
import { createContext } from "svelte";
import { createArc59AppClient, executeArc59SendAssetPlan } from "$core/apps";
import { getAssetInfo } from "$core/assets";
import { builtInNetworks } from "$core/data/networks";
import { createAlgodClient, searchNames } from "$core/network";
import {
	createBanjoTransactionSigner,
	signWalletTransactionRequest,
	transactionRequestNeedsPassword,
	walletTransactionsFromGroup,
} from "$core/signing";
import { selectNetwork } from "$core/state";
import {
	buildArc59SendAssetPlan,
	buildAssetTransferPlan,
	buildOfflineKeyreg,
	buildOnlineKeyreg,
	buildPaymentTransaction,
	buildRekeyTransaction,
	estimateAverageBlockTimeMs,
	parseGoalPartkeyInfo,
	submitSignedTransactions,
} from "$core/transactions";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
import { assetHoldingId } from "$lib/app/portfolio";
import { queryClient } from "$lib/app/query-client";
import { queryKeys } from "$lib/app/query-keys";

export type SendMode = "algo" | "asa" | "rekey" | "online-keyreg" | "offline-keyreg";
export type SendStep = "form" | "review" | "submitting" | "done";

export interface SendModeOption {
	value: SendMode;
	label: string;
	variant: "default" | "outline";
}

export type SendReviewPlan =
	| { type: "direct"; transactions: Transaction[]; needsPassword: boolean; warnings: string[] }
	| {
			type: "arc59";
			needsPassword: boolean;
			warnings: string[];
			assetId: bigint;
			assetDecimals: number;
			suggestedParams: SuggestedParams;
			mbrPaymentAmount: bigint;
			appCallFee: bigint;
			totalInnerTransactionCount: bigint;
		};

export class SendPageState {
	step = $state<SendStep>("form");
	mode = $state<SendMode>("algo");
	sender = $state("");
	receiver = $state("");
	amount = $state("");
	note = $state("");
	closeTo = $state("");
	clawbackSender = $state("");
	rekeyTo = $state("");
	recipientSearch = $state("");
	recipientResults = $state<Array<{ title: string; value: string }>>([]);
	recipientSearching = $state(false);
	selectedAssetId = $state("");
	partkeyText = $state("");
	voteFirst = $state("");
	voteLast = $state("");
	voteKeyDilution = $state("");
	voteKey = $state("");
	selectionKey = $state("");
	stateProofKey = $state("");
	incentiveEligible = $state(false);
	nonParticipation = $state(false);
	averageBlockMs = $state<number | undefined>();
	password = $state("");
	error = $state("");
	txId = $state("");
	review = $state<SendReviewPlan | null>(null);

	constructor(readonly app: WalletAppState) {}

	get signableAccounts() {
		return this.app.accounts.filter((account) => account.canSign);
	}

	get selectedAccount() {
		return this.signableAccounts.find((account) => account.addr === this.sender) ?? this.signableAccounts[0];
	}

	get activeSender() {
		return this.sender || this.selectedAccount?.addr || "";
	}

	get assetHoldings() {
		return this.selectedAccount?.info?.assets ?? [];
	}

	get activeAssetId() {
		return this.selectedAssetId || (this.assetHoldings[0] ? assetHoldingId(this.assetHoldings[0]).toString() : "");
	}

	get noteBytes() {
		return new TextEncoder().encode(this.note).byteLength;
	}

	get selectedNetwork() {
		return selectNetwork(this.app.state, builtInNetworks);
	}

	get ledgerReview() {
		const selectedStoredAccount = this.app.state.accounts.find((account) => account.addr === this.activeSender);
		return !!selectedStoredAccount && selectedStoredAccount.slot !== undefined && selectedStoredAccount.seedId === undefined && !selectedStoredAccount.falcon;
	}

	get modeOptions(): SendModeOption[] {
		return ([
			["algo", "ALGO"],
			["asa", "ASA"],
			["rekey", "Rekey"],
			["online-keyreg", "Online keyreg"],
			["offline-keyreg", "Offline keyreg"],
		] satisfies Array<[SendMode, string]>).map(([value, label]) => ({
			value,
			label,
			variant: this.mode === value ? "default" : "outline",
		}));
	}

	get noteByteClass() {
		return this.noteBytes > 1000 ? "text-destructive text-xs" : "text-muted-foreground text-xs";
	}

	get closeAddressLabel() {
		return this.mode === "algo" ? "Close remainder to" : "Close asset to";
	}

	get averageBlockLabel() {
		return this.averageBlockMs ? `~${(this.averageBlockMs / 1000).toFixed(1)}s/block` : "";
	}

	resetReview = (): void => {
		this.error = "";
		this.password = "";
		this.review = null;
		this.step = "form";
	};

	resetDone = (): void => {
		this.step = "form";
		this.review = null;
		this.txId = "";
	};

	setMode = (mode: SendMode): void => {
		this.mode = mode;
	};

	setSender = (value: string | string[] | undefined): void => {
		if (typeof value === "string") this.sender = value;
	};

	setSelectedAssetId = (value: string | string[] | undefined): void => {
		if (typeof value === "string") this.selectedAssetId = value;
	};

	selectRecipient = (value: string): void => {
		this.receiver = value;
	};

	private requireAddress(address: string, label: string) {
		if (!algosdk.isValidAddress(address.trim())) {
			throw new Error(`${label} must be a valid Algorand address.`);
		}

		return address.trim();
	}

	private validateCommon() {
		if (!this.app.core) throw new Error("Wallet not initialized.");
		if (!this.activeSender) throw new Error("Select a sender account.");
		if (this.noteBytes > 1000) throw new Error("Note must be 1000 bytes or less.");
	}

	searchRecipient = async (): Promise<void> => {
		this.recipientSearching = true;
		this.recipientResults = [];
		try {
			if (!this.app.core || !this.recipientSearch.trim()) return;

			this.recipientResults = await searchNames({
				query: this.recipientSearch.trim(),
				network: this.selectedNetwork,
				fetchJson: this.app.core.fetchJson,
			});
		} catch {
			this.recipientResults = [];
		} finally {
			this.recipientSearching = false;
		}
	};

	applyPartkeyPaste = (): void => {
		const parsed = parseGoalPartkeyInfo(this.partkeyText);
		this.voteFirst = parsed.voteFirst?.toString() ?? this.voteFirst;
		this.voteLast = parsed.voteLast?.toString() ?? this.voteLast;
		this.voteKeyDilution = parsed.voteKeyDilution?.toString() ?? this.voteKeyDilution;
		this.voteKey = parsed.voteKey ?? this.voteKey;
		this.selectionKey = parsed.selectionKey ?? this.selectionKey;
		this.stateProofKey = parsed.stateProofKey ?? this.stateProofKey;
	};

	estimateBlockTime = async (): Promise<void> => {
		this.error = "";
		try {
			const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
			const estimate = await estimateAverageBlockTimeMs(algod);
			this.averageBlockMs = estimate.averageBlockTimeMs;
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to estimate block time.";
		}
	};

	private async suggestedParams(algod: ReturnType<typeof createAlgodClient>): Promise<SuggestedParams> {
		return (await algod.getTransactionParams().do()) as SuggestedParams;
	}

	private async selectedAsset(algod: ReturnType<typeof createAlgodClient>) {
		if (!this.activeAssetId) throw new Error("Select an asset.");

		const assetId = BigInt(this.activeAssetId);
		const asset = await getAssetInfo({
			assetId,
			networkName: this.app.state.networkName,
			algod,
			storage: this.app.core!.storage,
			fetchJson: this.app.core!.fetchJson,
		});

		return { assetId, decimals: asset?.params.decimals ?? 0 };
	}

	private directNeedsPassword(transactions: Transaction[]) {
		const walletTransactions = walletTransactionsFromGroup(transactions);

		return transactionRequestNeedsPassword({
			walletTransactions,
			transactions,
			context: { state: this.app.state },
		});
	}

	private senderNeedsPassword() {
		const account = this.app.state.accounts.find((item) => item.addr === this.activeSender);
		const seedId = account?.seedId;
		if (seedId == null) return false;

		const seed = this.app.state.seeds.find((item) => item.id === seedId);
		return !!seed && !seed.credentialId;
	}

	buildReview = async (): Promise<void> => {
		this.error = "";
		try {
			this.validateCommon();

			const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
			const params = await this.suggestedParams(algod);

			if (this.mode === "algo") {
				const txn = buildPaymentTransaction({
					sender: this.activeSender,
					receiver: this.requireAddress(this.receiver, "Receiver"),
					amount: this.amount,
					closeRemainderTo: this.closeTo.trim() ? this.requireAddress(this.closeTo, "Close remainder address") : undefined,
					note: this.note || undefined,
					suggestedParams: params,
				});
				this.review = { type: "direct", transactions: [txn], needsPassword: this.directNeedsPassword([txn]), warnings: [] };
			} else if (this.mode === "rekey") {
				const txn = buildRekeyTransaction({
					sender: this.activeSender,
					rekeyTo: this.requireAddress(this.rekeyTo, "New auth address"),
					note: this.note || undefined,
					suggestedParams: params,
				});
				this.review = {
					type: "direct",
					transactions: [txn],
					needsPassword: this.directNeedsPassword([txn]),
					warnings: ["Rekeying changes who can authorize future transactions for this account."],
				};
			} else if (this.mode === "offline-keyreg") {
				const txn = buildOfflineKeyreg({
					sender: this.activeSender,
					suggestedParams: params,
					note: this.note || undefined,
					nonParticipation: this.nonParticipation,
				});
				this.review = {
					type: "direct",
					transactions: [txn],
					needsPassword: this.directNeedsPassword([txn]),
					warnings: [this.nonParticipation ? "Non-participation is intended to be irreversible." : "This will register offline participation keys."],
				};
			} else if (this.mode === "online-keyreg") {
				const txn = buildOnlineKeyreg({
					sender: this.activeSender,
					voteFirst: BigInt(this.voteFirst),
					voteLast: BigInt(this.voteLast),
					voteKeyDilution: BigInt(this.voteKeyDilution),
					voteKey: this.voteKey,
					selectionKey: this.selectionKey,
					stateProofKey: this.stateProofKey.trim() || undefined,
					incentiveEligible: this.incentiveEligible,
					suggestedParams: params,
					note: this.note || undefined,
				});
				this.review = {
					type: "direct",
					transactions: [txn],
					needsPassword: this.directNeedsPassword([txn]),
					warnings: this.incentiveEligible ? ["Incentive-eligible online registration uses a flat 2 ALGO fee."] : [],
				};
			} else {
				await this.buildAssetReview(algod, params);
			}

			this.step = "review";
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to build transaction.";
		}
	};

	private async buildAssetReview(algod: ReturnType<typeof createAlgodClient>, params: SuggestedParams): Promise<void> {
		const { assetId, decimals } = await this.selectedAsset(algod);
		const recipient = this.requireAddress(this.receiver, "Receiver");
		const receiverAccount = (await algod.accountInformation(recipient).do()) as modelsv2.Account;
		const plan = buildAssetTransferPlan({
			sender: this.activeSender,
			receiver: recipient,
			assetId,
			assetDecimals: decimals,
			amount: this.amount,
			closeRemainderTo: this.closeTo.trim() ? this.requireAddress(this.closeTo, "Close asset address") : undefined,
			assetSender: this.clawbackSender.trim() ? this.requireAddress(this.clawbackSender, "Clawback sender") : undefined,
			note: this.note || undefined,
			suggestedParams: params,
			receiverAccount,
			network: this.selectedNetwork,
		});

		if (plan.type === "direct") {
			this.review = { type: "direct", transactions: [plan.transaction], needsPassword: this.directNeedsPassword([plan.transaction]), warnings: [] };
			return;
		}

		if (plan.type !== "requires-arc59") {
			throw new Error("Receiver is not opted into this asset and no ARC-59 router is configured.");
		}

		if (!this.app.core?.approvalController) throw new Error("Signing approval controller is not available.");

		const signer = createBanjoTransactionSigner({
			state: this.app.state,
			storage: this.app.core.storage,
			ledgerProvider: this.app.core.ledgerProvider,
			credentialProvider: this.app.core.credentialProvider,
			cryptoProvider: this.app.core.cryptoProvider,
			algod,
		});
		const arc59Client = createArc59AppClient({ appId: plan.routerAppId, sender: this.activeSender, algod, signer });
		const arc59Plan = await buildArc59SendAssetPlan({
			arc59Client,
			sender: this.activeSender,
			receiver: recipient,
			assetId,
			assetDecimals: decimals,
			amount: this.amount,
			suggestedParams: params,
			note: this.note || undefined,
			closeRemainderTo: this.closeTo.trim() || undefined,
			assetSender: this.clawbackSender.trim() || undefined,
			signer,
		});

		if (arc59Plan.type === "direct") {
			this.review = { type: "direct", transactions: [arc59Plan.transaction], needsPassword: this.directNeedsPassword([arc59Plan.transaction]), warnings: [] };
			return;
		}

		this.review = {
			type: "arc59",
			needsPassword: this.senderNeedsPassword(),
			warnings: ["Receiver is not opted in. Banjo will route this ASA through ARC-59."],
			assetId,
			assetDecimals: decimals,
			suggestedParams: params,
			mbrPaymentAmount: arc59Plan.mbrPaymentAmount,
			appCallFee: arc59Plan.appCallFee,
			totalInnerTransactionCount: arc59Plan.totalInnerTransactionCount,
		};
	}

	private async signDirect(transactions: Transaction[]) {
		if (!this.app.core) throw new Error("Wallet not initialized.");
		const response = await signWalletTransactionRequest({
			walletTransactions: walletTransactionsFromGroup(transactions),
			context: {
				state: this.app.state,
				storage: this.app.core.storage,
				ledgerProvider: this.app.core.ledgerProvider,
				credentialProvider: this.app.core.credentialProvider,
				cryptoProvider: this.app.core.cryptoProvider,
				algod: createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled),
				password: this.password || undefined,
			},
		});

		return response.signedTransactions.filter((txn): txn is Uint8Array => !!txn);
	}

	private async executeArc59(plan: Extract<SendReviewPlan, { type: "arc59" }>) {
		if (!this.app.core) throw new Error("Wallet not initialized.");

		const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
		const signer = createBanjoTransactionSigner({
			state: this.app.state,
			storage: this.app.core.storage,
			ledgerProvider: this.app.core.ledgerProvider,
			credentialProvider: this.app.core.credentialProvider,
			cryptoProvider: this.app.core.cryptoProvider,
			algod,
			password: this.password || undefined,
		});
		const routerAppId = this.selectedNetwork.inboxRouter;
		if (routerAppId === undefined) throw new Error("No ARC-59 router configured for this network.");

		const arc59Client = createArc59AppClient({ appId: routerAppId, sender: this.activeSender, algod, signer });
		const arc59Plan = await buildArc59SendAssetPlan({
			arc59Client,
			sender: this.activeSender,
			receiver: this.requireAddress(this.receiver, "Receiver"),
			assetId: plan.assetId,
			assetDecimals: plan.assetDecimals,
			amount: this.amount,
			suggestedParams: plan.suggestedParams,
			note: this.note || undefined,
			closeRemainderTo: this.closeTo.trim() || undefined,
			assetSender: this.clawbackSender.trim() || undefined,
			signer,
		});

		return executeArc59SendAssetPlan(arc59Plan);
	}

	submitReview = async (): Promise<void> => {
		if (!this.review) return;
		this.error = "";
		this.step = "submitting";

		try {
			if (this.review.needsPassword && !this.password) throw new Error("Password is required to sign with this account.");

			const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
			if (this.review.type === "direct") {
				const signed = await this.signDirect(this.review.transactions);
				await submitSignedTransactions({ algod, signedTransactions: signed });
				this.txId = this.review.transactions[0]?.txID() ?? "Submitted";
			} else {
				await this.executeArc59(this.review);
				this.txId = "ARC-59 group submitted";
			}

			await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(this.app.state.networkName) });
			this.step = "done";
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to submit transaction.";
			this.step = "review";
		}
	};
}

const [getSendPageStateContext, setSendPageStateContext] = createContext<SendPageState>();

export function setSendPageState(app: WalletAppState) {
	const state = new SendPageState(app);
	setSendPageStateContext(state);
	return state;
}

export function getSendPageState() {
	return getSendPageStateContext();
}
