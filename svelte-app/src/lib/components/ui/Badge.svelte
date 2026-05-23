<script>
	import { cn } from "$lib/utils";

	/** @type {{ 
	 *   variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning',
	 *   class?: string,
	 *   children?: import('svelte').Snippet 
	 * }} */
	let { 
		variant = "default", 
		class: className = "", 
		children 
	} = $props();

	const variants = {
		default: "badge-default",
		secondary: "badge-secondary",
		destructive: "badge-destructive",
		outline: "badge-outline",
		success: "badge-success",
		warning: "badge-warning"
	};
</script>

<div class={cn("badge", variants[variant], className)}>
	{#if children}
		{@render children()}
	{/if}
</div>

<style>
	.badge {
		display: inline-flex;
		align-items: center;
		border-radius: 9999px;
		border: 1px solid transparent;
		padding: 0.125rem 0.625rem;
		font-size: 0.75rem;
		font-weight: 600;
		transition: all 0.2s;
		white-space: nowrap;
		line-height: 1;
		height: 1.25rem;
	}

	.badge-default {
		background-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	.badge-secondary {
		background-color: hsl(var(--secondary));
		color: hsl(var(--secondary-foreground));
	}

	.badge-destructive {
		background-color: hsl(var(--destructive));
		color: hsl(var(--destructive-foreground));
	}

	.badge-outline {
		border-color: hsl(var(--border));
		color: hsl(var(--foreground));
	}

	.badge-success {
		background-color: hsl(var(--success) / 0.1);
		color: hsl(var(--success));
		border-color: hsl(var(--success) / 0.2);
	}

	.badge-warning {
		background-color: hsl(var(--warning) / 0.1);
		color: hsl(var(--warning));
		border-color: hsl(var(--warning) / 0.2);
	}

	/* Micro-animation on hover if it has a specific class or context */
	.badge:hover {
		opacity: 0.8;
	}
</style>
