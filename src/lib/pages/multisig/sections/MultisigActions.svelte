<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { getMultisigPageState } from "../multisig-page-state.svelte";

	const state = getMultisigPageState();
</script>

<div class="flex flex-wrap gap-3">
	<Button variant="outline" onclick={() => state.refresh()}>
		Refresh App State
	</Button>
	{#if state.isMember && state.arc55App}
		<Button variant="destructive" onclick={() => state.destroyApp()}>
			Destroy App
		</Button>
	{/if}
</div>
