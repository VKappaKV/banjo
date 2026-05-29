<script lang="ts">
	import { onMount } from "svelte";
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import { getWalletAppContext } from "$lib/app/context";
	import { getWalletViewDefinition } from "$lib/app/views";
	import { setMultisigPageState, getMultisigPageState } from "./multisig-page-state.svelte";
	import MultisigHeader from "./sections/MultisigHeader.svelte";
	import GroupList from "./sections/GroupList.svelte";
	import MultisigActions from "./sections/MultisigActions.svelte";

	let { params = {} as Record<string, string> } = $props();

	const app = getWalletAppContext();
	const page = getWalletViewDefinition("multisig");

	const state = setMultisigPageState(app);

	onMount(() => {
		if (params.appId) {
			state.load(params.appId);
		}
	});

	let title = $derived(params.appId ? `Multisig #${params.appId}` : page.label);
</script>

<div class="grid gap-6">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-2xl font-semibold tracking-tight">{title}</h2>
		</div>
	</div>

	{#if !params.appId}
		<Alert.Root>
			<Alert.Title>No multisig selected</Alert.Title>
			<Alert.Description>
				Select a multisig account from the accounts page and view its details to access ARC-55
				management.
			</Alert.Description>
		</Alert.Root>
		<Button variant="outline" href="#/accounts">Back to Accounts</Button>
	{:else if state.loading}
		<div class="grid gap-3">
			<div class="bg-muted h-6 w-48 animate-pulse rounded"></div>
			<div class="bg-muted h-4 w-full max-w-xl animate-pulse rounded"></div>
			<div class="bg-muted h-48 w-full animate-pulse rounded"></div>
		</div>
	{:else if state.error}
		<Alert.Root variant="destructive">
			<Alert.Title>Error</Alert.Title>
			<Alert.Description>{state.error}</Alert.Description>
		</Alert.Root>
		<Button variant="outline" href="#/accounts">Back to Accounts</Button>
	{:else if state.arc55App}
		<MultisigHeader />
		<GroupList />
		<MultisigActions />
	{/if}
</div>
