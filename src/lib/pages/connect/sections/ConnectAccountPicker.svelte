<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import type { AccountInfo } from "$core/types";

	interface Props {
		accounts: AccountInfo[];
		selected: Set<string>;
		ontoggle: (address: string) => void;
	}

	let { accounts, selected, ontoggle }: Props = $props();
</script>

<div class="grid gap-2">
	{#each accounts as account (account.addr)}
		<label class="flex cursor-pointer items-start gap-3 rounded border p-3 hover:bg-accent/50">
			<input type="checkbox" checked={selected.has(account.addr)} onchange={() => ontoggle(account.addr)} />
			<div class="min-w-0 flex-1">
				<p class="truncate text-sm font-medium">{account.ns?.name ?? account.title}</p>
				<p class="break-all text-xs text-muted-foreground">{account.addr}</p>
				<div class="mt-2 flex flex-wrap gap-2">
					<Badge variant={account.canSign ? "default" : "secondary"}>{account.canSign ? "Signable" : "Watch"}</Badge>
					{#if account.appId}<Badge variant="outline">Multisig</Badge>{/if}
					{#if account.subType}<Badge variant="outline">{account.subType}</Badge>{/if}
				</div>
			</div>
		</label>
	{/each}
</div>
