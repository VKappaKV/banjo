<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Select from "$lib/components/ui/select";
	import { getSwapPageState } from "../swap-page-state.svelte";
	import SwapFeedbackAlerts from "./SwapFeedbackAlerts.svelte";
	import SwapSenderSelect from "./SwapSenderSelect.svelte";

	const state = getSwapPageState();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Create swap proposal</Card.Title>
		<Card.Description>Sign your side and share the serialized proposal with the counterparty.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<SwapSenderSelect />
		<input bind:value={state.receiver} class="rounded border border-input bg-background p-2 text-sm" placeholder="Counterparty address" />
		<div class="grid gap-2 sm:grid-cols-2">
			<Select.Root type="single" value={state.senderAssetId} onValueChange={state.setSenderAssetId}>
				<Select.Trigger>Send {state.selectedSenderAssetLabel}</Select.Trigger>
				<Select.Content>
					{#each state.assetChoices as asset (asset.id)}
						<Select.Item value={asset.id} label={asset.label} />
					{/each}
				</Select.Content>
			</Select.Root>
			<input bind:value={state.senderAmount} class="rounded border border-input bg-background p-2 text-sm" placeholder="You send amount" />
		</div>
		<div class="grid gap-2 sm:grid-cols-2">
			<input bind:value={state.receiverAssetId} class="rounded border border-input bg-background p-2 text-sm" placeholder="Counterparty asset ID (0 for ALGO)" />
			<input bind:value={state.receiverAmount} class="rounded border border-input bg-background p-2 text-sm" placeholder="They send amount" />
		</div>
		<input type="password" bind:value={state.password} class="rounded border border-input bg-background p-2 text-sm" placeholder="Signing password if required" />
		<SwapFeedbackAlerts />
		{#if state.proposal}
			<textarea readonly class="min-h-32 rounded border border-input bg-muted p-2 text-xs" value={state.proposal}></textarea>
		{/if}
	</Card.Content>
	<Card.Footer><Button onclick={state.buildProposal}>Build Signed Proposal</Button></Card.Footer>
</Card.Root>
