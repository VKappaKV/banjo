<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { Separator } from "$lib/components/ui/separator";
	import { explorerAccountUrl, formatMicroAlgos } from "$lib/app/portfolio";
	import { getMultisigPageState } from "../multisig-page-state.svelte";

	const state = getMultisigPageState();
	let explorerUrl = $derived(
		state.appId ? explorerAccountUrl(state.selectedNetwork, state.appAddress) : undefined,
	);
	let memberVotes = $derived.by(() => {
		const votes: Record<string, number> = {};
		for (const addr of state.members) {
			votes[addr] = (votes[addr] ?? 0) + 1;
		}
		return Object.entries(votes);
	});
</script>

<Card.Root>
	<Card.Header>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<Card.Title class="text-xl">ARC-55 Multisig App</Card.Title>
				<Card.Description class="break-all">{state.appAddress}</Card.Description>
			</div>
			<Badge variant="outline" class="shrink-0">App ID {state.appId?.toString()}</Badge>
		</div>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="flex flex-wrap gap-2">
			<Badge variant="secondary" class="text-sm">
				Balance: {formatMicroAlgos(state.balance)}
			</Badge>
			<Badge variant="secondary" class="text-sm">
				Threshold: {state.threshold}/{memberVotes.length}
			</Badge>
			<Badge variant="secondary" class="text-sm">Groups: {state.nonce}</Badge>
		</div>
		<Separator />
		<div class="grid gap-2">
			<h4 class="text-sm font-medium text-muted-foreground">Admin</h4>
			<p class="font-mono text-xs break-all">{state.admin}</p>
		</div>
		<Separator />
		<div class="grid gap-2">
			<h4 class="text-sm font-medium text-muted-foreground">Members</h4>
			<div class="grid gap-1">
				{#each memberVotes as [address, votes]}
					<div class="flex items-center justify-between gap-2 rounded border px-3 py-1.5 text-sm">
						<span class="min-w-0 break-all font-mono text-xs">{address}</span>
						<Badge variant="outline" class="shrink-0">Votes: {votes}</Badge>
					</div>
				{/each}
			</div>
		</div>
		{#if explorerUrl}
			<Separator />
			<a href={explorerUrl} target="_blank" rel="noreferrer" class="text-sm text-primary hover:underline">
				View on Explorer →
			</a>
		{/if}
	</Card.Content>
</Card.Root>
