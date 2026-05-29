<script lang="ts" module>
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLButtonAttributes } from "svelte/elements";
	import { tv, type VariantProps } from "tailwind-variants";

	export const switchVariants = tv({
		base: "bg-input peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-xs transition-colors focus-visible:outline-hidden focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:bg-primary",
	});

	export type SwitchVariant = VariantProps<typeof switchVariants>;
</script>

<script lang="ts">
	let {
		ref = $bindable(null),
		checked = $bindable(false),
		disabled = false,
		oncheckedchange,
		class: className,
		...restProps
	}: WithElementRef<HTMLButtonAttributes> & {
		checked: boolean;
		oncheckedchange?: (checked: boolean) => void;
	} = $props();

	function toggle() {
		if (!disabled) {
			const next = !checked;
			checked = next;
			oncheckedchange?.(next);
		}
	}
</script>

<button
	bind:this={ref}
	role="switch"
	type="button"
	aria-checked={checked}
	{disabled}
	data-state={checked ? "checked" : "unchecked"}
	onclick={toggle}
	class={cn(switchVariants(), className)}
	{...restProps}
>
	<span
		data-slot="switch-thumb"
		class={cn(
			"bg-background pointer-events-none block size-4 rounded-full ring-0 shadow-xs transition-transform",
			checked ? "translate-x-4" : "translate-x-0",
		)}
	></span>
</button>
