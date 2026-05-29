<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import Card from "./Card.svelte";
	import Badge from "./ui/Badge.svelte";
	import { slide, scale, fade } from "svelte/transition";
	import { flip } from "svelte/animate";
	import { quadOut, cubicOut, backOut } from "svelte/easing";
	import {
		ArrowDownWideNarrow,
		Plus,
		ChevronDown,
		Trash2,
		Filter,
		X,
		ArrowUp,
		ArrowDown,
		ArrowUpDown,
		MoveUp,
		MoveDown,
		RotateCcw,
		ArrowLeft,
		ArrowRight,
		Check,
		GripVertical,
	} from "lucide-svelte";

	/** @param {DragEvent} e */
	function handleDragOver(e) {
		if (!e.dataTransfer) return;

		// Ignore if we're dragging a sort pill
		if (e.dataTransfer.types.includes("application/x-sort-pill")) {
			return;
		}

		e.preventDefault();

		// Check if we're dragging a deck card
		const isDeckCard = e.dataTransfer.types.includes(
			"application/x-budgericard",
		);
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

		// Ignore if we're dragging a sort pill
		if (e.dataTransfer.types.includes("application/x-sort-pill")) {
			return;
		}

		e.preventDefault();
		isDraggingDeckCard = false;

		const dataStr = e.dataTransfer.getData("application/x-budgericard");
		if (dataStr) {
			const data = JSON.parse(dataStr);
			if (data.fromDeck) {
				const collection = searchStore.collection;
				const targetBoard =
					collection === "deleted" ? "garbage" : collection;

				if (collection === "sideboard" || collection === "maybeboard") {
					// Move from Main Deck to the current open board
					deckStore.moveCard(
						data.name,
						deckStore.activeBoard,
						targetBoard,
						data.id,
						data.price,
					);
				} else {
					// Delete (move to garbage)
					deckStore.removeCard(
						data.name,
						deckStore.activeBoard,
						data.id,
					);
				}
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

	// The Stage: Container expands if searching or results exist
	const isExpanded = $derived(searchStore.isExpanded);

	import { deckStore } from "$lib/stores/deck.svelte.js";

	let isDraggingDeckCard = $state(false);
	let showAddSortDropdown = $state(false);
	let activeMenuIndex = $state(-1);
	let draggedIndex = $state(-1);

	const sortOptions = [
		{ id: "color-cat", label: "Color Category" },
		{ id: "cmc", label: "Mana Value" },
		{ id: "type", label: "Card Type" },
		{ id: "name", label: "Alphabetical" },
		{ id: "price", label: "Price" },
		{ id: "rarity", label: "Rarity" },
	];

	const availableSortOptions = $derived(
		sortOptions.filter(
			(opt) => !searchStore.activeSorts.some((s) => s.type === opt.id),
		),
	);

	/** @param {string} id */
	function addSort(id) {
		searchStore.setSort(id);
		showAddSortDropdown = false;
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} index
	 */
	function handlePillDragStart(e, index) {
		if (!e.dataTransfer) return;
		e.stopPropagation();
		draggedIndex = index;
		e.dataTransfer.effectAllowed = "move";
		e.dataTransfer.setData("application/x-sort-pill", index.toString());
		e.dataTransfer.setData("text/plain", index.toString());
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} index
	 */
	function handlePillDragOver(e, index) {
		if (!e.dataTransfer || draggedIndex === -1) return;
		e.stopPropagation();
		e.preventDefault();

		if (draggedIndex === index) return;

		// Detect if mouse is on left or right half of the pill
		const rect = /** @type {HTMLElement} */ (
			e.currentTarget
		).getBoundingClientRect();
		const relX = e.clientX - rect.left;
		const isRightHalf = relX > rect.width / 2;

		// Set drop effect
		e.dataTransfer.dropEffect = "move";

		// Update indicator (we'll use a data attribute for CSS)
		const wrapper = /** @type {HTMLElement} */ (e.currentTarget);
		wrapper.dataset.dropSide = isRightHalf ? "right" : "left";
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} index
	 */
	function handlePillDrop(e, index) {
		if (!e.dataTransfer || draggedIndex === -1) return;
		e.stopPropagation();
		e.preventDefault();

		const wrapper = /** @type {HTMLElement} */ (e.currentTarget);
		const isRightHalf = wrapper.dataset.dropSide === "right";

		// Calculate final target index
		let targetIndex = index;
		if (isRightHalf) targetIndex = index + 1;

		// Adjust for the fact that removing the 'from' item shifts everything
		if (draggedIndex < targetIndex) targetIndex--;

		searchStore.reorderSort(draggedIndex, targetIndex);
		draggedIndex = -1;

		// Cleanup all indicators
		document.querySelectorAll(".sort-pill-wrapper").forEach((w) => {
			delete (/** @type {HTMLElement} */ (w).dataset.dropSide);
		});
	}

	/** @param {DragEvent} e */
	function handleContainerDragOver(e) {
		if (!e.dataTransfer || draggedIndex === -1) return;

		// If we're dragging a sort pill, we MUST preventDefault to allow drop
		if (e.dataTransfer.types.includes("application/x-sort-pill")) {
			e.preventDefault();
			e.dataTransfer.dropEffect = "move";
		}
	}

	/** @param {DragEvent} e */
	function handleContainerDrop(e) {
		if (!e.dataTransfer || draggedIndex === -1) return;
		if (e.dataTransfer.types.includes("application/x-sort-pill")) {
			e.preventDefault();
			// Default to moving to the end if dropped on container
			searchStore.reorderSort(
				draggedIndex,
				searchStore.activeSorts.length - 1,
			);
			draggedIndex = -1;
		}
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} targetIndex
	 */
	function handleTargetDrop(e, targetIndex) {
		if (!e.dataTransfer || draggedIndex === -1) return;
		e.stopPropagation();
		e.preventDefault();

		// If moving forward, the index shifts
		let finalIndex = targetIndex;
		if (draggedIndex < targetIndex) finalIndex--;

		searchStore.reorderSort(draggedIndex, Math.max(0, finalIndex));
		draggedIndex = -1;

		// Cleanup indicators
		document
			.querySelectorAll(".sort-target")
			.forEach(
				(t) => delete (/** @type {HTMLElement} */ (t).dataset.isOver),
			);
	}

	/** @param {DragEvent} e */
	function handlePillDragEnd(e) {
		draggedIndex = -1;
		// Cleanup indicators
		const wrappers = document.querySelectorAll(".sort-pill-wrapper");
		wrappers.forEach(
			(w) => delete (/** @type {HTMLElement} */ (w).dataset.dropSide),
		);
	}

	// Click outside to close menus
	/** @param {MouseEvent} e */
	function handleClickOutside(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (
			!target.closest(".sort-pill-wrapper") &&
			!target.closest(".add-sort-container")
		) {
			activeMenuIndex = -1;
			showAddSortDropdown = false;
		}
	}

	let gridContainer = $state(/** @type {HTMLElement | null} */ (null));

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

<svelte:window onclick={handleClickOutside} />

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
			<div class="results-info">
				<div class="info-left">
					{#if searchStore.isSearching}
						<div class="spinner"></div>
						<span>Searching...</span>
					{:else if searchStore.query.length >= 3}
						{#if searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride}
							<span>Found <span class="count">{searchStore.totalResults}</span> matches.</span>
						{:else}
							<span>Found <span class="count">{searchStore.totalResults}</span> cards{#if searchStore.totalResults >= 500 && searchStore.totalResults > displayResults.length} (showing first {displayResults.length}){/if}.</span>
						{/if}
					{:else if searchStore.query.length > 0}
						<span>Keep typing...</span>
					{/if}
				</div>

				{#if displayResults.length > 0}
					<div class="info-right" transition:fade>
						<div
							class="sort-pills-container"
							role="list"
							ondragover={handleContainerDragOver}
							ondrop={handleContainerDrop}
						>
							{#if searchStore.activeSorts.length > 0}
								<span
									class="sorted-by-label"
									transition:fade={{
										duration: 300,
										delay: 150,
									}}>Sorted by</span
								>
								<div
									class="active-sorts-group"
									class:is-only-sort={searchStore.activeSorts
										.length === 1}
								>
									<div
										class="sort-target start-target"
										transition:fade={{ duration: 300 }}
										role="presentation"
										ondragover={(e) => {
											if (draggedIndex === -1) return;
											e.preventDefault();
											e.stopPropagation();
											/** @type {HTMLElement} */ (
												e.currentTarget
											).dataset.isOver = "true";
										}}
										ondragleave={(e) =>
											delete (
												/** @type {HTMLElement} */ (
													e.currentTarget
												).dataset.isOver
											)}
										ondrop={(e) => handleTargetDrop(e, 0)}
									></div>

									{#each searchStore.activeSorts as sort, i (sort.type)}
										<div
											class="sort-pill-wrapper"
											transition:fade={{ duration: 300 }}
											draggable="true"
											role="listitem"
											aria-label="Sort by {searchStore
												.sortLabels[sort.type]}"
											ondragstart={(e) =>
												handlePillDragStart(e, i)}
											ondragover={(e) =>
												handlePillDragOver(e, i)}
											ondragleave={(e) => {
												delete (
													/** @type {HTMLElement} */ (
														e.currentTarget
													).dataset.dropSide
												);
											}}
											ondrop={(e) => handlePillDrop(e, i)}
											ondragend={handlePillDragEnd}
											class:is-dragging={draggedIndex ===
												i}
										>
											<button
												class="sort-pill"
												class:active={activeMenuIndex ===
													i}
												onclick={() =>
													(activeMenuIndex =
														activeMenuIndex === i
															? -1
															: i)}
												type="button"
											>
												<GripVertical
													size={10}
													class="drag-handle"
												/>
												<span class="pill-label"
													>{searchStore.sortLabels[
														sort.type
													]}</span
												>
												<ChevronDown
													size={10}
													class="pill-chevron"
												/>
											</button>

											{#if activeMenuIndex === i}
												<div
													class="pill-menu"
													transition:scale={{
														duration: 150,
														start: 0.95,
														easing: quadOut,
													}}
												>
													<div class="menu-section">
														{#each ["default", "reverse"] as mode}
															<button
																class="menu-item order-item"
																class:active={sort.direction ===
																	mode ||
																	(sort.direction ===
																		"default" &&
																		searchStore.getDefaultDirection(
																			sort.type,
																		) ===
																			mode)}
																onclick={() => {
																	searchStore.setSortOrder(
																		i,
																		mode,
																	);
																	activeMenuIndex =
																		-1;
																}}
															>
																<span
																	class="label-text"
																>
																	{searchStore
																		.sortOrderLabels[
																		sort
																			.type
																	][mode]}
																</span>
																{#if sort.direction === mode || (sort.direction === "default" && searchStore.getDefaultDirection(sort.type) === mode)}
																	<Check
																		size={12}
																		class="check-icon"
																	/>
																{/if}
															</button>
														{/each}
													</div>

													{#if searchStore.activeSorts.length > 1}
														<div
															class="menu-divider"
														></div>

														<div
															class="menu-section"
														>
															{#if i > 0}
																<button
																	class="menu-item position-item"
																	onclick={() => {
																		searchStore.moveSort(
																			i,
																			-1,
																		);
																		activeMenuIndex =
																			i -
																			1;
																	}}
																>
																	<span
																		class="label-text"
																		>Higher
																		Priority</span
																	>
																	<ArrowLeft
																		size={12}
																		class="menu-icon-right"
																	/>
																</button>
															{/if}
															{#if i < searchStore.activeSorts.length - 1}
																<button
																	class="menu-item position-item"
																	onclick={() => {
																		searchStore.moveSort(
																			i,
																			1,
																		);
																		activeMenuIndex =
																			i +
																			1;
																	}}
																>
																	<span
																		class="label-text"
																		>Lower
																		Priority</span
																	>
																	<ArrowRight
																		size={12}
																		class="menu-icon-right"
																	/>
																</button>
															{/if}
														</div>
													{/if}

													<div
														class="menu-divider"
													></div>

													<button
														class="menu-item delete-item"
														onclick={() => {
															searchStore.removeSort(
																i,
															);
															activeMenuIndex =
																-1;
														}}
													>
														<span class="label-text"
															>Remove Sort</span
														>
														<X
															size={12}
															class="menu-icon-right"
														/>
													</button>
												</div>
											{/if}
										</div>
									{/each}

									<div
										class="sort-target end-target"
										transition:fade={{ duration: 300 }}
										role="presentation"
										ondragover={(e) => {
											if (draggedIndex === -1) return;
											e.preventDefault();
											e.stopPropagation();
											/** @type {HTMLElement} */ (
												e.currentTarget
											).dataset.isOver = "true";
										}}
										ondragleave={(e) =>
											delete (
												/** @type {HTMLElement} */ (
													e.currentTarget
												).dataset.isOver
											)}
										ondrop={(e) =>
											handleTargetDrop(
												e,
												searchStore.activeSorts.length,
											)}
									></div>
								</div>
							{/if}

							{#if searchStore.activeSorts.length < 3}
								<div class="add-sort-container">
									<button
										class="add-sort-btn"
										class:has-text={searchStore.activeSorts
											.length === 0}
										onclick={() =>
											(showAddSortDropdown =
												!showAddSortDropdown)}
										aria-label="Add sort factor"
										title="Add sort factor"
									>
										{#if searchStore.activeSorts.length === 0}
											<span class="btn-text">Sort</span>
										{/if}
										<Plus size={14} />
									</button>

									{#if showAddSortDropdown}
										<div
											class="add-sort-menu"
											transition:scale={{
												duration: 150,
												start: 0.95,
												easing: quadOut,
											}}
										>
											{#each availableSortOptions as opt}
												<button
													class="menu-item"
													onclick={() =>
														addSort(opt.id)}
												>
													{opt.label}
												</button>
											{/each}
										</div>
									{/if}
								</div>
							{/if}

							{#if searchStore.activeSorts.length > 0}
								<button
									class="reset-sort-btn"
									onclick={() => searchStore.clearSorts()}
									transition:fade={{ duration: 200 }}
									aria-label="Reset sorting to default"
									title="Reset sorting to default"
								>
									<RotateCcw size={14} />
								</button>
							{/if}
						</div>
					</div>
				{/if}
			</div>

			<div bind:this={gridContainer} class="results-grid" onwheel={handleWheel} onscroll={handleScroll}>
				{#if searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride}
					<div class="large-search-warning" transition:fade={{ duration: 150 }}>
						<div class="warning-box">
							<Filter size={16} class="warning-icon" />
							<span class="warning-text">
								Your search matches <strong class="matches-count-bold">{searchStore.totalResults}</strong> cards. 
								Narrow down your query, or 
								<button class="override-link-btn" onclick={() => searchStore.overrideLargeSearch()}>search anyway</button>.
							</span>
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
								{:else if searchStore.collection === "deleted" && deckStore.garbage.length === 0}
									Recently Deleted Cards Empty
								{:else if !["sideboard", "maybeboard", "deleted"].includes(searchStore.collection)}
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

			{#if searchStore.totalResults >= 500}
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

	.results-info {
		padding: 0 1.25rem;
		background: hsl(var(--muted) / 0.15);
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border));
		z-index: 50;
		height: 36px;
	}

	.info-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.info-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.sort-pills-container {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.25rem;
		min-height: 32px;
	}

	.sorted-by-label {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		padding: 0 0.5rem;
		white-space: nowrap;
	}

	.active-sorts-group {
		display: flex;
		align-items: center;
		gap: 0.1rem;
	}

	.sort-target {
		width: 0;
		height: 24px;
		position: relative;
		overflow: visible;
	}

	.sort-target::before {
		content: "";
		position: absolute;
		left: -12px;
		right: -12px;
		top: 0;
		bottom: 0;
		z-index: 5;
	}

	.sort-target:global([data-is-over="true"]) {
		background: none;
	}

	.sort-target:global([data-is-over="true"])::after {
		content: "";
		position: absolute;
		left: 50%;
		top: 0;
		bottom: 0;
		width: 2px;
		background: hsl(var(--primary));
		transform: translateX(-50%);
		z-index: 20;
		box-shadow: 0 0 8px hsl(var(--primary) / 0.5);
	}

	.sort-pill-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.sort-pill-wrapper::after {
		content: "";
		width: 1px;
		height: 12px;
		background: hsl(var(--border));
	}

	.active-sorts-group::before {
		content: "";
		width: 1px;
		height: 12px;
		background: hsl(var(--border));
	}

	.sort-pill-wrapper.is-dragging {
		opacity: 0.3;
		transform: scale(0.95);
	}

	.sort-pill-wrapper:global([data-drop-side="left"])::before {
		content: "";
		position: absolute;
		left: -0.5px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: hsl(var(--primary));
		z-index: 20;
		box-shadow: 0 0 8px hsl(var(--primary) / 0.5);
	}

	.sort-pill-wrapper:global([data-drop-side="right"])::after {
		content: "";
		position: absolute;
		right: -0.5px;
		top: 0;
		bottom: 0;
		width: 2px;
		background: hsl(var(--primary));
		z-index: 20;
		box-shadow: 0 0 8px hsl(var(--primary) / 0.5);
	}

	.sort-pill {
		height: 24px;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0 0.25rem 0 0;
		background: transparent;
		border: none;
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		font-size: 0.6875rem;
		font-weight: 600;
		cursor: grab;
		transition: all 0.2s;
		white-space: nowrap;
		user-select: none;
	}

	.sort-pill:hover {
		background: hsl(var(--muted) / 0.5);
		padding: 0 0.5rem 0 0.25rem;
		color: hsl(var(--foreground));
	}

	.sort-pill.active {
		background: hsl(var(--accent));
		padding: 0 0.5rem 0 0.25rem;
		color: hsl(var(--foreground));
	}

	:global(.drag-handle),
	:global(.pill-chevron) {
		color: hsl(var(--muted-foreground));
		opacity: 0;
		transition: opacity 0.2s;
	}

	.sort-pill:hover :global(.drag-handle),
	.sort-pill.active :global(.drag-handle),
	.sort-pill:hover :global(.pill-chevron),
	.sort-pill.active :global(.pill-chevron) {
		opacity: 0.5;
	}

	.active-sorts-group.is-only-sort :global(.drag-handle) {
		opacity: 0 !important;
		pointer-events: none;
	}

	.sort-pill:active {
		cursor: grabbing;
	}

	.sort-pill:hover,
	.sort-pill.active {
		background: hsl(var(--accent) / 0.8);
		border-color: hsl(var(--primary) / 0.3);
	}

	:global(.order-icon) {
		opacity: 0.6;
	}

	.pill-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 180px;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		box-shadow: var(--shadow-xl);
		padding: 6px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		z-index: 100;
	}

	.menu-section {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.menu-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 6px 10px;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		border-radius: calc(var(--radius) - 4px);
		cursor: pointer;
		text-align: left;
		transition: all 0.15s;
	}

	.menu-item.order-item {
		justify-content: space-between;
	}

	:global(.menu-icon-right) {
		margin-left: auto;
		opacity: 0.5;
	}

	:global(.check-icon) {
		color: hsl(var(--primary));
	}

	.menu-item:hover:not(:disabled) {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	.menu-item:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.menu-item.active {
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.delete-item {
		color: hsl(var(--destructive));
	}

	.delete-item:hover:not(:disabled) {
		background: hsl(var(--destructive) / 0.1) !important;
		color: hsl(var(--destructive)) !important;
	}

	.menu-divider {
		height: 1px;
		background: hsl(var(--border));
		margin: 4px;
	}

	.add-sort-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.add-sort-container::after {
		content: "";
		width: 1px;
		height: 12px;
		background: hsl(var(--border));
		margin-left: 0.35rem;
	}

	.add-sort-btn {
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		background: none;
		border: none;
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s;
		padding: 0 0.5rem;
		font-size: 0.6875rem;
		font-weight: 600;
	}

	.add-sort-btn.has-text {
		padding-left: 0.75rem;
		padding-right: 0.5rem;
	}

	.btn-text {
		color: hsl(var(--foreground));
	}

	.reset-sort-btn {
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s;
	}

	.reset-sort-btn:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
		border-color: hsl(var(--destructive) / 0.3);
	}

	.add-sort-btn:hover {
		background: hsl(var(--accent) / 0.5);
		color: hsl(var(--foreground));
		border-color: hsl(var(--primary) / 0.3);
	}

	.add-sort-menu {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 160px;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		box-shadow: var(--shadow-xl);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		z-index: 100;
	}

	.results-grid {
		display: flex;
		gap: var(--column-gap);
		padding: 1rem var(--base-margin) 1.5rem var(--base-margin);
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
		transform: scale(0);
		animation: card-pop-in 450ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
		animation-delay: calc(var(--i) * 50ms);
		flex-shrink: 0;
	}

	@keyframes card-pop-in {
		0% {
			opacity: 0;
			transform: scale(0.5) translateY(10px);
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

	.large-search-warning {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem 2rem;
		width: 100%;
	}

	.warning-box {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border));
		padding: 0.75rem 1.25rem;
		border-radius: var(--radius);
		max-width: 600px;
		line-height: 1.4;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
	}

	:global(.warning-box .warning-icon) {
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.matches-count-bold {
		color: hsl(var(--foreground));
		font-weight: 700;
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
