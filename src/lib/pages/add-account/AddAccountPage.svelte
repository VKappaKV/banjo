<script lang="ts">
	import type { Component } from "svelte";
	import AddAccountHeader from "./sections/AddAccountHeader.svelte";
	import AccountTypeGrid from "./sections/AccountTypeGrid.svelte";
	import HotImport from "./sections/HotImport.svelte";
	import HotCreate from "./sections/HotCreate.svelte";
	import Bip39Import from "./sections/Bip39Import.svelte";
	import Bip39Create from "./sections/Bip39Create.svelte";
	import PasskeyFlow from "./sections/PasskeyFlow.svelte";
	import HdDiscovery from "./sections/HdDiscovery.svelte";
	import LedgerDiscovery from "./sections/LedgerDiscovery.svelte";
	import FalconAdd from "./sections/FalconAdd.svelte";
	import KmdImport from "./sections/KmdImport.svelte";
	import WatchAdd from "./sections/WatchAdd.svelte";
	import MsigCreate from "./sections/MsigCreate.svelte";
	import MsigImport from "./sections/MsigImport.svelte";
	import type { AddAccountFlow } from "./flows";

	type AddAccountFlowComponent = Component<{ onback: () => void }>;

	const flowComponents = {
		"hot-import": HotImport,
		"hot-create": HotCreate,
		"bip39-import": Bip39Import,
		"bip39-create": Bip39Create,
		passkey: PasskeyFlow,
		hd: HdDiscovery,
		ledger: LedgerDiscovery,
		falcon: FalconAdd,
		kmd: KmdImport,
		watch: WatchAdd,
		"msig-create": MsigCreate,
		"msig-import": MsigImport,
	} satisfies Record<AddAccountFlow, AddAccountFlowComponent>;

	let activeFlow: AddAccountFlow | undefined = $state();
	let ActiveFlow = $derived(activeFlow ? flowComponents[activeFlow] : undefined);

	function resetFlow() {
		activeFlow = undefined;
	}
</script>

{#if !activeFlow}
	<div class="grid gap-6">
		<AddAccountHeader />
		<AccountTypeGrid onselect={(flow) => (activeFlow = flow)} />
	</div>
{:else if ActiveFlow}
	<ActiveFlow onback={resetFlow} />
{/if}
