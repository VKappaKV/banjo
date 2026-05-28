<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Select from "$lib/components/ui/select";
	import { Separator } from "$lib/components/ui/separator";
	import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";
	import { getWalletViewDefinition, walletViewDefinitions } from "$lib/app/views";
	import AccountOverview from "./AccountOverview.svelte";
	import ConfirmDialog from "./ConfirmDialog.svelte";
	import InternalSigningModal from "./InternalSigningModal.svelte";
	import NotificationStack from "./NotificationStack.svelte";

	interface Props {
		app: WalletAppState;
	}

	let { app }: Props = $props();
	let activeView = $derived(getWalletViewDefinition(app.view));

	function onNetworkChange(value: string | string[] | undefined): void {
		if (typeof value === "string") {
			void app.switchNetwork(value);
		}
	}
</script>

<svelte:head>
	<title>Banjo Wallet</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<NotificationStack {app} />
	<ConfirmDialog {app} />
	<InternalSigningModal {app} />

	<div class="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[18rem_1fr]">
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

			<nav class="grid grid-cols-2 gap-2 lg:grid-cols-1">
				{#each walletViewDefinitions as item (item.value)}
					<Button
						variant={app.view === item.value ? "default" : "ghost"}
						class="justify-start"
						onclick={() => app.setView(item.value)}
					>
						{item.label}
					</Button>
				{/each}
			</nav>
		</aside>

		<main class="min-w-0 p-4 sm:p-6 lg:p-8">
			<header class="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
				<div>
					<div class="flex flex-wrap items-center gap-2">
						<Badge variant="outline">{app.initialized ? "Core loaded" : "Starting"}</Badge>
						<Badge variant="secondary">{app.selectedNetwork.genesisID}</Badge>
					</div>
					<h2 class="mt-3 text-3xl font-semibold tracking-tight">{activeView.label}</h2>
					<p class="text-muted-foreground mt-1 text-sm">{activeView.description}</p>
				</div>

				<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
					<Select.Root type="single" value={app.state.networkName} onValueChange={onNetworkChange}>
						<Select.Trigger class="w-full sm:w-56" aria-label="Selected network">
							{app.state.networkName}
						</Select.Trigger>
						<Select.Content>
							{#each app.allNetworks as network (network.genesisID)}
								<Select.Item value={network.name} label={network.name} />
							{/each}
						</Select.Content>
					</Select.Root>
					<Button variant="outline" onclick={() => app.refreshWallet()} disabled={app.isLoading || !app.initialized}>
						Refresh
					</Button>
				</div>
			</header>

			{#if app.view === "accounts"}
				<AccountOverview {app} />
			{:else}
				<Card.Root>
					<Card.Header>
						<Card.Title>{activeView.label}</Card.Title>
						<Card.Description>{activeView.description}</Card.Description>
					</Card.Header>
					<Card.Content>
						<p class="text-muted-foreground text-sm">
							The shell route is wired. The feature-specific UI is scheduled for the next roadmap milestones.
						</p>
					</Card.Content>
				</Card.Root>
			{/if}
		</main>
	</div>
</div>
