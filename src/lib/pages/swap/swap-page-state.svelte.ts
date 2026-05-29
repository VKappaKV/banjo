import algosdk, { type SuggestedParams, type Transaction } from "algosdk";
import { createContext } from "svelte";
import { getAssetInfo } from "$core/assets";
import { builtInNetworks } from "$core/data/networks";
import { createAlgodClient } from "$core/network";
import { signWalletTransactionRequest, walletTransactionsFromGroup } from "$core/signing";
import { selectNetwork } from "$core/state";
import {
	assembleSwapSignedTransactions,
	buildAtomicSwapProposal,
	buildSwapAcceptancePlan,
	serializeSwapProposal,
	submitSignedTransactions,
	validateSwapProposal,
} from "$core/transactions";
import { assetHoldingId } from "$lib/app/portfolio";
import { queryClient } from "$lib/app/query-client";
import { queryKeys } from "$lib/app/query-keys";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";

export type SwapMode = "propose" | "accept";

export interface SwapModeOption {
	value: SwapMode;
	label: string;
	variant: "default" | "outline";
}

export class SwapPageState {
	mode = $state<SwapMode>("propose");
	sender = $state("");
	receiver = $state("");
	senderAssetId = $state("0");
	senderAmount = $state("");
	receiverAssetId = $state("0");
	receiverAmount = $state("");
	acceptTx1 = $state("");
	acceptTx2 = $state("");
	password = $state("");
	proposal = $state("");
	error = $state("");
	result = $state("");
	accepting = $state(false);
	onAccepted: (() => Promise<void>) | undefined;
	onRejected: (() => Promise<void>) | undefined;

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

	get selectedNetwork() {
		return selectNetwork(this.app.state, builtInNetworks);
	}

	get assetChoices() {
		return [
			{ id: "0", label: "ALGO" },
			...(this.selectedAccount?.info?.assets ?? []).map((holding) => ({ id: assetHoldingId(holding).toString(), label: `Asset ${assetHoldingId(holding).toString()}` })),
		];
	}

	get modeOptions(): SwapModeOption[] {
		return ([
			["propose", "Create Proposal"],
			["accept", "Accept Proposal"],
		] satisfies Array<[SwapMode, string]>).map(([value, label]) => ({
			value,
			label,
			variant: this.mode === value ? "default" : "outline",
		}));
	}

	get selectedSenderAssetLabel() {
		return this.assetChoices.find((asset) => asset.id === this.senderAssetId)?.label ?? this.senderAssetId;
	}

	setMode = (mode: SwapMode): void => {
		this.mode = mode;
	};

	setSender = (value: string | string[] | undefined): void => {
		if (typeof value === "string") this.sender = value;
	};

	setSenderAssetId = (value: string | string[] | undefined): void => {
		if (typeof value === "string") this.senderAssetId = value;
	};

	loadAcceptanceRequest = (tx1: string, tx2: string): void => {
		this.mode = "accept";
		this.acceptTx1 = tx1;
		this.acceptTx2 = tx2;
	};

	private async suggestedParams(algod: ReturnType<typeof createAlgodClient>): Promise<SuggestedParams> {
		return (await algod.getTransactionParams().do()) as SuggestedParams;
	}

	private async swapAsset(assetId: string, algod: ReturnType<typeof createAlgodClient>) {
		if (assetId === "0") return { index: 0n, params: { decimals: 6 } };

		const asset = await getAssetInfo({
			assetId: BigInt(assetId),
			networkName: this.app.state.networkName,
			algod,
			storage: this.app.core!.storage,
			fetchJson: this.app.core!.fetchJson,
		});

		return asset ?? { index: BigInt(assetId), params: { decimals: 0 } };
	}

	private async signTransactions(transactions: Transaction[], indexesToSign?: number[]) {
		if (!this.app.core) throw new Error("Wallet not initialized.");

		const response = await signWalletTransactionRequest({
			walletTransactions: walletTransactionsFromGroup(transactions, indexesToSign),
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

		return response.signedTransactions;
	}

	buildProposal = async (): Promise<void> => {
		this.error = "";
		this.proposal = "";
		try {
			if (!this.app.core) throw new Error("Wallet not initialized.");
			if (!algosdk.isValidAddress(this.receiver.trim())) throw new Error("Receiver must be a valid Algorand address.");

			const algod = createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
			const params = await this.suggestedParams(algod);
			const built = buildAtomicSwapProposal({
				sender: this.activeSender,
				receiver: this.receiver.trim(),
				senderAsset: await this.swapAsset(this.senderAssetId, algod),
				senderAmount: this.senderAmount,
				receiverAsset: await this.swapAsset(this.receiverAssetId, algod),
				receiverAmount: this.receiverAmount,
				suggestedParams: params,
			});
			const [signedTxn1] = await this.signTransactions([built.txn1, built.txn2], [0]);
			if (!signedTxn1) throw new Error("First swap transaction was not signed.");

			this.proposal = JSON.stringify(serializeSwapProposal({ signedTxn1, unsignedTxn2: built.txn2 }));
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to build swap proposal.";
		}
	};

	acceptProposal = async (): Promise<void> => {
		this.error = "";
		this.result = "";
		this.accepting = true;
		try {
			let tx1 = this.acceptTx1.trim();
			let tx2 = this.acceptTx2.trim();
			if (this.acceptTx1.trim().startsWith("{")) {
				const parsed = JSON.parse(this.acceptTx1) as { tx1?: string; tx2?: string };
				tx1 = parsed.tx1 ?? "";
				tx2 = parsed.tx2 ?? "";
			}

			const validated = await validateSwapProposal({
				tx1,
				tx2,
				networks: this.app.allNetworks,
				algodForNetwork: (network) => createAlgodClient(network, this.app.state.fallbackEnabled),
			});
			const plan = buildSwapAcceptancePlan(validated);
			const signed = await this.signTransactions([...plan.transactions], plan.indexesToSign);
			const signedTxn2 = signed[1];
			if (!signedTxn2) throw new Error("Second swap transaction was not signed.");

			const algod = createAlgodClient(validated.network, this.app.state.fallbackEnabled);
			await submitSignedTransactions({
				algod,
				signedTransactions: assembleSwapSignedTransactions({ signedTxn1: plan.signedTxn1, signedTxn2 }),
			});
			await queryClient.invalidateQueries({ queryKey: queryKeys.accounts(this.app.state.networkName) });
			this.result = "Swap accepted and submitted.";
			await this.onAccepted?.();
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to accept swap.";
		} finally {
			this.accepting = false;
		}
	};
}

const [getSwapPageStateContext, setSwapPageStateContext] = createContext<SwapPageState>();

export function setSwapPageState(app: WalletAppState) {
	const state = new SwapPageState(app);
	setSwapPageStateContext(state);
	return state;
}

export function getSwapPageState() {
	return getSwapPageStateContext();
}
