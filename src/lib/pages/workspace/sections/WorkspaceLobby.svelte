<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import * as Alert from "$lib/components/ui/alert";
	import { getWorkspacePageState } from "../workspace-page-state.svelte";
	import algosdk from "algosdk";

	const ws = getWorkspacePageState();

	let joinCode = $state("");
	let relayInput = $state(ws.relayUrl);
	let showAdvanced = $state(false);

	function handleCreate() {
		ws.relayUrl = relayInput;
		ws.createSession();
	}

	function handleJoin() {
		if (!joinCode.trim()) return;
		ws.relayUrl = relayInput;
		ws.joinSession(joinCode.trim());
	}

	function handleBeaconOffer() {
		ws.signalingMode = "beacon";
		ws.createBeaconSession();
	}

	function handleBeaconListen() {
		ws.signalingMode = "beacon";
		ws.listenBeaconSession();
	}

	function computeMsigAddr() {
		const cfg = ws.multisigConfig;
		if (!cfg || cfg.addrs.length < 1) {
			ws.multisigComputedAddr = "";
			return;
		}
		try {
		ws.multisigComputedAddr = String(algosdk.multisigAddress({
			version: 1,
			threshold: cfg.threshold,
			addrs: cfg.addrs,
		}));
		} catch {
			ws.multisigComputedAddr = "";
		}
	}
</script>

