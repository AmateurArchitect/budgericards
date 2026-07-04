<script>
	import { fade, slide, scale } from "svelte/transition";
	import { onMount } from "svelte";
	import { Search, X, Loader } from "lucide-svelte";
	import { runLocalSearch } from "$lib/localSearch";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import Card from "./Card.svelte";
	import Button from "./ui/Button.svelte";
	import { priceStore } from "$lib/stores/prices.svelte.js";

	/**
	 * @typedef {Object} Props
	 * @property {boolean} isOpen
	 * @property {() => void} onClose
	 */

	/** @type {Props} */
	let { isOpen = $bindable(), onClose } = $props();

	let searchQuery = $state("");
	let selectedColors = $state(/** @type {string[]} */ ([]));
	let selectedFormat = $state(deckStore.format || "Commander");
	let isSearching = $state(false);
	/** @type {any[]} */
	let results = $state([]);
	/** @type {HTMLInputElement | null} */
	let searchInputEl = $state(null);

	$effect(() => {
		if (isOpen && searchInputEl) {
			setTimeout(() => searchInputEl?.focus(), 50);
		}
	});

	const colors = [
		{ id: "W", name: "white", label: "White" },
		{ id: "U", name: "blue", label: "Blue" },
		{ id: "B", name: "black", label: "Black" },
		{ id: "R", name: "red", label: "Red" },
		{ id: "G", name: "green", label: "Green" }
	];

	function getIconPath(/** @type {string} */ name, /** @type {boolean} */ active) {
		const state = active ? "selected" : "unselected";
		return `/mana/${name}-${state}-dark.svg`;
	}

	function toggleColor(/** @type {string} */ colorId) {
		if (selectedColors.includes(colorId)) {
			selectedColors = selectedColors.filter(c => c !== colorId);
		} else {
			selectedColors = [...selectedColors, colorId];
		}
	}

	async function performSearch() {
		isSearching = true;
		try {
			// Query the database for matches or fall back to general legendary search if empty query
			const queryText = searchQuery.trim() || "*";
			const rawResults = await runLocalSearch(queryText, { limit: 200 });

			// Filter to legendary creatures/planeswalkers and match subset color identity in JS
			results = rawResults.filter(card => {
				const isLegendary = card.type?.toLowerCase().includes("legendary");
				const isCreature = card.type?.toLowerCase().includes("creature");
				const isPlaneswalker = card.type?.toLowerCase().includes("planeswalker");
				
				if (!isLegendary || (!isCreature && !isPlaneswalker)) {
					return false;
				}

				if (selectedColors.length > 0) {
					const isSubset = card.identity?.every(c => selectedColors.includes(c));
					if (!isSubset) return false;
				}

				return true;
			});
		} catch (err) {
			console.error("Commander search failed:", err);
		} finally {
			isSearching = false;
		}
	}

	// Trigger search on input query or color filter change
	$effect(() => {
		if (isOpen) {
			performSearch();
		}
	});

	function handleSelectCommander(/** @type {any} */ card) {
		deckStore.batchUpdate(() => {
			// Clear existing commander
			deckStore.deck.commander = [];
			// Add new commander
			deckStore.addCard(card.name, 'commander', card.price || 0, card);
			// Update format if set to None or List
			if (!deckStore.format || deckStore.format === "None" || deckStore.format === "List") {
				deckStore.format = selectedFormat;
			}
		});
		isOpen = false;
		onClose();
	}

	function handleFormatChange(/** @type {Event} */ e) {
		const target = /** @type {HTMLSelectElement} */ (e.target);
		selectedFormat = target.value;
	}

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}
</script>

