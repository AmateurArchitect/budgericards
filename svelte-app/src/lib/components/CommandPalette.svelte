<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { db } from "$lib/db";
	import { scryfallFetch } from "$lib/api/scryfall.js";
	import { parseManaCost } from "$lib/layouts/grouping.svelte.js";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import { fade, scale } from "svelte/transition";
	import { cubicOut } from "svelte/easing";
	import { Search, X } from "lucide-svelte";

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

							const cards = names.slice(0, 8).map((name) => {
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

	function openSidePanel() {
		searchStore.openSearchWithQuery(query.trim());
	}

	/** @param {any} card */
	function selectCard(card) {
		searchStore.addCardToDeck(card);
		searchStore.closePalette();
	}

	function scrollActiveIntoView() {
		setTimeout(() => {
			const activeEl = listEl?.querySelector(".matched-card-item.active");
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
			if (matchedCards.length > 0) {
				e.preventDefault();
				query = matchedCards[selectedIndex].name;
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
			if (
				matchedCards.length > 0 &&
				selectedIndex >= 0 &&
				selectedIndex < matchedCards.length
			) {
				selectCard(matchedCards[selectedIndex]);
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
			class="command-palette-container"
			transition:scale={{ duration: 180, start: 0.96, easing: cubicOut }}
			role="dialog"
			aria-label="Card search bar"
			aria-modal="true"
		>
			<!-- Close control above and to the right of the main search bar -->
			<div class="close-control-row">
				<button
					type="button"
					class="close-palette-btn"
					onclick={() => searchStore.closePalette()}
					aria-label="Close search (Esc)"
					title="Close (Esc)"
				>
					<X size={18} />
				</button>
			</div>

			<!-- Main Search Bar -->
			<div class="main-search-bar">
				<div class="search-input-col">
					<Search size={18} class="search-input-icon" />
					<input
						bind:this={inputEl}
						type="text"
						class="main-search-input"
						placeholder="Type a card name..."
						bind:value={query}
						onkeydown={handleKeydown}
						autocomplete="off"
						spellcheck="false"
					/>
				</div>

				<!-- Search Button on the right of the main search bar to open panel -->
				<button
					type="button"
					class="search-panel-trigger-btn"
					onclick={openSidePanel}
					title="Open card search panel (Enter)"
				>
					<Search size={14} />
					<span>Search</span>
				</button>
			</div>

			<!-- When we can guess the user is typing a card name, we show the matched cards below, otherwise we don't. -->
			{#if matchedCards.length > 0}
				<div class="matched-cards-dropdown" bind:this={listEl} role="listbox">
					{#each matchedCards as card, idx}
						{@const manaSymbols = parseManaCost(card.mana_cost || card.mana)}
						{@const price =
							card.prices?.usd !== undefined && card.prices?.usd !== null
								? parseFloat(card.prices.usd)
								: priceStore.getPrice(card.name)}
						<button
							type="button"
							class="matched-card-item"
							class:active={selectedIndex === idx}
							data-tooltip-img={card.image || card.image_uris?.normal || null}
							onclick={() => selectCard(card)}
							onmouseenter={() => (selectedIndex = idx)}
							role="option"
							aria-selected={selectedIndex === idx}
						>
							<div class="card-info-left">
								<span class="card-name">{card.name}</span>
								{#if card.type || card.type_line}
									<span class="card-type">{card.type || card.type_line}</span>
								{/if}
							</div>

							<div class="card-info-right">
								{#if manaSymbols && manaSymbols.length > 0}
									<div class="card-mana">
										{#each manaSymbols as sym}
											{#if sym === "//"}
												<span class="mana-slash">//</span>
											{:else}
												<ManaSymbol symbol={sym} size="13px" />
											{/if}
										{/each}
									</div>
								{/if}

								{#if price !== null && price !== undefined}
									<span class="card-price">${price.toFixed(2)}</span>
								{/if}

								{#if selectedIndex === idx}
									<kbd class="enter-badge">↵</kbd>
								{/if}
							</div>
						</button>
					{/each}
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
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 1500;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: 14vh;
		padding-left: 1rem;
		padding-right: 1rem;
	}

	.command-palette-container {
		width: 580px;
		max-width: 100%;
		display: flex;
		flex-direction: column;
		user-select: none;
	}

	/* Close control above and to the right of the main search bar */
	.close-control-row {
		display: flex;
		justify-content: flex-end;
		margin-bottom: 8px;
	}

	.close-palette-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.14);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
	}

	.close-palette-btn:hover {
		background: rgba(255, 255, 255, 0.18);
		color: #ffffff;
		transform: scale(1.05);
	}

	/* Main Search Bar */
	.main-search-bar {
		display: flex;
		align-items: center;
		gap: 10px;
		background: #141824;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 12px;
		padding: 6px 6px 6px 14px;
		box-shadow:
			0 16px 48px -8px rgba(0, 0, 0, 0.85),
			0 0 0 1px rgba(255, 255, 255, 0.06);
	}

	.search-input-col {
		flex: 1;
		min-width: 0;
		display: flex;
		align-items: center;
		gap: 10px;
	}

	:global(.search-input-icon) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.main-search-input {
		flex: 1;
		min-width: 0;
		background: transparent;
		border: none;
		outline: none;
		color: #ffffff;
		font-size: 1.05rem;
		font-family: inherit;
	}

	.main-search-input::placeholder {
		color: hsl(var(--muted-foreground) / 0.7);
		font-size: 0.95rem;
	}

	/* Search button on the right of the main search bar */
	.search-panel-trigger-btn {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 16px;
		border-radius: 8px;
		background: hsl(var(--primary));
		color: #ffffff;
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		border: none;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.search-panel-trigger-btn:hover {
		background: hsl(var(--primary) / 0.88);
		transform: translateY(-1px);
	}

	/* Matched Cards Dropdown below */
	.matched-cards-dropdown {
		margin-top: 8px;
		background: #141824;
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 12px;
		box-shadow:
			0 16px 48px -8px rgba(0, 0, 0, 0.85),
			0 0 0 1px rgba(255, 255, 255, 0.06);
		overflow: hidden;
		max-height: 340px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
	}

	.matched-cards-dropdown::-webkit-scrollbar {
		width: 6px;
	}

	.matched-cards-dropdown::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.18);
		border-radius: 3px;
	}

	.matched-card-item {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 10px 14px;
		background: transparent;
		border: none;
		border-left: 3px solid transparent;
		cursor: pointer;
		text-align: left;
		color: inherit;
		transition: background 0.1s ease, border-color 0.1s ease;
	}

	.matched-card-item:hover,
	.matched-card-item.active {
		background: hsl(var(--primary) / 0.14);
		border-left-color: hsl(var(--primary));
	}

	.card-info-left {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.card-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: #ffffff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-type {
		font-size: 0.78rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-info-right {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.card-mana {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.mana-slash {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.card-price {
		font-size: 0.82rem;
		font-weight: 600;
		color: hsl(var(--foreground) / 0.85);
	}

	.enter-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 18px;
		height: 18px;
		padding: 0 4px;
		font-size: 11px;
		font-family: inherit;
		font-weight: 600;
		color: #ffffff;
		background: hsl(var(--primary));
		border-radius: 3px;
	}
</style>
