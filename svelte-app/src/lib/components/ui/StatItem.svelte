<script>
	import { cn } from "$lib/utils";

	/** @type {{ 
	 *   label: string,
	 *   value: string | number,
	 *   class?: string,
	 *   variant?: 'default' | 'accent' | 'success' | 'destructive'
	 * }} */
	let { 
		label, 
		value, 
		class: className = "",
		variant = "default"
	} = $props();

	const variants = {
		default: "stat-default",
		accent: "stat-accent",
		success: "stat-success",
		destructive: "stat-destructive"
	};
</script>

<div class={cn("stat-item", variants[variant], className)}>
	<span class="stat-label">{label}</span>
	<span class="stat-value">{value}</span>
</div>

<style>
	.stat-item {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.75rem;
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border));
		transition: all 0.2s ease;
	}

	.stat-item:hover {
		background: hsl(var(--muted) / 0.5);
		border-color: hsl(var(--muted-foreground) / 0.3);
	}

	.stat-label {
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.025em;
		font-weight: 600;
	}

	.stat-value {
		font-size: 0.875rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		font-family: tabular-nums;
	}

	.stat-accent .stat-value { color: hsl(var(--primary)); }
	.stat-success .stat-value { color: hsl(var(--success)); }
	.stat-destructive .stat-value { color: hsl(var(--destructive)); }
</style>