{#if isOpen}
	<div use:portal class="commander-portal-wrapper">
		<div
			class="backdrop"
			role="presentation"
			onclick={() => { isOpen = false; onClose(); }}
			in:fade={{ duration: 200 }}
			out:fade={{ duration: 150 }}
		></div>

		<div
			class="bottom-panel"
			role="dialog"
			aria-modal="true"
			aria-labelledby="commander-panel-title"
			in:slide={{ duration: 250, axis: 'y' }}
			out:slide={{ duration: 200, axis: 'y' }}
		>
			<div class="panel-header">
				<h3 id="commander-panel-title">Choose a Commander</h3>
				<button class="close-btn" onclick={() => { isOpen = false; onClose(); }} aria-label="Close panel">
					<X size={18} />
				</button>
			</div>

			<div class="panel-controls">
				<!-- Search Input -->
				<div class="search-input-wrapper">
					<Search class="search-icon" size={16} />
					<input
						bind:this={searchInputEl}
						type="text"
						placeholder="Search legendary creatures & planeswalkers..."
						bind:value={searchQuery}
						oninput={performSearch}
					/>
				</div>

				<!-- Color Identity Filters -->
				<div class="control-section">
					<span class="control-label">Color Identity:</span>
					<div class="mana-filter">
						{#each colors as { id, name, label }}
							{@const active = selectedColors.includes(id)}
							<button
								class="color-btn color-{name}"
								class:active
								onclick={() => toggleColor(id)}
								title={label}
								aria-label="Filter by {label}"
							>
								<img
									src={getIconPath(name, active)}
									alt={label}
									class="mana-icon"
								/>
							</button>
						{/each}
					</div>
				</div>

				<!-- Format Selector -->
				<div class="control-section">
					<span class="control-label">Format:</span>
					<select class="format-select" value={selectedFormat} onchange={handleFormatChange}>
						<option value="Commander">Commander</option>
						<option value="Brawl">Brawl</option>
						<option value="Oathbreaker">Oathbreaker</option>
					</select>
				</div>
			</div>

			<div class="panel-results">
				{#if isSearching}
					<div class="loading-state">
						<Loader class="spinner animate-spin" size={28} />
						<span>Searching local library...</span>
					</div>
				{:else if results.length === 0}
					<div class="empty-results">
						No legendary creatures or planeswalkers found matching those filters.
					</div>
				{:else}
					<div class="results-grid">
						{#each results as card, i}
							<button class="card-result-btn" onclick={() => handleSelectCommander(card)}>
								<Card {card} price={priceStore.getPrice(card.name)} inSearchPanel={true} index={i} />
							</button>
						{/each}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.commander-portal-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		z-index: 10500;
	}

	.backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(8px);
	}

	.bottom-panel {
		position: relative;
		width: 100%;
		max-height: 55vh;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(24px);
		border-top: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg) var(--radius-lg) 0 0;
		box-shadow: 0 -10px 40px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		padding-bottom: env(safe-area-inset-bottom, 0);
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem 1.5rem 0.75rem 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.panel-header h3 {
		font-family: var(--font-sans), sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		color: #ffffff;
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 0.25rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.close-btn:hover {
		background: hsl(var(--muted) / 0.15);
		color: #ffffff;
	}

	.panel-controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 1.5rem;
		padding: 0.75rem 1.5rem;
		background: hsl(var(--muted) / 0.05);
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.search-input-wrapper {
		position: relative;
		flex: 1;
		min-width: 250px;
		display: flex;
		align-items: center;
	}

	.search-icon {
		position: absolute;
		left: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.search-input-wrapper input {
		width: 100%;
		height: 2.25rem;
		padding: 0.5rem 0.5rem 0.5rem 2.25rem;
		background: hsl(var(--input) / 0.3);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		color: #ffffff;
		outline: none;
		transition: all 0.2s ease;
	}

	.search-input-wrapper input:focus {
		border-color: hsl(var(--primary) / 0.6);
		background: hsl(var(--input) / 0.5);
	}

	.control-section {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.control-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.mana-filter {
		display: flex;
		gap: 0.35rem;
	}

	.color-btn {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.5;
		transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, filter 0.2s ease;
	}

	.color-btn:hover {
		transform: scale(1.1);
		opacity: 0.85;
	}

	.color-btn.active {
		opacity: 1;
	}

	.mana-icon {
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/* Glow filters */
	.color-btn.active.color-white { filter: drop-shadow(0 0 4px rgba(255, 251, 213, 0.65)); }
	.color-btn.active.color-blue { filter: drop-shadow(0 0 4px rgba(139, 228, 255, 0.65)); }
	.color-btn.active.color-black { filter: drop-shadow(0 0 4px rgba(160, 140, 190, 0.5)); }
	.color-btn.active.color-red { filter: drop-shadow(0 0 4px rgba(255, 130, 100, 0.65)); }
	.color-btn.active.color-green { filter: drop-shadow(0 0 4px rgba(130, 220, 140, 0.65)); }

	.format-select {
		height: 2.25rem;
		padding: 0 0.75rem;
		background: hsl(var(--input) / 0.3);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		color: #ffffff;
		outline: none;
		cursor: pointer;
		transition: border-color 0.2s ease;
	}

	.format-select:focus {
		border-color: hsl(var(--primary) / 0.6);
	}

	.panel-results {
		flex: 1;
		overflow-x: auto;
		overflow-y: hidden;
		padding: 1rem 1.5rem 1.5rem 1.5rem;
		background: hsl(var(--background) / 0.3);
		min-height: calc(var(--card-height) + 2rem + 6px);
	}

	.loading-state,
	.empty-results {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		padding: 4rem 1.5rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.9rem;
		gap: 0.75rem;
	}

	.spinner {
		color: hsl(var(--primary));
		animation: spin 1s linear infinite;
	}

	.results-grid {
		display: flex;
		gap: var(--column-gap, 0.75rem);
		align-items: flex-start;
		overflow-x: visible;
	}

	.card-result-btn {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		outline: none;
		flex-shrink: 0;
		width: var(--card-width);
	}

	.card-result-btn :global(.card-container) {
		width: var(--card-width) !important;
		flex-shrink: 0;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
