<script lang="ts">
	import { onMount } from "svelte";
	import { buildCloseResponse } from "$core/protocol";
	import { getWalletAppContext } from "$lib/app/context";
	import { DappRequestState } from "$lib/app/dapp-request-state.svelte";
	import { setSwapPageState } from "./swap-page-state.svelte";
	import NoSignableAccounts from "./sections/NoSignableAccounts.svelte";
	import SwapAcceptForm from "./sections/SwapAcceptForm.svelte";
	import SwapHeader from "./sections/SwapHeader.svelte";
	import SwapModeTabs from "./sections/SwapModeTabs.svelte";
	import SwapProposalForm from "./sections/SwapProposalForm.svelte";

	const app = getWalletAppContext();
	const state = setSwapPageState(app);
	const dappRequest = new DappRequestState();

	onMount(() => {
		void dappRequest.load().then(() => {
			if (dappRequest.request?.action !== "swap") return;
			if (dappRequest.request.tx1 && dappRequest.request.tx2) {
				state.loadAcceptanceRequest(dappRequest.request.tx1, dappRequest.request.tx2);
				state.onAccepted = () => dappRequest.respond(buildCloseResponse());
				state.onRejected = dappRequest.reject;
			}
		});
	});
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
