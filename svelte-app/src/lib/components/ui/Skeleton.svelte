<script>
	import { cn } from "$lib/utils";

	/** @type {{ 
	 *   class?: string 
	 * }} */
	let { 
		class: className = "" 
	} = $props();
</script>

<div class={cn("skeleton", className)}></div>

<style>
	.skeleton {
		animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
		background-color: hsl(var(--muted));
		border-radius: var(--radius);
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 1;
		}
		50% {
			opacity: 0.5;
		}
	}
</style>
