<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import Card from "./Card.svelte";
	import { slide, fade } from "svelte/transition";
	import { Trash2 } from "lucide-svelte";

	let isDraggingDeckCard = $state(false);
	let gridContainer = $state(/** @type {HTMLElement | null} */ (null));

	/** @param {DragEvent} e */
	function handleDragOver(e) {
		if (!e.dataTransfer) return;
		e.preventDefault();
		const isDeckCard = e.dataTransfer.types.includes("application/x-budgericard");
		if (isDeckCard) {
			e.dataTransfer.dropEffect = "move";
			isDraggingDeckCard = true;
		}
	}

	/** @param {DragEvent} e */
	function handleDragLeave(e) {
		isDraggingDeckCard = false;
	}

	/** @param {DragEvent} e */
	function handleDrop(e) {
		if (!e.dataTransfer) return;
		e.preventDefault();
		isDraggingDeckCard = false;

		const dataStr = e.dataTransfer.getData("application/x-budgericard");
		if (dataStr) {
			const data = JSON.parse(dataStr);
			if (data.fromDeck) {
				const collection = searchStore.collection;
				const targetBoard = collection;
				const cardsToProcess = data.selectedCards || [data];
				deckStore.batchUpdate(() => {
					for (const item of cardsToProcess) {
						if (collection === "sideboard" || collection === "maybeboard") {
							deckStore.moveCard(
								item.name,
								item.sourceBoard,
								targetBoard,
								item.id,
								item.price,
							);
						} else {
							deckStore.removeCard(
								item.name,
								item.sourceBoard,
								item.id,
							);
						}
					}
				});
			}
		}
	}

	/** @type {any[]} */
	const displayResults = $derived(searchStore.results);

	/** @param {WheelEvent} e */
	function handleWheel(e) {
		if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
			e.preventDefault();
			const container = /** @type {HTMLElement} */ (e.currentTarget);
			container.scrollLeft += e.deltaY;
		}
	}

	// The Stage: Container expands if searchStore is open
	const isExpanded = $derived(searchStore.isOpen);

	/** @param {Event} e */
	function handleScroll(e) {
		const target = /** @type {HTMLElement} */ (e.currentTarget);
		if (searchStore.totalResults < 500) {
			const scrollRemaining = target.scrollWidth - target.scrollLeft - target.clientWidth;
			// 40 cards * 152px card width = 6080px
			if (scrollRemaining < 6080) {
				searchStore.loadNextBatch();
			}
		}
	}

	$effect(() => {
		// Reset scroll position on query or page changes
		const _q = searchStore.query;
		const _p = searchStore.currentPage;
		if (gridContainer) {
			gridContainer.scrollLeft = 0;
		}
	});
</script>

<section
	class="search-panel"
	class:drag-over={isDraggingDeckCard}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	aria-label="Card search results and removal zone"
