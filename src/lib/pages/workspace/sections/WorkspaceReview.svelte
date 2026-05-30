<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import * as Alert from "$lib/components/ui/alert";
	import { getWorkspacePageState } from "../workspace-page-state.svelte";

	const ws = getWorkspacePageState();

	function handleSign(txId: string) {
		const tx = ws.transactions.find((t) => t.id === txId);
		if (ws.mode === "swap" && tx?.swapGroupId) {
			ws.signSwapSide(txId, tx.swapGroupId);
		} else {
			ws.signTransaction(txId);
		}
	}

	function handleSubmit(txId: string) {
		if (ws.mode === "multisig") {
			ws.submitMultisigTransaction(txId);
		} else {
			ws.submitTransaction(txId);
		}
	}

	function handleSubmitSwapGroup(groupId: string) {
		ws.submitSwapGroup(groupId);
	}
</script>

{#if ws.transactions.length === 0}
	<Card.Root>
		<Card.Content class="py-8 text-center text-sm text-muted-foreground">
			No transactions yet. Compose one above.
		</Card.Content>
	</Card.Root>
{:else}
	{#each ws.transactions as tx (tx.id)}
		<Card.Root
			class={tx.id === ws.transitionTxId ? "ring-1 ring-primary/40 transition-all duration-700" : ""}
		>
			<Card.Header class="pb-2">
				<div class="flex items-center justify-between">
					<div class="flex items-center gap-2">
						<Card.Title class="text-base">Tx</Card.Title>
						<Badge variant="outline" class="text-xs uppercase">{tx.type}</Badge>
						<Badge
							variant={tx.status === "draft" ? "secondary" : tx.status === "signed" ? "default" : "outline"}
							class="text-xs"
						>
							{tx.status}
						</Badge>
						{#if tx.swapGroupId}
							<Badge variant="outline" class="text-xs">swap #{tx.swapGroupId}</Badge>
						{/if}
					</div>

					<div class="flex gap-2">
						{#if tx.status === "draft"}
							{#if ws.mode === "multisig"}
								<Button
									size="sm"
									variant="default"
									disabled={ws.signingStep === "signing" && ws.signingTxId === tx.id}
									onclick={() => handleSign(tx.id)}
								>
									{ws.signingStep === "signing" && ws.signingTxId === tx.id
										? "Signing..."
										: "Sign (personal key)"}
								</Button>
							{:else if ws.mode === "send"}
								<Button
									size="sm"
									variant="default"
									disabled={ws.signingStep === "signing" && ws.signingTxId === tx.id}
									onclick={() => handleSign(tx.id)}
								>
									{ws.signingStep === "signing" && ws.signingTxId === tx.id
										? "Signing..."
										: "Sign"}
								</Button>
							{/if}
							<Button size="sm" variant="outline" onclick={() => ws.removeTransaction(tx.id)}
								>Reject</Button
							>
						{/if}

						{#if tx.status === "signed" && ws.canSubmit(tx.id)}
							<Button
								size="sm"
								variant="default"
								disabled={ws.signingStep === "submitting"}
								onclick={() => handleSubmit(tx.id)}
							>
								{ws.signingStep === "submitting" && ws.signingTxId === tx.id
									? "Submitting..."
									: ws.mode === "multisig"
										? "Assemble & Submit"
										: "Submit"}
							</Button>
						{/if}
					</div>
				</div>
			</Card.Header>
			<Card.Content class="grid gap-3">
				<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
					<span class="text-muted-foreground">Sender</span>
					<span class="font-mono text-xs truncate" title={tx.sender}>
						{tx.sender ? tx.sender.slice(0, 8) + "…" + tx.sender.slice(-4) : "—"}
					</span>

					{#if tx.type === "pay" || tx.type === "axfer"}
						<span class="text-muted-foreground">Receiver</span>
						<span class="font-mono text-xs truncate" title={tx.receiver}>
							{tx.receiver
								? tx.receiver.slice(0, 8) + "…" + tx.receiver.slice(-4)
								: "—"}
						</span>

						{#if tx.amount}
							<span class="text-muted-foreground">Amount</span>
							<span>{tx.amount} {tx.type === "axfer" ? `ASA #${tx.assetId}` : "ALGO"}</span>
						{/if}
					{/if}

					{#if tx.closeRemainderTo}
						<span class="text-muted-foreground">Close To</span>
						<span class="font-mono text-xs truncate">{tx.closeRemainderTo}</span>
					{/if}

					{#if tx.rekeyTo}
						<span class="text-muted-foreground">Rekey To</span>
						<span class="font-mono text-xs truncate">{tx.rekeyTo}</span>
					{/if}

					{#if tx.note}
						<span class="text-muted-foreground">Note</span>
						<span class="truncate">{tx.note}</span>
					{/if}
				</div>

				{#if ws.mode === "multisig" && ws.multisigConfig}
					<div class="rounded border p-2 text-xs">
						<div class="flex items-center gap-2">
							<span class="text-muted-foreground">Signatures:</span>
							<span>{tx.peerSignatures.length} / {ws.multisigConfig.threshold}</span>
							{#if tx.peerSignatures.length >= ws.multisigConfig.threshold}
								<Badge variant="default" class="text-xs">threshold met</Badge>
							{/if}
						</div>
						{#if tx.peerSignatures.length > 0}
							<ul class="mt-1 space-y-0.5">
								{#each tx.peerSignatures as sig}
									<li class="flex items-center gap-1">
										<span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
										<span class="font-mono">{sig.peerId.slice(0, 8)}</span>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{/if}

				{#if ws.mode === "send" && tx.peerSignatures.length > 0}
					<div class="rounded border p-2 text-xs">
						<span class="text-muted-foreground">Signatures:</span>
						<ul class="mt-1 space-y-0.5">
							{#each tx.peerSignatures as sig}
								<li class="flex items-center gap-1">
									<span class="h-1.5 w-1.5 rounded-full bg-green-500"></span>
									<span class="font-mono">{sig.peerId.slice(0, 8)}</span>
								</li>
							{/each}
						</ul>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>
	{/each}
{/if}

{#if ws.mode === "swap" && ws.swapPairs.length > 0}
	<div class="space-y-2">
		<h3 class="text-sm font-medium">Swap Groups</h3>
		{#each ws.swapPairs as pair (pair.id)}
			{@const txn1 = ws.transactions.find((t) => t.id === pair.txn1Id)}
			{@const txn2 = ws.transactions.find((t) => t.id === pair.txn2Id)}
			<Card.Root class="border-dashed">
				<Card.Header class="pb-2">
					<div class="flex items-center justify-between">
						<Card.Title class="text-sm">Swap #{pair.id}</Card.Title>
						<Badge variant="outline" class="text-xs">{pair.status}</Badge>
					</div>
				</Card.Header>
				<Card.Content class="grid gap-2 text-xs">
					<div class="flex gap-2">
						<span class="text-muted-foreground">Tx1:</span>
						<span class="font-mono">{pair.txn1Id.slice(0, 8)}</span>
						<Badge variant="secondary" class="text-xs">{txn1?.status ?? "—"}</Badge>
					</div>
					<div class="flex gap-2">
						<span class="text-muted-foreground">Tx2:</span>
						<span class="font-mono">{pair.txn2Id.slice(0, 8)}</span>
						<Badge variant="secondary" class="text-xs">{txn2?.status ?? "—"}</Badge>
					</div>
					{#if pair.status === "signed"}
						<Button size="sm" variant="default" onclick={() => handleSubmitSwapGroup(pair.id)}>
							Submit Atomic Group
						</Button>
					{/if}
				</Card.Content>
			</Card.Root>
		{/each}
	</div>
{/if}

{#if ws.error && ws.signingStep === "error"}
	<Alert.Root variant="destructive">
		<Alert.Title>Error</Alert.Title>
		<Alert.Description>{ws.error}</Alert.Description>
	</Alert.Root>
{/if}

{#if ws.signingStep === "done" && ws.submittedTxIds.length > 0}
	<Alert.Root variant="default">
		<Alert.Title>Submitted</Alert.Title>
		<Alert.Description>
			Transaction(s) submitted:
			{#each ws.submittedTxIds as id}
				<span class="block font-mono text-xs">{id}</span>
			{/each}
		</Alert.Description>
	</Alert.Root>
{/if}
