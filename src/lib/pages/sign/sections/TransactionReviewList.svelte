<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import type { PreparedSigningProtocolRequest } from "$core/protocol";

	interface Props {
		prepared: PreparedSigningProtocolRequest;
		assetLabels: Record<string, string>;
	}

	let { prepared, assetLabels }: Props = $props();

	function transactionTitle(type: string): string {
		return type === "pay" ? "Payment" : type === "axfer" ? "Asset transfer" : type === "appl" ? "Application call" : type === "keyreg" ? "Key registration" : type;
	}

	function receiver(transaction: PreparedSigningProtocolRequest["transactions"][number]): string | undefined {
		return transaction.payment?.receiver.toString() ?? transaction.assetTransfer?.receiver.toString();
	}

	function amount(transaction: PreparedSigningProtocolRequest["transactions"][number]): string | undefined {
		return (transaction.payment?.amount ?? transaction.assetTransfer?.amount)?.toString();
	}
</script>

<div class="grid gap-3">
	{#each prepared.transactions as transaction, index (index)}
		<div class="rounded border p-3 text-sm">
			<div class="mb-2 flex flex-wrap items-center gap-2">
				<Badge variant="outline">#{index + 1}</Badge>
				<Badge variant="secondary">{transactionTitle(transaction.type)}</Badge>
				{#if prepared.walletTransactions[index]?.signers?.length === 0}<Badge variant="outline">Not signing</Badge>{/if}
			</div>
			<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
				<span class="text-muted-foreground">Sender</span><span class="break-all">{transaction.sender.toString()}</span>
				{#if receiver(transaction)}<span class="text-muted-foreground">Receiver</span><span class="break-all">{receiver(transaction)}</span>{/if}
				{#if amount(transaction)}<span class="text-muted-foreground">Amount</span><span>{amount(transaction)}</span>{/if}
				{#if transaction.assetTransfer}<span class="text-muted-foreground">Asset</span><span>{assetLabels[transaction.assetTransfer.assetIndex.toString()] ?? transaction.assetTransfer.assetIndex.toString()}</span>{/if}
				{#if transaction.applicationCall}<span class="text-muted-foreground">App ID</span><span>{transaction.applicationCall.appIndex.toString()}</span>{/if}
				{#if transaction.rekeyTo}<span class="text-muted-foreground">Rekey to</span><span class="break-all">{transaction.rekeyTo.toString()}</span>{/if}
				{#if transaction.payment?.closeRemainderTo}<span class="text-muted-foreground">Close to</span><span class="break-all">{transaction.payment.closeRemainderTo.toString()}</span>{/if}
			</div>
		</div>
	{/each}
</div>
