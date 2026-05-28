<script lang="ts">
	import { push } from "svelte-spa-router";
	import * as Alert from "$lib/components/ui/alert";
	import { Badge } from "$lib/components/ui/badge";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { getWalletAppContext } from "$lib/app/context";

	interface Props {
		addr: string;
	}

	let { addr }: Props = $props();

	const app = getWalletAppContext();

	let account = $derived(app.accounts.find((a) => a.addr === addr) ?? null);
	let title = $derived(account?.ns?.name ?? account?.title ?? "Unknown account");
	let balance = $derived.by(() => {
		if (!account?.info?.amount) return "—";
		const microAlgos = typeof account.info.amount === "bigint" ? account.info.amount : BigInt(Number(account.info.amount));
		const whole = microAlgos / 1_000_000n;
		const fraction = (microAlgos % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
		return `${whole.toString()}${fraction ? `.${fraction}` : ""} ALGO`;
	});

	function accountKind(acct: NonNullable<typeof account>): string {
		if (acct.subType === "rekey") return "Rekeyed";
		if (acct.subType === "hd") return "HD child";
		if (acct.appId) return "ARC-55 multisig";
		if (acct.isHot) return "Hot";
		if (acct.canSign) return "Signer";
		return "Watch";
	}

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

		const filtered = app.state.accounts.filter((a) => a.addr !== addr);
		if (app.core) {
			await app.core.storage.setAccounts(filtered);
		}
		app.state.accounts = filtered;
		app.notify(`Removed ${title}`, "info");
		push("/accounts");
	}
</script>

<div class="grid gap-6">
	{#if !account}
		<Alert.Root variant="destructive">
			<Alert.Title>Account not found</Alert.Title>
			<Alert.Description>No account with address {addr} was found in the wallet.</Alert.Description>
		</Alert.Root>
		<Button variant="outline" onclick={() => push("/accounts")}>Back to Accounts</Button>
	{:else}
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" onclick={() => push("/accounts")}>← Back</Button>
			<h2 class="text-2xl font-semibold tracking-tight">Account Details</h2>
		</div>

		<Card.Root>
			<Card.Header>
				<div class="flex items-start justify-between gap-3">
					<div class="min-w-0">
						<Card.Title class="text-xl">{title}</Card.Title>
						<Card.Description class="break-all">{addr}</Card.Description>
					</div>
					<Badge variant={accountKindVariant(account)}>{accountKind(account)}</Badge>
				</div>
			</Card.Header>
			<Card.Content class="grid gap-4">
				<div class="flex flex-wrap gap-2">
					<Badge variant="outline" class="text-base">{balance}</Badge>
				</div>

				<Separator />

				<div class="grid gap-2">
					<h4 class="text-sm font-medium text-muted-foreground">Account Info</h4>
					<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
						<span class="text-muted-foreground">Type</span>
						<span>{accountKind(account)}</span>

						{#if account.seedId !== undefined}
							<span class="text-muted-foreground">Seed ID</span>
							<span>{account.seedId}</span>
						{/if}

						{#if account.slot !== undefined}
							<span class="text-muted-foreground">Slot</span>
							<span>{account.slot}</span>
						{/if}

						{#if account.xpub}
							<span class="text-muted-foreground">Extended Public Key</span>
							<span class="break-all font-mono text-xs">{account.xpub.slice(0, 32)}…</span>
						{/if}

						{#if account.idxs && account.idxs.length > 0}
							<span class="text-muted-foreground">Address Indexes</span>
							<span>{account.idxs.join(", ")}</span>
						{/if}

						{#if account.appId}
							<span class="text-muted-foreground">App ID</span>
							<span>{account.appId.toString()}</span>
						{/if}

						{#if account.falcon}
							<span class="text-muted-foreground">Falcon counter</span>
							<span>{account.falcon.counter}</span>
						{/if}

						{#if account.network}
							<span class="text-muted-foreground">Restricted to</span>
							<span>{account.network}</span>
						{/if}

						{#if account.name}
							<span class="text-muted-foreground">Custom name</span>
							<span>{account.name}</span>
						{/if}
					</div>
				</div>

				{#if account.info?.authAddr}
					<Separator />
					<div class="grid gap-2">
						<h4 class="text-sm font-medium text-muted-foreground">Rekey Status</h4>
						<p class="text-sm">
							This account is rekeyed to
							<code class="rounded bg-muted px-1 py-0.5 text-xs break-all">{account.info.authAddr}</code>.
						</p>
						{#if rekeyedToAccount}
							<p class="text-sm text-muted-foreground">
								{rekeyedToAccount.title} can sign for this account.
							</p>
						{/if}
					</div>
				{/if}

				{#if rekeyedFromAccounts.length > 0}
					<Separator />
					<div class="grid gap-2">
						<h4 class="text-sm font-medium text-muted-foreground">
							Accounts rekeyed to this address ({rekeyedFromAccounts.length})
						</h4>
						{#each rekeyedFromAccounts as rekeyed}
							<div class="flex items-center gap-2 text-sm">
								<Button variant="link" class="h-auto p-0 text-sm" onclick={() => push(`/account-detail/${rekeyed.addr}`)}>
									{rekeyed.ns?.name ?? rekeyed.title}
								</Button>
							</div>
						{/each}
					</div>
				{/if}

				{#if account.ns}
					<Separator />
					<div class="grid gap-2">
						<h4 class="text-sm font-medium text-muted-foreground">Name Service</h4>
						<div class="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
							<span class="text-muted-foreground">Name</span>
							<span>{account.ns.name}</span>
							{#if account.ns.appID}
								<span class="text-muted-foreground">App ID</span>
								<span>{account.ns.appID}</span>
							{/if}
						</div>
					</div>
				{/if}
			</Card.Content>
		</Card.Root>

		<div class="flex gap-3">
			<Button variant="destructive" onclick={handleRemove}>Remove Account</Button>
		</div>
	{/if}
</div>
