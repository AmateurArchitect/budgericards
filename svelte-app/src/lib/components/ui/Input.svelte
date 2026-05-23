<script>
	import { cn } from "$lib/utils.js";

	let { class: className = "", value = $bindable(), ...restProps } = $props();
</script>

<input
	bind:value
	class={cn("ui-input", className)}
	{...restProps}
/>

<style>
	.ui-input {
		display: flex;
		height: 2.25rem;
		width: 100%;
		border-radius: var(--radius);
		border: 1px solid hsl(var(--border));
		background-color: hsla(var(--input) / 0.3);
		padding: 0 0.75rem;
		font-size: 0.875rem;
		transition: border-color 0.15s, box-shadow 0.15s;
		color: hsl(var(--foreground));
		outline: none;
	}

	.ui-input::placeholder {
		color: hsl(var(--muted-foreground));
	}

	.ui-input:focus-visible {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsla(var(--primary) / 0.2);
	}

	.ui-input:disabled {
		cursor: not-allowed;
		opacity: 0.5;
	}
</style>
