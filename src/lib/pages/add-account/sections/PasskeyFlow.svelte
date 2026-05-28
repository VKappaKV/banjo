<script lang="ts">
	import * as Alert from "$lib/components/ui/alert";
	import { Button } from "$lib/components/ui/button";
	import * as Card from "$lib/components/ui/card";
	import { restorePasskeySeed, registerPasskeySeed } from "$core/keys";
	import { getWalletAppContext } from "$lib/app/context";

	interface Props {
		onback: () => void;
	}

	let { onback }: Props = $props();

	const app = getWalletAppContext();

	type Step = "choose" | "restoring" | "registering" | "register-warning" | "done";
	let step = $state<Step>("choose");
	let error = $state("");
	let seedId = $state<number | null>(null);
	let message = $state("");

	async function handleRestore() {
		if (!app.core) return;
		error = "";
		step = "restoring";
		try {
			const result = await restorePasskeySeed({
				storage: app.core.storage,
				credentialProvider: app.core.credentialProvider,
			});
			seedId = result.seedId;
			message = `Passkey restored — seed ID ${result.seedId}`;
			step = "done";
		} catch (e) {
			error = e instanceof Error ? e.message : "Restore failed.";
			step = "choose";
		}
	}

	function showRegisterWarning() {
		error = "";
		step = "register-warning";
	}

	async function handleRegister() {
		if (!app.core) return;
		error = "";
		step = "registering";
		try {
			const result = await registerPasskeySeed({
				storage: app.core.storage,
				credentialProvider: app.core.credentialProvider,
			});
			seedId = result.seedId;
			message = `Passkey registered — seed ID ${result.seedId}`;
			step = "done";
		} catch (e) {
			error = e instanceof Error ? e.message : "Registration failed.";
			step = "choose";
		}
	}
</script>

<div class="grid gap-4">
	<div class="flex items-center gap-3">
		<Button variant="ghost" size="sm" onclick={onback}>← Back</Button>
		<h2 class="text-xl font-semibold tracking-tight">Passkey Account</h2>
	</div>

	{#if step === "choose"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Passkey Seed</Card.Title>
				<Card.Description>
					Use your device's biometric or PIN authentication to access or create a passkey-protected seed.
				</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-3">
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="flex gap-2">
				<Button onclick={handleRestore}>Restore Existing Passkey</Button>
				<Button variant="outline" onclick={showRegisterWarning}>Register New Passkey</Button>
			</Card.Footer>
		</Card.Root>

	{:else if step === "register-warning"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Important</Card.Title>
				<Card.Description>
					Registering a new passkey creates a new seed. If you already have a passkey for Banjo, registering again will create a different seed. Make sure you want to create a new one.
				</Card.Description>
			</Card.Header>
			<Card.Footer>
				<Button onclick={handleRegister}>I Understand — Register</Button>
			</Card.Footer>
		</Card.Root>

	{:else if step === "restoring" || step === "registering"}
		<Card.Root>
			<Card.Header>
				<Card.Title>{step === "restoring" ? "Restoring" : "Registering"} Passkey</Card.Title>
				<Card.Description>Follow your device's authentication prompt.</Card.Description>
			</Card.Header>
		</Card.Root>

	{:else if step === "done"}
		<Card.Root>
			<Card.Header>
				<Card.Title>Passkey Ready</Card.Title>
				<Card.Description>{message}</Card.Description>
			</Card.Header>
			<Card.Content>
				{#if error}
					<Alert.Root variant="destructive">
						<Alert.Description>{error}</Alert.Description>
					</Alert.Root>
				{/if}
			</Card.Content>
			<Card.Footer class="flex gap-2">
				<Button onclick={onback}>Done</Button>
				{#if seedId !== null}
					<Button variant="outline" onclick={() => { step = "choose"; seedId = null; message = ""; }}>
						Use Another Passkey
					</Button>
				{/if}
			</Card.Footer>
		</Card.Root>
	{/if}
</div>
