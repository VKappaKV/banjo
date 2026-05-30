<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { Badge } from "$lib/components/ui/badge";
	import { getWorkspacePageState } from "../workspace-page-state.svelte";

	const ws = getWorkspacePageState();

	const counts = $derived(ws.transactionCountByStatus);

	function copyInvite() {
		navigator.clipboard.writeText(ws.sessionId).catch(() => {});
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
	<div class="flex items-center gap-3">
		<Badge variant="outline" class="text-xs uppercase tracking-wider">
			{ws.mode}
		</Badge>
		<span class="text-sm text-muted-foreground">
			Session: <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">{ws.sessionId}</code>
		</span>
		<span class="text-sm text-muted-foreground">
			Peers: {ws.peers.length}
		</span>
		{#if ws.mode === "multisig" && ws.multisigComputedAddr}
			<span class="hidden sm:block text-xs text-muted-foreground font-mono" title="Multisig address">
				{ws.multisigComputedAddr.slice(0, 8)}…{ws.multisigComputedAddr.slice(-4)}
			</span>
		{/if}
	</div>
	<div class="flex items-center gap-2">
		<span class="text-xs text-muted-foreground hidden sm:block">
			{counts.draft}d / {counts.signed}s / {counts.submitted}✓
		</span>
		<Button size="sm" variant="outline" onclick={copyInvite}>
			Copy Invite Code
		</Button>
		{#if counts.signed > 0}
			<Button
				size="sm"
				variant="default"
				disabled={ws.signingStep === "submitting"}
				onclick={() => ws.submitAllSigned()}
			>
				Submit All Signed
			</Button>
		{/if}
		<Button size="sm" variant="destructive" onclick={() => ws.disconnect()}>
			Disconnect
		</Button>
	</div>
</div>
