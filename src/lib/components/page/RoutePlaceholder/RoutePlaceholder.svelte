<script lang="ts">
	import * as Card from "$lib/components/ui/card";

	interface Props {
		title: string;
		description: string;
	}

	let { title, description }: Props = $props();
</script>

<Card.Root>
	<Card.Header>
		<Card.Title>{title}</Card.Title>
		<Card.Description>{description}</Card.Description>
	</Card.Header>
	<Card.Content>
		<p class="text-muted-foreground text-sm">
			The route is wired. The feature-specific UI is scheduled for the next roadmap milestones.
		</p>
	</Card.Content>
</Card.Root>
