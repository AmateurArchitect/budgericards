<script>
	import { cn } from "$lib/utils";

	/** @type {{ 
	 *   orientation?: 'horizontal' | 'vertical',
	 *   class?: string 
	 * }} */
	let { 
		orientation = "horizontal", 
		class: className = "" 
	} = $props();
</script>

<div 
	role="none"
	class={cn(
		"separator", 
		orientation === "horizontal" ? "sep-horizontal" : "sep-vertical",
		className
	)}
></div>

<style>
	.separator {
		flex-shrink: 0;
		background-color: hsl(var(--border));
	}

	.sep-horizontal {
		height: 1px;
		width: 100%;
	}

	.sep-vertical {
		width: 1px;
		height: 100%;
	}
</style>
