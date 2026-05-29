<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import type { PreparedSigningProtocolRequest } from "$core/protocol";

	interface Props {
		prepared: PreparedSigningProtocolRequest;
		assetLabels: Record<string, string>;
	}

	let { prepared, assetLabels }: Props = $props();

	type DisplayTransaction = PreparedSigningProtocolRequest["transactions"][number];

	function displayType(transaction: DisplayTransaction): string {
		const isRekey = transaction.payment?.amount === 0n
			&& transaction.payment?.receiver.toString() === transaction.sender.toString()
			&& transaction.rekeyTo;
		if (isRekey) return "rekey";

		return transaction.type;
	}

	function typeLabel(type: string): string {
		const labels: Record<string, string> = {
			pay: "Payment",
			axfer: "Asset transfer",
			appl: "Application call",
			keyreg: "Key registration",
			acfg: "Asset config",
			afrz: "Freeze",
			rekey: "Rekey",
		};
		return labels[type] ?? type;
	}

	function receiver(transaction: DisplayTransaction): string | undefined {
		return transaction.payment?.receiver.toString()
			?? transaction.assetTransfer?.receiver.toString()
			?? undefined;
	}

	function amount(transaction: DisplayTransaction): string | undefined {
		const value = transaction.payment?.amount ?? transaction.assetTransfer?.amount;
		return value != null ? value.toString() : undefined;
	}

	function notePreview(note: Uint8Array | undefined): string | undefined {
		if (!note || note.length === 0) return undefined;
		const text = new TextDecoder().decode(note);
		return text.length > 80 ? `${text.slice(0, 80)}\u2026` : text;
	}

	function isAssetCreate(transaction: DisplayTransaction): boolean {
		return transaction.type === "acfg" && transaction.assetConfig?.assetIndex === 0n;
	}
</script>

<div class="grid gap-3">
	{#each prepared.transactions as transaction, index (index)}
		{@const type = displayType(transaction)}
		<div class="rounded border p-3 text-sm">
			<div class="mb-2 flex flex-wrap items-center gap-2">
				<Badge variant="outline">#{index + 1}</Badge>
				<Badge variant="secondary">{typeLabel(type)}</Badge>
				{#if prepared.walletTransactions[index]?.signers?.length === 0}<Badge variant="outline">Not signing</Badge>{/if}
				{#if isAssetCreate(transaction)}<Badge variant="outline">Create</Badge>{/if}
			</div>
			<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
				<span class="text-muted-foreground">Sender</span><span class="break-all">{transaction.sender.toString()}</span>
				{#if receiver(transaction)}<span class="text-muted-foreground">Receiver</span><span class="break-all">{receiver(transaction)}</span>{/if}
				{#if amount(transaction)}<span class="text-muted-foreground">Amount</span><span>{amount(transaction)}</span>{/if}
				{#if transaction.fee}<span class="text-muted-foreground">Fee</span><span>{transaction.fee.toString()} microALGO</span>{/if}
				{#if transaction.assetTransfer}<span class="text-muted-foreground">Asset</span><span>{assetLabels[transaction.assetTransfer.assetIndex.toString()] ?? transaction.assetTransfer.assetIndex.toString()}</span>{/if}
				{#if transaction.applicationCall}<span class="text-muted-foreground">App ID</span><span>{transaction.applicationCall.appIndex.toString()}</span>{/if}
				{#if transaction.assetConfig}
					{#if isAssetCreate(transaction)}
						<span class="text-muted-foreground">Asset name</span><span>{transaction.assetConfig.assetName ?? "—"}</span>
						<span class="text-muted-foreground">Unit name</span><span>{transaction.assetConfig.unitName ?? "—"}</span>
						<span class="text-muted-foreground">Decimals</span><span>{transaction.assetConfig.decimals.toString()}</span>
						<span class="text-muted-foreground">Total supply</span><span>{transaction.assetConfig.total.toString()}</span>
					{:else}
						<span class="text-muted-foreground">Asset index</span><span>{transaction.assetConfig.assetIndex.toString()}</span>
					{/if}
				{/if}
				{#if transaction.keyreg}
					{#if transaction.keyreg.nonParticipation}
						<span class="text-muted-foreground">Status</span><span>Non-participating</span>
					{:else}
						<span class="text-muted-foreground">Vote first</span><span>{transaction.keyreg.voteFirst?.toString() ?? "—"}</span>
						<span class="text-muted-foreground">Vote last</span><span>{transaction.keyreg.voteLast?.toString() ?? "—"}</span>
						<span class="text-muted-foreground">Key dilution</span><span>{transaction.keyreg.voteKeyDilution?.toString() ?? "—"}</span>
					{/if}
				{/if}
				{#if type === "rekey"}
					<span class="text-muted-foreground">New auth</span><span class="break-all font-medium">{transaction.rekeyTo!.toString()}</span>
				{:else if transaction.rekeyTo}
					<span class="text-muted-foreground">Rekey to</span><span class="break-all">{transaction.rekeyTo.toString()}</span>
				{/if}
				{#if transaction.payment?.closeRemainderTo}
					<span class="text-muted-foreground">Close to</span><span class="break-all">{transaction.payment.closeRemainderTo.toString()}</span>
				{/if}
				{#if transaction.assetTransfer?.closeRemainderTo}
					<span class="text-muted-foreground">Close asset to</span><span class="break-all">{transaction.assetTransfer.closeRemainderTo.toString()}</span>
				{/if}
				{#if transaction.assetFreeze}
					<span class="text-muted-foreground">Freeze account</span><span class="break-all">{transaction.assetFreeze.freezeAccount.toString()}</span>
					<span class="text-muted-foreground">Freeze state</span><span>{transaction.assetFreeze.frozen ? "Frozen" : "Unfrozen"}</span>
				{/if}
				{#if notePreview(transaction.note)}
					<span class="text-muted-foreground">Note</span><span class="break-all font-mono text-xs">{notePreview(transaction.note)}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>
