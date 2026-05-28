<script>
	import '../app.css';
	import Tooltip from '$lib/components/Tooltip.svelte';
	import { onMount } from 'svelte';
	import { settingsStore } from '$lib/stores/settings.svelte.js';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { interactionStore } from '$lib/stores/interaction.svelte.js';
	import { layoutStore } from '$lib/stores/layout.svelte.js';
	import ContextMenu from '$lib/components/ui/ContextMenu.svelte';
	import AnimationLayer from '$lib/components/ui/AnimationLayer.svelte';
	import QuantityModal from '$lib/components/ui/QuantityModal.svelte';
	import { syncManager } from '$lib/syncManager.svelte.ts';

	let { children } = $props();

	onMount(() => {
		// Boot the local card database — downloads cards.json if stale or missing.
		// This runs in the background; search.svelte.js waits for syncManager.isReady.
		syncManager.init();
		/** @param {KeyboardEvent} e */
		const handleKeydown = (e) => {
			const isInput = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName || '');
			if (isInput) return;

			if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
				if (e.shiftKey) {
					deckStore.redo();
				} else {
					deckStore.undo();
				}
				e.preventDefault();
			} else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
				deckStore.redo();
				e.preventDefault();
			}
		};

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});
</script>

<div 
	class="app-shell"
	style:--dpi-num={settingsStore.dpi} 
	style:--physical-card-width="{settingsStore.physicalCardWidth}px"
	style={Object.entries(layoutStore.cssVariables).map(([k, v]) => `${k}: ${v}`).join("; ")}
>
	{@render children()}
	<Tooltip />
	<ContextMenu 
		bind:isOpen={interactionStore.isMenuOpen} 
		x={interactionStore.menuPosition?.x ?? 0} 
		y={interactionStore.menuPosition?.y ?? 0} 
		items={interactionStore.menuItems}
		onClose={() => {}}
	/>
	<AnimationLayer />
	<QuantityModal />
</div>

<style>
	.app-shell {
		display: contents;
	}
</style>
