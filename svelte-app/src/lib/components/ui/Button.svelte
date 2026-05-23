<script>
	import { cn } from "$lib/utils.js";

	let {
		variant = "default",
		size = "default",
		children,
		class: className = "",
		el = $bindable(null),
		...restProps
	} = $props();

	const baseClass = "ui-button";
</script>

<button
	bind:this={el}
	class={cn(baseClass, `variant-${variant}`, `size-${size}`, className)}
	{...restProps}
>
	{@render children?.()}
</button>

<style>
	.ui-button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		white-space: nowrap;
		border-radius: var(--radius);
		font-size: 0.875rem;
		font-weight: 500;
		transition: background-color 0.15s, opacity 0.15s, transform 0.1s;
		cursor: pointer;
		border: 1px solid transparent;
		outline: none;
	}

	.ui-button:disabled {
		pointer-events: none;
		opacity: 0.5;
	}

	.ui-button:focus-visible {
		box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring));
	}

	/* Variants */
	.variant-default {
		background-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}
	.variant-default:hover {
		background-color: hsl(var(--primary) / 0.9);
	}

	.variant-destructive {
		background-color: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
	}
	.variant-destructive:hover {
		background-color: hsl(var(--destructive) / 0.9);
	}

	.variant-outline {
		border-color: hsl(var(--border));
		background-color: transparent;
		color: hsl(var(--foreground));
	}
	.variant-outline:hover {
		background-color: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	.variant-secondary {
		background-color: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
	}
	.variant-secondary:hover {
		background-color: hsl(var(--secondary) / 0.8);
	}

	.variant-ghost {
		background-color: transparent;
		color: hsl(var(--foreground));
	}
	.variant-ghost:hover {
		background-color: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	button.variant-toggle-active {
		background-color: hsl(var(--primary) / 0.15) !important;
		color: hsl(var(--primary)) !important;
		border-color: hsl(var(--primary) / 0.3) !important;
	}
	button.variant-toggle-active:hover {
		background-color: hsl(var(--primary) / 0.25) !important;
	}

	.variant-link {
		background-color: transparent;
		color: hsl(var(--primary));
		text-decoration: underline-offset(4px);
	}
	.variant-link:hover {
		text-decoration: underline;
	}

	/* Sizes */
	.size-default {
		height: 2.25rem;
		padding: 0 1rem;
	}
	.size-sm {
		height: 2rem;
		padding: 0 0.75rem;
		font-size: 0.75rem;
	}
	.size-lg {
		height: 2.5rem;
		padding: 0 2rem;
	}
	.size-icon {
		height: 2.25rem;
		width: 2.25rem;
	}
</style>
