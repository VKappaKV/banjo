<script lang="ts">
	import { push } from "svelte-spa-router";
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { createAlgodClient } from "$core/network";
	import { builtInNetworks } from "$core/data/networks";
	import { selectNetwork } from "$core/state";
	import { appendAccount } from "$core/accounts";
	import { loadArc55App, validateArc55Import, accountFromArc55App } from "$core/apps";
	import { getWalletAppContext } from "$lib/app/context";

	interface Props {
		onback: () => void;
	}

	let { onback }: Props = $props();

	const app = getWalletAppContext();

	type Step = "form" | "loading" | "confirm" | "done";
	let step = $state<Step>("form");
	let appIdInput = $state("");
	let error = $state("");
	let loadedApp = $state<Awaited<ReturnType<typeof loadArc55App>>>(undefined);
	let validationError = $state("");

	async function handleLoad() {
		error = "";
		validationError = "";
		loadedApp = undefined;

		const appId = Number(appIdInput.trim());
		if (!appId || isNaN(appId)) { error = "Enter a valid app ID."; return; }
		if (!app.core) { error = "Wallet not initialized."; return; }

		step = "loading";

		try {
			const network = selectNetwork(app.state, builtInNetworks);
			const algod = createAlgodClient(network, app.state.fallbackEnabled);

			const arc55 = await loadArc55App({ appId, algod, ignore404: true });
			if (!arc55) {
				error = "App not found or is not a valid ARC-55 app.";
				step = "form";
				return;
			}

			loadedApp = arc55;

			try {
				validateArc55Import(arc55, app.accounts);
				step = "confirm";
			} catch (e) {
				validationError = e instanceof Error ? e.message : "Cannot import this app.";
				step = "confirm";
			}
		} catch (e) {
			error = e instanceof Error ? e.message : "Failed to load app.";
			step = "form";
		}
	}

	async function handleImport() {
		if (!loadedApp || !app.core) return;
		error = "";

		try {
			const account = accountFromArc55App(loadedApp, app.state.networkName);
			await appendAccount({
				state: app.state,
				storage: app.core.storage,
				account,
			});
			step = "done";
			await app.refreshWallet();
		} catch (e) {
			error = e instanceof Error ? e.message : "Import failed.";
		}
	}
</script>

<div class="grid gap-4">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
		<h2 class="text-xl font-semibold tracking-tight">ARC-55 Multisig Import</h2>
	</div>

	{#if step === "form"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Import an existing multisig app</Card.Title>
				<Card.Description>Enter the app ID of an ARC-55 on-chain multisig app.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3">
				<input
					type="number"
					bind:value={appIdInput}
					class="w-full rounded border border-input bg-background p-2 font-mono text-sm"
					placeholder="App ID (e.g. 12345)"
				/>

				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer>
				<Button onclick={handleLoad} disabled={!appIdInput.trim()}>Load App</Button>
			</Card.Footer>
		</Card.Root>

	{:else if step === "loading"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Loading app state...</Card.Title>
				<Card.Description>Fetching on-chain data for this app.</Card.Description>
			</Card.Header>
		</Card.Root>

	{:else if step === "confirm"}
		<Card.Root>
			<Card.Header>
				<Card.Title>App loaded</Card.Title>
				<Card.Description>
					Loaded ARC-55 app with {loadedApp?.addrs.length ?? 0} member(s), threshold {String(loadedApp?.arc55_threshold ?? "?")}.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-2">
				{#if validationError}
					<Alert.Root variant="destructive">
						<Alert.Description>{validationError}</Alert.Description>
					</Alert.Root>
					<p class="text-sm text-muted-foreground">You can still add this account, but you may not be able to sign for it.</p>
				{/if}

				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="flex gap-2">
				<Button onclick={handleImport}>Import Account</Button>
				<Button variant="outline" onclick={() => { step = "form"; loadedApp = undefined; }}>
					Cancel
				</Button>
			</Card.Footer>
		</Card.Root>

	{:else if step === "done"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Multisig Account Imported</Card.Title>
				<Card.Description>The ARC-55 multisig account has been added to your wallet.</Card.Description>
			</Card.Header>
			<Card.Footer class="flex gap-2">
				<Button onclick={onback}>Done</Button>
				<Button variant="outline" onclick={() => push("/accounts")}>View Accounts</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
