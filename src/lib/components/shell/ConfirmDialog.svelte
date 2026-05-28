<script lang="ts">
	import * as Dialog from "$lib/components/ui/dialog";
	import { Button } from "$lib/components/ui/button";
	import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";

	interface Props {
		app: WalletAppState;
	}

	let { app }: Props = $props();
</script>

<Dialog.Root open={!!app.confirmation}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Confirm action</Dialog.Title>
			<Dialog.Description>{app.confirmation?.message}</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer>
			<Button variant="outline" onclick={() => app.resolveConfirmation(false)}>Cancel</Button>
			<Button onclick={() => app.resolveConfirmation(true)}>Continue</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
