import algosdk from "algosdk";
import { createContext } from "svelte";
import { createAlgodClient } from "$core/network";
import { selectMsigSigner, selectNetwork } from "$core/state";
import { builtInNetworks } from "$core/data/networks";
import { createBanjoTransactionSigner } from "$core/signing";
import {
	loadArc55App,
	submitArc55Group,
	clearArc55Signatures,
	deleteArc55Group,
	destroyArc55App,
	validateDestroyArc55App,
} from "$core/apps";
import type { Arc55App, MsigGroup } from "$core/types";
import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";

export class MultisigPageState {
	appId = $state<bigint | undefined>();
	arc55App = $state<Arc55App | undefined>();
	loading = $state(true);
	error = $state("");
	expandedGroups = $state<Record<string, boolean>>({});

	constructor(readonly app: WalletAppState) {}

	get selectedNetwork() {
		return selectNetwork(this.app.state, builtInNetworks);
	}

	get algodClient() {
		return createAlgodClient(this.selectedNetwork, this.app.state.fallbackEnabled);
	}

	get msigMember(): string | undefined {
		if (!this.arc55App) return undefined;
		try {
			return selectMsigSigner(this.arc55App, this.app.accounts);
		} catch {
			return undefined;
		}
	}

	get isMember() {
		return this.msigMember != null;
	}

	get admin() {
		return this.arc55App?.arc55_admin;
	}

	get threshold() {
		return Number(this.arc55App?.arc55_threshold ?? 0);
	}

	get nonce() {
		return Number(this.arc55App?.arc55_nonce ?? 0);
	}

	get members() {
		return this.arc55App?.addrs ?? [];
	}

	get appAddress() {
		if (!this.appId) return "";
		return algosdk.getApplicationAddress(this.appId).toString();
	}

	get balance() {
		return this.arc55App?.acct?.amount ?? 0n;
	}

	toggleGroup(nonce: bigint) {
		const key = nonce.toString();
		this.expandedGroups = { ...this.expandedGroups, [key]: !this.expandedGroups[key] };
	}

	isExpanded(nonce: bigint): boolean {
		return !!this.expandedGroups[nonce.toString()];
	}

	signatureCount(group: MsigGroup): number {
		return group.sigs.reduce((total, member) => total + member.sigs.length, 0);
	}

	signatureNeeded(group: MsigGroup): number {
		return this.threshold * group.txns.length;
	}

	canSubmit(group: MsigGroup): boolean {
		return this.signatureCount(group) >= this.signatureNeeded(group) && group.txns.length > 0;
	}

	private createSigner() {
		if (!this.app.core) throw new Error("Wallet not initialized.");
		return createBanjoTransactionSigner({
			state: this.app.state,
			storage: this.app.core.storage,
			ledgerProvider: this.app.core.ledgerProvider,
			credentialProvider: this.app.core.credentialProvider,
			cryptoProvider: this.app.core.cryptoProvider,
			algod: this.algodClient,
		});
	}

	load = async (appIdStr: string): Promise<void> => {
		this.loading = true;
		this.error = "";
		this.arc55App = undefined;
		this.appId = undefined;
		this.expandedGroups = {};
		try {
			const appId = BigInt(appIdStr);
			this.appId = appId;
			const app = await loadArc55App({ appId, algod: this.algodClient });
			if (!app) throw new Error("ARC-55 app not found on the selected network.");
			this.arc55App = app;
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to load ARC-55 app.";
		} finally {
			this.loading = false;
		}
	};

	refresh = async (): Promise<void> => {
		if (!this.appId) return;
		this.error = "";
		try {
			const app = await loadArc55App({ appId: this.appId, algod: this.algodClient });
			if (!app) throw new Error("ARC-55 app not found.");
			this.arc55App = app;
			this.app.notify("ARC-55 app state refreshed.", "success");
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to refresh.";
		}
	};

	submitGroup = async (nonce: bigint): Promise<void> => {
		if (!this.arc55App) return;
		this.error = "";
		try {
			const result = await submitArc55Group({
				app: this.arc55App,
				nonce,
				algod: this.algodClient,
			});
			this.app.notify(`Group #${nonce} submitted.`, "success");
			await this.refresh();
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to submit group.";
		}
	};

	clearSignatures = async (nonce: bigint): Promise<void> => {
		if (!this.appId || !this.msigMember) return;
		const confirmed = await this.app.requestConfirmation(
			`Clear your signatures from group #${nonce}? This action cannot be undone and will cost a transaction fee.`,
		);
		if (!confirmed) return;
		this.error = "";
		try {
			await clearArc55Signatures({
				appId: this.appId,
				nonce,
				address: this.msigMember,
				sender: this.msigMember,
				algod: this.algodClient,
				signer: this.createSigner(),
			});
			this.app.notify(`Signatures cleared for group #${nonce}.`, "success");
			await this.refresh();
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to clear signatures.";
		}
	};

	deleteGroup = async (nonce: bigint): Promise<void> => {
		if (!this.appId || !this.arc55App || !this.msigMember) return;
		const confirmed = await this.app.requestConfirmation(
			`Delete group #${nonce} and all its signatures? This action cannot be undone and will cost transaction fees.`,
		);
		if (!confirmed) return;
		this.error = "";
		try {
			const group = this.arc55App.groups.find((g) => g.nonce === nonce);
			if (!group) throw new Error("Group not found.");
			await deleteArc55Group({
				appId: this.appId,
				group,
				sender: this.msigMember,
				algod: this.algodClient,
				signer: this.createSigner(),
			});
			this.app.notify(`Group #${nonce} deleted.`, "success");
			await this.refresh();
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to delete group.";
		}
	};

	destroyApp = async (): Promise<void> => {
		if (!this.arc55App || !this.msigMember) return;
		this.error = "";
		try {
			validateDestroyArc55App(this.arc55App);
		} catch {
			this.error =
				"Cannot destroy app while groups or signatures remain. Delete all groups first.";
			return;
		}
		const confirmed = await this.app.requestConfirmation(
			"Destroy this ARC-55 app? This removes the application from the network permanently. All groups must be empty.",
		);
		if (!confirmed) return;
		try {
			await destroyArc55App({
				app: this.arc55App,
				sender: this.msigMember,
				algod: this.algodClient,
				signer: this.createSigner(),
			});
			this.app.notify("ARC-55 app destroyed.", "success");
			this.arc55App = undefined;
		} catch (err) {
			this.error = err instanceof Error ? err.message : "Failed to destroy app.";
		}
	};
}

const [getMultisigStateContext, setMultisigStateContext] = createContext<MultisigPageState>();

export function setMultisigPageState(app: WalletAppState) {
	const state = new MultisigPageState(app);
	setMultisigStateContext(state);
	return state;
}

export function getMultisigPageState() {
	return getMultisigStateContext();
}
