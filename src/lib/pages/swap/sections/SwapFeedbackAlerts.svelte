<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { getSwapPageState } from "../swap-page-state.svelte";

	const state = getSwapPageState();
</script>

{#if state.error}
	<Alert.Root variant="destructive"><Alert.Description>{state.error}</Alert.Description></Alert.Root>
{/if}
{#if state.result}
	<Alert.Root><Alert.Description>{state.result}</Alert.Description></Alert.Root>
{/if}
