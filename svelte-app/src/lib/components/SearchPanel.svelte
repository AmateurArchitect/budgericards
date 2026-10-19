<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { toastStore } from "$lib/stores/toast.svelte.js";
	import { isCommanderFormat } from "$lib/constants/formats.js";
	import Card from "./Card.svelte";
	import Input from "./ui/Input.svelte";
	import SearchOptionsModal from "./SearchOptionsModal.svelte";
	import MultiSortModal from "./MultiSortModal.svelte";
	import { slide, fade, fly } from "svelte/transition";
	import {
		Search,
		Trash2,
		X,
		SlidersHorizontal,
		ArrowDownWideNarrow,
		HelpCircle,
		ChevronDown,
		PanelTop,
		PanelBottom,
		PanelLeft,
		Pin,
		PinOff
	} from "lucide-svelte";

	let isDraggingDeckCard = $state(false);
	let gridContainer = $state(/** @type {HTMLElement | null} */ (null));
	let showCollectionDropdown = $state(false);
	let showSearchOptions = $state(false);
	let showSearchSort = $state(false);
	/** @type {HTMLElement | null} */
	let searchSettingsBtn = $state(null);

	const searchPlaceholders = [
		"Lightning Bolt",
		"t:creature cmc<=2",
		"is:commander id=gw",
		"o:draw"
	];
	let placeholderIndex = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			placeholderIndex = (placeholderIndex + 1) % searchPlaceholders.length;
		}, 4000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (searchStore.isOpen) {
			setTimeout(() => {
				const inputEl =
					document.querySelector(".panel-search-input input") ||
					document.querySelector(".panel-search-input");
				/** @type {HTMLElement | null} */ (inputEl)?.focus();
			}, 60);
		}
	});

	const collections = [
		{ id: "scryfall", label: "All Cards (Scryfall)" },
		{ divider: true },
		{ id: "sideboard", label: "Deck Sideboard" },
		{ id: "maybeboard", label: "Deck Maybeboard" },
		{ divider: true },
		{ id: "budget-edh-26.2", label: "Budget EDH 26.2" },
		{ id: "budget-staples", label: "Budget Staples" },
	];

	const activeCollection = $derived(
		collections.find((c) => c.id === searchStore.collection) || collections[0]
	);

	const activeCollectionLabel = $derived(
		activeCollection?.label?.split(" (")[0] || "All Cards"
	);

	const isCustomSearchSortActive = $derived(
		Boolean(searchStore.activeSorts && searchStore.activeSorts.length > 0)
	);

	/** @param {string} id */
	function selectCollection(id) {
		searchStore.collection = id;
		showCollectionDropdown = false;
	}

	/** @param {any} card */
	function addSearchCard(card) {
		if (!card) return;
		const isLocalBoard = ["sideboard", "maybeboard"].includes(searchStore.collection);
		const currentBoard = searchStore.collection;
		const price =
			searchStore.collection === "scryfall"
				? card.prices?.usd
					? parseFloat(card.prices.usd)
					: null
				: priceStore.getPrice(card.name);

		if (isLocalBoard) {
			deckStore.moveCard(
				card.name,
				currentBoard,
				deckStore.activeBoard,
				card.id,
				price,
			);
		} else {
			let targetBoard = deckStore.activeBoard;
			const meta = card.type_line
				? card
				: deckStore.metadata[card.name?.toLowerCase()] || card;
			const typeLine = (meta.type_line || "").toLowerCase();
			const oracle = (meta.oracle_text || "").toLowerCase();
			const facesOracle = (meta.card_faces || [])
				.map((/** @type {any} */ f) => (f.oracle_text || "").toLowerCase())
				.join(" ");
			const isLegendaryCreature =
				typeLine.includes("legendary") && typeLine.includes("creature");
			const isPlaneswalker = typeLine.includes("planeswalker");
			const canBeCommander =
				oracle.includes("can be your commander") ||
				facesOracle.includes("can be your commander");
			const isCompanion =
				oracle.includes("companion —") ||
				facesOracle.includes("companion —");
			const isCommander = isCommanderFormat(deckStore.format);

			const isCommanderCandidate =
				isLegendaryCreature ||
				canBeCommander ||
				(deckStore.format === "Brawl" && isPlaneswalker);

			const isDeckEmpty = deckStore.totalCount === 0;
			const isFormatUnset =
				!deckStore.format ||
				deckStore.format === "List" ||
				deckStore.format === "None" ||
				deckStore.format === "Draft";

			if (isDeckEmpty && isFormatUnset && isCommanderCandidate) {
				deckStore.format = "Commander";
				targetBoard = "commander";
				toastStore.show(
					`Set format to Commander with ${card.name} as commander.`,
				);
			} else if (
				isCommander &&
				deckStore.commander.length === 0 &&
				isCommanderCandidate
			) {
				targetBoard = "commander";
			} else if (isCompanion && deckStore.companion.length === 0) {
				targetBoard = "companion";
			}
			deckStore.addCard(card.name, targetBoard, price, card);
		}
	}

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

	function handleDragLeave() {
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

	const isFewResults = $derived(
		!searchStore.isSearching &&
		searchStore.query.trim().length > 0 &&
		searchStore.totalResults > 0 &&
		searchStore.totalResults <= 8 &&
		displayResults.length > 0
	);
	const activeIndex = $derived(
		isFewResults ? Math.min(searchStore.highlightedIndex, displayResults.length - 1) : 0
	);
	const targetCard = $derived(isFewResults ? displayResults[activeIndex] : null);

	/** @param {WheelEvent} e */
	function handleWheel(e) {
		if (searchStore.panelPosition !== "left") {
			if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
				e.preventDefault();
				const container = /** @type {HTMLElement} */ (e.currentTarget);
				container.scrollLeft += e.deltaY;
			}
		}
	}

	const isExpanded = $derived(searchStore.isOpen);
	const isSideLayout = $derived(searchStore.panelPosition === 'left');

	/** @param {Event} e */
	function handleScroll(e) {
		const target = /** @type {HTMLElement} */ (e.currentTarget);
		if (searchStore.totalResults < 500) {
			if (searchStore.panelPosition === "left") {
				const scrollRemaining = target.scrollHeight - target.scrollTop - target.clientHeight;
				if (scrollRemaining < 1200) {
					searchStore.loadNextBatch();
				}
			} else {
				const scrollRemaining = target.scrollWidth - target.scrollLeft - target.clientWidth;
				if (scrollRemaining < 6080) {
					searchStore.loadNextBatch();
				}
			}
		}
	}

	$effect(() => {
		const _q = searchStore.query;
		const _p = searchStore.currentPage;
		if (gridContainer) {
			if (searchStore.panelPosition === "left") {
				gridContainer.scrollTop = 0;
			} else {
				gridContainer.scrollLeft = 0;
			}
		}
	});

	/** @param {HTMLElement} node */
	function smartAlign(node) {
		function align() {
			node.style.left = "0";
			node.style.right = "auto";
			const rect = node.getBoundingClientRect();
			if (rect.right > window.innerWidth - 10) {
				node.style.left = "auto";
				node.style.right = "0";
			}
		}
		align();
		window.addEventListener("resize", align);
		return {
			destroy() {
				window.removeEventListener("resize", align);
			},
		};
	}
