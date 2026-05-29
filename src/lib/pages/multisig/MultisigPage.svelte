<script lang="ts">
	import RoutePlaceholder from "$lib/components/page/RoutePlaceholder/RoutePlaceholder.svelte";
	import { getWalletViewDefinition } from "$lib/app/views";

	const page = getWalletViewDefinition("multisig");
</script>

<RoutePlaceholder title={page.label} description={page.description} />
