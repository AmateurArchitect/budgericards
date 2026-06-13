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
	import CardDataModal from '$lib/components/ui/CardDataModal.svelte';
	import ChangePrintingsModal from '$lib/components/ui/ChangePrintingsModal.svelte';
	import PrintingPickerModal from '$lib/components/ui/PrintingPickerModal.svelte';
	import { syncManager } from '$lib/syncManager.svelte';
	import { loginBgStore } from '$lib/stores/loginBg.svelte.js';
	import { page } from '$app/stores';
	import Header from '$lib/components/Header.svelte';
	import { parseDecklist } from '$lib/utils/decklistParser.js';
	import { getCardByName } from '$lib/localSearch';
	import { db } from '$lib/db';

	let { children } = $props();

	onMount(() => {
		// Boot the local card database — downloads cards.json if stale or missing.
		// This runs in the background; search.svelte.js waits for syncManager.isReady.
		syncManager.init();

		let lastProcessedClipboard = '';
		const preloadedImageUrls = new Set();

		const processClipboardPreload = async (/** @type {string} */ text) => {
			if (!text) return;
			const parsed = parseDecklist(text);
			if (parsed.length < 5) return;

			// Sample up to first 5 unique card names to verify against IndexedDB
			const uniqueNames = [...new Set(parsed.filter(c => c.name).map(c => /** @type {string} */ (c.name).toLowerCase()))];
			if (uniqueNames.length === 0) return;

			const sampleNames = uniqueNames.slice(0, 5);
			let localMatches = 0;

			await Promise.all(sampleNames.map(async (name) => {
				const localCard = await getCardByName(name);
				if (localCard) {
					localMatches++;
				}
			}));

			// Require at least 3 matches to consider it a valid MTG decklist
			if (localMatches < Math.min(3, sampleNames.length)) {
				return;
			}

			console.info(`📋 Valid clipboard decklist detected (${parsed.length} cards). Preloading...`);

			// Populate missing card metadata and warm up image cache
			await Promise.all(uniqueNames.map(async (name) => {
				// Don't preload metadata if already cached in memory
				if (deckStore.metadata[name]) {
					// Check if image is already preloaded, if not trigger it
					const meta = deckStore.metadata[name];
					const url = meta?.image_uris?.art_crop || meta?.image_uris?.normal;
					if (url && !preloadedImageUrls.has(url)) {
						preloadedImageUrls.add(url);
						const img = new window.Image();
						img.src = url;
					}
					return;
				}

				try {
					const localCard = await getCardByName(name);
					if (localCard) {
						const priceRecord = await db.prices.get(localCard.id);
						const cardMetadata = {
							name: localCard.name,
							type_line: localCard.type || "",
							mana_cost: localCard.mana || "",
							cmc: localCard.cmc ?? 0,
							colors: localCard.colors || [],
							color_identity: localCard.identity || [],
							oracle_text: localCard.text || "",
							card_faces: [],
							image_uris: {
								normal: localCard.image,
								small: localCard.image ? localCard.image.replace('/normal/', '/small/') : null,
								art_crop: localCard.image ? localCard.image.replace('/normal/', '/art_crop/') : null,
							},
							prices: {
								usd: priceRecord ? String(priceRecord.price) : null,
							},
						};

						// Store in memory cache
						deckStore.metadata[name] = cardMetadata;

						// Pre-fetch the card image in background
						const url = cardMetadata.image_uris.art_crop || cardMetadata.image_uris.normal;
						if (url && !preloadedImageUrls.has(url)) {
							preloadedImageUrls.add(url);
							const img = new window.Image();
							img.src = url;
						}
					}
				} catch (e) {
					// Ignore resolution failures
				}
			}));
			console.info(`📋 Preloading complete for clipboard decklist.`);
		};

		const handleFocus = async () => {
			if (!settingsStore.enableClipboardPreload) return;

			try {
				const status = await navigator.permissions.query({ name: /** @type {any} */ ('clipboard-read') });
				if (status.state === 'granted') {
					const text = await navigator.clipboard.readText();
					const trimmedText = text ? text.trim() : '';
					if (trimmedText && trimmedText !== lastProcessedClipboard) {
						lastProcessedClipboard = trimmedText;
						await processClipboardPreload(trimmedText);
					}
				}
			} catch (e) {
				// Clipboard Permissions or Read API not supported or disallowed
			}
		};

		window.addEventListener('focus', handleFocus);

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
		return () => {
			window.removeEventListener('focus', handleFocus);
			window.removeEventListener('keydown', handleKeydown);
		};
	});
</script>

<div 
	class="app-shell"
	style:--dpi-num={settingsStore.dpi} 
	style:--physical-card-width="{settingsStore.physicalCardWidth}px"
	style={Object.entries(layoutStore.cssVariables).map(([k, v]) => `${k}: ${v}`).join("; ")}
>
	{#if $page.url.pathname !== '/login' && !$page.url.pathname.startsWith('/auth')}
		<Header />
		<div class="app-content-wrapper">
			{@render children()}
		</div>
	{:else}
		{@render children()}
	{/if}
	<Tooltip />
	<ContextMenu 
		bind:isOpen={interactionStore.isMenuOpen} 
		x={interactionStore.menuPosition?.x ?? 0} 
		y={interactionStore.menuPosition?.y ?? 0} 
		items={interactionStore.menuItems}
		cardName={interactionStore.menuHeader}
		onClose={() => {}}
	/>
	<AnimationLayer />
	<QuantityModal />
	<CardDataModal />
	<ChangePrintingsModal />
	<PrintingPickerModal />
</div>

<style>
	.app-shell {
		display: flex;
		flex-direction: column;
		height: 100vh;
		width: 100vw;
		overflow: hidden;
	}

	.app-content-wrapper {
		flex: 1;
		width: 100%;
		min-height: 0;
		overflow: hidden;
	}
</style>
