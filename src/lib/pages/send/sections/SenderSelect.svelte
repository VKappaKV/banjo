<script lang="ts">
	import * as Select from "$lib/components/ui/select";
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

<div class="grid gap-2">
	<label class="text-sm font-medium" for="sender">Sender</label>
	<Select.Root type="single" value={state.activeSender} onValueChange={state.setSender}>
		<Select.Trigger id="sender">{state.selectedAccount?.ns?.name ?? state.selectedAccount?.title ?? "Select sender"}</Select.Trigger>
		<Select.Content>
			{#each state.signableAccounts as account (account.addr)}
				<Select.Item value={account.addr} label={account.ns?.name ?? account.title} />
			{/each}
		</Select.Content>
	</Select.Root>
</div>
