<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";
	import { setFallbackEnabled, setSandboxRouter, selectSigningAccounts } from "$core/state";
	import { createAlgodClient } from "$core/network";
	import { createArc59Router } from "$core/apps/arc59";
	import { createBanjoTransactionSigner } from "$core/signing";
	import { getWalletAppContext } from "$lib/app/context";

	const app = getWalletAppContext();

	function getCore() {
		if (!app.core) throw new Error("Wallet not initialized.");
		return app.core;
	}

	const isLocalNet = $derived(app.selectedNetwork.name === "LocalNet");

	async function toggleFallback() {
		const core = getCore();
		const next = !app.state.fallbackEnabled;
		await setFallbackEnabled(core.storage, next);
		app.state = { ...app.state, fallbackEnabled: next };
		app.notify(`Fallback endpoints ${next ? "enabled" : "disabled"}`, "info");
	}

	let sandboxRouterStr = $state(app.state.sandboxRouter?.toString() ?? "");
	let creatingRouter = $state(false);

	$effect(() => {
		sandboxRouterStr = app.state.sandboxRouter?.toString() ?? "";
	});

	async function setRouter() {
		const core = getCore();
		const val = sandboxRouterStr.trim();
		if (!val) {
			await setSandboxRouter(core.storage, undefined);
			app.state = { ...app.state, sandboxRouter: undefined };
			app.notify("Sandbox router cleared", "info");
			return;
		}
		const num = Number(val);
		if (isNaN(num) || num <= 0 || !Number.isInteger(num)) {
			app.notify("Router app ID must be a positive integer", "error");
			return;
		}
		await setSandboxRouter(core.storage, num);
		app.state = { ...app.state, sandboxRouter: num };
		app.notify(`Sandbox router set to ${num}`, "info");
	}

	async function createRouter() {
		const core = getCore();
		creatingRouter = true;
		try {
			const signers = selectSigningAccounts(app.state);
			const sender = signers[0]?.addr.toString();
			if (!sender) {
				app.notify("No signable account available to create the router", "error");
				return;
			}
			const algod = createAlgodClient(app.selectedNetwork, app.state.fallbackEnabled);
			const signer = createBanjoTransactionSigner({
				state: app.state,
				storage: core.storage,
				algod,
				ledgerProvider: core.ledgerProvider,
				credentialProvider: core.credentialProvider,
				cryptoProvider: core.cryptoProvider,
			});
			const appId = await createArc59Router({ sender, algod, signer });
			const id = Number(appId);
			await setSandboxRouter(core.storage, id);
			app.state = { ...app.state, sandboxRouter: id };
			sandboxRouterStr = id.toString();
			app.notify(`ARC-59 router created: ${id}`, "success");
		} catch (err) {
			app.notify(err instanceof Error ? err.message : "Failed to create ARC-59 router", "error");
		} finally {
			creatingRouter = false;
		}
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Connection preferences</Card.Title>
		<Card.Description>Configure network fallback behavior and LocalNet ARC-59 router.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Fallback endpoints</div>
				<div class="text-muted-foreground text-sm">Use Nodely fallback endpoints when primary endpoints are unreachable.</div>
			</div>
			<Switch checked={app.state.fallbackEnabled} oncheckedchange={toggleFallback} />
		</div>

		{#if isLocalNet}
			<Separator />
			<div>
				<div class="mb-2 font-medium">ARC-59 sandbox router</div>
				<div class="text-muted-foreground mb-3 text-sm">Set the ARC-59 router app ID for LocalNet, or create a new one from the first signable account.</div>
				<div class="flex items-center gap-2">
					<input
						type="number"
						bind:value={sandboxRouterStr}
						placeholder="Router app ID"
						class="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring h-8 w-40 rounded-lg border px-2 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
					/>
					<Button size="sm" onclick={setRouter}>Save</Button>
					<Button variant="outline" size="sm" onclick={createRouter} disabled={creatingRouter}>
						{creatingRouter ? "Creating..." : "Create new"}
					</Button>
				</div>
				{#if app.state.sandboxRouter}
					<p class="text-muted-foreground mt-1 text-xs">Current router app ID: {app.state.sandboxRouter}</p>
				{/if}
			</div>
		{/if}
	</Card.Content>
</Card.Root>