</script>

<svelte:window 
	onclick={(e) => {
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target.closest('.collection-picker-container')) {
			showCollectionDropdown = false;
		}
	}}
/>

<section
	class="search-panel"
	class:is-docked={searchStore.isDocked}
	class:is-floating={!searchStore.isDocked}
	class:pos-below={searchStore.panelPosition === 'below'}
	class:pos-above={searchStore.panelPosition === 'above'}
	class:pos-left={searchStore.panelPosition === 'left'}
	class:drag-over={isDraggingDeckCard}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	aria-label="Card search panel"
>
	{#if isDraggingDeckCard}
		<div class="remove-overlay" transition:fade={{ duration: 150 }}>
			<div class="remove-content">
				<Trash2 size={44} />
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
		<div class="panel-inner-container">
			<!-- Reusable Header Component Snippets -->
			{#snippet searchInput(isFullWidth = false)}
				<div class="search-input-pill" class:full-width={isFullWidth}>
					<Search size={14} class="search-bar-icon" />
					<Input
						class="panel-search-input"
						placeholder={searchPlaceholders[placeholderIndex]}
						bind:value={searchStore.query}
						onfocus={() => searchStore.setFocus(true)}
						onblur={() => searchStore.setFocus(false)}
						onkeydown={(/** @type {KeyboardEvent} */ e) => {
							if (e.key === "Escape") {
								searchStore.closeSearch();
								return;
							}
							if (e.key === "Tab") {
								if (isFewResults) {
									e.preventDefault();
									searchStore.cycleHighlight(e.shiftKey ? -1 : 1);
								}
								return;
							}
							if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
								if (isFewResults && targetCard) {
									e.preventDefault();
									addSearchCard(targetCard);
									const inputEl = /** @type {HTMLInputElement | null} */ (e.target);
									inputEl?.select();
								}
							}
						}}
					/>
					{#if searchStore.query !== ""}
						<button
							type="button"
							class="clear-query-btn"
							title="Clear search query"
							onclick={() => (searchStore.query = "")}
						>
							<X size={13} />
						</button>
					{:else}
						<a
							href="https://scryfall.com/docs/syntax"
							target="_blank"
							rel="noopener noreferrer"
							class="syntax-help-btn"
							title="Scryfall search syntax guide"
						>
							<HelpCircle size={13} />
						</a>
					{/if}
				</div>
			{/snippet}

			{#snippet collectionPicker()}
				<div class="collection-picker-container">
					<button
						type="button"
						class="header-tool-btn collection-trigger-btn"
						onclick={(e) => {
							e.stopPropagation();
							showCollectionDropdown = !showCollectionDropdown;
						}}
						aria-expanded={showCollectionDropdown}
						title="Filter search collection"
					>
						<span class="collection-label-text">{activeCollectionLabel}</span>
						<ChevronDown size={13} class="chevron" />
					</button>

					{#if showCollectionDropdown}
						<div class="dropdown-menu-box" use:smartAlign transition:fly={{ y: 4, duration: 150 }}>
							{#each collections as item}
								{#if item.divider}
									<div class="menu-divider"></div>
								{:else if item.id}
									<button
										type="button"
										class="dropdown-item-btn"
										class:active={searchStore.collection === item.id}
										onclick={() => selectCollection(item.id)}
									>
										{item.label}
									</button>
								{/if}
							{/each}
						</div>
					{/if}
				</div>
			{/snippet}

			{#snippet headerActions()}
				<!-- Sort Button -->
				<button
					type="button"
					class="header-tool-btn"
					class:active={showSearchSort || isCustomSearchSortActive}
					onclick={() => (showSearchSort = !showSearchSort)}
					aria-label="Sort search results"
					title={isCustomSearchSortActive ? "Active sort configuration" : "Sort search results"}
				>
					<ArrowDownWideNarrow size={14} />
				</button>

				<!-- Settings / Options Button -->
				<button
					type="button"
					bind:this={searchSettingsBtn}
					class="header-tool-btn"
					class:active={showSearchOptions}
					onclick={() => (showSearchOptions = !showSearchOptions)}
					aria-label="Search filter options"
					title="Search options & filters"
				>
					<SlidersHorizontal size={14} />
				</button>

				<div class="bar-divider"></div>

				<!-- Position Toggles: Above, Below, Left -->
				<div class="position-toggle-group" role="group" aria-label="Search panel position">
					<button
						type="button"
						class="pos-btn"
						class:active={searchStore.panelPosition === 'above'}
						onclick={() => searchStore.setPanelPosition('above')}
						aria-label="Position above deck area"
						title="Position above deck area"
					>
						<PanelTop size={13} />
					</button>

					<button
						type="button"
						class="pos-btn"
						class:active={searchStore.panelPosition === 'below'}
						onclick={() => searchStore.setPanelPosition('below')}
						aria-label="Position below deck area"
						title="Position below deck area"
					>
						<PanelBottom size={13} />
					</button>

					<button
						type="button"
						class="pos-btn"
						class:active={searchStore.panelPosition === 'left'}
						onclick={() => searchStore.setPanelPosition('left')}
						aria-label="Position to the left (vertical)"
						title="Position to the left (vertical)"
					>
						<PanelLeft size={13} />
					</button>
				</div>

				<!-- Dock / Undock Toggle -->
				<button
					type="button"
					class="header-tool-btn dock-btn"
					class:active={searchStore.isDocked}
					onclick={() => searchStore.toggleDocked()}
					aria-label={searchStore.isDocked ? "Undock panel (Float)" : "Dock panel"}
					title={searchStore.isDocked ? "Undock panel (Float)" : "Dock panel to workspace"}
				>
					{#if searchStore.isDocked}
						<Pin size={13} />
					{:else}
						<PinOff size={13} />
					{/if}
				</button>

				<!-- Close Search Button -->
				<button
					type="button"
					class="close-panel-btn"
					onclick={() => searchStore.closeSearch()}
					aria-label="Close search (Esc)"
					title="Close search (Esc)"
				>
					<X size={14} />
				</button>
			{/snippet}

			<!-- Panel Integrated Control Bar -->
			<div class="panel-header-bar" class:is-side-layout={isSideLayout}>
				{#if isSideLayout}
					<!-- Row 1: Collection Picker on Left, Tools & Window Actions on Right -->
					<div class="header-top-row">
						{@render collectionPicker()}
						<div class="header-actions-group">
							{@render headerActions()}
						</div>
					</div>

					<!-- Row 2: Full-Width Search Input -->
					<div class="header-search-row">
						{@render searchInput(true)}
					</div>
				{:else}
					<!-- Single Horizontal Row (Above/Below shelf mode) -->
					{@render searchInput(false)}
					{@render collectionPicker()}
					{@render headerActions()}
				{/if}
			</div>

			<!-- Marginal Info / Autocomplete Row -->
			<div class="results-marginal-zone">
				{#if searchStore.isSearching || (searchStore.query.length >= 3 && searchStore.totalResults > 0) || (searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride) || (searchStore.totalResults > 0 && searchStore.totalResults <= 8)}
					<div class="results-marginal" transition:fade={{ duration: 150 }}>
						{#if searchStore.isSearching}
							<div class="spinner"></div>
							<span>Searching...</span>
						{:else if searchStore.totalResults >= 500 && !searchStore.showLargeSearchOverride}
							<span class="large-search-subheader-warning">
								Matches <span class="count">{searchStore.totalResults}</span> cards. 
								<button class="override-link-btn" onclick={() => searchStore.overrideLargeSearch()}>search anyway</button>.
							</span>
						{:else if isFewResults && targetCard}
							<div class="marginal-autocomplete-info">
								<span>Found <span class="count">{searchStore.totalResults}</span> {searchStore.totalResults === 1 ? 'card' : 'cards'}.</span>
								<span class="autocomplete-hint">
									{#if displayResults.length > 1}
										Press <kbd class="key-cap">Tab</kbd> to cycle or <kbd class="key-cap">↵ Enter</kbd> to add <strong class="card-highlight-name">{targetCard.name}</strong>
									{:else}
										Press <kbd class="key-cap">↵ Enter</kbd> to add <strong class="card-highlight-name">{targetCard.name}</strong>
									{/if}
								</span>
							</div>
						{:else}
							<span>Found <span class="count">{searchStore.totalResults}</span> cards{#if searchStore.totalResults >= 500 && searchStore.totalResults > displayResults.length} (showing first {displayResults.length}){/if}.</span>
						{/if}
					</div>
				{/if}
			</div>

			<!-- Results Grid (Horizontal Shelf vs Vertical Panel) -->
			<div
				bind:this={gridContainer}
				class="results-grid"
				class:is-vertical={searchStore.panelPosition === 'left'}
				onwheel={handleWheel}
				onscroll={handleScroll}
			>
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
								isHighlighted={isFewResults && i === activeIndex}
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
									Search for cards by name or syntax.
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

			<!-- Large Search Pagination Bar -->
			{#if searchStore.totalResults >= 500 && searchStore.showLargeSearchOverride && searchStore.query.length >= 3}
				<div class="search-pagination" transition:slide={{ duration: 180 }}>
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

	<SearchOptionsModal
		bind:isOpen={showSearchOptions}
		triggerElement={searchSettingsBtn}
	/>

	<MultiSortModal bind:isOpen={showSearchSort} target="search" />
</section>

<style>
	.search-panel {
		background: #0f1219;
		position: relative;
		user-select: none;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
	}

	/* Docked Mode (takes layout space) */
	.search-panel.is-docked {
		position: relative;
		z-index: 30;
	}

	.search-panel.is-docked.pos-above {
		border-bottom: 1px solid rgba(255, 255, 255, 0.1);
	}

	.search-panel.is-docked.pos-below {
		border-top: 1px solid rgba(255, 255, 255, 0.1);
	}

	.search-panel.is-docked.pos-left {
		width: 380px;
		height: 100%;
		max-height: 100%;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		flex-shrink: 0;
	}

	/* Floating Mode (hovers over canvas) */
	.search-panel.is-floating {
		position: fixed;
		z-index: 850;
		background: rgba(15, 18, 25, 0.94);
		backdrop-filter: blur(24px) saturate(160%);
		-webkit-backdrop-filter: blur(24px) saturate(160%);
		border: 1px solid rgba(255, 255, 255, 0.14);
		border-radius: 16px;
		box-shadow:
			0 24px 64px -8px rgba(0, 0, 0, 0.8),
			0 4px 16px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.12);
	}

	.search-panel.is-floating.pos-below {
		bottom: 0;
		left: 1.5rem;
		right: 1.5rem;
		max-height: 48vh;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom: none;
	}

	.search-panel.is-floating.pos-above {
		top: 3.5rem;
		left: 1.5rem;
		right: 1.5rem;
		max-height: 48vh;
	}

	.search-panel.is-floating.pos-left {
		top: 3.5rem;
		bottom: 0;
		left: 1.5rem;
		width: 380px;
		max-width: calc(100vw - 3rem);
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom: none;
	}

	.panel-inner-container {
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
	}

	/* Panel Integrated Header Bar */
	.panel-header-bar {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.03);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
		overflow-x: auto;
	}

	.panel-header-bar.is-side-layout {
		flex-direction: column;
		align-items: stretch;
		gap: 8px;
		padding: 10px 12px 8px 12px;
		overflow: visible;
	}

	.header-top-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
		gap: 6px;
	}

	.header-actions-group {
		display: flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	.header-search-row {
		display: flex;
		align-items: center;
		width: 100%;
	}

	.search-input-pill {
		display: flex;
		align-items: center;
		gap: 6px;
		flex: 1;
		min-width: 160px;
		height: 32px;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 9999px;
		padding: 0 10px;
		transition: all 0.15s ease;
	}

	.search-input-pill.full-width {
		flex: 1;
		width: 100%;
		min-width: 0;
		height: 34px;
	}

	.panel-header-bar.is-side-layout .collection-trigger-btn {
		height: 28px;
		padding: 0 8px;
		font-size: 0.78rem;
	}

	.panel-header-bar.is-side-layout .collection-label-text {
		max-width: 105px;
	}

	.panel-header-bar.is-side-layout .header-tool-btn {
		height: 28px;
		padding: 0 6px;
	}

	.panel-header-bar.is-side-layout .pos-btn {
		width: 24px;
		height: 24px;
	}

	.panel-header-bar.is-side-layout .position-toggle-group {
		padding: 1px;
	}

	.panel-header-bar.is-side-layout .close-panel-btn {
		width: 26px;
		height: 26px;
	}

	.search-input-pill:focus-within {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.25);
		background: rgba(255, 255, 255, 0.08);
	}

	:global(.search-bar-icon) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	:global(.panel-search-input) {
		flex: 1;
		border: none !important;
		background: transparent !important;
		padding: 0 !important;
		height: auto !important;
		font-size: 0.82rem !important;
		color: hsl(var(--foreground)) !important;
		box-shadow: none !important;
		outline: none !important;
	}

	.clear-query-btn, .syntax-help-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 2px;
		border-radius: 9999px;
	}

	.clear-query-btn:hover, .syntax-help-btn:hover {
		color: hsl(var(--foreground));
	}

	/* Header Action Buttons */
	.header-tool-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 30px;
		padding: 0 8px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-sm);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		font-size: 0.8rem;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.header-tool-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: hsl(var(--foreground));
	}

	.header-tool-btn.active {
		background: hsl(var(--primary) / 0.2);
		border-color: hsl(var(--primary));
		color: hsl(var(--primary-foreground, #ffffff));
	}

	.collection-picker-container {
		position: relative;
	}

	.collection-trigger-btn {
		gap: 6px;
		font-weight: 500;
	}

	.collection-label-text {
		max-width: 120px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.dropdown-menu-box {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		background: #141824;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-sm);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.7);
		min-width: 180px;
		padding: 4px;
		z-index: 1000;
	}

	.dropdown-item-btn {
		width: 100%;
		display: block;
		padding: 6px 10px;
		border: none;
		background: transparent;
		color: hsl(var(--foreground));
		font-size: 0.8rem;
		text-align: left;
		border-radius: 4px;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.dropdown-item-btn:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.dropdown-item-btn.active {
		background: hsl(var(--primary));
		color: #ffffff;
	}

	.menu-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.1);
		margin: 4px 0;
	}

	.bar-divider {
		width: 1px;
		height: 18px;
		background: rgba(255, 255, 255, 0.1);
		margin: 0 2px;
		flex-shrink: 0;
	}

	/* Position Toggles */
	.position-toggle-group {
		display: flex;
		align-items: center;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-sm);
		padding: 1px;
		flex-shrink: 0;
	}

	.pos-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 26px;
		height: 26px;
		background: transparent;
		border: none;
		border-radius: 3px;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.pos-btn:hover {
		color: hsl(var(--foreground));
	}

	.pos-btn.active {
		background: hsl(var(--primary));
		color: #ffffff;
	}

	.close-panel-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.close-panel-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		color: hsl(var(--foreground));
	}

	/* Marginal / Autocomplete */
	.results-marginal-zone {
		height: 28px;
		min-height: 28px;
		display: flex;
		align-items: center;
		padding: 2px 16px;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.search-panel.pos-left .results-marginal-zone {
		height: auto;
		min-height: 24px;
		padding: 4px 12px 6px 12px;
	}

	.search-panel.pos-left .results-marginal {
		font-size: 11px;
		flex-wrap: wrap;
	}

	.search-panel.pos-left .marginal-autocomplete-info {
		gap: 0.35rem;
		font-size: 11px;
	}

	.results-marginal {
		font-size: 12px;
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

	.marginal-autocomplete-info {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.autocomplete-hint {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.card-highlight-name {
		color: hsl(var(--foreground));
		font-weight: 600;
	}

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
		color: hsl(var(--foreground) / 0.85);
		background: hsl(var(--muted) / 0.8);
		border: 1px solid hsl(var(--border));
		border-radius: 3px;
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
		width: 12px;
		height: 12px;
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

	/* Results Grid */
	.results-grid {
		display: flex;
		gap: var(--column-gap, 12px);
		padding: 6px var(--base-margin, 16px) 16px var(--base-margin, 16px);
		position: relative;
		flex: 1;
		min-height: 220px;
	}

	/* Horizontal Mode (default / above / below) */
	.results-grid:not(.is-vertical) {
		overflow-x: auto;
		overflow-y: hidden;
		align-items: flex-start;
		min-height: calc(var(--card-height, 220px) + 2rem);
	}

	.results-grid:not(.is-vertical)::-webkit-scrollbar {
		height: 6px;
	}

	.results-grid:not(.is-vertical)::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	/* Vertical Mode (left side) */
	.results-grid.is-vertical {
		flex-direction: column;
		overflow-y: auto;
		overflow-x: hidden;
		align-items: center;
		padding: 8px 12px;
		gap: 10px;
	}

	.results-grid.is-vertical::-webkit-scrollbar {
		width: 6px;
	}

	.results-grid.is-vertical::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.2);
		border-radius: 3px;
	}

	.staggered-card {
		opacity: 0;
		transform: translateY(8px);
		animation: card-pop-in 350ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
		animation-delay: calc(var(--i) * 35ms);
		flex-shrink: 0;
	}

	.results-grid.is-vertical .staggered-card {
		width: 100%;
		display: flex;
		justify-content: center;
	}

	@keyframes card-pop-in {
		0% {
			opacity: 0;
			transform: scale(0.96) translateY(8px);
		}
		100% {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	.status-container {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.status-msg {
		color: hsl(var(--muted-foreground));
		font-size: 0.85rem;
		text-align: center;
		padding: 1rem;
	}

	.status-msg.error {
		color: hsl(var(--destructive));
	}

	/* Drag-drop Remove Overlay */
	.remove-overlay {
		position: absolute;
		inset: 0;
		background: rgba(220, 38, 38, 0.85);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
	}

	.remove-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: white;
		font-weight: 600;
		font-size: 1.1rem;
	}

	/* Pagination */
	.search-pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 6px 12px;
		background: rgba(0, 0, 0, 0.2);
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		flex-shrink: 0;
	}

	.pagination-btn {
		padding: 3px 8px;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		cursor: pointer;
		font-size: 0.8rem;
	}

	.pagination-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.pagination-info {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.pagination-info .page-num {
		color: hsl(var(--foreground));
		font-weight: 600;
	}
</style>
