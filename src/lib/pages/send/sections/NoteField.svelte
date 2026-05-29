<script lang="ts">
	import { getSendPageState } from "../send-page-state.svelte";

	const state = getSendPageState();
</script>

<div class="grid gap-2">
	<label class="text-sm font-medium" for="note">Note</label>
	<textarea id="note" bind:value={state.note} class="min-h-20 w-full rounded border border-input bg-background p-2 text-sm" placeholder="Optional note"></textarea>
	<p class={state.noteByteClass}>{state.noteBytes}/1000 bytes</p>
</div>
