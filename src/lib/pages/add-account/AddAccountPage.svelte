<script lang="ts">
	import AddAccountIntro from "./sections/AddAccountIntro.svelte";
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

	let activeFlow: string | undefined = $state();
</script>

{#if !activeFlow}
	<AddAccountIntro onselect={(flow) => (activeFlow = flow)} />
{:else if activeFlow === "hot-import"}
	<HotImport onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "hot-create"}
	<HotCreate onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "bip39-import"}
	<Bip39Import onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "bip39-create"}
	<Bip39Create onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "passkey"}
	<PasskeyFlow onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "hd"}
	<HdDiscovery onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "ledger"}
	<LedgerDiscovery onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "falcon"}
	<FalconAdd onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "kmd"}
	<KmdImport onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "watch"}
	<WatchAdd onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "msig-create"}
	<MsigCreate onback={() => (activeFlow = undefined)} />
{:else if activeFlow === "msig-import"}
	<MsigImport onback={() => (activeFlow = undefined)} />
{/if}
