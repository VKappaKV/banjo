<script lang="ts">
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

{#if state.mode === "algo" || state.mode === "asa"}
	<div class="grid gap-2">
		<label class="text-sm font-medium" for="closeTo">{state.closeAddressLabel}</label>
		<input id="closeTo" bind:value={state.closeTo} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Optional address" />
	</div>
{/if}

{#if state.mode === "asa"}
	<div class="grid gap-2">
		<label class="text-sm font-medium" for="clawbackSender">Clawback sender</label>
		<input id="clawbackSender" bind:value={state.clawbackSender} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Optional clawback target" />
	</div>
{/if}