<div class="grid gap-6">
	<Card.Root>
		<Card.Header>
			<Card.Title>P2P Workspace</Card.Title>
			<Card.Description>
				Create a new workspace or join an existing one to collaborate on transaction
				composition and signing.
			</Card.Description>
		</Card.Header>
		<Card.Content class="grid gap-4">
			<div class="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-xs">
				<strong>BEACON default.</strong> Workspace signaling uses encrypted Algorand note
				transactions instead of a TCP relay. WebSocket relay is still available under Advanced.
			</div>

			{#if !ws.beaconConfigured}
				<Alert.Root variant="destructive">
					<Alert.Title>BEACON Not Configured</Alert.Title>
					<Alert.Description>
						Set <code class="font-mono text-xs">{ws.beaconProtocolEnvName}</code> to a BEACON
						protocol address for {ws.selectedNetwork.name}.
					</Alert.Description>
				</Alert.Root>
			{:else}
				<div class="rounded bg-muted px-3 py-2 text-xs">
					<span class="text-muted-foreground">BEACON address:</span>
					<span class="ml-1 font-mono">{ws.beaconProtocolAddress}</span>
				</div>
			{/if}

			<div class="grid gap-2">
				<label for="beacon-identity" class="text-sm font-medium">BEACON Identity</label>
				<select
					id="beacon-identity"
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					bind:value={ws.beaconIdentityAddress}
				>
					<option value="">Select signing account...</option>
					{#each ws.signableAccounts as account (account.addr)}
						<option value={account.addr}>{account.name ?? account.addr.slice(0, 12)}…{account.addr.slice(-4)}</option>
					{/each}
				</select>
				<div class="flex flex-wrap gap-2">
					<Button size="sm" variant="outline" disabled={ws.beaconBusy || !ws.beaconConfigured} onclick={ws.checkBeaconAnnouncement}>
						Check BEACON
					</Button>
					<Button size="sm" variant="outline" disabled={ws.beaconBusy || !ws.beaconConfigured} onclick={ws.initializeBeacon}>
						Initialize BEACON
					</Button>
					{#if ws.beaconStatus}
						<span class="self-center text-xs text-muted-foreground">{ws.beaconStatus}</span>
					{/if}
				</div>
			</div>

			<div class="grid gap-2">
				<label for="mode-select" class="text-sm font-medium">Mode</label>
				<select
					id="mode-select"
					class="rounded border bg-background px-3 py-2 text-sm"
					bind:value={ws.mode}
				>
					<option value="send">Peer Send</option>
					<option value="swap">Atomic Swap</option>
					<option value="multisig">Multisig (Stealth)</option>
				</select>
			</div>

			{#if ws.mode === "multisig"}
				<div class="rounded border p-3 grid gap-3">
					<h4 class="text-sm font-semibold">Multisig Configuration</h4>

					<div class="grid gap-2">
						<label for="msig-threshold" class="text-sm font-medium">
							Threshold (M-of-N)
						</label>
						<input
							id="msig-threshold"
							type="number"
							min="1"
							max="10"
							bind:value={ws.multisigThreshold}
							class="rounded border bg-background px-3 py-2 text-sm"
						/>
					</div>

					<div class="grid gap-2">
						<label for="msig-addrs" class="text-sm font-medium">
							Member Addresses (one per line)
						</label>
						<textarea
							id="msig-addrs"
							bind:value={ws.multisigAddrs}
							class="min-h-[80px] rounded border bg-background px-3 py-2 text-sm font-mono"
							placeholder="Address 1&#10;Address 2&#10;Address 3"
							oninput={computeMsigAddr}
						></textarea>
					</div>

					{#if ws.multisigComputedAddr}
						<div class="rounded bg-muted px-3 py-2 text-xs">
							<span class="text-muted-foreground">Multisig address:</span>
							<span class="ml-1 font-mono">{ws.multisigComputedAddr}</span>
						</div>
					{/if}
				</div>
			{/if}

			{#if ws.mode === "swap"}
				<div class="rounded border p-3">
					<p class="text-xs text-muted-foreground">
						Each peer drafts one side of the swap. When both sides are ready, they
						will be grouped and submitted atomically.
					</p>
				</div>
			{/if}

			<div class="grid gap-2">
				<label for="beacon-recipient" class="text-sm font-medium">Recipient Address</label>
				<input
					id="beacon-recipient"
					type="text"
					bind:value={ws.beaconRecipientAddress}
					class="rounded border bg-background px-3 py-2 text-sm font-mono"
					placeholder="Address to invite"
				/>
			</div>

			<div class="grid gap-2 sm:grid-cols-2">
				<Button disabled={!ws.beaconConfigured || ws.beaconBusy} onclick={handleBeaconOffer}>Send BEACON Offer</Button>
				<Button variant="outline" disabled={!ws.beaconConfigured || ws.beaconBusy} onclick={handleBeaconListen}>Listen for Offer</Button>
			</div>

			<Button variant="ghost" class="justify-self-start px-0" onclick={() => (showAdvanced = !showAdvanced)}>
				{showAdvanced ? "Hide" : "Show"} Advanced WebSocket Relay
			</Button>

			{#if showAdvanced}
				<div class="grid gap-4 rounded border p-3">
					<div class="rounded border border-amber-500/30 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-400/20 dark:bg-amber-950 dark:text-amber-200">
						<strong>Developer fallback.</strong> Start the relay in a terminal:
						<code class="mt-1 block rounded bg-amber-100 px-2 py-1 font-mono text-xs dark:bg-amber-900">node server/relay.mjs</code>
					</div>
					<div class="grid gap-2">
						<label for="relay-url" class="text-sm font-medium">Relay Server</label>
						<input
							id="relay-url"
							type="text"
							bind:value={relayInput}
							class="rounded border bg-background px-3 py-2 text-sm"
							placeholder="ws://localhost:9876"
						/>
					</div>
					<Button onclick={() => { ws.signalingMode = "websocket"; handleCreate(); }}>Create Relay Workspace</Button>
					<div class="flex gap-2">
						<input
							type="text"
							bind:value={joinCode}
							class="min-w-0 flex-1 rounded border bg-background px-3 py-2 text-sm"
							placeholder="Session code"
						/>
						<Button variant="outline" onclick={() => { ws.signalingMode = "websocket"; handleJoin(); }}>Join</Button>
					</div>
				</div>
			{/if}
		</Card.Content>
	</Card.Root>

	{#if ws.error}
		<Alert.Root variant="destructive">
			<Alert.Title>Connection Error</Alert.Title>
			<Alert.Description>{ws.error}</Alert.Description>
		</Alert.Root>
	{/if}

	{#if ws.savedSession}
		<Card.Root>
			<Card.Header>
				<Card.Title>Reconnect</Card.Title>
				<Card.Description>
					Session <code class="rounded bg-muted px-1 font-mono text-xs">{ws.savedSession.sessionId}</code>
					was active — reconnect?
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<div class="flex gap-2">
					<Button variant="default" onclick={ws.reconnectToSavedSession}>
						Reconnect
					</Button>
					<Button variant="outline" onclick={ws.clearSavedSession}>
						Dismiss
					</Button>
				</div>
			</Card.Content>
		</Card.Root>
	{/if}
</div>
