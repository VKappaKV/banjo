<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Select from "$lib/components/ui/select";
	import { assetHoldingAmount, assetHoldingId, formatAssetAmount } from "$lib/app/portfolio";
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

{#if state.mode === "asa"}
	<div class="grid gap-2">
		<label class="text-sm font-medium" for="asset">Asset</label>
		<Select.Root type="single" value={state.activeAssetId} onValueChange={state.setSelectedAssetId}>
			<Select.Trigger id="asset">{state.activeAssetId ? `Asset ${state.activeAssetId}` : "Select asset"}</Select.Trigger>
			<Select.Content>
				{#each state.assetHoldings as holding (assetHoldingId(holding).toString())}
					<Select.Item
						value={assetHoldingId(holding).toString()}
						label={`Asset ${assetHoldingId(holding).toString()} (${formatAssetAmount(assetHoldingAmount(holding), 0)})`}
					/>
				{/each}
			</Select.Content>
		</Select.Root>
		{#if state.assetHoldings.length === 0}
			<p class="text-muted-foreground text-sm">The selected account has no ASA holdings.</p>
		{/if}
	</div>
{/if}

{#if state.mode === "algo" || state.mode === "asa"}
	<div class="grid gap-2">
		<label class="text-sm font-medium" for="receiver">Receiver</label>
		<input id="receiver" bind:value={state.receiver} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Algorand address" />
		<div class="flex gap-2">
			<input bind:value={state.recipientSearch} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Search NFD name" />
			<Button variant="outline" onclick={state.searchRecipient} disabled={state.recipientSearching || !state.recipientSearch.trim()}>
				{state.recipientSearching ? "Searching" : "Search"}
			</Button>
		</div>
		{#if state.recipientResults.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each state.recipientResults as result (result.value)}
					<Button variant="outline" size="sm" onclick={() => state.selectRecipient(result.value)}>{result.title}</Button>
				{/each}
			</div>
		{/if}
	</div>
	<div class="grid gap-2">
		<label class="text-sm font-medium" for="amount">Amount</label>
		<input id="amount" bind:value={state.amount} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="0.00" />
	</div>
{:else if state.mode === "rekey"}
	<Alert.Root>
		<Alert.Title>Rekey warning</Alert.Title>
		<Alert.Description>Rekeying changes the account authorized to sign future transactions.</Alert.Description>
	</Alert.Root>
	<div class="grid gap-2">
		<label class="text-sm font-medium" for="rekeyTo">New auth address</label>
		<input id="rekeyTo" bind:value={state.rekeyTo} class="w-full rounded border border-input bg-background p-2 text-sm" placeholder="Algorand address" />
	</div>
{:else if state.mode === "online-keyreg"}
	<div class="grid gap-3">
		<div class="grid gap-2">
			<label class="text-sm font-medium" for="partkey">Paste partkey info</label>
			<textarea id="partkey" bind:value={state.partkeyText} class="min-h-28 w-full rounded border border-input bg-background p-2 text-sm" placeholder="Paste goal account partkeyinfo output"></textarea>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" onclick={state.applyPartkeyPaste}>Parse Partkey</Button>
				<Button variant="outline" onclick={state.estimateBlockTime}>Estimate Block Time</Button>
				{#if state.averageBlockLabel}<Badge variant="secondary">{state.averageBlockLabel}</Badge>{/if}
			</div>
		</div>
		<div class="grid gap-2 sm:grid-cols-3">
			<input bind:value={state.voteFirst} class="rounded border border-input bg-background p-2 text-sm" placeholder="First round" />
			<input bind:value={state.voteLast} class="rounded border border-input bg-background p-2 text-sm" placeholder="Last round" />
			<input bind:value={state.voteKeyDilution} class="rounded border border-input bg-background p-2 text-sm" placeholder="Key dilution" />
		</div>
		<input bind:value={state.voteKey} class="rounded border border-input bg-background p-2 text-sm" placeholder="Voting key (base64)" />
		<input bind:value={state.selectionKey} class="rounded border border-input bg-background p-2 text-sm" placeholder="Selection key (base64)" />
		<input bind:value={state.stateProofKey} class="rounded border border-input bg-background p-2 text-sm" placeholder="State proof key (base64, optional)" />
		<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={state.incentiveEligible} /> Incentive eligible</label>
	</div>
{:else if state.mode === "offline-keyreg"}
	<Alert.Root>
		<Alert.Title>Offline participation</Alert.Title>
		<Alert.Description>Build an offline key registration transaction. Non-participation should be used with care.</Alert.Description>
	</Alert.Root>
	<label class="flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={state.nonParticipation} /> Mark account non-participating</label>
{/if}
