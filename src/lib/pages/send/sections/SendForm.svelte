<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { getSendPageState } from "../send-page-state.svelte";
	import NoteField from "./NoteField.svelte";
	import OptionalTransferFields from "./OptionalTransferFields.svelte";
	import SendErrorAlert from "./SendErrorAlert.svelte";
	import SendModeFields from "./SendModeFields.svelte";
	import SendModeTabs from "./SendModeTabs.svelte";
	import SenderSelect from "./SenderSelect.svelte";

	const state = getSendPageState();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Transaction details</Card.Title>
		<Card.Description>Choose a sender and transaction type.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<SenderSelect />
		<SendModeTabs />
		<SendModeFields />
		<NoteField />
		<OptionalTransferFields />
		<SendErrorAlert />
	</Card.Content>
	<Card.Footer>
		<Button onclick={state.buildReview}>Review Transaction</Button>
	</Card.Footer>
</Card.Root>
