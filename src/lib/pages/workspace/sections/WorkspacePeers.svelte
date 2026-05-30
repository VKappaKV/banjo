<script lang="ts">
	import { Badge } from "$lib/components/ui/badge";
	import * as Card from "$lib/components/ui/card";
	import { getWorkspacePageState } from "../workspace-page-state.svelte";

	const ws = getWorkspacePageState();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>Peers</Card.Title>
		<Card.Description>{ws.peers.length} connected</Card.Description>
	</Card.Header>
	<Card.Content class="grid gap-2">
		{#each ws.peers as peer (peer.peerId)}
			<div class="flex items-center justify-between rounded border px-3 py-2">
				<div class="flex items-center gap-2">
					<div
						class="h-2 w-2 rounded-full {peer.connected ? 'bg-green-500' : 'bg-muted-foreground'}"
					></div>
					<span class="font-mono text-xs">
						{peer.peerId.slice(0, 8)}
						{#if peer.peerId === ws.peerId}
							<Badge variant="outline" class="ml-1 text-xs">you</Badge>
						{/if}
					</span>
					{#if peer.typing}
						<span class="text-xs text-muted-foreground italic">typing…</span>
					{/if}
				</div>
				<Badge variant={peer.connected ? "default" : "secondary"} class="text-xs">
					{peer.connected ? "connected" : "disconnected"}
				</Badge>
			</div>
		{/each}
	</Card.Content>
</Card.Root>
