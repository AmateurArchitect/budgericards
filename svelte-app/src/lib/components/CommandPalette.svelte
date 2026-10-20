<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { db } from "$lib/db";
	import { runLocalSearch } from "$lib/localSearch";
	import { parseManaCost } from "$lib/layouts/grouping.svelte.js";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import { isCommanderFormat } from "$lib/constants/formats.js";
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { Search, PanelLeft, X, Sparkles, CornerDownLeft, ArrowRight } from "lucide-svelte";

	let query = $state("");
	let selectedIndex = $state(0);
	let suggestions = $state(/** @type {any[]} */ ([]));
	let isSearching = $state(false);
	let targetBoard = $state("mainboard");
	/** @type {HTMLInputElement | null} */
	let inputEl = $state(null);
	let listEl = $state(/** @type {HTMLElement | null} */ (null));

	// When palette opens, sync active board and focus input
	$effect(() => {
		if (searchStore.isPaletteOpen) {
			targetBoard = deckStore.activeBoard || "mainboard";
			query = "";
			selectedIndex = 0;
			suggestions = [];
			setTimeout(() => {
				inputEl?.focus();
			}, 30);
		}
	});

	// Check if query contains MTG syntax operators
	const hasSyntax = $derived(/[:<>=!]/.test(query.trim()));

	// Available boards to cycle through
	const availableBoards = $derived.by(() => {
		const boards = ["mainboard", "sideboard", "maybeboard"];
		if (isCommanderFormat(deckStore.format)) {
			boards.unshift("commander");
		}
		return boards;
	});

	const targetBoardLabel = $derived.by(() => {
		if (targetBoard === "commander") return "Commander";
		if (targetBoard === "sideboard") return "Sideboard";
		if (targetBoard === "maybeboard") return "Maybeboard";
		return "Mainboard";
	});

	function cycleBoard() {
		const idx = availableBoards.indexOf(targetBoard);
		const next = (idx + 1) % availableBoards.length;
		targetBoard = availableBoards[next];
	}

	let searchSeq = 0;

	// Reactive search as user types
	$effect(() => {
		const q = query.trim();
		const currentSeq = ++searchSeq;

		if (!q) {
			suggestions = [];
			isSearching = false;
			selectedIndex = 0;
			return;
		}

		isSearching = true;

		(async () => {
			try {
				if (hasSyntax) {
					// Syntax query: fetch preview candidates via runLocalSearch
					const localResults = await runLocalSearch(q, { limit: 8 });
					if (currentSeq === searchSeq) {
						suggestions = localResults;
						isSearching = false;
						selectedIndex = 0;
					}
				} else {
					// Fast name prefix lookup in IndexedDB
					const prefix = await db.cards
						.where("name")
						.startsWithIgnoreCase(q)
						.limit(8)
						.toArray();

					let combined = [...prefix];
					if (combined.length < 8) {
						const lower = q.toLowerCase();
						const substring = await db.cards
							.filter(c => c.name.toLowerCase().includes(lower) && !c.name.toLowerCase().startsWith(lower))
							.limit(8 - combined.length)
							.toArray();
						combined = [...combined, ...substring];
					}

					if (currentSeq === searchSeq) {
						suggestions = combined;
						isSearching = false;
						selectedIndex = 0;
					}
				}
			} catch (err) {
				console.error("Command palette search error:", err);
				if (currentSeq === searchSeq) {
					suggestions = [];
					isSearching = false;
				}
			}
		})();
	});

	// Total navigable items in the list
	// When query is non-empty: suggestions + 1 (the side panel action)
	// When query is empty: 1 (the side panel action)
	const totalItems = $derived(query.trim() ? suggestions.length + 1 : 1);

	// The side panel action item index:
	// If syntax query: index 0 (so Enter defaults to opening the side panel)
	// If normal card query: last index (after suggestions)
	const sidePanelActionIndex = $derived(hasSyntax ? 0 : suggestions.length);

	/**
	 * Get card count for a specific card name in the active deck
	 * @param {string} cardName
	 */
	function getDeckCount(cardName) {
		if (!cardName) return 0;
		const lower = cardName.toLowerCase();
		let count = 0;
		const boards = ["commander", "companion", "mainboard", "sideboard", "maybeboard"];
		for (const b of boards) {
			const board = deckStore.deck[b];
			if (Array.isArray(board)) {
				for (const c of board) {
					if (c.name?.toLowerCase() === lower) count++;
				}
			}
		}
		return count;
	}

	function openSidePanel() {
		searchStore.openSearchWithQuery(query.trim());
	}

	/**
	 * @param {any} card
	 * @param {boolean} keepOpen
	 */
	function selectCard(card, keepOpen = false) {
		searchStore.addCardToDeck(card, targetBoard);
		if (keepOpen) {
			query = "";
			inputEl?.focus();
		} else {
			searchStore.closePalette();
		}
	}

	/**
	 * Returns the card corresponding to the current selectedIndex
	 */
	function getSelectedCard() {
		if (hasSyntax) {
			// If syntax query, index 0 is side panel action, cards are 1..N
			return selectedIndex > 0 ? suggestions[selectedIndex - 1] : null;
		} else {
			// If normal query, cards are 0..N-1, side panel action is last
			return selectedIndex < suggestions.length ? suggestions[selectedIndex] : null;
		}
	}

	function scrollActiveIntoView() {
		setTimeout(() => {
			const activeEl = listEl?.querySelector(".palette-item.active");
			if (activeEl) {
				activeEl.scrollIntoView({ block: "nearest" });
			}
		}, 10);
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			selectedIndex = (selectedIndex + 1) % totalItems;
			scrollActiveIntoView();
			return;
		}

		if (e.key === "ArrowUp") {
			e.preventDefault();
			selectedIndex = (selectedIndex - 1 + totalItems) % totalItems;
			scrollActiveIntoView();
			return;
		}

		if (e.key === "Tab") {
			e.preventDefault();
			const card = getSelectedCard();
			if (card && card.name) {
				query = card.name;
			} else {
				selectedIndex = (selectedIndex + (e.shiftKey ? -1 : 1) + totalItems) % totalItems;
				scrollActiveIntoView();
			}
			return;
		}

		if (e.key === "Escape") {
			e.preventDefault();
			searchStore.closePalette();
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
			// Cmd+Enter or Ctrl+Enter: Always open side panel
			if (e.metaKey || e.ctrlKey) {
				openSidePanel();
				return;
			}

			// If current selection is the side panel action:
			if (selectedIndex === sidePanelActionIndex) {
				openSidePanel();
				return;
			}

			// Otherwise, add the selected card:
			const card = getSelectedCard();
			if (card) {
				selectCard(card, e.shiftKey);
			} else {
				openSidePanel();
			}
		}
	}
