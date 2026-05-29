<script lang="ts">
	import { push } from "svelte-spa-router";
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { accountKind, assetHoldingId, explorerAccountUrl, formatMicroAlgos } from "$lib/app/portfolio";
	import { accountAssets, useAccountQuery, useRemoveAccountMutation } from "$lib/app/queries/wallet-queries.svelte";
	import { getWalletAppContext } from "$lib/app/context";
	import AssetHoldingRow from "./AssetHoldingRow.svelte";

	interface Props {
		addr: string;
	}

	let { addr }: Props = $props();

	const app = getWalletAppContext();
	const accountQuery = useAccountQuery(app, () => addr);
	const removeAccountMutation = useRemoveAccountMutation(app);

	let account = $derived(accountQuery.data ?? app.accounts.find((a) => a.addr === addr) ?? null);
	let title = $derived(account?.ns?.name ?? account?.title ?? "Unknown account");
	let balance = $derived(account ? formatMicroAlgos(account.info?.amount) : "—");
	let assetHoldings = $derived(accountAssets(account));
	let explorerUrl = $derived(account ? explorerAccountUrl(app.selectedNetwork, account.addr) : undefined);
	let kindVariant = $derived(account ? accountKindVariant(account) : "secondary");
	let refreshErrorMessage = $derived(accountQuery.error?.message ?? "Unable to refresh account data.");

	function accountKindVariant(acct: NonNullable<typeof account>): "default" | "secondary" | "outline" | "destructive" {
		return acct.canSign ? "default" : "secondary";
	}

	const rekeyedToAccount = $derived.by(() => {
		const authAddr = account?.info?.authAddr as string | undefined;
		if (!authAddr) return null;
		return app.accounts.find((a) => a.addr === authAddr) ?? null;
	});

	const rekeyedFromAccounts = $derived(
		app.accounts.filter((a) => a !== account && a.info?.authAddr === account?.addr)
	);

	async function handleRemove() {
		if (!account) return;
		const confirmed = await app.requestConfirmation(
			`Remove account ${title} (${addr.slice(0, 8)}...)? Only wallet metadata is removed; on-chain data is unaffected.`
		);
		if (!confirmed) return;

		try {
			await removeAccountMutation.mutateAsync({ address: addr });
			app.notify(`Removed ${title}`, "info");
			push("/accounts");
		} catch (error) {
			app.notify(error instanceof Error ? error.message : "Failed to remove account", "error");
		}
	}
</script>

