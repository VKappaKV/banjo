<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Dialog from "$lib/components/ui/dialog";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";
	import { applyTheme, getStoredTheme, setStoredTheme } from "$core/state/theme";
	import { getWalletAppContext } from "$lib/app/context";

	const app = getWalletAppContext();

	let isDark = $state(getStoredTheme() === "dark");

	$effect(() => {
		const theme = isDark ? "dark" : "light";
		setStoredTheme(theme);
		applyTheme(theme);
	});

	let showClearDialog = $state(false);
	let clearing = $state(false);

	async function clearCache() {
		if (!app.core) {
			app.notify("Wallet not initialized", "error");
			return;
		}
		clearing = true;
		app.core.logger.info({ namespace: "settings", event: "asset-cache-clear-started" });
		try {
			await app.core.storage.clearAllAssets();
			app.core.logger.info({ namespace: "settings", event: "asset-cache-cleared" });
			app.notify("Asset cache cleared", "info");
		} catch (error) {
			app.core.logger.error({ namespace: "settings", event: "asset-cache-clear-failed", error });
			app.notify("Failed to clear asset cache", "error");
		} finally {
			clearing = false;
			showClearDialog = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Appearance</Card.Title>
		<Card.Description>Toggle dark mode and manage cached data.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Dark mode</div>
				<div class="text-muted-foreground text-sm">Switch between light and dark appearance.</div>
			</div>
			<Switch bind:checked={isDark} />
		</div>
		<Separator />
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Asset cache</div>
				<div class="text-muted-foreground text-sm">Clear cached asset metadata to force re-fetch from network.</div>
			</div>
			<Button variant="outline" size="sm" onclick={() => showClearDialog = true}>Clear cache</Button>
		</div>
	</Card.Content>
</Card.Root>

<Dialog.Root bind:open={showClearDialog}>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Clear asset cache?</Dialog.Title>
			<Dialog.Description>This will remove all cached asset metadata. Assets will be re-fetched from the network as needed.</Dialog.Description>
		</Dialog.Header>
		<Dialog.Footer class="flex gap-2">
			<Button variant="outline" onclick={() => showClearDialog = false}>Cancel</Button>
			<Button variant="destructive" onclick={clearCache} disabled={clearing}>{clearing ? "Clearing..." : "Clear"}</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