</script>

{#if searchStore.isPaletteOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="command-palette-backdrop"
		transition:fade={{ duration: 150 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) searchStore.closePalette();
		}}
	>
		<div
			class="command-palette-window"
			transition:scale={{ duration: 180, start: 0.96, easing: cubicOut }}
			role="dialog"
			aria-label="Card search command palette"
			aria-modal="true"
		>
			<!-- Top Search Input Bar -->
			<div class="palette-input-bar">
				<Search size={18} class="palette-search-icon" />
				<input
					bind:this={inputEl}
					type="text"
					class="palette-input"
					placeholder="Search cards by name or syntax (e.g. Sol Ring, t:creature cmc<=2)..."
					bind:value={query}
					onkeydown={handleKeydown}
					autocomplete="off"
					spellcheck="false"
				/>
				{#if isSearching}
					<div class="palette-spinner"></div>
				{:else if query.length > 0}
					<button
						type="button"
						class="clear-input-btn"
						onclick={() => {
							query = "";
							inputEl?.focus();
						}}
						aria-label="Clear input"
						title="Clear input"
					>
						<X size={14} />
					</button>
				{:else}
					<kbd class="esc-badge">esc</kbd>
				{/if}
			</div>

			<!-- Suggestions & Results List -->
			<div class="palette-list" bind:this={listEl} role="listbox">
				<!-- If query is empty, show helpful quick start hints -->
				{#if !query.trim()}
					<button
						type="button"
						class="palette-item side-panel-action active"
						onclick={openSidePanel}
						role="option"
						aria-selected="true"
					>
						<div class="action-icon-circle">
							<PanelLeft size={16} />
						</div>
						<div class="action-text-col">
							<span class="action-title">Open card search in side panel</span>
							<span class="action-subtitle">Browse full 2-column grid, visual filters, and sets</span>
						</div>
						<div class="action-key-pill">
							<kbd class="key-cap">↵</kbd>
						</div>
					</button>

					<div class="palette-empty-hints">
						<div class="hint-header">Quick Tips</div>
						<div class="hint-row">
							<span class="hint-bullet">•</span>
							<span>Type any card name to autocomplete and add with <kbd class="key-cap">↵</kbd></span>
						</div>
						<div class="hint-row">
							<span class="hint-bullet">•</span>
							<span>Use <kbd class="key-cap">⇧↵</kbd> to add a card and immediately search the next</span>
						</div>
						<div class="hint-row">
							<span class="hint-bullet">•</span>
							<span>Supports Scryfall syntax: <code>t:instant</code>, <code>cmc&lt;=2</code>, <code>c:rg</code>, <code>o:"draw"</code></span>
						</div>
					</div>
				{:else}
					<!-- When hasSyntax is true, put the Side Panel Action at the top (index 0) -->
					{#if hasSyntax}
						<button
							type="button"
							class="palette-item side-panel-action"
							class:active={selectedIndex === 0}
							onclick={openSidePanel}
							onmouseenter={() => (selectedIndex = 0)}
							role="option"
							aria-selected={selectedIndex === 0}
						>
							<div class="action-icon-circle">
								<PanelLeft size={16} />
							</div>
							<div class="action-text-col">
								<span class="action-title">Search for "{query}" in side panel</span>
								<span class="action-subtitle">Open side panel results for this query</span>
							</div>
							<div class="action-key-pill">
								<kbd class="key-cap">↵</kbd>
							</div>
						</button>
					{/if}

					<!-- Card Autocomplete Suggestions -->
					{#each suggestions as card, idx}
						{@const actualIdx = hasSyntax ? idx + 1 : idx}
						{@const inDeck = getDeckCount(card.name)}
						{@const price = priceStore.getPrice(card.name)}
						{@const manaSymbols = parseManaCost(card.mana)}
						<button
							type="button"
							class="palette-item card-item"
							class:active={selectedIndex === actualIdx}
							data-tooltip-img={card.image}
							onclick={() => selectCard(card)}
							onmouseenter={() => (selectedIndex = actualIdx)}
							role="option"
							aria-selected={selectedIndex === actualIdx}
						>
							<!-- Card Thumbnail -->
							<div class="card-thumb-container">
								{#if card.image}
									<img
										src={card.image}
										alt={card.name}
										class="card-thumb-img"
										loading="lazy"
									/>
								{:else}
									<div class="card-thumb-placeholder">
										<Sparkles size={13} />
									</div>
								{/if}
							</div>

							<!-- Card Details -->
							<div class="card-details-col">
								<div class="card-title-row">
									<span class="card-name-text">{card.name}</span>
									{#if inDeck > 0}
										<span class="in-deck-badge">{inDeck} in deck</span>
									{/if}
								</div>
								<div class="card-type-row">
									<span class="card-type-text">{card.type}</span>
								</div>
							</div>

							<!-- Mana & Price Meta -->
							<div class="card-meta-col">
								{#if manaSymbols && manaSymbols.length > 0}
									<div class="card-mana-row">
										{#each manaSymbols as sym}
											{#if sym === "//"}
												<span class="mana-divider">//</span>
											{:else}
												<ManaSymbol symbol={sym} size="13px" />
											{/if}
										{/each}
									</div>
								{/if}

								{#if price !== null && price !== undefined}
									<span class="card-price-text">${price.toFixed(2)}</span>
								{/if}
							</div>

							<!-- Action Keycap Badge -->
							<div class="card-action-col">
								{#if selectedIndex === actualIdx}
									<span class="action-badge">
										<kbd class="key-cap">↵</kbd>
										<span class="action-label">Add</span>
									</span>
								{/if}
							</div>
						</button>
					{/each}

					<!-- When hasSyntax is false, put the Side Panel Action at the bottom -->
					{#if !hasSyntax}
						<button
							type="button"
							class="palette-item side-panel-action"
							class:active={selectedIndex === suggestions.length}
							onclick={openSidePanel}
							onmouseenter={() => (selectedIndex = suggestions.length)}
							role="option"
							aria-selected={selectedIndex === suggestions.length}
						>
							<div class="action-icon-circle">
								<PanelLeft size={16} />
							</div>
							<div class="action-text-col">
								<span class="action-title">Search all for "{query}" in side panel</span>
								<span class="action-subtitle">Open visual grid and filter printings</span>
							</div>
							<div class="action-key-pill">
								<kbd class="key-cap">⌘↵</kbd>
							</div>
						</button>
					{/if}
				{/if}
			</div>

			<!-- Footer Bar with Target Board and Key Hints -->
			<div class="palette-footer">
				<div class="footer-left">
					<span class="target-board-label">Adding to:</span>
					<button
						type="button"
						class="board-selector-btn"
						onclick={cycleBoard}
						title="Click to cycle target board"
					>
						<span class="board-badge">{targetBoardLabel}</span>
						<span class="board-cycle-hint">▾</span>
					</button>
				</div>

				<div class="footer-right">
					<span class="shortcut-tip"><kbd class="key-cap">↑↓</kbd> Navigate</span>
					<span class="shortcut-tip"><kbd class="key-cap">Tab</kbd> Complete</span>
					<span class="shortcut-tip"><kbd class="key-cap">↵</kbd> Add</span>
					<span class="shortcut-tip"><kbd class="key-cap">⌘↵</kbd> Panel</span>
					<span class="shortcut-tip"><kbd class="key-cap">esc</kbd> Close</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.command-palette-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 1500;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 10vh;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.command-palette-window {
		width: 640px;
		max-width: 100%;
		background: #141824;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 16px;
		box-shadow:
			0 24px 64px -12px rgba(0, 0, 0, 0.9),
			0 0 0 1px rgba(255, 255, 255, 0.05),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		user-select: none;
	}

	/* Input Bar */
	.palette-input-bar {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 20px;
		background: rgba(255, 255, 255, 0.02);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}

	:global(.palette-search-icon) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.palette-input {
		flex: 1;
		background: transparent;
		border: none;
		outline: none;
		color: #ffffff;
		font-size: 1.05rem;
		font-family: inherit;
		min-width: 0;
	}

	.palette-input::placeholder {
		color: hsl(var(--muted-foreground) / 0.65);
		font-size: 0.95rem;
	}

	.esc-badge {
		padding: 2px 6px;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 4px;
	}

	.clear-input-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		background: rgba(255, 255, 255, 0.08);
		border: none;
		border-radius: 50%;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.clear-input-btn:hover {
		background: rgba(255, 255, 255, 0.15);
		color: #ffffff;
	}

	.palette-spinner {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.2);
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* List Area */
	.palette-list {
		max-height: 440px;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 8px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.palette-list::-webkit-scrollbar {
		width: 6px;
	}

	.palette-list::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.18);
		border-radius: 3px;
	}

	/* Items */
	.palette-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 8px 12px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 8px;
		cursor: pointer;
		text-align: left;
		transition: background 0.12s ease, border-color 0.12s ease;
		color: inherit;
	}

	.palette-item:hover,
	.palette-item.active {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.08);
	}

	.palette-item.active {
		background: hsl(var(--primary) / 0.14);
		border-color: hsl(var(--primary) / 0.35);
	}

	/* Side Panel Action Item */
	.palette-item.side-panel-action {
		padding: 10px 12px;
	}

	.action-icon-circle {
		width: 32px;
		height: 32px;
		border-radius: 8px;
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.action-text-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.action-title {
		font-size: 0.92rem;
		font-weight: 600;
		color: #ffffff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.action-subtitle {
		font-size: 0.78rem;
		color: hsl(var(--muted-foreground));
	}

	.action-key-pill {
		display: flex;
		align-items: center;
	}

	/* Card Items */
	.card-thumb-container {
		width: 32px;
		height: 44px;
		border-radius: 4px;
		overflow: hidden;
		background: #1c202d;
		flex-shrink: 0;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.card-thumb-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.card-thumb-placeholder {
		color: hsl(var(--muted-foreground) / 0.5);
	}

	.card-details-col {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 3px;
	}

	.card-title-row {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
	}

	.card-name-text {
		font-size: 0.95rem;
		font-weight: 600;
		color: #ffffff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.in-deck-badge {
		font-size: 10px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 9999px;
		background: rgba(255, 255, 255, 0.1);
		color: hsl(var(--foreground));
		flex-shrink: 0;
	}

	.card-type-row {
		display: flex;
		align-items: center;
	}

	.card-type-text {
		font-size: 0.78rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-meta-col {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 4px;
		flex-shrink: 0;
	}

	.card-mana-row {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.mana-divider {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		padding: 0 1px;
	}

	.card-price-text {
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--foreground) / 0.85);
	}

	.card-action-col {
		width: 58px;
		display: flex;
		justify-content: flex-end;
		flex-shrink: 0;
	}

	.action-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		background: hsl(var(--primary));
		color: #ffffff;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 600;
	}

	.action-label {
		font-size: 10px;
	}

	/* Empty Hints */
	.palette-empty-hints {
		padding: 16px 20px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		margin-top: 4px;
	}

	.hint-header {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin-bottom: 2px;
	}

	.hint-row {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 0.82rem;
		color: hsl(var(--muted-foreground));
	}

	.hint-bullet {
		color: hsl(var(--primary));
	}

	.hint-row code {
		background: rgba(255, 255, 255, 0.06);
		padding: 1px 4px;
		border-radius: 3px;
		color: hsl(var(--foreground));
		font-size: 0.78rem;
	}

	/* Key Cap Style */
	.key-cap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		font-size: 10px;
		font-family: inherit;
		font-weight: 600;
		color: hsl(var(--foreground));
		background: rgba(255, 255, 255, 0.12);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	/* Footer Bar */
	.palette-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 18px;
		background: rgba(0, 0, 0, 0.25);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 0.78rem;
		color: hsl(var(--muted-foreground));
	}

	.footer-left {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.target-board-label {
		font-size: 0.78rem;
	}

	.board-selector-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 8px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 4px;
		color: #ffffff;
		font-size: 0.78rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.board-selector-btn:hover {
		background: rgba(255, 255, 255, 0.14);
		border-color: hsl(var(--primary));
	}

	.board-cycle-hint {
		font-size: 9px;
		color: hsl(var(--muted-foreground));
	}

	.footer-right {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.shortcut-tip {
		display: inline-flex;
		align-items: center;
		gap: 4px;
	}

	@media (max-width: 600px) {
		.footer-right .shortcut-tip:not(:last-child) {
			display: none;
		}
	}
</style>
