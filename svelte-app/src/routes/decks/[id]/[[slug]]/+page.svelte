<script>
	import SearchPanel from "$lib/components/SearchPanel.svelte";
	import DeckHeader from "$lib/components/DeckHeader.svelte";
	import StacksView from "$lib/components/StacksView.svelte";
	import TableView from "$lib/components/TableView.svelte";
	import SpoilerView from "$lib/components/SpoilerView.svelte";
	import ImportView from "$lib/components/ImportView.svelte";
	import SideboardPanel from "$lib/components/SideboardPanel.svelte";
	import MaybeboardCleanupModal from "$lib/components/MaybeboardCleanupModal.svelte";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { onMount, untrack } from "svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { fade, slide } from "svelte/transition";
	import { Loader } from "lucide-svelte";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import StatsView from "$lib/components/StatsView.svelte";
	import SettingsView from "$lib/components/SettingsView.svelte";
	import { page } from "$app/stores";
	import { goto } from "$app/navigation";

	let isHydrated = $state(false);

	onMount(() => {
		priceStore.load();
		isHydrated = true;
	});

	// Reactively select the deck whenever the ID in the URL changes
	$effect(() => {
		const id = $page.params.id;
		if (id) {
			untrack(() => {
				const prevId = deckStore.id;
				deckStore.selectDeckId(id);
				if (prevId && prevId !== deckStore.id) {
					searchStore.reset();
				}
			});
		}
	});

	// Helper to create a URL-safe slug
	/** @param {string} name */
	function slugify(name) {
		if (!name) return "untitled-deck";
		return name
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, "")
			.replace(/[\s_-]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	// Reactively update URL slug when deck name changes
	$effect(() => {
		const id = deckStore.id;
		const name = deckStore.name;
		if (id && isHydrated) {
			const shortId = id.slice(0, 8);
			const expectedSlug = slugify(name);
			const currentSlug = $page.params.slug;
			const currentId = $page.params.id;
			if (currentSlug !== expectedSlug || currentId !== shortId) {
				goto(`/decks/${shortId}/${expectedSlug}`, { replaceState: true, noScroll: true });
			}
		}
	});

	$effect(() => {
		console.log("[+page.svelte] status:", { isHydrated, isEmptyStateActive: deckStore.isEmptyStateActive });
	});

	/** @param {DragEvent} e */
	async function handleGlobalDrop(e) {
		e.preventDefault();
		if (!e.dataTransfer) return;
		
		const internalData = e.dataTransfer.getData("application/x-budgericard");
		const deckArea = document.querySelector(".deck-area");
		const isOverDeck = deckArea && (deckArea === e.target || deckArea.contains(/** @type {Node} */ (e.target)));

		if (internalData) {
			try {
				const data = JSON.parse(internalData);
				if (data.fromDeck) {
					if (!isOverDeck) {
						deckStore.removeCard(data.name, deckStore.activeBoard, data.id);
					}
				} else {
					if (isOverDeck) {
						deckStore.addCard(data.name, deckStore.activeBoard, data.price, data.card);
					}
				}
				return;
			} catch (err) {
				console.error('Failed to parse internal drag data:', err);
			}
		}

		if (isOverDeck) {
			const text = e.dataTransfer.getData("text/plain");
			const html = e.dataTransfer.getData("text/html");
			const url = e.dataTransfer.getData("text/uri-list");

			let cardName = "";
			
			if (url) {
				const scryUrl = url.split("\n")[0];
				if (scryUrl.includes("scryfall.com/card/")) {
					const parts = scryUrl.split("/");
					const lastPart = parts[parts.length - 1]?.split("?")[0];
					const secondLastPart = parts[parts.length - 2];
					if (lastPart && isNaN(parseInt(lastPart))) {
						cardName = lastPart.replace(/-/g, " ");
					} else if (secondLastPart && isNaN(parseInt(secondLastPart))) {
						cardName = secondLastPart.replace(/-/g, " ");
					}
				}
				if (!cardName && scryUrl.includes("cards.scryfall.io")) {
					const parts = scryUrl.split("/");
					const filename = parts[parts.length - 1];
					const id = filename.split(".")[0];
					if (id && id.length > 20) {
						try {
							const res = await fetch(`https://api.scryfall.com/cards/${id}`);
							const data = await res.json();
							if (data.name) cardName = data.name;
						} catch (e) {
							console.error("Failed to fetch card name from ID:", e);
						}
					}
				}
			}

			if (!cardName && html) {
				const doc = new DOMParser().parseFromString(html, "text/html");
				const img = doc.querySelector("img");
				if (img && img.alt) cardName = img.alt;
				else {
					const link = doc.querySelector("a");
					if (link) cardName = link.textContent || "";
				}
			}

			if (!cardName && text && text.length < 100 && !text.includes("http")) {
				cardName = text.trim();
			}

			if (cardName) {
				deckStore.addCard(cardName, deckStore.activeBoard, 0);
			}
		}
	}

	/** @param {any} e */
	function handleGlobalPointerDrop(e) {
		if (!e.detail?.data) return;
		const data = e.detail.data;
		const target = /** @type {HTMLElement} */ (e.target);
		const deckArea = document.querySelector(".deck-area");
		const isOverDeck = deckArea && (deckArea === target || deckArea.contains(target));

		if (data.fromDeck) {
			if (!isOverDeck) {
				deckStore.removeCard(data.name, data.sourceBoard || deckStore.activeBoard, data.id);
			}
		} else {
			if (isOverDeck) {
				deckStore.addCard(data.name, deckStore.activeBoard, data.price, data.card);
			}
		}
	}

	/** @param {DragEvent} e */
	function handleGlobalDragOver(e) {
		e.preventDefault();
		if (e.dataTransfer && e.dataTransfer.types.includes("application/x-budgericard")) {
			e.dataTransfer.dropEffect = "move";
		} else if (e.dataTransfer) {
			e.dataTransfer.dropEffect = "copy";
		}
	}

	/** @param {MouseEvent} e */
	function handleDeckAreaClick(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (
			target.closest(
				"button, input, textarea, select, [role='button'], [role='row'], " +
				".card-shell, .card-row, td, th, table, tbody, thead, .deck-header, .modal-content, " +
				".printing-picker-dropdown, .color-picker-dropdown, .tags-picker-dropdown, " +
				".context-menu, .menu-container"
			)
		) {
			return;
		}
		if (interactionStore.selectedCells.size > 0) {
			interactionStore.clearSelection();
		}
	}
</script>

<div 
	class="app-root" 
	role="region"
	aria-label="Budgericards Deckbuilder"
	ondragover={handleGlobalDragOver}
	ondrop={handleGlobalDrop}
	onbudgericard-pointer-drop={handleGlobalPointerDrop}
	style={Object.entries(layoutStore.cssVariables).map(([k, v]) => `${k}: ${v}`).join("; ")}
>
	<main class="app-layout">
		{#if searchStore.isOpen}
			<div class="search-panel-container" transition:slide={{ duration: 250 }}>
				<SearchPanel />
			</div>
		{/if}
		
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="deck-area" onclick={handleDeckAreaClick}>
			{#if searchStore.isOpen}
				<div class="lower-deck-header" transition:slide={{ duration: 200 }}>
					<DeckHeader isTopBar={false} />
				</div>
			{/if}
			{#if settingsStore.deckViewMode === 'list'}
				<ImportView />
			{:else if settingsStore.deckViewMode === 'table'}
				<TableView />
			{:else if settingsStore.deckViewMode === 'spoiler'}
				<SpoilerView />
			{:else if settingsStore.deckViewMode === 'stats'}
				<StatsView />
			{:else if settingsStore.deckViewMode === 'settings'}
				<SettingsView />
			{:else}
				<StacksView />
			{/if}
		</div>
	</main>

	<MaybeboardCleanupModal bind:isOpen={interactionStore.maybeboardCleanupModal.isOpen} />
	<SideboardPanel />

	{#if deckStore.isImagePreloading}
		<div class="stripey-loader" transition:slide={{ axis: 'y', duration: 200 }}>
			<div class="stripey-bar"></div>
		</div>
	{/if}

	{#if import.meta.env.DEV}
		<!-- svelte-ignore a11y_mouse_events_have_key_events -->
		<button
			onclick={() => {
				deckStore.clearMetadataAndCards();
				alert("Cache & deck cleared! You can now paste your decklist again.");
			}}
			style="
				position: fixed;
				bottom: 1.5rem;
				right: 1.5rem;
				z-index: 9999;
				background: hsl(var(--destructive));
				color: white;
				border: none;
				padding: 0.75rem 1.25rem;
				border-radius: var(--radius-md);
				font-size: 0.8rem;
				font-weight: 600;
				cursor: pointer;
				box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
				transition: all 0.2s ease;
			"
			onmouseover={(e) => e.currentTarget.style.transform = 'scale(1.05)'}
			onmouseout={(e) => e.currentTarget.style.transform = 'scale(1)'}
		>
			🔧 Clear Cache & Deck
		</button>
	{/if}
</div>

<style>
	:global(:root) {
		--edge-margin: 1.5rem;
		--card-gap: 0.5rem;
	}

	.app-root {
		display: flex;
		flex-direction: column;
		height: 100%;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		overflow: hidden;
	}

	.app-layout {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.deck-area {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	:global(.search-panel) {
		height: auto;
		max-height: 45vh;
	}

	:global(.search-panel .card-container) {
		width: var(--card-width) !important;
		flex-shrink: 0;
	}

	.stripey-loader {
		position: fixed;
		bottom: 0;
		left: 0;
		right: 0;
		height: 4px;
		background: hsla(0, 0%, 100%, 0.1);
		z-index: 10000;
		overflow: hidden;
	}

	.stripey-bar {
		width: 100%;
		height: 100%;
		background: repeating-linear-gradient(
			-45deg,
			hsl(var(--primary)) 0px,
			hsl(var(--primary)) 20px,
			hsl(var(--primary-dark)) 20px,
			hsl(var(--primary-dark)) 40px
		);
		background-size: 56px 100%;
		animation: stripe-move 1s linear infinite;
	}

	@keyframes stripe-move {
		0% {
			background-position: 0 0;
		}
		100% {
			background-position: 56px 0;
		}
	}
</style>
