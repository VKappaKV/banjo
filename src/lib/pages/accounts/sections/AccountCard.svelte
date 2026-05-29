<script lang="ts">
	import { push } from "svelte-spa-router";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import type { AccountInfo } from "$core/types";
	import { accountKind, formatMicroAlgos } from "$lib/app/portfolio";

	interface Props {
		account: AccountInfo;
		explorerUrl: string | undefined;
		onremove: (account: AccountInfo) => void;
	}
	type BadgeVariant = "default" | "secondary";

	let { account, explorerUrl, onremove }: Props = $props();

	let title = $derived(account.ns?.name ?? account.title);
	let kindVariant = $derived<BadgeVariant>(account.canSign ? "default" : "secondary");
	let balance = $derived(formatMicroAlgos(account.info?.amount));

	function goToDetail() {
		push(`/account-detail/${account.addr}`);
	}
</script>

<Card.Root>
	<button type="button" class="w-full text-left" onclick={goToDetail}>
		<Card.Header>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<Card.Title class="truncate text-base">{title}</Card.Title>
					<Card.Description class="break-all">{account.addr}</Card.Description>
				</div>
				<Badge variant={kindVariant}>{accountKind(account)}</Badge>
			</div>
		</Card.Header>
		<Card.Content>
			{@render AccountBadges()}
		</Card.Content>
	</button>
	<Card.Footer class="flex flex-wrap gap-2 border-t pt-3">
		<Button href={`#/account-detail/${account.addr}`} variant="outline" size="sm" title="View account details">Details</Button>
		<Button href="#/send" variant="outline" size="sm" title="Send from this account">Send</Button>
		{#if explorerUrl}
			<Button href={explorerUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">Explorer</Button>
		{/if}
		<Button variant="destructive" size="sm" onclick={() => onremove(account)}>Remove</Button>
	</Card.Footer>
</Card.Root>

{#snippet AccountBadges()}
	<div class="flex flex-wrap gap-2 text-sm">
		<Badge variant="outline">{balance}</Badge>
		{#if account.info?.authAddr}
			<Badge variant="secondary">Rekeyed</Badge>
		{/if}
		{#if account.subType === "hd"}
			<Badge variant="outline">Slot {account.slot}</Badge>
		{/if}
		{#if account.falcon}
			<Badge variant="outline">Falcon</Badge>
		{/if}
		{#if account.info?.assets?.length}
			<Badge variant="outline">{account.info.assets.length} ASA</Badge>
		{/if}
		{#if account.ns}
			<Badge variant="secondary">NFD</Badge>
		{/if}
	</div>
{/snippet}
