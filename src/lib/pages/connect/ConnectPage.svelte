<script lang="ts">
	import { onMount } from "svelte";
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { buildConnectResponse, resolveConnectNetwork } from "$core/protocol";
	import { getWalletAppContext } from "$lib/app/context";
	import { DappRequestState } from "$lib/app/dapp-request-state.svelte";
	import ConnectAccountPicker from "./sections/ConnectAccountPicker.svelte";

	const app = getWalletAppContext();
	const request = new DappRequestState();

	type AccountFilter = "sendable" | "signable" | "all";
	type FilterOption = { value: AccountFilter; label: string; variant: "default" | "outline" };

	let selectedAddresses = $state<Set<string>>(new Set());
	let filter = $state<AccountFilter>("sendable");
	let connectError = $state("");
	let targetNetwork = $derived.by(() => {
		if (request.request?.action !== "connect" || !request.request.genesisID) return undefined;
		try {
			return resolveConnectNetwork({ genesisID: request.request.genesisID, networks: app.allNetworks });
		} catch {
			return undefined;
		}
	});
	let filterOptions = $derived<FilterOption[]>(
		([
			["sendable", "Sendable"],
			["signable", "Signable"],
			["all", app.state.snoop ? "All (snoop)" : "All"],
		] satisfies Array<[AccountFilter, string]>).map(([value, label]) => ({
			value,
			label,
			variant: filter === value ? "default" : "outline",
		}))
	);
	let filteredAccounts = $derived.by(() => {
		if (filter === "signable") return app.accounts.filter((account) => account.canSign);
		if (filter === "all" && app.state.snoop) return app.accounts;
		return app.accounts.filter((account) => account.canSign || account.appId);
	});

	function toggleAddress(address: string) {
		const next = new Set(selectedAddresses);
		if (next.has(address)) next.delete(address);
		else next.add(address);
		selectedAddresses = next;
	}

	async function approve() {
		connectError = "";
		try {
			await app.initialize();
			if (request.request?.action !== "connect") throw new Error("No connect request is pending.");
			if (!request.request.genesisID) throw new Error("Connect request is missing a genesis ID.");
			const network = resolveConnectNetwork({ genesisID: request.request.genesisID, networks: app.allNetworks });

			if (network.name !== app.state.networkName) {
				await app.switchNetwork(network.name);
			}

			const addresses = [...selectedAddresses];
			if (addresses.length === 0) throw new Error("Select at least one account.");

			await request.respond(buildConnectResponse(addresses, app.state.debug));
		} catch (error) {
			connectError = error instanceof Error ? error.message : "Failed to approve connect request.";
		}
	}

	onMount(() => {
		void app.initialize().then(() => request.load());
	});
</script>

<div class="grid gap-6">
	<div>
		<h2 class="text-2xl font-semibold tracking-tight">Connect dApp</h2>
		<p class="text-muted-foreground text-sm">Review the dApp request and choose which accounts to expose.</p>
	</div>

	{#if request.loading}
		<Card.Root><Card.Header><Card.Title>Loading request</Card.Title></Card.Header></Card.Root>
	{:else if request.error}
		<Alert.Root variant="destructive"><Alert.Description>{request.error}</Alert.Description></Alert.Root>
	{:else if request.done}
		<Card.Root><Card.Header><Card.Title>Connect response sent</Card.Title><Card.Description>You can close this panel.</Card.Description></Card.Header></Card.Root>
	{:else if request.request?.action !== "connect"}
		<Alert.Root variant="destructive"><Alert.Description>No connect request is pending.</Alert.Description></Alert.Root>
	{:else}
		<Card.Root>
			<Card.Header>
				<Card.Title>{request.request.name ?? "Unknown dApp"}</Card.Title>
				<Card.Description>Requested network: {request.request.genesisID}</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div class="flex flex-wrap gap-2">
					<Badge variant={targetNetwork ? "default" : "destructive"}>{targetNetwork?.name ?? "Unknown network"}</Badge>
					{#if app.state.snoop}<Badge variant="secondary">Snoop mode enabled</Badge>{/if}
					{#if app.state.debug}<Badge variant="outline">Debug response enabled</Badge>{/if}
				</div>
				<div class="flex flex-wrap gap-2">
					{#each filterOptions as option (option.value)}
						<Button variant={option.variant} size="sm" onclick={() => (filter = option.value)}>{option.label}</Button>
					{/each}
				</div>
				<ConnectAccountPicker accounts={filteredAccounts} selected={selectedAddresses} ontoggle={toggleAddress} />
				{#if connectError}<Alert.Root variant="destructive"><Alert.Description>{connectError}</Alert.Description></Alert.Root>{/if}
			</Card.Content>
			<Card.Footer class="flex flex-wrap gap-2">
				<Button onclick={approve} disabled={!targetNetwork || selectedAddresses.size === 0}>Approve</Button>
				<Button variant="outline" onclick={request.reject}>Reject</Button>
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
