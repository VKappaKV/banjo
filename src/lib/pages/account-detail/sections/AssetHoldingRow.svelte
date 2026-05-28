<script lang="ts">
	import type { modelsv2 } from "algosdk";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { assetHoldingAmount, assetHoldingId, explorerAssetUrl, formatAssetAmount } from "$lib/app/portfolio";
	import { useAssetMetadataQuery } from "$lib/app/queries/wallet-queries.svelte";
	import { getWalletAppContext } from "$lib/app/context";

	interface Props {
		holding: modelsv2.AssetHolding;
	}

	let { holding }: Props = $props();

	const app = getWalletAppContext();
	let imageFailed = $state(false);
	let assetId = $derived(assetHoldingId(holding));
	const assetQuery = useAssetMetadataQuery(app, () => assetId);
	let asset = $derived(assetQuery.data);
	let decimals = $derived(asset?.params.decimals ?? 0);
	let unitName = $derived(asset?.params.unitName ?? `ASA ${assetId.toString()}`);
	let displayName = $derived(asset?.params.name ?? unitName);
	let imageUrl = $derived(asset?.params.url);
	let amount = $derived(formatAssetAmount(assetHoldingAmount(holding), decimals));
	let explorerUrl = $derived(explorerAssetUrl(app.selectedNetwork, assetId));
</script>

<div class="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
	<div class="flex min-w-0 items-center gap-3">
		{#if imageUrl && !imageFailed}
			<img
				src={imageUrl}
				alt=""
				class="size-10 rounded-md border object-cover"
				onerror={() => (imageFailed = true)}
			/>
		{:else}
			<div class="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-md border text-xs">
				ASA
			</div>
		{/if}
		<div class="min-w-0">
			<p class="truncate text-sm font-medium">{displayName}</p>
			<p class="text-muted-foreground text-xs">Asset {assetId.toString()}</p>
			{#if assetQuery.isError}
				<p class="text-destructive text-xs">Metadata unavailable: {assetQuery.error.message}</p>
			{/if}
		</div>
	</div>

	<div class="flex flex-wrap items-center gap-2 sm:justify-end">
		<Badge variant="outline">{amount} {unitName}</Badge>
		{#if holding.isFrozen}
			<Badge variant="destructive">Frozen</Badge>
		{/if}
		{#if assetQuery.isFetching}
			<Badge variant="secondary">Loading metadata</Badge>
		{/if}
		{#if explorerUrl}
			<Button href={explorerUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">Explorer</Button>
		{/if}
	</div>
</div>
