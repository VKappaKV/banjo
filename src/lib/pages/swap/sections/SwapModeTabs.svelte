<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { getSwapPageState } from "../swap-page-state.svelte";

	const state = getSwapPageState();
</script>

<div class="flex flex-wrap gap-2">
	{#each state.modeOptions as option (option.value)}
		<Button variant={option.variant} onclick={() => state.setMode(option.value)}>{option.label}</Button>
	{/each}
</div>
