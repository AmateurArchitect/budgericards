<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { db } from "$lib/db";
	import { scryfallFetch } from "$lib/api/scryfall.js";
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { Search, X, Plus, Layers, Tags } from "lucide-svelte";

	let query = $state("");
	let selectedIndex = $state(0);
	let matchedCards = $state(/** @type {any[]} */ ([]));
	let isSearching = $state(false);
	/** @type {HTMLInputElement | null} */
	let inputEl = $state(null);
	let listEl = $state(/** @type {HTMLElement | null} */ (null));

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
						.limit(8)
						.toArray();

					if (localMatches.length < 8) {
						const lower = q.toLowerCase();
						const substring = await db.cards
							.filter(
								(c) =>
									c.name.toLowerCase().includes(lower) &&
									!c.name.toLowerCase().startsWith(lower),
							)
							.limit(8 - localMatches.length)
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

							const cards = names.slice(0, 8).map((/** @type {string} */ name) => {
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

	let selectedCard = $derived(
		matchedCards.length > 0 &&
			selectedIndex >= 0 &&
			selectedIndex < matchedCards.length
			? matchedCards[selectedIndex]
			: null,
	);

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
			class="command-palette"
			class:has-matches={matchedCards.length > 0}
			transition:scale={{ duration: 140, start: 0.97, easing: cubicOut }}
			role="dialog"
			aria-label="Card search command palette"
			aria-modal="true"
		>
			<!-- Integrated Search Bar Header -->
			<div class="palette-header">
				<Search size={15} class="header-search-icon" />
				<input
					bind:this={inputEl}
					type="text"
					class="palette-input"
					placeholder="Type a card name..."
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

					<button
						type="button"
						class="header-action-btn close-btn"
						onclick={() => searchStore.closePalette()}
						title="Close (Esc)"
						aria-label="Close"
					>
						<X size={13} />
						<kbd class="key-cap">esc</kbd>
					</button>
				</div>
			</div>

			<!-- Visually integrated Card List and Preview area -->
			{#if matchedCards.length > 0 && selectedCard}
				<div class="palette-divider"></div>
				<div class="palette-body">
					<!-- Left: Pure list of card names -->
					<div class="card-names-list" bind:this={listEl} role="listbox">
						{#each matchedCards as card, idx}
							<button
								type="button"
								class="card-name-item"
								class:active={selectedIndex === idx}
								onclick={() => selectCard(card)}
								onmouseenter={() => (selectedIndex = idx)}
								role="option"
								aria-selected={selectedIndex === idx}
								title={card.name}
							>
								<span class="card-name-text">{card.name}</span>
							</button>
						{/each}
					</div>

					<div class="vertical-divider"></div>

					<!-- Right: Selected card preview & option buttons -->
					<div class="card-details-pane">
						<div class="preview-img-container">
							{#if previewImgUrl}
								<img
									src={previewImgUrl}
									alt={selectedCard.name}
									class="card-preview-img"
									onerror={(e) => {
										const el = /** @type {HTMLImageElement} */ (e.currentTarget);
										if (!el.src.includes("&fuzzy=")) {
											el.src = `https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(selectedCard.name)}&format=image&version=normal`;
										}
									}}
								/>
							{:else}
								<div class="preview-placeholder">
									<span>No Preview</span>
								</div>
							{/if}
						</div>

						<div class="card-actions-wrapper">
							<button
								type="button"
								class="palette-action-btn add-btn"
								onclick={() => selectCard(selectedCard)}
								title="Add to deck (Enter)"
							>
								<div class="btn-left">
									<Plus size={13} />
									<span>Add Card</span>
								</div>
								<kbd class="key-cap">↵</kbd>
							</button>

							<div class="secondary-actions-row">
								<button
									type="button"
									class="palette-action-btn secondary-btn"
									onclick={() => handlePrinting(selectedCard)}
									title="Change printings (P)"
								>
									<div class="btn-left">
										<Layers size={13} />
										<span>Printing</span>
									</div>
									<kbd class="key-cap">P</kbd>
								</button>

								<button
									type="button"
									class="palette-action-btn secondary-btn"
									onclick={() => handleTag(selectedCard)}
									title="Edit tags (T)"
								>
									<div class="btn-left">
										<Tags size={13} />
										<span>Tags</span>
									</div>
									<kbd class="key-cap">T</kbd>
								</button>
							</div>
						</div>
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
		background: rgba(0, 0, 0, 0.7);
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

	/* Single visually integrated container styled like ContextMenu */
	.command-palette {
		width: 480px;
		max-width: 100%;
		background: hsl(var(--popover));
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius);
		box-shadow:
			0 15px 35px -5px rgba(0, 0, 0, 0.55),
			0 0 0 1px hsla(255, 100%, 100%, 0.04);
		overflow: hidden;
		user-select: none;
		outline: none;
		transition: width 0.15s ease;
	}

	.command-palette.has-matches {
		width: 520px;
	}

	/* Integrated search bar header */
	.palette-header {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px 6px 12px;
		background: transparent;
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
		padding: 3px 7px;
		border-radius: var(--radius-sm);
		border: 1px solid hsla(var(--border) / 0.5);
		background: hsla(var(--muted) / 0.3);
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

	.header-action-btn.close-btn {
		background: transparent;
		border-color: hsla(var(--border) / 0.4);
		color: hsl(var(--muted-foreground));
		padding: 3px 5px;
	}

	.header-action-btn.close-btn:hover {
		background: hsla(0, 70%, 50%, 0.2);
		border-color: hsla(0, 70%, 50%, 0.4);
		color: #ffffff;
	}

	/* Divider between header and list */
	.palette-divider {
		height: 1px;
		background: hsla(var(--border) / 0.5);
	}

	/* Body containing list and preview */
	.palette-body {
		display: flex;
		align-items: stretch;
		min-height: 250px;
		max-height: 290px;
	}

	/* Left column: Card names list */
	.card-names-list {
		flex: 1;
		min-width: 0;
		overflow-y: auto;
		padding: 5px;
		display: flex;
		flex-direction: column;
		gap: 1px;
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
		padding: 5px 8px;
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
	}

	.vertical-divider {
		width: 1px;
		background: hsla(var(--border) / 0.5);
		flex-shrink: 0;
	}

	/* Right column: Card details & preview */
	.card-details-pane {
		width: 185px;
		flex-shrink: 0;
		background: hsla(var(--muted) / 0.12);
		padding: 8px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.preview-img-container {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		flex: 1;
		min-height: 0;
	}

	.card-preview-img {
		max-width: 130px;
		max-height: 182px;
		width: auto;
		height: auto;
		aspect-ratio: 63 / 88;
		border-radius: 6px;
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.45);
		border: 1px solid rgba(255, 255, 255, 0.08);
		object-fit: cover;
	}

	.preview-placeholder {
		width: 130px;
		height: 182px;
		border-radius: 6px;
		border: 1px dashed hsla(var(--border) / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
	}

	.card-actions-wrapper {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.palette-action-btn {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 6px;
		width: 100%;
		padding: 4px 7px;
		border-radius: var(--radius-sm);
		font-size: 0.76rem;
		font-weight: 500;
		cursor: pointer;
		user-select: none;
		border: 1px solid hsla(var(--border) / 0.5);
		background: hsla(var(--muted) / 0.25);
		color: var(--text-primary, #ffffff);
		transition: all 0.1s ease;
	}

	.palette-action-btn:hover {
		background: hsl(var(--primary) / 0.9);
		border-color: hsl(var(--primary));
		color: #ffffff;
	}

	.palette-action-btn:hover .key-cap {
		border-color: hsla(0, 0%, 100%, 0.4);
		color: #ffffff;
		background: hsla(0, 0%, 100%, 0.15);
	}

	.palette-action-btn.add-btn {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: #ffffff;
	}

	.palette-action-btn.add-btn:hover {
		background: hsl(var(--primary) / 0.85);
	}

	.secondary-actions-row {
		display: flex;
		gap: 4px;
		width: 100%;
	}

	.secondary-actions-row .palette-action-btn {
		flex: 1;
		min-width: 0;
		padding: 4px 5px;
	}

	.btn-left {
		display: flex;
		align-items: center;
		gap: 4px;
		min-width: 0;
	}

	.btn-left span {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
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
