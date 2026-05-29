<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import type { SignPageState } from "../sign-page-state.svelte";

	interface Props {
		state: SignPageState;
	}

	let { state }: Props = $props();
</script>

<div class="grid gap-3">
	<div class="flex flex-wrap gap-2">
		{#if state.hasGroupWarning}<Badge variant="destructive">Multiple groups or ungrouped transactions</Badge>{/if}
		{#if state.hasStandardMultisigMetadata}<Badge variant="secondary">Multisig metadata</Badge>{/if}
		{#if state.hasArc55Account}<Badge variant="secondary">ARC-55 account</Badge>{/if}
		{#if state.hasFalconSigner}<Badge variant="secondary">Falcon signer</Badge>{/if}
	</div>

	{#if state.hasGroupWarning}
		<Alert.Root variant="destructive">
			<Alert.Title>Review grouped transactions carefully</Alert.Title>
			<Alert.Description>This request contains multiple groups or ungrouped transactions. Approve only if the full sequence is expected.</Alert.Description>
		</Alert.Root>
	{/if}

	{#if state.hasStandardMultisigMetadata || state.hasArc55Account}
		<Alert.Root>
			<Alert.Title>Multisig signing request</Alert.Title>
			<Alert.Description>
				Standard multisig metadata is signed directly when supported. ARC-55 app-account requests may require storing the group for additional signatures instead of producing a final fully signed group immediately.
			</Alert.Description>
		</Alert.Root>
	{/if}

	{#if state.hasFalconSigner}
		<Alert.Root>
			<Alert.Title>Falcon adjusted transaction</Alert.Title>
			<Alert.Description>
				Falcon accounts sign with a logic signature. Some Falcon flows may require Banjo to submit the adjusted transaction on behalf of the wallet rather than returning a normal user signature only.
			</Alert.Description>
		</Alert.Root>
	{/if}
</div>
