<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Separator } from "$lib/components/ui/separator";
	import {
		Select,
		SelectContent,
		SelectGroup,
		SelectItem,
		SelectLabel,
		SelectTrigger,
	} from "$lib/components/ui/select";
	import { builtInNetworks } from "$core/data/networks";
	import { setCustomNetworks, setSelectedNetworkName } from "$core/state";
	import { validateNetworkConfig } from "$core/network/validation";
	import type { Network } from "$core/types";
	import { getWalletAppContext } from "$lib/app/context";

	const app = getWalletAppContext();

	const allNetworks = $derived(app.allNetworks);
	const customNetworks = $derived(app.state.customNetworks);

	let selectedNetwork = $state(app.state.networkName);

	function getCore() {
		if (!app.core) throw new Error("Wallet not initialized.");
		return app.core;
	}

	async function changeNetwork(name: string) {
		const core = getCore();
		selectedNetwork = name;
		await setSelectedNetworkName(core.storage, name);
		app.state = { ...app.state, networkName: name };
		await app.switchNetwork(name);
		app.notify(`Switched to ${name}`, "info");
	}

	let showAddDialog = $state(false);
	let addJson = $state("");
	let addError = $state("");
	let adding = $state(false);

	function openAdd() {
		addJson = "";
		addError = "";
		showAddDialog = true;
	}

	async function addNetwork() {
		const core = getCore();
		addError = "";
		adding = true;
		try {
			let parsed: unknown;
			try {
				parsed = JSON.parse(addJson);
			} catch {
				addError = "Invalid JSON";
				return;
			}
			const result = validateNetworkConfig(parsed);
			if (!result.valid || !result.network) {
				addError = result.errors.join("; ");
				return;
			}
			const knownGenesisIds = [...new Set(allNetworks.map((n) => n.genesisID))];
			if (knownGenesisIds.includes(result.network.genesisID)) {
				addError = `Network genesisID "${result.network.genesisID}" is already configured`;
				return;
			}
			const next = [...customNetworks, result.network];
			await setCustomNetworks(core.storage, next);
			app.state = { ...app.state, customNetworks: next };
			app.notify(`Added network ${result.network.name}`, "info");
			showAddDialog = false;
		} finally {
			adding = false;
		}
	}

	async function removeNetwork(network: Network) {
		const core = getCore();
		const next = customNetworks.filter((n) => n.genesisID !== network.genesisID);
		await setCustomNetworks(core.storage, next);
		app.state = { ...app.state, customNetworks: next };
		app.notify(`Removed ${network.name}`, "info");
		if (app.state.networkName === network.name) {
			await changeNetwork("MainNet");
		}
	}

	let editNetwork = $state<Network | undefined>();
	let showEditDialog = $state(false);
	let editJson = $state("");
	let editError = $state("");

	function openEdit(network: Network) {
		editNetwork = network;
		editJson = JSON.stringify(network, null, 2);
		editError = "";
		showEditDialog = true;
	}

	async function saveEdit() {
		const core = getCore();
		if (!editNetwork) return;
		editError = "";
		try {
			let parsed: unknown;
			try {
				parsed = JSON.parse(editJson);
			} catch {
				editError = "Invalid JSON";
				return;
			}
			const result = validateNetworkConfig(parsed);
			if (!result.valid || !result.network) {
				editError = result.errors.join("; ");
				return;
			}
			const idx = customNetworks.findIndex((n) => n.genesisID === editNetwork!.genesisID);
			if (idx === -1) return;
			const next = [...customNetworks];
			next[idx] = result.network;
			await setCustomNetworks(core.storage, next);
			app.state = { ...app.state, customNetworks: next };
			app.notify(`Updated ${result.network.name}`, "info");
			editNetwork = undefined;
			showEditDialog = false;
		} finally {
			editError = "";
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Network</Card.Title>
		<Card.Description>Select the active network and manage custom network configurations.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Active network</div>
				<div class="text-muted-foreground text-sm">Choose which Algorand network to connect to.</div>
			</div>
			<Select value={selectedNetwork} onValueChange={changeNetwork} type="single">
				<SelectTrigger class="w-44">
					<span data-slot="select-value">{selectedNetwork}</span>
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						<SelectLabel>Built-in</SelectLabel>
						{#each builtInNetworks as network}
							<SelectItem value={network.name}>{network.name}</SelectItem>
						{/each}
					</SelectGroup>
					{#if customNetworks.length > 0}
						<SelectGroup>
							<SelectLabel>Custom</SelectLabel>
							{#each customNetworks as network}
								<SelectItem value={network.name}>{network.name}</SelectItem>
							{/each}
						</SelectGroup>
					{/if}
				</SelectContent>
			</Select>
		</div>

		<Separator />

		<div>
			<div class="mb-3 flex items-center justify-between">
				<div>
					<div class="font-medium">Custom networks</div>
					<div class="text-muted-foreground text-sm">Add or remove custom network endpoints.</div>
				</div>
				<Button size="sm" onclick={openAdd}>Add</Button>
			</div>
			{#if customNetworks.length === 0}
				<p class="text-muted-foreground text-sm italic">No custom networks added.</p>
			{:else}
				<div class="grid gap-2">
					{#each customNetworks as network}
						<div class="bg-muted flex items-center justify-between rounded-lg px-3 py-2">
							<div class="min-w-0">
								<div class="truncate font-medium">{network.name}</div>
								<div class="text-muted-foreground truncate text-xs">{network.algod.url}:{network.algod.port}</div>
							</div>
							<div class="flex shrink-0 gap-1">
								<Button variant="ghost" size="xs" onclick={() => openEdit(network)}>Edit</Button>
								<Button variant="ghost" size="xs" onclick={() => removeNetwork(network)}>Remove</Button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</Card.Content>
</Card.Root>

<Dialog.Root bind:open={showAddDialog}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Add custom network</Dialog.Title>
			<Dialog.Description>Paste the network configuration JSON below.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<textarea
				bind:value={addJson}
				placeholder={`{"algod":{"url":"...","port":"...","token":"..."},"genesisID":"...","explorer":"..."}`}
				class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-50 w-full rounded-lg border px-3 py-2 text-xs font-mono focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				spellcheck="false"
			></textarea>
			{#if addError}
				<p class="text-destructive text-xs">{addError}</p>
			{/if}
		</div>
		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={() => showAddDialog = false}>Cancel</Button>
			<Button onclick={addNetwork} disabled={adding || !addJson.trim()}>Add</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<Dialog.Root bind:open={showEditDialog}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Edit custom network</Dialog.Title>
			<Dialog.Description>Modify the network configuration.</Dialog.Description>
		</Dialog.Header>
		<div class="grid gap-4">
			<textarea
				bind:value={editJson}
				class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring min-h-50 w-full rounded-lg border px-3 py-2 text-xs font-mono focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
				spellcheck="false"
			></textarea>
			{#if editError}
				<p class="text-destructive text-xs">{editError}</p>
			{/if}
		</div>
		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={() => { editNetwork = undefined; showEditDialog = false; }}>Cancel</Button>
			<Button onclick={saveEdit} disabled={!editJson.trim()}>Save</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
