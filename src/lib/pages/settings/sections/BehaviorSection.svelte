<script lang="ts">
	import { Button } from "$lib/components/ui/button";
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
		core.logger.info({ namespace: "settings", event: "feature-toggled", fields: { key, enabled: next } });
		app.notify(`${label[key]} ${next ? "enabled" : "disabled"}`, "info");
	}

	async function copyLogs() {
		await navigator.clipboard.writeText(app.exportLogs());
		app.notify("Diagnostic logs copied", "success");
	}

	function downloadLogs() {
		const blob = new Blob([app.exportLogs()], { type: "application/json" });
		const href = URL.createObjectURL(blob);
		const anchor = document.createElement("a");
		anchor.href = href;
		anchor.download = `banjo-diagnostics-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
		anchor.click();
		URL.revokeObjectURL(href);
		app.notify("Diagnostic logs downloaded", "success");
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
				<div class="text-muted-foreground text-sm">Include debug information in dApp responses and print sanitized diagnostics to the console.</div>
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
		<Separator />
		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<div class="font-medium">User testing diagnostics</div>
				<div class="text-muted-foreground text-sm">Export sanitized local logs for bug reports. Secrets, signatures, transaction bytes, and auth payloads are redacted.</div>
				<div class="text-muted-foreground mt-1 text-xs">Buffered entries: {app.logEntries.length}</div>
			</div>
			<div class="flex flex-wrap gap-2">
				<Button variant="outline" size="sm" onclick={copyLogs}>Copy logs</Button>
				<Button variant="outline" size="sm" onclick={downloadLogs}>Download</Button>
				<Button variant="ghost" size="sm" onclick={app.clearLogs}>Clear</Button>
			</div>
		</div>
	</Card.Content>
</Card.Root>
