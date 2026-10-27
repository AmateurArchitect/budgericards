<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { db } from "$lib/db";
	import { scryfallFetch } from "$lib/api/scryfall.js";
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { Search, X, Layers, Tags } from "lucide-svelte";

	let query = $state("");
	let selectedIndex = $state(0);
	let matchedCards = $state(/** @type {any[]} */ ([]));
	let isSearching = $state(false);
	/** @type {HTMLInputElement | null} */
	let inputEl = $state(null);
	/** @type {HTMLElement | null} */
	let listEl = $state(null);
	/** @type {HTMLElement | null} */
	let dropdownEl = $state(null);
	let popoverOnLeft = $state(false);

	// When palette opens, reset query and focus input
	$effect(() => {
		if (searchStore.isPaletteOpen) {
			query = "";
			selectedIndex = 0;
			matchedCards = [];
			setTimeout(() => {
				inputEl?.focus();
			}, 30);
		}
	});

	let searchSeq = 0;

	// When we can guess the user is typing a card name, we show the matched cards below, otherwise we don't.
	$effect(() => {
		const q = query.trim();
		const currentSeq = ++searchSeq;

		if (!q) {
			matchedCards = [];
			selectedIndex = 0;
			isSearching = false;
			return;
		}

		// If query looks like syntax (e.g. contains colon, <, >, =), it's not a card name:
		if (/[:<>=]/.test(q)) {
			matchedCards = [];
			selectedIndex = 0;
			isSearching = false;
			return;
		}

		isSearching = true;

		(async () => {
			try {
				// 1. Check local IndexedDB first
				/** @type {any[]} */
				let localMatches = [];
				try {
					localMatches = await db.cards
						.where("name")
						.startsWithIgnoreCase(q)
						.limit(6)
						.toArray();

					if (localMatches.length < 6) {
						const lower = q.toLowerCase();
						const substring = await db.cards
							.filter(
								(c) =>
									c.name.toLowerCase().includes(lower) &&
									!c.name.toLowerCase().startsWith(lower),
							)
							.limit(6 - localMatches.length)
							.toArray();
						localMatches = [...localMatches, ...substring];
					}
				} catch (dbErr) {
					console.warn("IndexedDB query unavailable:", dbErr);
				}

				if (currentSeq !== searchSeq) return;

				if (localMatches.length > 0) {
					matchedCards = localMatches;
					selectedIndex = 0;
					isSearching = false;
					return;
				}

				// 2. If local DB returned 0 matches, fetch Scryfall autocomplete as reliable fallback
				if (q.length >= 2) {
					try {
						const res = await scryfallFetch(
							`https://api.scryfall.com/cards/autocomplete?q=${encodeURIComponent(q)}`,
						);
						if (res.ok) {
							const json = await res.json();
							const names = json.data || [];
							if (currentSeq !== searchSeq) return;

							const cards = names.slice(0, 6).map((/** @type {string} */ name) => {
								const meta = deckStore.metadata[name.toLowerCase()] || {};
								const localPrice = priceStore.getPrice(name);
								return {
									name,
									type: meta.type_line || meta.type || "",
									mana: meta.mana_cost || meta.mana || "",
									image: meta.image || meta.image_uris?.normal || "",
									prices: {
										usd: localPrice !== null ? String(localPrice) : null,
									},
								};
							});

							matchedCards = cards;
							selectedIndex = 0;
							isSearching = false;
							return;
						}
					} catch (scryErr) {
						// Autocomplete fallback failed
					}
				}

				if (currentSeq === searchSeq) {
					matchedCards = [];
					selectedIndex = 0;
					isSearching = false;
				}
			} catch (err) {
				if (currentSeq === searchSeq) {
					matchedCards = [];
					isSearching = false;
				}
			}
		})();
	});

	// Check screen boundaries to flip the popover card if near right edge
	$effect(() => {
		if (matchedCards.length > 0 && dropdownEl) {
			const rect = dropdownEl.getBoundingClientRect();
			popoverOnLeft = rect.right + 260 > window.innerWidth;
		}
	});

	let selectedCard = $derived(
		matchedCards.length > 0 &&
			selectedIndex >= 0 &&
			selectedIndex < matchedCards.length
			? matchedCards[selectedIndex]
			: null,
	);

	let selectedPrice = $derived.by(() => {
		if (!selectedCard) return null;
		if (
			selectedCard.prices?.usd !== undefined &&
			selectedCard.prices?.usd !== null
		) {
			const p = parseFloat(selectedCard.prices.usd);
			if (!isNaN(p)) return p;
		}
		return priceStore.getPrice(selectedCard.name);
	});

	let previewImgUrl = $derived.by(() => {
		if (!selectedCard) return "";
		if (selectedCard.image) return selectedCard.image;
		if (selectedCard.image_uris?.normal) return selectedCard.image_uris.normal;

		const meta = deckStore.metadata[selectedCard.name.toLowerCase()];
		if (meta?.image) return meta.image;
		if (meta?.image_uris?.normal) return meta.image_uris.normal;
		if (meta?.card_faces && meta.card_faces[0]?.image_uris?.normal) {
			return meta.card_faces[0].image_uris.normal;
		}

		return `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(selectedCard.name)}&format=image&version=normal`;
	});

	function openSidePanel() {
		searchStore.openSearchWithQuery(query.trim());
	}

	/** @param {any} card */
	function selectCard(card) {
		if (!card) return;
		searchStore.addCardToDeck(card);
		searchStore.closePalette();
	}

	/** @param {string} cardName */
	function findCardInBoards(cardName) {
		const boards = ["commander", "companion", "mainboard", "sideboard", "maybeboard"];
		for (const b of boards) {
			const boardCards = /** @type {any[]} */ (/** @type {any} */ (deckStore)[b]);
			if (boardCards) {
				const found = boardCards.find(
					(c) => c.name.toLowerCase() === cardName.toLowerCase(),
				);
				if (found) return { card: found, board: b };
			}
		}
		return null;
	}

	/** @param {any} card */
	function handlePrinting(card) {
		if (!card) return;
		const price = card.prices?.usd
			? parseFloat(card.prices.usd)
			: priceStore.getPrice(card.name);

		let existing = findCardInBoards(card.name);
		if (!existing) {
			searchStore.addCardToDeck(card);
			existing = findCardInBoards(card.name);
		}

		searchStore.closePalette();
		interactionStore.showPrintingPickerModal(
			existing?.card || card,
			existing?.board || deckStore.activeBoard,
			price,
		);
	}

	/** @param {any} card */
	function handleTag(card) {
		if (!card) return;
		let existing = findCardInBoards(card.name);
		if (!existing) {
			searchStore.addCardToDeck(card);
			existing = findCardInBoards(card.name);
		}

		searchStore.closePalette();
		interactionStore.showBulkTagsModal([
			existing?.card || { ...card, board: deckStore.activeBoard },
		]);
	}

	let isSyntaxQuery = $derived(/[:<>=]/.test(query.trim()));

	/** @param {string} syntaxText */
	function appendSyntax(syntaxText) {
		const trimmed = query.trim();
		if (!trimmed) {
			query = syntaxText + " ";
		} else {
			query = trimmed + " " + syntaxText + " ";
		}
		inputEl?.focus();
	}

	function scrollActiveIntoView() {
		setTimeout(() => {
			const activeEl = listEl?.querySelector(".card-name-item.active");
			if (activeEl) {
				activeEl.scrollIntoView({ block: "nearest" });
			}
		}, 10);
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "ArrowDown") {
			if (matchedCards.length > 0) {
				e.preventDefault();
				selectedIndex = (selectedIndex + 1) % matchedCards.length;
				scrollActiveIntoView();
			}
			return;
		}

		if (e.key === "ArrowUp") {
			if (matchedCards.length > 0) {
				e.preventDefault();
				selectedIndex =
					(selectedIndex - 1 + matchedCards.length) % matchedCards.length;
				scrollActiveIntoView();
			}
			return;
		}

		if (e.key === "Tab") {
			if (selectedCard) {
				e.preventDefault();
				query = selectedCard.name;
			}
			return;
		}

		if (e.key === "Escape") {
			e.preventDefault();
			searchStore.closePalette();
			return;
		}

		// Keyboard shortcuts for Printing (P / Alt+P) and Tags (T / Alt+T)
		const isInputFocused = document.activeElement === inputEl;
		if (
			selectedCard &&
			(e.key.toLowerCase() === "p" || e.code === "KeyP") &&
			(e.altKey || e.ctrlKey || e.metaKey || !isInputFocused)
		) {
			e.preventDefault();
			handlePrinting(selectedCard);
			return;
		}

		if (
			selectedCard &&
			(e.key.toLowerCase() === "t" || e.code === "KeyT") &&
			(e.altKey || e.ctrlKey || e.metaKey || !isInputFocused)
		) {
			e.preventDefault();
			handleTag(selectedCard);
			return;
		}

		if (e.key === "Enter") {
			e.preventDefault();
			if (e.metaKey || e.ctrlKey) {
				openSidePanel();
			} else if (selectedCard) {
				selectCard(selectedCard);
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
		transition:fade={{ duration: 120 }}
		onclick={(e) => {
			if (e.target === e.currentTarget) searchStore.closePalette();
		}}
	>
		<div
			class="command-palette-wrapper"
			transition:scale={{ duration: 140, start: 0.97, easing: cubicOut }}
			role="dialog"
			aria-label="Card search command palette"
			aria-modal="true"
		>
			<div class="command-palette-card" bind:this={dropdownEl}>
				<!-- 1. Header (Above the search bar) -->
				<div class="palette-header">
					<div class="palette-header-text">
						<h2 class="palette-title">Add Cards</h2>
						<p class="palette-subtitle">Type a card name or enter search syntax</p>
					</div>

					<button
						type="button"
						class="palette-close-btn"
						onclick={() => searchStore.closePalette()}
						title="Close (Esc)"
						aria-label="Close"
					>
						<X size={14} />
						<kbd class="key-cap">esc</kbd>
					</button>
				</div>

				<div class="palette-divider" aria-hidden="true"></div>

				<!-- 2. Integrated Search Bar -->
				<div class="palette-search-bar">
					<Search size={16} class="header-search-icon" />
					<input
						bind:this={inputEl}
						type="text"
						class="palette-input"
						placeholder="Type a card name or enter search syntax..."
						bind:value={query}
						onkeydown={handleKeydown}
						autocomplete="off"
						spellcheck="false"
					/>

					<div class="header-actions">
						<button
							type="button"
							class="header-action-btn search-trigger-btn"
							onclick={openSidePanel}
							title="Open card search panel (Enter or ⌘↵)"
						>
							<span>Search</span>
							<kbd class="key-cap">{matchedCards.length > 0 ? "⌘↵" : "↵"}</kbd>
						</button>
					</div>
				</div>

				<!-- 3. Results / Syntax Action / Empty Hints Area -->
				{#if matchedCards.length > 0 && selectedCard}
					<div class="palette-divider" aria-hidden="true"></div>
					<div class="card-names-list" bind:this={listEl} role="listbox">
						{#each matchedCards as card, idx}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="card-name-item"
								class:active={selectedIndex === idx}
								onclick={() => selectCard(card)}
								onmouseenter={() => (selectedIndex = idx)}
								role="option"
								aria-selected={selectedIndex === idx}
								tabindex="-1"
								title={card.name}
							>
								<span class="card-name-text">{card.name}</span>

								{#if selectedIndex === idx}
									<div class="row-actions">
										<button
											type="button"
											class="row-action-btn"
											onclick={(e) => {
												e.stopPropagation();
												handlePrinting(card);
											}}
											title="Change printing (P)"
										>
											<Layers size={11} />
											<span>Printing</span>
											<kbd class="key-cap">P</kbd>
										</button>

										<button
											type="button"
											class="row-action-btn"
											onclick={(e) => {
												e.stopPropagation();
												handleTag(card);
											}}
											title="Edit tags (T)"
										>
											<Tags size={11} />
											<span>Tags</span>
											<kbd class="key-cap">T</kbd>
										</button>

										<kbd class="key-cap row-enter-badge" title="Add to deck (Enter)">↵</kbd>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else if isSyntaxQuery}
					<div class="palette-divider" aria-hidden="true"></div>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="palette-action-row"
						onclick={openSidePanel}
						role="button"
						tabindex="-1"
						title="Run syntax search in panel (Enter)"
					>
						<div class="palette-action-left">
							<div class="palette-action-badge">
								<Search size={14} />
							</div>
							<div class="palette-action-text">
								<span class="action-label">Search syntax in panel:</span>
								<strong class="action-highlight">{query.trim()}</strong>
							</div>
						</div>
						<div class="palette-action-right">
							<span class="action-shortcut-hint">Open panel</span>
							<kbd class="key-cap">↵</kbd>
						</div>
					</div>
				{:else if query.trim().length > 0 && !isSearching}
					<div class="palette-divider" aria-hidden="true"></div>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<div
						class="palette-action-row"
						onclick={openSidePanel}
						role="button"
						tabindex="-1"
						title="Search full database in panel (Enter)"
					>
						<div class="palette-action-left">
							<div class="palette-action-badge">
								<Search size={14} />
							</div>
							<div class="palette-action-text">
								<span class="action-label">Search all cards for:</span>
								<strong class="action-highlight">{query.trim()}</strong>
							</div>
						</div>
						<div class="palette-action-right">
							<span class="action-shortcut-hint">Open panel</span>
							<kbd class="key-cap">↵</kbd>
						</div>
					</div>
				{:else if !query.trim()}
					<div class="palette-divider" aria-hidden="true"></div>
					<div class="palette-empty-hints">
						<span class="hints-label">Search syntax examples</span>
						<div class="syntax-chips">
							<button
								type="button"
								class="syntax-chip"
								onclick={() => appendSyntax("t:instant")}
								title="Filter by card type (e.g. t:creature, t:instant)"
							>
								<span class="chip-code">t:instant</span>
								<span class="chip-desc">Type</span>
							</button>
							<button
								type="button"
								class="syntax-chip"
								onclick={() => appendSyntax("c:blue")}
								title="Filter by color (e.g. c:blue, c:w)"
							>
								<span class="chip-code">c:blue</span>
								<span class="chip-desc">Color</span>
							</button>
							<button
								type="button"
								class="syntax-chip"
								onclick={() => appendSyntax("o:draw")}
								title="Filter by card text (e.g. o:draw, o:counter)"
							>
								<span class="chip-code">o:draw</span>
								<span class="chip-desc">Text</span>
							</button>
							<button
								type="button"
								class="syntax-chip"
								onclick={() => appendSyntax("cmc<=2")}
								title="Filter by mana value (e.g. cmc<=2, cmc=3)"
							>
								<span class="chip-code">cmc&lt;=2</span>
								<span class="chip-desc">Mana</span>
							</button>
						</div>
					</div>
				{/if}
			</div>

			<!-- Popover Card displayed outside the container next to the card name -->
			{#if previewImgUrl && matchedCards.length > 0 && selectedCard}
				<div
					class="card-popover"
					class:popover-left={popoverOnLeft}
					in:fade={{ duration: 100 }}
				>
					<div class="card-popover-container">
						<img
							src={previewImgUrl}
							alt={selectedCard.name}
							onerror={(e) => {
								const el = /** @type {HTMLImageElement} */ (e.currentTarget);
								if (!el.src.includes("&fuzzy=")) {
									el.src = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(selectedCard.name)}&format=image&version=normal`;
								}
							}}
						/>
						{#if selectedPrice !== null && (settingsStore?.showPrices ?? true)}
							<div class="tooltip-price" in:fade={{ duration: 150 }}>
								${Number(selectedPrice).toFixed(2)}
							</div>
						{/if}
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.command-palette-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 1500;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 14vh;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.command-palette-wrapper {
		width: 540px;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		user-select: none;
		position: relative;
	}

	/* Unified Card Container */
	.command-palette-card {
		width: 100%;
		display: flex;
		flex-direction: column;
		background: hsl(var(--popover));
		border: 1px solid hsla(var(--border) / 0.65);
		border-radius: 14px;
		box-shadow:
			0 24px 48px -10px rgba(0, 0, 0, 0.7),
			0 0 0 1px hsla(255, 100%, 100%, 0.05);
		overflow: hidden;
	}

	/* Header above search bar */
	.palette-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		padding: 16px 20px 14px 20px;
		background: transparent;
	}

	.palette-header-text {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.palette-title {
		margin: 0;
		font-size: 1.15rem;
		font-weight: 600;
		color: var(--text-primary, #ffffff);
		letter-spacing: -0.015em;
		line-height: 1.25;
	}

	.palette-subtitle {
		margin: 0;
		font-size: 0.84rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
	}

	.palette-close-btn {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 4px 8px;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid hsla(var(--border) / 0.5);
		background: hsla(var(--muted) / 0.35);
		color: hsl(var(--muted-foreground));
		font-size: 0.76rem;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		flex-shrink: 0;
		transition: all 0.15s ease;
	}

	.palette-close-btn:hover {
		background: hsla(0, 70%, 50%, 0.2);
		border-color: hsla(0, 70%, 50%, 0.4);
		color: #ffffff;
	}

	.palette-close-btn:hover .key-cap {
		border-color: hsla(0, 0%, 100%, 0.4);
		color: #ffffff;
		background: hsla(0, 0%, 100%, 0.15);
	}

	/* Clean subtle divider line */
	.palette-divider {
		height: 1px;
		width: 100%;
		background: hsla(var(--border) / 0.5);
	}

	/* Integrated search bar */
	.palette-search-bar {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 14px 10px 18px;
		background: hsla(var(--muted) / 0.18);
	}

	:global(.header-search-icon) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.palette-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: var(--text-primary, #ffffff);
		font-size: 0.92rem;
		font-family: inherit;
	}

	.palette-input::placeholder {
		color: hsl(var(--muted-foreground) / 0.7);
		font-size: 0.88rem;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 5px;
		flex-shrink: 0;
	}

	.header-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		border: 1px solid hsla(var(--border) / 0.5);
		background: hsla(var(--muted) / 0.35);
		color: var(--text-primary, #ffffff);
		font-size: 0.76rem;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		transition: all 0.1s ease;
	}

	.header-action-btn:hover {
		background: hsl(var(--primary) / 0.9);
		border-color: hsl(var(--primary));
		color: #ffffff;
	}

	.header-action-btn:hover .key-cap {
		border-color: hsla(0, 0%, 100%, 0.4);
		color: #ffffff;
		background: hsla(0, 0%, 100%, 0.15);
	}

	/* Action Row for syntax search or fallback */
	.palette-action-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 16px;
		cursor: pointer;
		background: transparent;
		transition: background 0.12s ease;
	}

	.palette-action-row:hover {
		background: hsla(var(--muted) / 0.45);
	}

	.palette-action-left {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}

	.palette-action-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		border-radius: var(--radius-sm, 6px);
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.palette-action-text {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 0.85rem;
		color: var(--text-primary, #ffffff);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.action-label {
		color: hsl(var(--muted-foreground));
	}

	.action-highlight {
		color: #ffffff;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		background: hsla(var(--muted) / 0.6);
		padding: 1px 6px;
		border-radius: 4px;
		font-size: 0.82rem;
	}

	.palette-action-right {
		display: flex;
		align-items: center;
		gap: 6px;
		flex-shrink: 0;
	}

	.action-shortcut-hint {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	/* Empty State Hints & Syntax Chips */
	.palette-empty-hints {
		padding: 12px 18px 14px 18px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		background: hsla(var(--muted) / 0.12);
	}

	.hints-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.syntax-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.syntax-chip {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		padding: 3px 8px;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid hsla(var(--border) / 0.5);
		background: hsla(var(--muted) / 0.35);
		color: var(--text-primary, #ffffff);
		font-size: 0.75rem;
		cursor: pointer;
		user-select: none;
		transition: all 0.12s ease;
	}

	.syntax-chip:hover {
		background: hsl(var(--primary) / 0.22);
		border-color: hsl(var(--primary) / 0.55);
		color: #ffffff;
		transform: translateY(-1px);
	}

	.chip-code {
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-weight: 600;
		color: hsl(var(--primary));
	}

	.chip-desc {
		color: hsl(var(--muted-foreground));
		font-size: 0.7rem;
	}

	/* Card names list */
	.card-names-list {
		max-height: 210px;
		overflow-y: auto;
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		scrollbar-width: thin;
		scrollbar-color: hsla(var(--border) / 0.8) transparent;
	}

	.card-names-list::-webkit-scrollbar {
		width: 4px;
	}

	.card-names-list::-webkit-scrollbar-thumb {
		background: hsla(var(--border) / 0.8);
		border-radius: 4px;
	}

	.card-name-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 5px 10px;
		min-height: 30px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--text-primary, #ffffff);
		font-size: 0.85rem;
		font-weight: 500;
		text-align: left;
		cursor: pointer;
		width: 100%;
		transition: none;
	}

	.card-name-item:hover,
	.card-name-item.active {
		background: hsl(var(--primary) / 0.9);
		color: #ffffff;
	}

	.card-name-text {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	/* Row action buttons appearing on the right of the active card line */
	.row-actions {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.row-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		border: 1px solid rgba(255, 255, 255, 0.28);
		background: rgba(255, 255, 255, 0.15);
		color: #ffffff;
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		transition: all 0.1s ease;
	}

	.row-action-btn:hover {
		background: rgba(255, 255, 255, 0.3);
		border-color: rgba(255, 255, 255, 0.55);
		transform: scale(1.02);
	}

	.row-action-btn .key-cap {
		background: rgba(0, 0, 0, 0.25);
		border-color: rgba(255, 255, 255, 0.35);
		color: #ffffff;
		font-size: 0.6rem;
		min-width: 1rem;
		height: 1rem;
		padding: 0 3px;
	}

	.row-enter-badge {
		border-color: rgba(255, 255, 255, 0.35);
		color: #ffffff;
		background: rgba(0, 0, 0, 0.25);
		font-size: 0.65rem;
		min-width: 1.125rem;
		height: 1.125rem;
		padding: 0 4px;
	}

	/* Popover Card outside container */
	.card-popover {
		position: absolute;
		left: calc(100% + 14px);
		top: 0;
		width: 240px;
		border-radius: 12px;
		box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.8);
		pointer-events: none;
		z-index: 100;
	}

	.card-popover.popover-left {
		left: auto;
		right: calc(100% + 14px);
	}

	.card-popover-container {
		width: 100%;
		position: relative;
		border-radius: 12px;
		overflow: hidden;
		background: #000;
	}

	.card-popover-container::after {
		content: "";
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
		border-radius: inherit;
		pointer-events: none;
	}

	.card-popover-container img {
		width: 100%;
		height: auto;
		display: block;
		aspect-ratio: 63 / 88;
		object-fit: cover;
	}

	.tooltip-price {
		position: absolute;
		bottom: 10px;
		left: 10px;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 6px;
		padding: 3px 7px;
		font-size: 0.82rem;
		font-weight: 700;
		color: #4ade80;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}

	/* Keyboard shortcut badge styled like ContextMenu */
	.key-cap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.125rem;
		height: 1.125rem;
		padding: 0 3px;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.65rem;
		font-weight: 600;
		color: var(--text-secondary, hsl(var(--muted-foreground)));
		background: hsla(var(--muted) / 0.3);
		border: 1px solid hsla(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		box-shadow:
			0 1px 0 hsla(var(--border) / 0.6),
			inset 0 1px 0 hsla(255, 100%, 100%, 0.02);
		line-height: 1;
		user-select: none;
		flex-shrink: 0;
		transition: all 0.1s ease;
	}
</style>
