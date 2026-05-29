<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Transaction submitted</Card.Title>
		<Card.Description class="break-all">{state.txId}</Card.Description>
	</Card.Header>
	<Card.Footer class="flex gap-2">
		<Button onclick={state.resetDone}>Send Another</Button>
		<Button href="#/accounts" variant="outline">View Accounts</Button>
	</Card.Footer>
</Card.Root>
