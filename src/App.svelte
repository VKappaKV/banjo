<script lang="ts">
	import { onMount } from "svelte";
	import { WalletAppState } from "$lib/app/wallet-app-state.svelte";
	import type { WalletView } from "$lib/app/views";
	import BanjoShell from "$lib/components/shell/BanjoShell.svelte";

	function initialViewFromLocation(): WalletView {
		const params = new URLSearchParams(globalThis.location?.search ?? "");
		const action = params.get("action");

		switch (action) {
			case "connect":
				return "connect";
			case "sign":
			case "auth":
				return "sign";
			case "network":
				return "network-add";
			case "swap":
				return "swap";
			default:
				return "accounts";
		}
	}

	const app = new WalletAppState({ initialView: initialViewFromLocation() });

	onMount(() => {
		void app.initialize();
	});
</script>

<BanjoShell {app} />
