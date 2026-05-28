<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import type { AppNotification, WalletAppState } from "$lib/app/wallet-app-state.svelte";

	interface Props {
		app: WalletAppState;
	}

	let { app }: Props = $props();

	function variant(notification: AppNotification) {
		return notification.color === "error" ? "destructive" : "default";
	}
</script>

{#if app.notifications.length}
	<div class="fixed top-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
		{#each app.notifications as notification (notification.id)}
			<Alert.Root variant={variant(notification)} class="shadow-md">
				<Alert.Title>{notification.color}</Alert.Title>
				<Alert.Description>{notification.message}</Alert.Description>
				<Alert.Action>
					<Button variant="ghost" size="sm" onclick={() => app.dismissNotification(notification.id)}>
						Dismiss
					</Button>
				</Alert.Action>
			</Alert.Root>
		{/each}
	</div>
{/if}
