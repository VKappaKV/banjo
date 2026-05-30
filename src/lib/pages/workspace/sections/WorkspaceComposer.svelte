<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Badge } from "$lib/components/ui/badge";
	import { getWorkspacePageState } from "../workspace-page-state.svelte";

	const ws = getWorkspacePageState();

	let sender = $state("");
	let receiver = $state("");
	let amount = $state("");
	let note = $state("");
	let assetId = $state("");
	let closeTo = $state("");
	let rekeyTo = $state("");
	let voteFirst = $state("");
	let voteLast = $state("");
	let voteKeyDilution = $state("");
	let voteKey = $state("");
	let selectionKey = $state("");
	let stateProofKey = $state("");
	let nonParticipation = $state(false);
	let txType = $state<"pay" | "axfer" | "keyreg">("pay");
	let swapPartnerTxnId = $state("");
	let typing = $state(false);
	let typingTimer: ReturnType<typeof setTimeout> | null = null;

	function onTyping() {
		if (!typing) {
			typing = true;
			ws.broadcastTyping(true);
		}
		if (typingTimer) clearTimeout(typingTimer);
		typingTimer = setTimeout(() => {
			typing = false;
			ws.broadcastTyping(false);
		}, 2000);
	}

	function onBlur() {
		typing = false;
		ws.broadcastTyping(false);
		if (typingTimer) clearTimeout(typingTimer);
	}

	function resetForm() {
		sender = "";
		receiver = "";
		amount = "";
		note = "";
		assetId = "";
		closeTo = "";
		rekeyTo = "";
		voteFirst = "";
		voteLast = "";
		voteKeyDilution = "";
		voteKey = "";
		selectionKey = "";
		stateProofKey = "";
		nonParticipation = false;
		txType = "pay";
		swapPartnerTxnId = "";
	}

	function submitProposal() {
		const overrides: Record<string, unknown> = {
			type: txType,
			sender,
			receiver,
			amount,
			note,
			closeRemainderTo: closeTo,
			rekeyTo,
			peerSignatures: [],
			signedBy: [],
			status: "draft" as const,
		};

		if (txType === "axfer") {
			overrides.assetId = assetId;
		}

		ws.proposeTransaction(overrides as Partial<import("$p2p/workspace-types").TransactionDraft>);
		resetForm();
	}

	function pairSwapTxns() {
		const unpaired = ws.transactions.filter((t) => !t.swapGroupId && t.status === "draft");
		if (unpaired.length < 2) return;
		ws.assignSwapPair(unpaired[0]!.id, unpaired[1]!.id);
	}

	function setSender(addr: string) {
		sender = addr;
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Transaction Composer</Card.Title>
		<Card.Description>
			{ws.mode === "send"
				? "Draft a transaction for a peer to review and sign."
				: ws.mode === "swap"
					? "Draft your side of an atomic swap."
					: "Draft a transaction for multisig signing."}
		</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-3" oninput={onTyping} onfocusout={onBlur}>
		<div class="flex gap-2">
			<Button
				size="sm"
				variant={txType === "pay" ? "default" : "outline"}
				onclick={() => (txType = "pay")}>Payment</Button
			>
			<Button
				size="sm"
				variant={txType === "axfer" ? "default" : "outline"}
				onclick={() => (txType = "axfer")}>Asset Transfer</Button
			>
			<Button
				size="sm"
				variant={txType === "keyreg" ? "default" : "outline"}
				onclick={() => (txType = "keyreg")}>Keyreg</Button
			>
		</div>

		<div class="grid gap-2">
			<label for="tx-sender" class="text-sm font-medium">Sender</label>
			{#if ws.signableAccounts.length > 0}
				<select
					id="tx-sender"
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					bind:value={sender}
				>
					<option value="">Select sender...</option>
					{#each ws.signableAccounts as account}
						<option value={account.addr}>
							{account.name ?? account.addr.slice(0, 12)}…{account.addr.slice(-4)}
						</option>
					{/each}
				</select>
			{:else}
				<input
					id="tx-sender"
					type="text"
					bind:value={sender}
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					placeholder="Sender address"
				/>
			{/if}
		</div>

		{#if txType === "pay" || txType === "axfer"}
			<div class="grid gap-2">
				<label for="tx-receiver" class="text-sm font-medium">Receiver</label>
				<input
					id="tx-receiver"
					type="text"
					bind:value={receiver}
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					placeholder="Receiver address"
				/>
			</div>
			<div class="grid gap-2">
				<label for="tx-amount" class="text-sm font-medium">
					Amount {txType === "axfer" ? "(base units)" : "(ALGO)"}
				</label>
				<input
					id="tx-amount"
					type="text"
					bind:value={amount}
					class="rounded border bg-background px-3 py-2 text-sm"
					placeholder="0"
				/>
			</div>
			{#if txType === "axfer"}
				<div class="grid gap-2">
					<label for="tx-asset-id" class="text-sm font-medium">Asset ID</label>
					<input
						id="tx-asset-id"
						type="text"
						bind:value={assetId}
						class="rounded border bg-background px-3 py-2 text-sm"
						placeholder="Asset index"
					/>
				</div>
			{/if}
			<div class="grid gap-2">
				<label for="tx-close" class="text-sm font-medium">Close Remainder To</label>
				<input
					id="tx-close"
					type="text"
					bind:value={closeTo}
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					placeholder="Optional close address"
				/>
			</div>
		{/if}

		{#if txType === "keyreg"}
			<div class="grid gap-2">
				<label for="tx-vote-key" class="text-sm font-medium">Vote Key</label>
				<input
					id="tx-vote-key"
					type="text"
					bind:value={voteKey}
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					placeholder="Vote participation key"
				/>
			</div>
			<div class="grid gap-2">
				<label for="tx-sel-key" class="text-sm font-medium">Selection Key</label>
				<input
					id="tx-sel-key"
					type="text"
					bind:value={selectionKey}
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					placeholder="Selection participation key"
				/>
			</div>
			<div class="grid gap-2">
				<label for="tx-vote-first" class="text-sm font-medium">Vote First</label>
				<input
					id="tx-vote-first"
					type="text"
					bind:value={voteFirst}
					class="rounded border bg-background px-3 py-2 text-sm"
					placeholder="First voting round"
				/>
			</div>
			<div class="grid gap-2">
				<label for="tx-vote-last" class="text-sm font-medium">Vote Last</label>
				<input
					id="tx-vote-last"
					type="text"
					bind:value={voteLast}
					class="rounded border bg-background px-3 py-2 text-sm"
					placeholder="Last voting round"
				/>
			</div>
			<div class="grid gap-2">
				<label for="tx-vote-dilution" class="text-sm font-medium">Vote Key Dilution</label>
				<input
					id="tx-vote-dilution"
					type="text"
					bind:value={voteKeyDilution}
					class="rounded border bg-background px-3 py-2 text-sm"
					placeholder="Key dilution"
				/>
			</div>
		{/if}

		<div class="grid gap-2">
			<label for="tx-rekey" class="text-sm font-medium">Rekey To</label>
			<input
				id="tx-rekey"
				type="text"
				bind:value={rekeyTo}
				class="rounded border bg-background px-3 py-2 text-sm font-mono"
				placeholder="Optional rekey address"
			/>
		</div>

		<div class="grid gap-2">
			<label for="tx-note" class="text-sm font-medium">Note</label>
			<input
				id="tx-note"
				type="text"
				bind:value={note}
				class="rounded border bg-background px-3 py-2 text-sm"
				placeholder="Optional note"
			/>
		</div>

		<Button onclick={submitProposal}>Propose Transaction</Button>
	</Card.Content>
</Card.Root>

{#if ws.transactions.length > 0}
	<Card.Root>
		<Card.Header>
			<Card.Title>Proposed ({ws.transactions.length})</Card.Title>
			<Card.Description>
				{#if ws.mode === "multisig"}
					Signatures collected across the workspace. Submit when threshold is met.
				{:else if ws.mode === "swap"}
					Draft your side of the swap. Pair two transactions to create an atomic group.
				{:else}
					Peers can review, sign, or reject proposed transactions.
				{/if}
			</Card.Description>
			{#if ws.mode === "swap" && ws.transactions.filter((t) => !t.swapGroupId && t.status === "draft").length >= 2}
				<div class="mt-2">
					<Button size="sm" variant="outline" onclick={pairSwapTxns}>
						Pair as Swap Group
					</Button>
				</div>
			{/if}
		</Card.Header>
		<Card.Content class="grid gap-3">
			{#each ws.transactions as tx (tx.id)}
				<div class="rounded-lg border p-3">
					<div class="mb-2 flex items-center gap-2">
						<Badge variant="outline" class="text-xs uppercase">{tx.type}</Badge>
						<Badge
							variant={tx.status === "signed" ? "default" : "secondary"}
							class="text-xs"
						>
							{tx.status}
						</Badge>
						{#if tx.peerSignatures.length > 0}
							<span class="text-xs text-muted-foreground">
								{tx.peerSignatures.length} signature(s)
							</span>
						{/if}
					</div>
					<div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
						<span class="text-muted-foreground">Sender</span>
						<span class="font-mono text-xs truncate">{tx.sender || "—"}</span>
						{#if tx.receiver}
							<span class="text-muted-foreground">Receiver</span>
							<span class="font-mono text-xs truncate">{tx.receiver}</span>
						{/if}
						{#if tx.amount}
							<span class="text-muted-foreground">Amount</span>
							<span>{tx.amount}</span>
						{/if}
					</div>
				</div>
			{/each}
		</Card.Content>
	</Card.Root>
{/if}
