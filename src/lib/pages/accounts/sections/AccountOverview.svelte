<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import type { AccountInfo } from "$core/types";
	import { calculatePortfolioSummary, explorerAccountUrl, formatMicroAlgos } from "$lib/app/portfolio";
	import { useAccountsQuery, useRemoveAccountMutation } from "$lib/app/queries/wallet-queries.svelte";
	import { getWalletAppContext } from "$lib/app/context";
	import AccountCard from "./AccountCard.svelte";

	const app = getWalletAppContext();
	const accountsQuery = useAccountsQuery(app);
	const removeAccountMutation = useRemoveAccountMutation(app);
	type BadgeVariant = "default" | "secondary";

	let accounts = $derived(accountsQuery.data ?? app.accounts);
	let summary = $derived(calculatePortfolioSummary(accounts));
	let lastUpdated = $derived(
		accountsQuery.dataUpdatedAt > 0 ? new Date(accountsQuery.dataUpdatedAt).toLocaleTimeString() : "Never"
	);
	let explorerUrl = $derived.by(() => (address: string) => explorerAccountUrl(app.selectedNetwork, address));
	let hotWalletVariant = $derived<BadgeVariant>(app.state.hotWalletEnabled ? "default" : "secondary");

	async function removeAccount(account: AccountInfo) {
		const confirmed = await app.requestConfirmation(
			`Remove account ${account.title} (${account.addr.slice(0, 8)}...)? This only removes wallet metadata; on-chain data is unaffected.`
		);
		if (!confirmed) return;

		try {
			await removeAccountMutation.mutateAsync({ address: account.addr });
			app.notify(`Removed ${account.title}`, "info");
		} catch (error) {
			app.notify(error instanceof Error ? error.message : "Failed to remove account", "error");
		}
	}
</script>

<div class="grid gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-2xl font-semibold tracking-tight">Accounts</h2>
			<p class="text-muted-foreground text-sm">Loaded from Banjo core state for {app.state.networkName}.</p>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button
				href="#/add-account"
				variant="outline"
				size="icon"
				aria-label="Add account"
				title="Add account"
			>
				+
			</Button>
			<Button onclick={() => accountsQuery.refetch()} disabled={accountsQuery.isFetching || !app.initialized}>
				{accountsQuery.isFetching ? "Refreshing" : "Refresh"}
			</Button>
		</div>
	</div>

	<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
		<Card.Root>
			<Card.Header>
				<Card.Description>Total portfolio</Card.Description>
				<Card.Title>{formatMicroAlgos(summary.totalMicroAlgos)}</Card.Title>
			</Card.Header>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Description>Accounts</Card.Description>
				<Card.Title>{summary.totalAccounts}</Card.Title>
			</Card.Header>
			<Card.Content class="flex flex-wrap gap-2">
				<Badge variant="outline">{summary.signableAccounts} signable</Badge>
				<Badge variant="secondary">{summary.watchAccounts} watch</Badge>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Description>Assets</Card.Description>
				<Card.Title>{summary.distinctAssets}</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-muted-foreground">{summary.totalAssets} total holdings</p>
			</Card.Content>
		</Card.Root>
		<Card.Root>
			<Card.Header>
				<Card.Description>Last refresh</Card.Description>
				<Card.Title>{lastUpdated}</Card.Title>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-muted-foreground">{accountsQuery.isFetching ? "Updating in background" : app.state.networkName}</p>
			</Card.Content>
		</Card.Root>
	</div>

	{#if app.startupError}
		<Alert.Root variant="destructive">
			<Alert.Title>Startup error</Alert.Title>
			<Alert.Description>{app.startupError}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if app.initializing}
		<Card.Root>
			<Card.Header>
				<Card.Title>Loading wallet</Card.Title>
				<Card.Description>Opening IndexedDB and checking browser capabilities.</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if accountsQuery.isLoading && accounts.length === 0}
		<div class="grid gap-3">
			{#each [1, 2, 3] as item (item)}
				<Card.Root>
					<Card.Header>
						<div class="bg-muted h-5 w-40 animate-pulse rounded"></div>
						<div class="bg-muted mt-2 h-4 w-full max-w-lg animate-pulse rounded"></div>
					</Card.Header>
					<Card.Content>
						<div class="bg-muted h-6 w-28 animate-pulse rounded"></div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{:else if accountsQuery.isError}
		<Alert.Root variant="destructive">
			<Alert.Title>Refresh failed</Alert.Title>
			<Alert.Description>{accountsQuery.error.message}</Alert.Description>
		</Alert.Root>
		<Button variant="outline" onclick={() => accountsQuery.refetch()}>Retry</Button>
	{:else if accounts.length === 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>No accounts yet</Card.Title>
				<Card.Description>
					Add your first account to get started.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-2">
					<Badge variant="secondary">{app.allNetworks.length} networks</Badge>
					<Badge variant={hotWalletVariant}>
						Hot wallet {app.state.hotWalletEnabled ? "available" : "unavailable"}
					</Badge>
				</div>
			</Card.Content>
			<Card.Footer>
				<Button href="#/add-account" title="Add account">Add Account</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<div class="grid gap-3">
			{#each accounts as account (account.addr)}
				<AccountCard {account} explorerUrl={explorerUrl(account.addr)} onremove={removeAccount} />
			{/each}
		</div>
	{/if}
</div>
