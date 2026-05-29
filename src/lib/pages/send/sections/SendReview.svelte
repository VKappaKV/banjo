<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { formatMicroAlgos } from "$lib/app/portfolio";
	import { getSendPageState } from "../send-page-state.svelte";
	import SendErrorAlert from "./SendErrorAlert.svelte";

	const state = getSendPageState();
</script>

{#if state.review}
	<Card.Root>
		<Card.Header>
			<Card.Title>Review transaction</Card.Title>
			<Card.Description>Confirm these details before signing.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<div class="flex flex-wrap gap-2">
				<Badge variant="outline">{state.mode.toUpperCase()}</Badge>
				<Badge variant="secondary">{state.activeSender.slice(0, 8)}...</Badge>
				{#if state.review.type === "arc59"}<Badge variant="default">ARC-59</Badge>{/if}
			</div>
			<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<span class="text-muted-foreground">Sender</span><span class="break-all">{state.activeSender}</span>
				{#if state.mode !== "rekey"}
					<span class="text-muted-foreground">Receiver</span><span class="break-all">{state.receiver}</span>
					<span class="text-muted-foreground">Amount</span><span>{state.amount}</span>
				{/if}
				{#if state.mode === "rekey"}<span class="text-muted-foreground">New auth</span><span class="break-all">{state.rekeyTo}</span>{/if}
				{#if state.activeAssetId && state.mode === "asa"}<span class="text-muted-foreground">Asset</span><span>{state.activeAssetId}</span>{/if}
				{#if state.closeTo}<span class="text-muted-foreground">Close to</span><span class="break-all">{state.closeTo}</span>{/if}
				{#if state.clawbackSender}<span class="text-muted-foreground">Clawback sender</span><span class="break-all">{state.clawbackSender}</span>{/if}
				{#if state.note}<span class="text-muted-foreground">Note</span><span>{state.note}</span>{/if}
				{#if state.review.type === "arc59"}
					<span class="text-muted-foreground">MBR payment</span><span>{formatMicroAlgos(state.review.mbrPaymentAmount)}</span>
					<span class="text-muted-foreground">App call fee</span><span>{formatMicroAlgos(state.review.appCallFee)}</span>
					<span class="text-muted-foreground">Inner transactions</span><span>{state.review.totalInnerTransactionCount.toString()}</span>
				{/if}
			</div>
			{#each state.review.warnings as warning}
				<Alert.Root><Alert.Description>{warning}</Alert.Description></Alert.Root>
			{/each}
			{#if state.review.needsPassword}
				<div class="grid gap-2">
					<label class="text-sm font-medium" for="password">Signing password</label>
					<input id="password" type="password" bind:value={state.password} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Required for this seed" />
				</div>
			{/if}
			<SendErrorAlert />
		</Card.Content>
		<Card.Footer class="flex flex-wrap gap-2">
			<Button onclick={state.submitReview}>Sign & Submit</Button>
			<Button variant="outline" onclick={state.resetReview}>Back</Button>
		</Card.Footer>
	</Card.Root>
{/if}
