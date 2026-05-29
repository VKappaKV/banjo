<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import { Separator } from "$lib/components/ui/separator";
	import { Switch } from "$lib/components/ui/switch";
	import { setDebugEnabled, setExperimentalEnabled, setLedgerSelectEnabled, setSnoopEnabled } from "$core/state";
	import { getWalletAppContext } from "$lib/app/context";

	const app = getWalletAppContext();

	function getCore() {
		if (!app.core) throw new Error("Wallet not initialized.");
		return app.core;
	}

	async function toggle(key: "debug" | "snoop" | "ledgerSelect" | "experimental") {
		const core = getCore();
		const current = app.state[key];
		if (typeof current !== "boolean") return;
		const next = !current;
		const setters: Record<string, (storage: typeof core.storage, val: boolean) => Promise<void>> = {
			debug: setDebugEnabled,
			snoop: setSnoopEnabled,
			ledgerSelect: setLedgerSelectEnabled,
			experimental: setExperimentalEnabled,
		};
		const label: Record<string, string> = {
			debug: "Debug",
			snoop: "Snoop",
			ledgerSelect: "LedgerSelect",
			experimental: "Experimental",
		};
		await setters[key](core.storage, next);
		app.state = { ...app.state, [key]: next };
		app.notify(`${label[key]} ${next ? "enabled" : "disabled"}`, "info");
	}
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Features</Card.Title>
		<Card.Description>Enable or disable wallet features and developer tools.</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-4">
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Debug mode</div>
				<div class="text-muted-foreground text-sm">Include debug information in dApp responses.</div>
			</div>
			<Switch checked={app.state.debug} oncheckedchange={() => toggle("debug")} />
		</div>
		<Separator />
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Snoop mode</div>
				<div class="text-muted-foreground text-sm">Show all accounts in dApp connect dialogs, including non-selected accounts.</div>
			</div>
			<Switch checked={app.state.snoop} oncheckedchange={() => toggle("snoop")} />
		</div>
		<Separator />
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Ledger accounts</div>
				<div class="text-muted-foreground text-sm">Allow Ledger hardware wallet accounts to appear in account lists.</div>
			</div>
			<Switch checked={app.state.ledgerSelect} oncheckedchange={() => toggle("ledgerSelect")} />
		</div>
		<Separator />
		<div class="flex items-center justify-between">
			<div>
				<div class="font-medium">Experimental features</div>
				<div class="text-muted-foreground text-sm">Enable in-progress features that may change or be removed.</div>
			</div>
			<Switch checked={app.state.experimental} oncheckedchange={() => toggle("experimental")} />
		</div>
	</Card.Content>
</Card.Root>
