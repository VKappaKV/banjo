<script lang="ts">
	import { onMount } from "svelte";
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { approveDappNetworkRequest, validateDappNetworkRequest } from "$core/protocol";
	import type { Network } from "$core/types";
	import { getWalletAppContext } from "$lib/app/context";
	import { DappRequestState } from "$lib/app/dapp-request-state.svelte";

	const app = getWalletAppContext();
	const request = new DappRequestState();

	let network = $state<Network | undefined>();
	let error = $state("");

	async function load() {
		await app.initialize();
		await request.load();
		try {
			if (request.request?.action !== "network") return;
			network = validateDappNetworkRequest(request.request.network, app.allNetworks);
		} catch (err) {
			error = err instanceof Error ? err.message : "Invalid network request.";
		}
	}

	async function approve() {
		error = "";
		try {
			await app.initialize();
			if (request.request?.action !== "network") throw new Error("No add-network request is pending.");
			if (!app.core) throw new Error("Wallet not initialized.");
			const response = await approveDappNetworkRequest({
				storage: app.core.storage,
				network: request.request.network,
				knownNetworks: app.allNetworks,
			});
			app.state = { ...app.state, customNetworks: response.networks ?? app.state.customNetworks };
			await app.switchNetwork(response.network.name);
			await request.respond(response);
		} catch (err) {
			error = err instanceof Error ? err.message : "Failed to add network.";
		}
	}

	onMount(() => {
		void load();
	});
</script>

<div class="grid gap-6">
	<div>
		<h2 class="text-2xl font-semibold tracking-tight">Add Network</h2>
		<p class="text-muted-foreground text-sm">Review the custom network requested by the dApp.</p>
	</div>

	{#if request.loading}
		<Card.Root><Card.Header><Card.Title>Loading request</Card.Title></Card.Header></Card.Root>
	{:else if request.done}
		<Card.Root><Card.Header><Card.Title>Network response sent</Card.Title><Card.Description>You can close this panel.</Card.Description></Card.Header></Card.Root>
	{:else if request.error}
		<Alert.Root variant="destructive"><Alert.Description>{request.error}</Alert.Description></Alert.Root>
	{:else if request.request?.action !== "network"}
		<Alert.Root variant="destructive"><Alert.Description>No add-network request is pending.</Alert.Description></Alert.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>{network?.name ?? "Invalid network"}</Card.Title>
				<Card.Description>{network?.genesisID ?? "The requested network could not be validated."}</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				{#if network}
					<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<span class="text-muted-foreground">Algod</span><span class="break-all">{network.algod.url}:{network.algod.port}</span>
						{#if network.indexer}<span class="text-muted-foreground">Indexer</span><span class="break-all">{network.indexer.url}:{network.indexer.port}</span>{/if}
						{#if network.explorer}<span class="text-muted-foreground">Explorer</span><span class="break-all">{network.explorer}</span>{/if}
						{#if network.genesisHash}<span class="text-muted-foreground">Genesis hash</span><span class="break-all">{network.genesisHash}</span>{/if}
					</div>
				{/if}
				{#if error}<Alert.Root variant="destructive"><Alert.Description>{error}</Alert.Description></Alert.Root>{/if}
			</Card.Content>
			<Card.Footer class="flex flex-wrap gap-2">
				<Button onclick={approve} disabled={!network}>Approve Network</Button>
				<Button variant="outline" onclick={request.reject}>Reject</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
