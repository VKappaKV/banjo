<script lang="ts">
	import { getWalletAppContext } from "$lib/app/context";
	import { setSwapPageState } from "./swap-page-state.svelte";
	import NoSignableAccounts from "./sections/NoSignableAccounts.svelte";
	import SwapAcceptForm from "./sections/SwapAcceptForm.svelte";
	import SwapHeader from "./sections/SwapHeader.svelte";
	import SwapModeTabs from "./sections/SwapModeTabs.svelte";
	import SwapProposalForm from "./sections/SwapProposalForm.svelte";

	const app = getWalletAppContext();
	const state = setSwapPageState(app);
</script>

<div class="grid gap-6">
	<SwapHeader />
	<SwapModeTabs />

	{#if state.signableAccounts.length === 0}
		<NoSignableAccounts />
	{:else if state.mode === "propose"}
		<SwapProposalForm />
	{:else}
		<SwapAcceptForm />
	{/if}
</div>