<div class="grid gap-6">
	{#if accountQuery.isError}
		{@render RefreshFailed()}
	{:else if accountQuery.isLoading && !account}
		{@render LoadingAccount()}
	{:else if !account}
		{@render AccountNotFound()}
	{:else}
		{@render LoadedAccount()}
	{/if}
</div>

{#snippet RefreshFailed()}
	<Alert.Root variant="destructive">
		<Alert.Title>Refresh failed</Alert.Title>
		<Alert.Description>{refreshErrorMessage}</Alert.Description>
	</Alert.Root>
	<Button variant="outline" onclick={() => accountQuery.refetch()}>Retry</Button>
{/snippet}

{#snippet LoadingAccount()}
	<Card.Root>
		<Card.Header>
			<Card.Title>Loading account</Card.Title>
			<Card.Description>Refreshing account balances, assets, and name metadata.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3">
			<div class="bg-muted h-6 w-48 animate-pulse rounded"></div>
			<div class="bg-muted h-4 w-full max-w-xl animate-pulse rounded"></div>
			<div class="bg-muted h-20 w-full animate-pulse rounded"></div>
		</Card.Content>
	</Card.Root>
{/snippet}

{#snippet AccountNotFound()}
	<Alert.Root variant="destructive">
		<Alert.Title>Account not found</Alert.Title>
		<Alert.Description>No account with address {addr} was found in the wallet.</Alert.Description>
	</Alert.Root>
	<Button variant="outline" onclick={() => push("/accounts")}>Back to Accounts</Button>
{/snippet}

{#snippet LoadedAccount()}
	{@render AccountHeader()}
	{@render SummaryCards()}
	{@render AccountInfoCard()}
	{@render Arc55Card()}
	{@render AssetsCard()}
	<div class="flex gap-3">
		<Button variant="destructive" onclick={handleRemove}>Remove Account</Button>
	</div>
{/snippet}

{#snippet AccountHeader()}
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" onclick={() => push("/accounts")}>← Back</Button>
			<h2 class="text-2xl font-semibold tracking-tight">Account Details</h2>
		</div>
		<div class="flex flex-wrap gap-2">
			<Button variant="outline" size="sm" onclick={() => accountQuery.refetch()} disabled={accountQuery.isFetching}>
				{accountQuery.isFetching ? "Refreshing" : "Refresh"}
			</Button>
			{#if explorerUrl}
				<Button href={explorerUrl} target="_blank" rel="noreferrer" variant="outline" size="sm">Explorer</Button>
			{/if}
		</div>
	</div>
{/snippet}

{#snippet SummaryCards()}
	<div class="grid gap-3 sm:grid-cols-3">
		{@render SummaryCard("Native balance", balance)}
		{@render SummaryCard("ASA holdings", assetHoldings.length.toString())}
		{@render SummaryCard("Signability", account?.canSign ? "Can sign" : "Watch only")}
	</div>
{/snippet}

{#snippet SummaryCard(label: string, value: string)}
	<Card.Root>
		<Card.Header>
			<Card.Description>{label}</Card.Description>
			<Card.Title>{value}</Card.Title>
		</Card.Header>
	</Card.Root>
{/snippet}

{#snippet AccountInfoCard()}
	<Card.Root>
		<Card.Header>
			<div class="flex items-start justify-between gap-3">
				<div class="min-w-0">
					<Card.Title class="text-xl">{title}</Card.Title>
					<Card.Description class="break-all">{addr}</Card.Description>
				</div>
				<Badge variant={kindVariant}>{account ? accountKind(account) : "Unknown"}</Badge>
			</div>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<Badge variant="outline" class="w-fit text-base">{balance}</Badge>
			<Separator />
			{@render AccountInfoRows()}
			{@render RekeyStatus()}
			{@render RekeyedFromAccounts()}
			{@render NameService()}
		</Card.Content>
	</Card.Root>
{/snippet}

{#snippet AccountInfoRows()}
	{#if account}
		<div class="grid gap-2">
			<h4 class="text-sm font-medium text-muted-foreground">Account Info</h4>
			<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<span class="text-muted-foreground">Type</span><span>{accountKind(account)}</span>
				{@render OptionalAccountRows()}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet OptionalAccountRows()}
	{#if account?.seedId !== undefined}
		<span class="text-muted-foreground">Seed ID</span><span>{account.seedId}</span>
	{/if}
	{#if account?.slot !== undefined}
		<span class="text-muted-foreground">Slot</span><span>{account.slot}</span>
	{/if}
	{#if account?.xpub}
		<span class="text-muted-foreground">Extended Public Key</span><span class="break-all font-mono text-xs">{account.xpub.slice(0, 32)}...</span>
	{/if}
	{#if account?.idxs && account.idxs.length > 0}
		<span class="text-muted-foreground">Address Indexes</span><span>{account.idxs.join(", ")}</span>
	{/if}
	{#if account?.appId}
		<span class="text-muted-foreground">App ID</span><span>{account.appId.toString()}</span>
	{/if}
	{#if account?.falcon}
		<span class="text-muted-foreground">Falcon counter</span><span>{account.falcon.counter}</span>
	{/if}
	{#if account?.network}
		<span class="text-muted-foreground">Restricted to</span><span>{account.network}</span>
	{/if}
	{#if account?.name}
		<span class="text-muted-foreground">Custom name</span><span>{account.name}</span>
	{/if}
{/snippet}

{#snippet RekeyStatus()}
	{#if account?.info?.authAddr}
		<Separator />
		<div class="grid gap-2">
			<h4 class="text-sm font-medium text-muted-foreground">Rekey Status</h4>
			<p class="text-sm">This account is rekeyed to <code class="rounded bg-muted px-1 py-0.5 text-xs break-all">{account.info.authAddr}</code>.</p>
			{#if rekeyedToAccount}
				<p class="text-sm text-muted-foreground">{rekeyedToAccount.title} can sign for this account.</p>
			{/if}
		</div>
	{/if}
{/snippet}

{#snippet RekeyedFromAccounts()}
	{#if rekeyedFromAccounts.length > 0}
		<Separator />
		<div class="grid gap-2">
			<h4 class="text-sm font-medium text-muted-foreground">Accounts rekeyed to this address ({rekeyedFromAccounts.length})</h4>
			{#each rekeyedFromAccounts as rekeyed (rekeyed.addr)}
				<Button variant="link" class="h-auto w-fit p-0 text-sm" onclick={() => push(`/account-detail/${rekeyed.addr}`)}>
					{rekeyed.ns?.name ?? rekeyed.title}
				</Button>
			{/each}
		</div>
	{/if}
{/snippet}

{#snippet NameService()}
	{#if account?.ns}
		<Separator />
		<div class="grid gap-2">
			<h4 class="text-sm font-medium text-muted-foreground">Name Service</h4>
			<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				<span class="text-muted-foreground">Name</span><span>{account.ns.name}</span>
				{#if account.ns.appID}
					<span class="text-muted-foreground">App ID</span><span>{account.ns.appID}</span>
				{/if}
			</div>
		</div>
	{/if}
{/snippet}

{#snippet Arc55Card()}
	{#if account?.appId}
		<Card.Root>
			<Card.Header>
				<Card.Title>ARC-55 Multisig</Card.Title>
				<Card.Description>Smart-contract-backed multisig account summary.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-2 text-sm">
				<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
					<span class="text-muted-foreground">App ID</span><span>{account.appId.toString()}</span>
					<span class="text-muted-foreground">Address</span><span class="break-all">{account.addr}</span>
					<span class="text-muted-foreground">Signability</span><span>{account.canSign ? "Local signer available" : "Watch only"}</span>
					{#if account.network}
						<span class="text-muted-foreground">Network</span><span>{account.network}</span>
					{/if}
				</div>
				<Button variant="outline" size="sm" class="w-fit" onclick={() => push(`/multisig/${account.appId!.toString()}`)}>
					Manage Multisig
				</Button>
			</Card.Content>
		</Card.Root>
	{/if}
{/snippet}

{#snippet AssetsCard()}
	<Card.Root>
		<Card.Header>
			<Card.Title>Assets</Card.Title>
			<Card.Description>ASA holdings with cached metadata and resolved media URLs.</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-3">
			{#if assetHoldings.length === 0}
				<p class="text-sm text-muted-foreground">No ASA holdings found for this account.</p>
			{:else}
				{#each assetHoldings as holding (assetHoldingId(holding).toString())}
					<AssetHoldingRow {holding} />
				{/each}
			{/if}
		</Card.Content>
	</Card.Root>
{/snippet}
