<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { getWalletAppContext } from "$lib/app/context";

	interface Props {
		onselect: (flow: string) => void;
	}

	let { onselect }: Props = $props();

	const app = getWalletAppContext();

	type AccountTypeCard = {
		flow: string;
		label: string;
		description: string;
		available: boolean;
	};

	const types: AccountTypeCard[] = [
		{ flow: "hot-import", label: "Hot Mnemonic Import", description: "Import an existing 25-word Algorand mnemonic", available: true },
		{ flow: "hot-create", label: "New Hot Account", description: "Generate a new random hot key account", available: true },
		{ flow: "bip39-import", label: "BIP39 Seed Import", description: "Import a 24-word BIP39 seed phrase", available: true },
		{ flow: "bip39-create", label: "New BIP39 Seed", description: "Generate a new BIP39 seed with HD accounts", available: true },
		{ flow: "passkey", label: "Passkey Account", description: "Restore or register using a passkey", available: true },
		{ flow: "hd", label: "HD Account Discovery", description: "Discover and add HD wallet accounts from a seed", available: true },
		{ flow: "ledger", label: "Ledger Hardware", description: "Discover and add Ledger hardware wallet accounts", available: true },
		{ flow: "falcon", label: "Falcon Post-Quantum", description: "Add a Falcon post-quantum signing account", available: true },
		{ flow: "kmd", label: "KMD Import (LocalNet)", description: "Import accounts from the LocalNet KMD wallet", available: app.state.networkName === "LocalNet" },
		{ flow: "watch", label: "Watch Account", description: "Add an address to monitor without importing keys", available: true },
		{ flow: "msig-create", label: "ARC-55 Multisig Create", description: "Deploy a new multisig app", available: true },
		{ flow: "msig-import", label: "ARC-55 Multisig Import", description: "Import an existing multisig app", available: true },
	];
</script>

<div class="grid gap-6">
	<div>
		<h2 class="text-2xl font-semibold tracking-tight">Add Account</h2>
		<p class="text-muted-foreground text-sm">Choose an account type to create or import.</p>
	</div>

	<div class="grid gap-3 sm:grid-cols-2">
		{#each types as type (type.flow)}
			<button
				type="button"
				class="w-full text-left"
				disabled={!type.available}
				onclick={() => type.available && onselect(type.flow)}
			>
				<Card.Root class={type.available ? "cursor-pointer hover:bg-accent/50" : "opacity-50"}>
					<Card.Header>
						<Card.Title class="text-base">{type.label}</Card.Title>
						<Card.Description>{type.description}</Card.Description>
					</Card.Header>
				</Card.Root>
			</button>
		{/each}
	</div>
</div>
