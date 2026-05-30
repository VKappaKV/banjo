<script lang="ts">
	import { onDestroy } from "svelte";
	import { getWalletAppContext } from "$lib/app/context";
	import { getWalletViewDefinition } from "$lib/app/views";
	import {
		setWorkspacePageState,
		getWorkspacePageState,
	} from "./workspace-page-state.svelte";
	import WorkspaceLobby from "./sections/WorkspaceLobby.svelte";
	import WorkspaceToolbar from "./sections/WorkspaceToolbar.svelte";
	import WorkspacePeers from "./sections/WorkspacePeers.svelte";
	import WorkspaceComposer from "./sections/WorkspaceComposer.svelte";
	import WorkspaceReview from "./sections/WorkspaceReview.svelte";

	const app = getWalletAppContext();
	const page = getWalletViewDefinition("workspace");
	const ws = setWorkspacePageState();
	ws.setApp(app);

	onDestroy(() => {
		if (ws.status !== "idle") ws.disconnect();
	});
</script>

<div class="grid gap-6">
	<div class="flex flex-col gap-1">
		<h2 class="text-2xl font-semibold tracking-tight">{page.label}</h2>
		<p class="text-sm text-muted-foreground">{page.description}</p>
	</div>

	{#if ws.status === "idle" || ws.status === "error"}
		<WorkspaceLobby />
	{:else if ws.status === "connecting"}
		<div class="flex items-center justify-center py-12">
			<p class="text-muted-foreground">Connecting to workspace...</p>
		</div>
	{:else if ws.status === "connected"}
		<WorkspaceToolbar />
		<div class="grid gap-6 md:grid-cols-[1fr_280px]">
			<div class="grid gap-6">
				<WorkspaceComposer />
				<WorkspaceReview />
			</div>
			<div>
				<WorkspacePeers />
			</div>
		</div>
	{/if}
</div>