>
	{#if isDraggingDeckCard}
		<div class="remove-overlay" transition:fade={{ duration: 150 }}>
			<div class="remove-content">
				<Trash2 size={48} />
				<p>
					{searchStore.collection === "sideboard" ||
					searchStore.collection === "maybeboard"
						? `Move to ${searchStore.collection}`
						: "Remove from deck"}
				</p>
			</div>
		</div>
	{/if}
	{#if isExpanded}
		<div transition:slide={{ duration: 300 }} class="expanded-content">
			<div class="results-marginal-zone">
				{#if searchStore.isSearching || (searchStore.query.length >= 3 && searchStore.totalResults > 0) || (searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride)}
					<div class="results-marginal" transition:fade={{ duration: 150 }}>
						{#if searchStore.isSearching}
							<div class="spinner"></div>
							<span>Searching...</span>
						{:else if searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride}
							<span class="large-search-subheader-warning">
								Your search matches <span class="count">{searchStore.totalResults}</span> cards. 
								Narrow down your query, or 
								<button class="override-link-btn" onclick={() => searchStore.overrideLargeSearch()}>search anyway</button>.
							</span>
						{:else}
							<span>Found <span class="count">{searchStore.totalResults}</span> cards{#if searchStore.totalResults >= 500 && searchStore.totalResults > displayResults.length} (showing first {displayResults.length}){/if}.</span>
						{/if}
					</div>
				{/if}
			</div>

			<div bind:this={gridContainer} class="results-grid" onwheel={handleWheel} onscroll={handleScroll}>
				{#if searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride}
					<div class="status-container" in:fade={{ duration: 150 }}>
						<div class="status-msg">
							Search results hidden to protect performance.
						</div>
					</div>
				{:else if displayResults.length > 0}
					{#each displayResults as card, i (card.id)}
						<div class="staggered-card" style="--i: {i}">
							<Card
								{card}
								price={searchStore.collection === "scryfall"
									? card.prices?.usd || null
									: priceStore.getPrice(card.name)}
								inSearchPanel={true}
								index={i}
							/>
						</div>
					{/each}
				{:else}
					<div class="status-container" in:fade>
						{#if searchStore.error}
							<div class="status-msg error">
								{searchStore.error}
							</div>
						{:else if searchStore.query.length === 0}
							<div class="status-msg">
								{#if searchStore.collection === "sideboard" && deckStore.sideboard.length === 0}
									Sideboard Empty
								{:else if searchStore.collection === "maybeboard" && deckStore.maybeboard.length === 0}
									Maybeboard Empty
								{:else if !["sideboard", "maybeboard"].includes(searchStore.collection)}
									The void hungers for cards...
								{/if}
							</div>
						{:else if searchStore.query.length < 3}
							<div class="status-msg">
								Keep typing to find cards...
							</div>
						{:else if searchStore.isSearching}
							<div class="status-msg">Preparing results...</div>
						{:else if displayResults.length === 0 && searchStore.hasTriggered}
							<div class="status-msg">
								No cards found in this collection.
							</div>
						{:else}
							<div class="status-msg">Waiting for cards...</div>
						{/if}
					</div>
				{/if}
			</div>

			{#if searchStore.totalResults >= 500 && searchStore.showLargeSearchOverride && searchStore.query.length >= 3}
				<div class="search-pagination" transition:slide={{ duration: 200 }}>
					<button 
						disabled={searchStore.currentPage === 1} 
						onclick={() => searchStore.goToPage(1)}
						class="pagination-btn"
						aria-label="First page"
					>
						&laquo;
					</button>
					<button 
						disabled={searchStore.currentPage === 1} 
						onclick={() => searchStore.prevPage()}
						class="pagination-btn"
						aria-label="Previous page"
					>
						&lsaquo;
					</button>
					
					<span class="pagination-info" aria-live="polite">
						Page <span class="page-num">{searchStore.currentPage}</span> of <span class="page-num">{searchStore.totalPages}</span>
						<span class="matches-count">({searchStore.totalResults} matches)</span>
					</span>
					
					<button 
						disabled={searchStore.currentPage === searchStore.totalPages} 
						onclick={() => searchStore.nextPage()}
						class="pagination-btn"
						aria-label="Next page"
					>
						&rsaquo;
					</button>
					<button 
						disabled={searchStore.currentPage === searchStore.totalPages} 
						onclick={() => searchStore.goToPage(searchStore.totalPages)}
						class="pagination-btn"
						aria-label="Last page"
					>
						&raquo;
					</button>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.search-panel {
		background: hsl(var(--background));
		display: flex;
		flex-direction: column;
		overflow: hidden;
		position: relative;
	}

	.remove-overlay {
		position: absolute;
		inset: 0;
		background: hsla(var(--destructive) / 0.15);
		backdrop-filter: blur(8px);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		border: 2px dashed hsl(var(--destructive) / 0.4);
		margin: 8px;
		border-radius: var(--radius);
		pointer-events: none;
	}

	.remove-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		color: hsl(var(--destructive));
	}

	.remove-content p {
		font-weight: 700;
		font-size: 1.125rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.expanded-content {
		border-bottom: 1px solid hsl(var(--border));
		display: flex;
		flex-direction: column;
	}

	.results-marginal-zone {
		height: 32px;
		min-height: 32px;
		display: flex;
		align-items: center;
		padding: 4px 20px 0 20px;
		box-sizing: border-box;
	}

	.results-marginal {
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		gap: 0.5rem;
		user-select: none;
	}

	.results-marginal .count {
		color: hsl(var(--foreground));
		font-weight: 600;
	}

	.large-search-subheader-warning {
		color: hsl(var(--muted-foreground));
	}

	.override-link-btn {
		background: none;
		border: none;
		padding: 0;
		color: hsl(var(--foreground));
		text-decoration: underline;
		font-size: inherit;
		font-weight: 500;
		cursor: pointer;
	}

	.override-link-btn:hover {
		color: hsl(var(--primary));
	}

	.spinner {
		width: 14px;
		height: 14px;
		border: 2px solid hsl(var(--muted-foreground) / 0.3);
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.results-grid {
		display: flex;
		gap: var(--column-gap);
		padding: 8px var(--base-margin) 1.5rem var(--base-margin);
		overflow-x: scroll;
		overflow-y: hidden;
		align-items: flex-start;
		min-height: calc(var(--card-height) + 2.5rem + 6px);
		position: relative;
	}

	.status-container {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.results-grid::-webkit-scrollbar {
		height: 6px;
	}

	.staggered-card {
		opacity: 0;
		transform: translateY(10px);
		animation: card-pop-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
		animation-delay: calc(var(--i) * 50ms);
		flex-shrink: 0;
	}

	@keyframes card-pop-in {
		0% {
			opacity: 0;
			transform: scale(0.95) translateY(10px);
		}
		100% {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.results-grid::-webkit-scrollbar-track {
		background: transparent;
	}

	.results-grid::-webkit-scrollbar-thumb {
		background: hsl(var(--border));
		border-radius: var(--radius-sm);
	}

	.results-grid::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	.status-msg {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		font-weight: 500;
		height: 40px;
	}

	.status-msg.error {
		color: hsl(var(--destructive));
	}

	.spinner {
		width: 12px;
		height: 12px;
		border: 2px solid hsl(var(--border));
		border-top-color: hsl(var(--primary));
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	:global(.search-panel .card-container) {
		width: var(--card-width) !important;
		flex-shrink: 0;
	}

	.search-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: hsl(var(--muted) / 0.1);
		border-top: 1px solid hsl(var(--border));
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		height: 36px;
	}

	.pagination-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--background));
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-weight: 600;
		color: hsl(var(--foreground));
		transition: all 0.2s;
	}

	.pagination-btn:hover:not(:disabled) {
		background: hsl(var(--accent));
		border-color: hsl(var(--primary) / 0.3);
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		border-color: hsl(var(--border) / 0.5);
	}

	.pagination-info {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 500;
	}

	.page-num {
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.matches-count {
		color: hsl(var(--muted-foreground) / 0.8);
		font-size: 0.6875rem;
	}



	.override-link-btn {
		background: none;
		border: none;
		padding: 0;
		color: hsl(var(--primary));
		font-weight: 600;
		text-decoration: underline;
		cursor: pointer;
		display: inline;
		font-size: inherit;
		transition: color 0.2s;
	}

	.override-link-btn:hover {
		color: var(--accent-hover);
	}
</style>
