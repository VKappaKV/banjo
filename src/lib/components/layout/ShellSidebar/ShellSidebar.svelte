<script lang="ts">
	import { router } from "svelte-spa-router";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import { Separator } from "$lib/components/ui/separator";
	import { getWalletAppContext } from "$lib/app/context";
	import { sidebarViewDefinitions } from "$lib/app/views";

	const app = getWalletAppContext();

	function isActive(path: string): boolean {
		const location = router.location === "/" ? "/accounts" : router.location;

		return location === path;
	}
</script>

<aside class="border-border bg-sidebar text-sidebar-foreground border-b p-4 lg:border-r lg:border-b-0">
	<div class="flex items-center justify-between gap-3 lg:block">
		<div>
			<p class="font-mono text-xs uppercase tracking-[0.35em] text-muted-foreground">Banjo</p>
			<h1 class="mt-1 text-2xl font-semibold tracking-tight">Wallet Shell</h1>
		</div>
		{#if app.isLoading}
			<Badge variant="secondary">Loading</Badge>
		{/if}
	</div>

	<Separator class="my-4" />

	<nav class="grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="Wallet sections">
		{#each sidebarViewDefinitions as item (item.value)}
			<Button
				href={`#${item.path}`}
				variant={isActive(item.path) ? "default" : "ghost"}
				class="justify-start"
			>
				{item.label}
			</Button>
		{/each}
	</nav>
</aside>
