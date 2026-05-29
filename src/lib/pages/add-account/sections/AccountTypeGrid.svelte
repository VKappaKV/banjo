<script lang="ts">
	import { getWalletAppContext } from "$lib/app/context";
	import { addAccountFlowOptions, type AddAccountFlow, type AddAccountFlowCard } from "../flows";
	import AccountTypeCard from "./AccountTypeCard.svelte";

	interface Props {
		onselect: (flow: AddAccountFlow) => void;
	}

	let { onselect }: Props = $props();

	const app = getWalletAppContext();
	let types = $derived<AddAccountFlowCard[]>(
		addAccountFlowOptions(app.state.networkName).map((type) => ({
			...type,
			cardClass: type.available ? "cursor-pointer hover:bg-accent/50" : "opacity-50",
		}))
	);
</script>

<div class="grid gap-3 sm:grid-cols-2">
	{#each types as type (type.flow)}
		<AccountTypeCard {type} {onselect} />
	{/each}
</div>
