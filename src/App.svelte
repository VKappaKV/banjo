<script lang="ts">
	import { onMount } from "svelte";
	import { QueryClientProvider } from "@tanstack/svelte-query";
	import Router, { replace } from "svelte-spa-router";
	import { queryClient } from "$lib/app/query-client";
	import { routes } from "$lib/app/routes";
	import { setWalletAppContext } from "$lib/app/context";
	import { WalletAppState } from "$lib/app/wallet-app-state.svelte";
	import { routePathForExtensionAction } from "$lib/app/views";
	import ConfirmDialog from "$lib/components/confirmation/ConfirmDialog/ConfirmDialog.svelte";
	import AppHeader from "$lib/components/layout/AppHeader/AppHeader.svelte";
	import ShellSidebar from "$lib/components/layout/ShellSidebar/ShellSidebar.svelte";
	import NotificationStack from "$lib/components/notifications/NotificationStack/NotificationStack.svelte";
	import InternalSigningModal from "$lib/components/signing/InternalSigningModal/InternalSigningModal.svelte";

	function initialRouteFromLocation(): string | undefined {
		const params = new URLSearchParams(globalThis.location?.search ?? "");

		return routePathForExtensionAction(params.get("action"));
	}

	const app = new WalletAppState();
	setWalletAppContext(app);

	onMount(() => {
		const initialRoute = initialRouteFromLocation();

		if (initialRoute && !globalThis.location.hash) {
			void replace(initialRoute);
		}

		void app.initialize();
	});
</script>

<svelte:head>
	<title>Banjo Wallet</title>
</svelte:head>

<div class="min-h-screen bg-background text-foreground">
	<NotificationStack />
	<ConfirmDialog />
	<InternalSigningModal />

	<QueryClientProvider client={queryClient}>
		<div class="mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 lg:grid-cols-[18rem_1fr]">
			<ShellSidebar />

			<main class="min-w-0 p-4 sm:p-6 lg:p-8">
				<AppHeader />
				<Router {routes} />
			</main>
		</div>
	</QueryClientProvider>
</div>
