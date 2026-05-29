<script lang="ts">
	import * as Card from "$lib/components/ui/card";
	import type { AddAccountFlowCard } from "../flows";

	interface Props {
		type: AddAccountFlowCard;
		onselect: (flow: AddAccountFlowCard["flow"]) => void;
	}

	let { type, onselect }: Props = $props();
</script>

<button
	type="button"
	class="w-full text-left"
	disabled={!type.available}
	onclick={() => type.available && onselect(type.flow)}
>
	<Card.Root class={type.cardClass}>
		<Card.Header>
			<Card.Title class="text-base">{type.label}</Card.Title>
			<Card.Description>{type.description}</Card.Description>
		</Card.Header>
	</Card.Root>
</button>
