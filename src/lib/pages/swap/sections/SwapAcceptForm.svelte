<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { getSwapPageState } from "../swap-page-state.svelte";
	import SwapFeedbackAlerts from "./SwapFeedbackAlerts.svelte";

	const state = getSwapPageState();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Accept swap proposal</Card.Title>
		<Card.Description>Paste the JSON proposal or both serialized transaction fields.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<textarea bind:value={state.acceptTx1} class="min-h-32 rounded border border-input bg-background p-2 text-sm" placeholder='Paste proposal JSON or tx1'></textarea>
		<input bind:value={state.acceptTx2} class="rounded border border-input bg-background p-2 text-sm" placeholder="tx2 if not using JSON" />
		<input type="password" bind:value={state.password} class="rounded border border-input bg-background p-2 text-sm" placeholder="Signing password if required" />
		<SwapFeedbackAlerts />
	</Card.Content>
	<Card.Footer><Button onclick={state.acceptProposal} disabled={state.accepting}>{state.accepting ? "Submitting" : "Accept & Submit"}</Button></Card.Footer>
</Card.Root>
