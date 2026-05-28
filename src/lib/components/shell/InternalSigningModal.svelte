<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";

	interface Props {
		app: WalletAppState;
	}

	let { app }: Props = $props();
</script>

<Dialog.Root open={!!app.signingRequest}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Transaction approval</Dialog.Title>
			<Dialog.Description>
				A full transaction review screen is scheduled for a later milestone. This modal proves the internal
				promise-based signing adapter can open and resolve from UI.
			</Dialog.Description>
		</Dialog.Header>
		<div class="flex items-center gap-2">
			<Badge variant="secondary">{app.signingRequest?.walletTxns.length ?? 0} transactions</Badge>
			<span class="text-muted-foreground text-sm">Internal signing request</span>
		</div>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => app.resolveSigningRequest(false)}>Reject</Button>
			<Button onclick={() => app.resolveSigningRequest(true)}>Approve placeholder</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
