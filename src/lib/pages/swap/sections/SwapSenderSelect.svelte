<script lang="ts">
	import * as Select from "$lib/components/ui/select";
	import { getSwapPageState } from "../swap-page-state.svelte";

	const state = getSwapPageState();
</script>

<Select.Root type="single" value={state.activeSender} onValueChange={state.setSender}>
	<Select.Trigger>{state.selectedAccount?.ns?.name ?? state.selectedAccount?.title ?? "Select sender"}</Select.Trigger>
	<Select.Content>
		{#each state.signableAccounts as account (account.addr)}
			<Select.Item value={account.addr} label={account.ns?.name ?? account.title} />
		{/each}
	</Select.Content>
</Select.Root>
