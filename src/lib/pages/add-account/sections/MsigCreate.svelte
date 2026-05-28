<script lang="ts">
	import { push } from "svelte-spa-router";
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { createAlgodClient } from "$core/network";
	import { builtInNetworks } from "$core/data/networks";
	import { selectNetwork } from "$core/state";
	import { appendAccount } from "$core/accounts";
	import { computeArc55MultisigAddress, deployArc55App, accountFromArc55App } from "$core/apps";
	import { signTransactions } from "$core/signing";
	import { getWalletAppContext } from "$lib/app/context";
	import type { TransactionSigner } from "algosdk";

	interface Props {
		onback: () => void;
	}

	let { onback }: Props = $props();

	const app = getWalletAppContext();

	type Step = "form" | "deploying" | "done";
	let step = $state<Step>("form");
	let threshold = $state(2);
	let addressesText = $state("");
	let error = $state("");
	let multisigAddr = $state("");
	let appId = $state<bigint | null>(null);

	function parseAddresses(): string[] {
		return addressesText
			.split("\n")
			.map((l) => l.trim())
			.filter((l) => l.length > 0);
	}

	function computePreview() {
		error = "";
		const addrs = parseAddresses();
		if (addrs.length < 1) { error = "Enter at least one address."; return; }
		if (threshold < 1 || threshold > addrs.length) { error = `Threshold must be between 1 and ${addrs.length}.`; return; }
		try {
			multisigAddr = computeArc55MultisigAddress(threshold, addrs);
		} catch (e) {
			error = e instanceof Error ? e.message : "Invalid address or threshold.";
		}
	}

	async function handleDeploy() {
		error = "";
		const addrs = parseAddresses();
		if (addrs.length < 1) { error = "Enter at least one address."; return; }
		if (threshold < 1 || threshold > addrs.length) { error = `Threshold must be between 1 and ${addrs.length}.`; }

		if (!app.core) { error = "Wallet not initialized."; return; }

		try {
			multisigAddr = computeArc55MultisigAddress(threshold, addrs);
		} catch (e) {
			error = e instanceof Error ? e.message : "Invalid address or threshold.";
			return;
		}

		step = "deploying";

		try {
			const network = selectNetwork(app.state, builtInNetworks);
			const algod = createAlgodClient(network, app.state.fallbackEnabled);

			const signer: TransactionSigner = async (txnGroup, indexesToSign) => {
				return signTransactions({
					transactions: txnGroup,
					indexesToSign,
					state: app.state!,
					storage: app.core!.storage,
					ledgerProvider: app.core!.ledgerProvider,
					credentialProvider: app.core!.credentialProvider,
					cryptoProvider: app.core!.cryptoProvider,
				});
			};

			const result = await deployArc55App({
				creator: app.state.hotKeyAddresses[0] ?? app.state.accounts[0]?.addr,
				threshold,
				addresses: addrs,
				algod,
				signer,
			});

			appId = result.appId;

			const loadedApp = { appId: Number(result.appId), info: {} as never, acct: {} as never, addrs: addrs, groups: [] };
			const account = accountFromArc55App(loadedApp as never, app.state.networkName);

			await appendAccount({
				state: app.state,
				storage: app.core.storage,
				account,
			});

			step = "done";
			await app.refreshWallet();
		} catch (e) {
			error = e instanceof Error ? e.message : "Deployment failed.";
			step = "form";
		}
	}
</script>

<div class="grid gap-4">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
		<h2 class="text-xl font-semibold tracking-tight">ARC-55 Multisig Create</h2>
	</div>

	{#if step === "form"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Configure multisig</Card.Title>
				<Card.Description>Set the threshold and member addresses for the on-chain multisig app.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3">
				<div class="grid gap-1">
					<label class="text-sm font-medium" for="threshold">Threshold</label>
					<input
						id="threshold"
						type="number"
						bind:value={threshold}
						min="1"
						max="100"
						class="w-full rounded border border-input bg-background p-2 text-sm"
					/>
				</div>

				<div class="grid gap-1">
					<label class="text-sm font-medium" for="addresses">Member addresses (one per line)</label>
					<textarea
						id="addresses"
						bind:value={addressesText}
						class="min-h-[120px] w-full rounded border border-input bg-background p-3 font-mono text-sm"
						placeholder="Address 1&#10;Address 2&#10;Address 3"
					></textarea>
				</div>

				{#if multisigAddr}
					<Alert.Root>
						<Alert.Title>Multisig address</Alert.Title>
						<Alert.Description class="break-all font-mono text-xs">{multisigAddr}</Alert.Description>
					</Alert.Root>
				{/if}

				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={computePreview}>Preview Address</Button>
				<Button onclick={handleDeploy} disabled={parseAddresses().length < 1}>
					Deploy App
				</Button>
			</Card.Footer>
		</Card.Root>

	{:else if step === "deploying"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Deploying multisig app...</Card.Title>
				<Card.Description>Creating the ARC-55 app on-chain. Please wait.</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
		</Card.Root>

	{:else if step === "done"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Multisig App Deployed</Card.Title>
				<Card.Description>
					App ID: {appId?.toString()} — Address: {multisigAddr.slice(0, 8)}...
				</Card.Description>
			</Card.Header>
			<Card.Footer class="flex gap-2">
				<Button onclick={onback}>Done</Button>
				<Button variant="outline" onclick={() => push("/accounts")}>View Accounts</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
