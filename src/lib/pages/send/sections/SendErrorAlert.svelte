<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

{#if state.error}
	<Alert.Root variant="destructive"><Alert.Description>{state.error}</Alert.Description></Alert.Root>
{/if}
