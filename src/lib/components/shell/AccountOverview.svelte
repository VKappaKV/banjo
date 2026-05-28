<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import type { AccountInfo } from "$core/types";
	import type { WalletAppState } from "$lib/app/wallet-app-state.svelte";

	interface Props {
		app: WalletAppState;
	}

	let { app }: Props = $props();

	function formatAlgo(account: AccountInfo): string {
		const amount = account.info?.amount;
		const microAlgos = typeof amount === "bigint" ? amount : BigInt(Number(amount ?? 0));
		const whole = microAlgos / 1_000_000n;
		const fraction = (microAlgos % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");

		return `${whole.toString()}${fraction ? `.${fraction}` : ""} ALGO`;
	}

	function accountKind(account: AccountInfo): string {
		if (account.subType === "rekey") return "Rekeyed";
		if (account.subType === "hd") return "HD child";
		if (account.appId) return "ARC-55";
		if (account.isHot) return "Hot";
		if (account.canSign) return "Signer";
		return "Watch";
	}
</script>

<div class="grid gap-4">
	<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
		<div>
			<h2 class="text-2xl font-semibold tracking-tight">Accounts</h2>
			<p class="text-muted-foreground text-sm">Loaded from Banjo core state for {app.state.networkName}.</p>
		</div>
		<Button onclick={() => app.refreshWallet()} disabled={app.isLoading || !app.initialized}>Refresh</Button>
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
	{:else if app.accounts.length === 0}
		<Card.Root>
			<Card.Header>
				<Card.Title>No accounts yet</Card.Title>
				<Card.Description>
					Banjo core is initialized. Account onboarding screens arrive in Milestone 11.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex flex-wrap gap-2">
					<Badge variant="secondary">{app.allNetworks.length} networks</Badge>
					<Badge variant={app.state.hotWalletEnabled ? "default" : "secondary"}>
						Hot wallet {app.state.hotWalletEnabled ? "available" : "unavailable"}
					</Badge>
				</div>
			</Card.Content>
			<Card.Footer>
				<Button onclick={() => app.setView("add-account")}>Go to Add Account</Button>
			</Card.Footer>
		</Card.Root>
	{:else}
		<div class="grid gap-3">
			{#each app.accounts as account (account.addr)}
				<Card.Root>
					<Card.Header>
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0">
								<Card.Title class="truncate text-base">{account.ns?.name ?? account.title}</Card.Title>
								<Card.Description class="break-all">{account.addr}</Card.Description>
							</div>
							<Badge variant={account.canSign ? "default" : "secondary"}>{accountKind(account)}</Badge>
						</div>
					</Card.Header>
					<Card.Content>
						<div class="flex flex-wrap gap-2 text-sm">
							<Badge variant="outline">{formatAlgo(account)}</Badge>
							{#if account.info?.authAddr}
								<Badge variant="secondary">Rekeyed</Badge>
							{/if}
						</div>
					</Card.Content>
				</Card.Root>
			{/each}
		</div>
	{/if}
</div>
