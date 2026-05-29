<script lang="ts">
	import { getWalletAppContext } from "$lib/app/context";
	import { setSendPageState } from "./send-page-state.svelte";
	import NoSignableAccounts from "./sections/NoSignableAccounts.svelte";
	import SendDone from "./sections/SendDone.svelte";
	import SendForm from "./sections/SendForm.svelte";
	import SendHeader from "./sections/SendHeader.svelte";
	import SendReview from "./sections/SendReview.svelte";
	import SendSubmitting from "./sections/SendSubmitting.svelte";

	const app = getWalletAppContext();
	const state = setSendPageState(app);
</script>

<div class="grid gap-6">
	<SendHeader />

	{#if state.signableAccounts.length === 0}
		<NoSignableAccounts />
	{:else if state.step === "form"}
		<SendForm />
	{:else if state.step === "review" && state.review}
		<SendReview />
	{:else if state.step === "submitting"}
		<SendSubmitting />
	{:else if state.step === "done"}
		<SendDone />
	{/if}
</div>
