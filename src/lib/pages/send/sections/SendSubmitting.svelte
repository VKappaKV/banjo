<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Submitting transaction</Card.Title>
		<Card.Description>{state.ledgerReview ? "Review the transaction on your Ledger device, then wait for confirmation." : "Signing and waiting for confirmation."}</Card.Description>
	</Card.Header>
</Card.Root>
