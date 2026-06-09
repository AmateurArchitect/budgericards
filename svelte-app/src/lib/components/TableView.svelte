<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { checkLegality } from "$lib/utils/legality.js";
	import { getGroupedCategories } from "$lib/layouts/grouping.svelte.js";
	import { fade } from "svelte/transition";
	import { onMount } from "svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import { SvelteSet } from "svelte/reactivity";
	import {
		MoreVertical,
		Trash2,
		Info,
		ChevronDown,
		AlertTriangle,
		ArrowUp,
		ArrowDown,
		Plus,
		X,
		Star
	} from "lucide-svelte";

	let isDragOver = $state(false);
	let lastSorting = $state(deckStore.sorting);
	let collapsedCategories = $state(new SvelteSet());

	/** @param {string} categoryName */
	function toggleCategoryCollapse(categoryName) {
		if (collapsedCategories.has(categoryName)) {
			collapsedCategories.delete(categoryName);
		} else {
			collapsedCategories.add(categoryName);
		}
	}

	// Selection Visible IDs sync
	$effect(() => {
		/** @type {string[]} */
		const visibleIds = [];
		for (const cat of groupedCategories) {
			for (const cardRow of cat.cards) {
				for (const inst of cardRow.instances) {
					visibleIds.push(inst.id);
				}
			}
		}
		interactionStore.currentVisibleCardIds = visibleIds;
	});

	// Tag states & dragging
	let activeTagsPopoverCardId = $state(null);
	let newTagValue = $state("");

	const deckTagsList = $derived.by(() => {
		const tags = new Set();
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			if (storeAny[board]) {
				const list = storeAny[board] || [];
				for (const c of list) {
					if (c.tags) {
						for (const t of c.tags) {
							tags.add(t);
						}
					}
				}
			}
		}
		return Array.from(tags).sort();
	});

	/** @param {string} tag */
	function getTagBgColor(tag) {
		let hash = 0;
		for (let i = 0; i < tag.length; i++) {
			hash = tag.charCodeAt(i) + ((hash << 5) - hash);
		}
		const h = Math.abs(hash) % 360;
		return `hsl(${h}, 25%, 35%)`;
	}

	/** @type {number | null} */
	let draggedTagIdx = null;
	/** @type {string | null} */
	let draggedTagCardId = null;

	/**
	 * @param {DragEvent} e
	 * @param {string} cardId
	 * @param {number} idx
	 */
	function handleTagDragStart(e, cardId, idx) {
		draggedTagIdx = idx;
		draggedTagCardId = cardId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
		}
	}

	/**
	 * @param {DragEvent} e
	 * @param {string} cardId
	 * @param {number} targetIdx
	 */
	function handleTagDrop(e, cardId, targetIdx) {
		e.preventDefault();
		if (draggedTagCardId !== cardId || draggedTagIdx === null) return;
		
		const cardRes = deckStore.findCardById(cardId);
		if (cardRes && cardRes.card && cardRes.card.tags) {
			const tags = [...cardRes.card.tags];
			const [removed] = tags.splice(draggedTagIdx, 1);
			tags.splice(targetIdx, 0, removed);
			deckStore.reorderCardTags(cardId, tags);
		}
		draggedTagIdx = null;
		draggedTagCardId = null;
	}

	// Inline Overrides states
	let editingCmcCardId = $state(null);
	let editingTypeCardId = $state(null);
	let editingColorCardId = $state(null);

	let inlineCmcVal = $state("");
	let inlineTypeVal = $state("");

	let editingCardName = $state(null);
	let editingCardZone = $state(null);
	let localQtyText = $state("");

	/** @param {any} cardRow */
	function handleQtySubmit(cardRow) {
		if (
			editingCardName !== cardRow.name ||
			editingCardZone !== cardRow.zone
		)
			return;

		const parsed = parseInt(localQtyText, 10);
		if (isNaN(parsed) || parsed <= 0) {
			deckStore.removeAllCopies(cardRow.name, cardRow.zone);
		} else {
			deckStore.setQuantity(
				cardRow.name,
				cardRow.zone,
				parsed,
				cardRow.price,
				cardRow.card,
			);
		}

		editingCardName = null;
		editingCardZone = null;
	}

	/**
	 * @param {KeyboardEvent} e
	 * @param {any} cardRow
	 */
	function handleQtyKeyDown(e, cardRow) {
		if (e.key === "Enter") {
			e.preventDefault();
			handleQtySubmit(cardRow);
		} else if (e.key === "Escape") {
			e.preventDefault();
			editingCardName = null;
			editingCardZone = null;
		}
	}

	/** @param {HTMLInputElement} node */
	function focusOnMount(node) {
		node.focus();
		const val = node.value;
		node.value = "";
		node.value = val;
	}

	$effect(() => {
		if (deckStore.sorting !== lastSorting) {
			lastSorting = deckStore.sorting;
			deckStore.sortAscending =
				lastSorting !== "price" && lastSorting !== "added";
		}
	});

	/** @param {string} columnId */
	function handleHeaderClick(columnId) {
		/** @type {Record<string, string>} */
		const colToSortId = {
			qty: "qty",
			name: "name",
			mana: "mana",
			cmc: "cmc",
			type: "type",
			printing: "printing",
			"color-cat": "color",
			"color-id": "color",
			price: "price",
		};

		const sortFactor = colToSortId[columnId];
		if (!sortFactor) return;

		const defaultAsc = sortFactor !== "price" && sortFactor !== "added";

		if (deckStore.sorting === sortFactor) {
			const isCurrentlyDefault = deckStore.sortAscending === defaultAsc;
			if (isCurrentlyDefault) {
				deckStore.sortAscending = !defaultAsc;
			} else {
				// Toggle off back to natural default sorting
				const fallback =
					deckStore.grouping === "color" ? "cmc" : "color";
				deckStore.sorting = fallback;
				deckStore.sortAscending = true;
			}
		} else {
			deckStore.sorting = sortFactor;
			deckStore.sortAscending = defaultAsc;
		}
	}

	// Parse mana symbols from Scryfall format (e.g. {3}{W}{U} -> ['3', 'w', 'u'])
	/**
	 * @param {string} manaCostStr
	 * @returns {string[]}
	 */
	function parseManaCost(manaCostStr) {
		if (!manaCostStr) return [];
		const matches = manaCostStr.match(/\{[^}]+\}/g);
		if (!matches) return [];
		/** @type {string[]} */
		const result = [];
		for (const m of matches) {
			result.push(m.slice(1, -1).toLowerCase().replace("/", ""));
		}
		return result;
	}

	// Calculate a human-readable color category word
	/**
	 * @param {any} cardRow
	 * @returns {string}
	 */
	function getColorCategory(cardRow) {
		const type = (cardRow.type || "").toLowerCase();
		if (type.includes("land")) return "Land";
		const colors = cardRow.colors || [];
		if (colors.length === 0) return "Colorless";
		if (colors.length > 1) return "Multicolor";
		/** @type {Record<string, string>} */
		const colorNames = {
			W: "White",
			U: "Blue",
			B: "Black",
			R: "Red",
			G: "Green",
		};
		return colorNames[colors[0]] || "Colorless";
	}

	// Group and sort card rows Reactively in Svelte 5
	const groupedCategories = $derived.by(getGroupedCategories);

	// Drag & Drop handlers
	/**
	 * @param {DragEvent} e
	 */
	function handleDragOver(e) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	/**
	 * @param {DragEvent} e
	 */
	async function handleDrop(e) {
		isDragOver = false;
		if (!e.dataTransfer) return;
		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (internalData) {
			e.preventDefault();
			e.stopPropagation();
			const data = JSON.parse(internalData);

			if (!data.fromDeck || data.sourceBoard !== deckStore.activeBoard) {
				const isLocalSource = [
					"sideboard",
					"maybeboard",
					"garbage",
					"commander",
					"companion",
					"mainboard",
				].includes(data.sourceBoard);

				if (data.sourceBoard !== deckStore.activeBoard) {
					if (isLocalSource) {
						deckStore.moveCard(
							data.name,
							data.sourceBoard,
							deckStore.activeBoard,
							data.id,
							data.price,
						);
					} else {
						deckStore.addCard(
							data.name,
							deckStore.activeBoard,
							data.price,
							data.card,
						);
					}
				}
			}
		}
	}

	// Dynamic Category Scroll Tracking to Fade Out Covered Sticky Header Contents
	/** @type {HTMLDivElement | null} */
	let tableWrapperEl = $state(null);
	let stuckCategories = $state(new Set());
	let activeCategoryName = $state("");

	function handleScroll() {
		if (!tableWrapperEl) return;
		const headerElements = tableWrapperEl.querySelectorAll(
			".category-header-row",
		);

		// The top boundary of the sticky area is the thead height (38px)
		const stickyThreshold = tableWrapperEl.getBoundingClientRect().top + 38;

		const newStuck = new Set();
		let currentActive = "";

		for (const el of headerElements) {
			const rect = el.getBoundingClientRect();
			const name = el.getAttribute("data-category") || "";

			// Detect if the section header is currently at or above the sticky line
			if (rect.top <= stickyThreshold + 2) {
				newStuck.add(name);
				currentActive = name; // The lowest stuck category is the active stuck category
			}
		}

		stuckCategories = newStuck;
		activeCategoryName = currentActive;
	}
	let isDraggingSelection = $state(false);

	onMount(() => {
		handleScroll();
		const handleGlobalMouseUp = () => {
			isDraggingSelection = false;
		};
		window.addEventListener("mouseup", handleGlobalMouseUp);
		return () => {
			window.removeEventListener("mouseup", handleGlobalMouseUp);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="table-view-container"
	class:drag-over={isDragOver}
	class:compact={layoutStore.isCondensed}
	class:spacious={!layoutStore.isCondensed}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<div class="table-border-shield">
		<div
			class="table-wrapper"
			bind:this={tableWrapperEl}
			onscroll={handleScroll}
		>
			<table class="deck-table">
				<thead>
					<tr>
						<th
							class="col-qty sortable"
							class:active-sort={deckStore.sorting === "qty"}
							onclick={() => handleHeaderClick("qty")}
						>
							<div class="header-cell-inner">
								<span>#</span>
								{#if deckStore.sorting === "qty"}
									{#if deckStore.sortAscending}
										<ArrowUp
											size={12}
											class="sort-indicator"
										/>
									{:else}
										<ArrowDown
											size={12}
											class="sort-indicator"
										/>
									{/if}
								{/if}
							</div>
						</th>
						<th
							class="col-name sortable"
							class:active-sort={deckStore.sorting === "name"}
							onclick={() => handleHeaderClick("name")}
						>
							<div class="header-cell-inner">
								<span>CARD NAME</span>
								{#if deckStore.sorting === "name"}
									{#if deckStore.sortAscending}
										<ArrowUp
											size={12}
											class="sort-indicator"
										/>
									{:else}
										<ArrowDown
											size={12}
											class="sort-indicator"
										/>
									{/if}
								{/if}
							</div>
						</th>
						{#if settingsStore.visibleColumns.includes("mana")}
							<th
								class="col-mana sortable"
								class:active-sort={deckStore.sorting === "mana"}
								onclick={() => handleHeaderClick("mana")}
							>
								<div class="header-cell-inner">
									<span>MANA COST</span>
									{#if deckStore.sorting === "mana"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("cmc")}
							<th
								class="col-cmc sortable"
								class:active-sort={deckStore.sorting === "cmc"}
								onclick={() => handleHeaderClick("cmc")}
							>
								<div class="header-cell-inner">
									<span>MV</span>
									{#if deckStore.sorting === "cmc"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("type")}
							<th
								class="col-type sortable"
								class:active-sort={deckStore.sorting === "type"}
								onclick={() => handleHeaderClick("type")}
							>
								<div class="header-cell-inner">
									<span>TYPE</span>
									{#if deckStore.sorting === "type"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("printing")}
							<th
								class="col-printing sortable"
								class:active-sort={deckStore.sorting ===
									"printing"}
								onclick={() => handleHeaderClick("printing")}
							>
								<div class="header-cell-inner">
									<span>PRINTING</span>
									{#if deckStore.sorting === "printing"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("color-cat")}
							<th
								class="col-color-cat sortable"
								class:active-sort={deckStore.sorting ===
									"color"}
								onclick={() => handleHeaderClick("color-cat")}
							>
								<div class="header-cell-inner">
									<span>COLOR CAT</span>
									{#if deckStore.sorting === "color"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("color-id")}
							<th class="col-color-id">COLOR ID</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("tags")}
							<th class="col-tags">TAGS</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("price")}
							<th
								class="col-price sortable"
								class:active-sort={deckStore.sorting ===
									"price"}
								onclick={() => handleHeaderClick("price")}
							>
								<div class="header-cell-inner price-header">
									<span>PRICE</span>
									{#if deckStore.sorting === "price"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
							{#if settingsStore.showTotalPrice}
								<th class="col-total">TOTAL</th>
							{/if}
						{/if}
						<th class="col-actions"></th>
					</tr>
				</thead>
				{#each groupedCategories as category}
					{#if category.cards.length > 0}
						<tbody class="category-group">
							<!-- Section Header Row -->
							<tr
								class="category-header-row"
								data-category={category.name}
								onclick={() =>
									toggleCategoryCollapse(category.name)}
								style="cursor: pointer; user-select: none;"
							>
								{#if !settingsStore.visibleColumns.includes("price")}
									<td
										colspan={2 +
											settingsStore.visibleColumns.length}
										class="spanned-cat-cell"
									>
										<div class="category-header-content">
											<div class="category-pill-box">
												<ChevronDown
													size={14}
													class="category-chevron {collapsedCategories.has(
														category.name,
													)
														? 'collapsed'
														: ''}"
												/>
												<span class="category-title">{category.name}</span>
												<span class="category-count">({(/** @type {any} */ (category)).totalQtyText || category.totalQty})</span>
											</div>
										</div>
									</td>
									<td class="col-actions"></td>
								{:else}
									<td
										colspan={1 +
											settingsStore.visibleColumns.length}
										class="spanned-cat-cell"
									>
										<div class="category-header-content">
											<div class="category-pill-box">
												<ChevronDown
													size={14}
													class="category-chevron {collapsedCategories.has(
														category.name,
													)
														? 'collapsed'
														: ''}"
												/>
												<span class="category-title">{category.name}</span>
												<span class="category-count">({(/** @type {any} */ (category)).totalQtyText || category.totalQty})</span>
											</div>
										</div>
									</td>
									{#if settingsStore.showTotalPrice}
										<td class="col-price"></td>
										<td class="col-total">
											{#if category.totalPrice > 0}
												<div
													class="category-sum"
													transition:fade={{
														duration: 100,
													}}
												>
													${category.totalPrice.toFixed(
														2,
													)}
												</div>
											{/if}
										</td>
									{:else}
										<td class="col-price">
											{#if category.totalPrice > 0}
												<div
													class="category-sum"
													transition:fade={{
														duration: 100,
													}}
												>
													${category.totalPrice.toFixed(
														2,
													)}
												</div>
											{/if}
										</td>
									{/if}
									<td class="col-actions"></td>
								{/if}
							</tr>

							<!-- Individual Card Rows -->
							{#if !collapsedCategories.has(category.name)}
								{#each category.cards as cardRow (cardRow.name)}
									{@const isSelected = interactionStore.selectedCardIds.has(cardRow.instances[0]?.id)}
									<tr
										class="card-row"
										class:is-illegal={cardRow.isIllegal}
										class:is-selected={isSelected}
										class:is-editing={editingCardName ===
											cardRow.name &&
											editingCardZone === cardRow.zone}
										data-tooltip-img={cardRow.imgUrl}
										onmousedown={(e) => {
											if (e.button !== 0) return;
											if (e.target instanceof HTMLElement && (
												e.target.closest('button') || 
												e.target.closest('input') || 
												e.target.closest('.action-buttons-cell') ||
												e.target.closest('.col-actions')
											)) return;

											if (cardRow.instances[0]) {
												isDraggingSelection = true;
												const isCmdCtrl = e.metaKey || e.ctrlKey;
												interactionStore.handleCardSelectClick(
													cardRow.instances[0].id,
													e.shiftKey,
													isCmdCtrl
												);
											}
										}}
										oncontextmenu={(e) => {
											e.preventDefault();
											interactionStore.showMenu(
												e,
												cardRow.card,
												cardRow.zone,
												cardRow.price,
											);
										}}
										onmouseenter={() => {
											interactionStore.registerHover(
												cardRow.card,
												cardRow.zone,
												cardRow.price,
											);
											if (isDraggingSelection && cardRow.instances[0]) {
												interactionStore.handleCardSelectClick(
													cardRow.instances[0].id,
													true,
													false
												);
											}
										}}
										onmouseleave={() =>
											interactionStore.unregisterHover()}
									>
										<!-- Quantity Display (Clickable/Typable inline input) -->
										<td class="col-qty">
											{#if editingCardName === cardRow.name && editingCardZone === cardRow.zone}
												<input
													type="number"
													class="qty-inline-input"
													bind:value={localQtyText}
													onblur={() =>
														handleQtySubmit(
															cardRow,
														)}
													onkeydown={(e) =>
														handleQtyKeyDown(
															e,
															cardRow,
														)}
													min="0"
													max="999"
													use:focusOnMount
													onclick={(e) =>
														e.stopPropagation()}
												/>
											{:else}
												<button
													type="button"
													class="qty-text-btn"
													onclick={(e) => {
														e.stopPropagation();
														editingCardName =
															cardRow.name;
														editingCardZone =
															cardRow.zone;
														localQtyText = String(
															cardRow.quantity,
														);
													}}
													title="Click to change quantity inline"
												>
													{cardRow.quantity}
												</button>
											{/if}
										</td>

										<!-- Card Name & Legality Warning -->
										<td class="col-name">
											<div class="name-container-cell">
												<span class="card-name-label"
													>{cardRow.name}</span
												>
												{#if cardRow.isIllegal}
													<div
														class="legality-warning-icon"
														title={cardRow.legalityReasons.join(
															", ",
														)}
													>
														<AlertTriangle
															size={12}
														/>
													</div>
												{/if}
											</div>
										</td>

										<!-- Mana Icons (Mana Cost) -->
										{#if settingsStore.visibleColumns.includes("mana")}
											<td class="col-mana">
												<div class="mana-icons-cell">
													{#each cardRow.manaSymbols as sym}
														<ManaSymbol
															symbol={sym}
															size="1.1em"
															className="ms-cost"
														/>
													{/each}
												</div>
											</td>
										{/if}

										<!-- Mana Value (Numerical CMC) -->
										{#if settingsStore.visibleColumns.includes("cmc")}
											{@const hasCmcOverride = cardRow.instances[0]?.overrides?.manaValue !== undefined}
											<td 
												class="col-cmc"
												ondblclick={(e) => {
													e.stopPropagation();
													if (cardRow.instances[0]) {
														editingCmcCardId = cardRow.instances[0].id;
														inlineCmcVal = String(cardRow.cmc);
													}
												}}
											>
												{#if editingCmcCardId && cardRow.instances[0] && editingCmcCardId === cardRow.instances[0].id}
													<input
														type="number"
														class="qty-inline-input"
														bind:value={inlineCmcVal}
														onblur={() => {
															const parsed = parseInt(inlineCmcVal, 10);
															if (!isNaN(parsed) && cardRow.instances[0]) {
																deckStore.setCardOverride(cardRow.instances[0].id, 'manaValue', parsed);
															}
															editingCmcCardId = null;
														}}
														onkeydown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																const parsed = parseInt(inlineCmcVal, 10);
																if (!isNaN(parsed) && cardRow.instances[0]) {
																	deckStore.setCardOverride(cardRow.instances[0].id, 'manaValue', parsed);
																}
																editingCmcCardId = null;
															} else if (e.key === "Escape") {
																editingCmcCardId = null;
															}
														}}
														use:focusOnMount
														onclick={(e) => e.stopPropagation()}
													/>
												{:else}
													<span 
														class="cmc-badge"
														class:is-overridden={hasCmcOverride}
														title={hasCmcOverride ? "Double click to edit override (Customized)" : "Double click to override"}
													>
														{cardRow.cmc}
													</span>
												{/if}
											</td>
										{/if}

										<!-- Type Line -->
										{#if settingsStore.visibleColumns.includes("type")}
											{@const hasTypeOverride = cardRow.instances[0]?.overrides?.primaryType !== undefined}
											<td 
												class="col-type"
												ondblclick={(e) => {
													e.stopPropagation();
													if (cardRow.instances[0]) {
														editingTypeCardId = cardRow.instances[0].id;
														inlineTypeVal = String(cardRow.type);
													}
												}}
											>
												{#if editingTypeCardId && cardRow.instances[0] && editingTypeCardId === cardRow.instances[0].id}
													<input
														type="text"
														class="qty-inline-input text-left"
														style="text-align: left;"
														bind:value={inlineTypeVal}
														onblur={() => {
															if (cardRow.instances[0]) {
																deckStore.setCardOverride(cardRow.instances[0].id, 'primaryType', inlineTypeVal.trim());
															}
															editingTypeCardId = null;
														}}
														onkeydown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																if (cardRow.instances[0]) {
																	deckStore.setCardOverride(cardRow.instances[0].id, 'primaryType', inlineTypeVal.trim());
																}
																editingTypeCardId = null;
															} else if (e.key === "Escape") {
																editingTypeCardId = null;
															}
														}}
														use:focusOnMount
														onclick={(e) => e.stopPropagation()}
													/>
												{:else}
													<span
														class="type-text"
														class:is-overridden={hasTypeOverride}
														title={hasTypeOverride ? "Double click to edit override (Customized)" : "Double click to override"}
														>{cardRow.type}</span
													>
												{/if}
											</td>
										{/if}

										<!-- Printing (Set and Collector Number) -->
										{#if settingsStore.visibleColumns.includes("printing")}
											<td class="col-printing">
												<span class="printing-text">
													{#if cardRow.card?.set}
														<span class="set-code"
															>{cardRow.card.set.toUpperCase()}</span
														>
														<span
															class="collector-number"
															>{cardRow.card
																.collector_number ||
																""}</span
														>
													{:else}
														<span
															class="placeholder-dash"
															>—</span
														>
													{/if}
												</span>
											</td>
										{/if}

										<!-- Color Category -->
										{#if settingsStore.visibleColumns.includes("color-cat")}
											{@const hasColorOverride = cardRow.instances[0]?.overrides?.colorCategory !== undefined}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
											<td 
												class="col-color-cat"
												onclick={(e) => {
													e.stopPropagation();
													if (cardRow.instances[0]) {
														editingColorCardId = editingColorCardId === cardRow.instances[0].id ? null : cardRow.instances[0].id;
													}
												}}
											>
												<div style="position: relative; cursor: pointer;">
													<span
														class="color-cat-text class-{getColorCategory(
															cardRow,
														).toLowerCase()}"
														class:is-overridden={hasColorOverride}
														title={hasColorOverride ? "Click to change color override (Customized)" : "Click to override"}
													>
														{getColorCategory(cardRow)}
													</span>

													{#if editingColorCardId && cardRow.instances[0] && editingColorCardId === cardRow.instances[0].id}
														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div 
															class="color-picker-dropdown"
															onclick={(evt) => evt.stopPropagation()}
														>
															<div class="dropdown-backdrop" role="presentation" onclick={() => editingColorCardId = null}></div>
															<div class="color-picker-menu">
																{#each ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"] as colorOpt}
																	<button
																		type="button"
																		class="color-opt-btn"
																		onclick={() => {
																			if (cardRow.instances[0]) {
																				deckStore.setCardOverride(cardRow.instances[0].id, 'colorCategory', colorOpt);
																				/** @type {Record<string, string[]>} */
																				const mapColors = { "White": ["W"], "Blue": ["U"], "Black": ["B"], "Red": ["R"], "Green": ["G"] };
																				if (mapColors[colorOpt]) {
																					deckStore.setCardOverride(cardRow.instances[0].id, 'colors', mapColors[colorOpt]);
																					deckStore.setCardOverride(cardRow.instances[0].id, 'colorIdentity', mapColors[colorOpt]);
																				} else if (colorOpt === "Colorless") {
																					deckStore.setCardOverride(cardRow.instances[0].id, 'colors', []);
																					deckStore.setCardOverride(cardRow.instances[0].id, 'colorIdentity', []);
																				}
																			}
																			editingColorCardId = null;
																		}}
																	>
																		{colorOpt}
																	</button>
																{/each}
																<div class="menu-divider"></div>
																<button
																	type="button"
																	class="color-opt-btn reset-btn"
																	onclick={() => {
																		if (cardRow.instances[0]) {
																			deckStore.resetCardOverride(cardRow.instances[0].id, 'colorCategory');
																			deckStore.resetCardOverride(cardRow.instances[0].id, 'colors');
																			deckStore.resetCardOverride(cardRow.instances[0].id, 'colorIdentity');
																		}
																		editingColorCardId = null;
																	}}
																>
																	Reset to Default
																</button>
															</div>
														</div>
													{/if}
												</div>
											</td>
										{/if}

										<!-- Color Identity (Mana symbols) -->
										{#if settingsStore.visibleColumns.includes("color-id")}
											<td class="col-color-id">
												<div class="color-id-cell">
													{#each cardRow.color_identity as sym}
														<ManaSymbol
															symbol={sym}
															size="1.1em"
															className="ms-cost"
														/>
													{:else}
														<span
															class="placeholder-dash"
															>—</span
														>
													{/each}
												</div>
											</td>
										{/if}

										<!-- Tags (Premium Popover Selection Dropdown) -->
										{#if settingsStore.visibleColumns.includes("tags")}
											{@const tags = cardRow.instances[0]?.tags || []}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
											<td 
												class="col-tags"
												onclick={(e) => {
													e.stopPropagation();
													if (cardRow.instances[0]) {
														activeTagsPopoverCardId = activeTagsPopoverCardId === cardRow.instances[0].id ? null : cardRow.instances[0].id;
														newTagValue = "";
													}
												}}
											>
												<div style="position: relative; cursor: pointer;" class="tags-popover-anchor">
													<div class="tags-badges-list">
														{#each tags as tag, idx}
															<span 
																class="tag-badge"
																style="background-color: {getTagBgColor(tag)}"
																draggable="true"
																ondragstart={(e) => handleTagDragStart(e, cardRow.instances[0].id, idx)}
																ondragover={(e) => e.preventDefault()}
																ondrop={(e) => handleTagDrop(e, cardRow.instances[0].id, idx)}
															>
																{#if idx === 0}
																	<Star size={10} class="star-icon text-yellow-400 fill-yellow-400" />
																{/if}
																<span>{tag}</span>
															</span>
														{:else}
															<span class="placeholder-dash">+ Tag</span>
														{/each}
													</div>

													{#if activeTagsPopoverCardId && cardRow.instances[0] && activeTagsPopoverCardId === cardRow.instances[0].id}
														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div 
															class="tags-popover-menu"
															onclick={(evt) => evt.stopPropagation()}
														>
															<div class="dropdown-backdrop" role="presentation" onclick={() => activeTagsPopoverCardId = null}></div>
															<div class="tags-popover-content">
																<div class="popover-title">Card Tags</div>
																
																<!-- Active tags on card -->
																<div class="popover-section-title">Active ({tags.length})</div>
																<div class="active-tags-container">
																	{#each tags as tag}
																		<div class="active-tag-row">
																			<button
																				type="button"
																				class="star-tag-btn"
																				class:is-primary={cardRow.instances[0].primaryTag === tag}
																				title="Make Primary Tag"
																				onclick={() => deckStore.setPrimaryTag(cardRow.instances[0].id, tag)}
																			>
																				<Star size={11} class="star-icon" />
																			</button>
																			<span class="tag-text">{tag}</span>
																			<button
																				type="button"
																				class="remove-tag-btn"
																				onclick={() => deckStore.removeCardTag(cardRow.instances[0].id, tag)}
																			>
																				<X size={11} />
																			</button>
																		</div>
																	{/each}
																</div>

																<div class="menu-divider"></div>

																<!-- Global tag suggestions -->
																<div class="popover-section-title">All Tags</div>
																<div class="all-tags-suggestions">
																	{#each deckTagsList as gTag}
																		{#if !tags.includes(gTag)}
																			<button
																				type="button"
																				class="suggestion-tag-btn"
																				onclick={() => deckStore.addCardTag(cardRow.instances[0].id, gTag)}
																			>
																				{gTag}
																			</button>
																		{/if}
																	{/each}
																</div>

																<div class="tag-input-box">
																	<input
																		type="text"
																		placeholder="Create Tag..."
																		bind:value={newTagValue}
																		onkeydown={(evt) => {
																			if (evt.key === 'Enter') {
																				evt.preventDefault();
																				const val = newTagValue.trim();
																				if (val) {
																					deckStore.addCardTag(cardRow.instances[0].id, val);
																					newTagValue = "";
																				}
																			}
																		}}
																	/>
																	<button
																		type="button"
																		class="add-tag-submit-btn"
																		onclick={() => {
																			const val = newTagValue.trim();
																			if (val) {
																				deckStore.addCardTag(cardRow.instances[0].id, val);
																				newTagValue = "";
																			}
																		}}
																	>
																		<Plus size={14} />
																	</button>
																</div>
															</div>
														</div>
													{/if}
												</div>
											</td>
										{/if}

										<!-- Price (Optional) -->
										{#if settingsStore.visibleColumns.includes("price")}
											<td class="col-price">
												<span class="price-span">
													{cardRow.price > 0
														? `$${cardRow.price.toFixed(2)}`
														: "—"}
												</span>
											</td>
											{#if settingsStore.showTotalPrice}
												<td class="col-total">
													<span
														class="price-span total"
													>
														{cardRow.price > 0
															? `$${(cardRow.price * cardRow.quantity).toFixed(2)}`
															: "—"}
													</span>
												</td>
											{/if}
										{/if}

										<!-- Options Menu Trigger -->
										<td class="col-actions">
											<div class="action-buttons-cell">
												<button
													type="button"
													class="row-action-btn"
													onclick={(e) => {
														e.stopPropagation();
														interactionStore.showMenu(
															e,
															cardRow.card,
															cardRow.zone,
															cardRow.price,
														);
													}}
													title="More Options"
												>
													<MoreVertical size={14} />
												</button>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					{/if}
				{/each}
			</table>
		</div>
	</div>
</div>

<style>
	.table-view-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2), transparent);
		padding: 1.25rem 2rem;
		position: relative;
		transition: background-color 0.2s ease;
	}

	.table-view-container.drag-over {
		background-color: hsla(var(--primary-hsl), 0.05);
	}

	.table-border-shield {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-md);
		background: hsla(0, 0%, 100%, 0.015);
	}

	.table-wrapper {
		flex: 1;
		overflow-x: auto;
		overflow-y: auto;
	}

	/* Elegant Custom Scrollbar for Table Wrapper */
	.table-wrapper::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.table-wrapper::-webkit-scrollbar-track {
		background: transparent;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground) / 0.25);
		border-radius: 3px;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.45);
	}

	.deck-table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		text-align: left;
		font-size: 0.875rem;
		table-layout: auto;
		--padding-y: 8px;
		--row-height: 1.5rem;
		user-select: none;
	}

	.compact .deck-table {
		--padding-y: 0px;
		--row-height: 22px;
	}

	.spacious .deck-table {
		--padding-y: 8px;
		--row-height: 1.5rem;
	}

	.deck-table th {
		position: sticky;
		top: 0;
		z-index: 10;
		height: 38px;
		background: linear-gradient(hsla(0, 0%, 100%, 0.06), hsla(0, 0%, 100%, 0.06)), hsl(var(--background));
		padding: 0 14px;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsla(var(--border) / 0.8);
		border-top: none;
		border-right: 1px solid hsl(var(--border) / 0.5);
		white-space: nowrap;
		box-sizing: border-box;
	}

	.deck-table th:last-child {
		border-right: none;
		padding-right: 20px !important;
	}

	/* Columns Sizes */
	.col-qty {
		width: 50px;
		min-width: 50px;
		max-width: 50px;
		text-align: right;
		padding-right: 0.25rem !important;
	}
	.col-name {
		width: 100%;
		min-width: 220px;
		padding-left: 0.25rem !important;
	}
	.col-mana {
		width: 105px;
	}
	.col-cmc {
		width: 55px;
		text-align: center;
	}
	.col-type {
		width: 240px;
	}
	.col-printing {
		width: 100px;
	}
	.col-color-cat {
		width: 110px;
	}
	.col-color-id {
		width: 95px;
	}
	.col-tags {
		width: 90px;
	}
	.col-price {
		width: 85px;
		text-align: right;
	}
	.col-total {
		width: 85px;
		text-align: right;
	}
	.col-actions {
		width: 50px;
		text-align: center;
	}

	.deck-table th:first-child,
	.deck-table td:first-child {
		padding-left: var(--base-margin, 20px) !important;
	}

	.deck-table th:last-child,
	.deck-table td:last-child {
		padding-right: var(--base-margin, 20px) !important;
	}

	.deck-table th.col-qty {
		text-align: right;
	}
	.deck-table th.col-cmc {
		text-align: center;
	}
	.deck-table th.col-price {
		text-align: right;
	}
	.deck-table th.col-total {
		text-align: right;
	}

	.deck-table th.sortable {
		cursor: pointer;
		user-select: none;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
	}

	.deck-table th.sortable:hover {
		color: hsl(var(--foreground));
		background: hsla(var(--foreground-hsl, 0, 0%, 100%), 0.05);
	}

	.header-cell-inner {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 100%;
	}

	.deck-table th.col-qty .header-cell-inner {
		justify-content: flex-end;
	}

	.deck-table th.col-cmc .header-cell-inner {
		justify-content: center;
	}

	.deck-table th.col-price .header-cell-inner {
		justify-content: flex-end;
	}

	.sort-indicator {
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.deck-table th.active-sort {
		color: hsl(var(--primary)) !important;
	}

	/* Row Styling */
	.card-row {
		background: hsla(0, 0%, 100%, 0.03);
		transition: background-color 0.15s ease;
		cursor: pointer;
		position: relative;
	}

	.card-row:nth-child(even) {
		background: hsla(0, 0%, 100%, 0.015);
	}

	.card-row:hover {
		background: hsla(0, 0%, 100%, 0.06) !important;
	}

	.card-row.is-selected {
		background-color: hsla(var(--primary-hsl), 0.1) !important;
	}

	.card-row.is-editing {
		background: hsla(var(--primary-hsl), 0.08) !important;
	}

	.category-group:last-of-type .card-row:last-child td {
		border-bottom: none;
	}

	.card-row.is-illegal {
		background: hsla(var(--destructive) / 0.05);
	}

	.card-row.is-illegal:hover {
		background: hsla(var(--destructive) / 0.08);
	}

	/* Notion Table Overrides visual custom indicator (Italics and colors) */
	.is-overridden {
		font-style: italic !important;
		color: hsl(var(--primary)) !important;
		opacity: 0.95;
	}

	/* Tags Badge layouts */
	.tags-badges-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}

	.tag-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		color: #ffffff;
		line-height: 1;
		user-select: none;
	}

	.tag-badge :global(.star-icon) {
		color: #fbbf24;
		fill: #fbbf24;
	}

	/* Tags Popover Menu styling */
	.tags-popover-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 1000;
		width: 220px;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		padding: 10px;
	}

	.tags-popover-content {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.popover-title {
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 4px;
	}

	.popover-section-title {
		font-size: 10px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-top: 4px;
	}

	.active-tags-container {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 120px;
		overflow-y: auto;
	}

	.active-tag-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: hsl(var(--muted) / 0.15);
		padding: 3px 6px;
		border-radius: 4px;
		font-size: 11px;
		color: hsl(var(--foreground));
	}

	.star-tag-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground) / 0.4);
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
	}

	.star-tag-btn.is-primary {
		color: #fbbf24;
	}

	.remove-tag-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
	}

	.remove-tag-btn:hover {
		color: hsl(var(--destructive));
	}

	.all-tags-suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		max-height: 80px;
		overflow-y: auto;
	}

	.suggestion-tag-btn {
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.4);
		color: hsl(var(--foreground));
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		cursor: pointer;
	}

	.suggestion-tag-btn:hover {
		background: hsl(var(--primary) / 0.2);
		border-color: hsl(var(--primary));
	}

	.tag-input-box {
		display: flex;
		gap: 4px;
		margin-top: 6px;
	}

	.tag-input-box input {
		flex: 1;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: 4px;
		padding: 4px 6px;
		font-size: 11px;
		color: hsl(var(--foreground));
		outline: none;
	}

	.add-tag-submit-btn {
		background: hsl(var(--primary));
		color: white;
		border: none;
		border-radius: 4px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	/* Color Picker Dropdown Menu */
	.color-picker-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 1000;
		width: 140px;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		padding: 4px;
	}

	.color-picker-menu {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.color-opt-btn {
		width: 100%;
		text-align: left;
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.color-opt-btn:hover {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.color-opt-btn.reset-btn {
		color: hsl(var(--muted-foreground));
		font-weight: 600;
	}

	.color-opt-btn.reset-btn:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	.menu-divider {
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin: 2px 0;
	}

	.deck-table td {
		padding: var(--padding-y) 14px;
		vertical-align: middle;
		color: var(--text-secondary);
		height: var(--row-height);
		transition:
			padding 0.2s ease,
			height 0.2s ease,
			border-color 0.2s ease;
		white-space: nowrap;
		border-bottom: 1px solid hsl(var(--border) / 0.5); /* Clean border-bottom directly on cells */
		border-right: 1px solid hsl(var(--border) / 0.5);
	}

	.deck-table td:last-child {
		border-right: none;
		padding-right: 20px !important;
	}

	/* Clickable Quantity Badge Button */
	.qty-text-btn {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-weight: 600;
		font-size: 0.875rem;
		font-family: inherit;
		padding: 0;
		min-width: auto;
		text-align: center;
		cursor: pointer;
		font-variant-numeric: tabular-nums;
		transition: color 0.15s ease;
		display: inline-block;
		outline: none;
	}

	.qty-text-btn:hover {
		color: hsl(var(--primary));
	}

	.qty-inline-input {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-weight: 600;
		font-size: 0.875rem;
		font-family: inherit;
		padding: 0;
		width: 100%;
		text-align: center;
		font-variant-numeric: tabular-nums;
		outline: none;
		box-sizing: border-box;
		display: inline-block;
	}

	/* Remove spin buttons */
	.qty-inline-input::-webkit-outer-spin-button,
	.qty-inline-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		appearance: none;
		margin: 0;
	}
	.qty-inline-input[type="number"] {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	/* Name Cell */
	.name-container-cell {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.card-name-label {
		font-weight: 500;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		max-width: 200px;
	}

	.card-row:hover .card-name-label {
		color: hsla(
			217,
			91%,
			60%,
			1
		); /* Sleek primary color transition on hover */
	}

	.legality-warning-icon {
		color: hsl(var(--destructive));
		display: inline-flex;
		align-items: center;
		justify-content: center;
		animation: pulse 2s infinite ease-in-out;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}

	/* Mana Value Badge */
	.cmc-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		font-weight: 600;
		color: hsl(var(--foreground));
		background: hsla(0, 0%, 100%, 0.04);
		border-radius: 50%;
		border: 1px solid hsla(var(--border) / 0.4);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	/* Printing Cell */
	.printing-text {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.set-code {
		color: hsl(var(--muted-foreground));
		font-weight: 700;
		font-size: 0.6875rem;
		letter-spacing: 0.05em;
	}

	.collector-number {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
	}

	/* Color Category Labels */
	.color-cat-text {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		background: hsla(0, 0%, 100%, 0.04);
		border: 1px solid hsla(var(--border) / 0.4);
		color: hsl(var(--muted-foreground));
	}

	.color-cat-text.class-white {
		color: #fef08a;
		border-color: rgba(254, 240, 138, 0.2);
		background: rgba(254, 240, 138, 0.03);
	}
	.color-cat-text.class-blue {
		color: #60a5fa;
		border-color: rgba(96, 165, 250, 0.2);
		background: rgba(96, 165, 250, 0.03);
	}
	.color-cat-text.class-black {
		color: #c084fc;
		border-color: rgba(192, 132, 252, 0.2);
		background: rgba(192, 132, 252, 0.03);
	}
	.color-cat-text.class-red {
		color: #f87171;
		border-color: rgba(248, 113, 113, 0.2);
		background: rgba(248, 113, 113, 0.03);
	}
	.color-cat-text.class-green {
		color: #34d399;
		border-color: rgba(52, 211, 153, 0.2);
		background: rgba(52, 211, 153, 0.03);
	}
	.color-cat-text.class-multicolor {
		color: #fb923c;
		border-color: rgba(251, 146, 60, 0.2);
		background: rgba(251, 146, 60, 0.03);
	}
	.color-cat-text.class-land {
		color: #a7f3d0;
		border-color: rgba(167, 243, 208, 0.2);
		background: rgba(167, 243, 208, 0.03);
	}

	/* Color Identity Cell */
	.color-id-cell {
		display: flex;
		gap: 0.15em;
		align-items: center;
	}

	/* Mana Cell */
	.mana-icons-cell {
		display: flex;
		gap: 0.15em;
		flex-wrap: wrap;
		align-items: center;
	}

	:global(.mana-icons-cell .ms-cost),
	:global(.color-id-cell .ms-cost) {
		margin: 0 !important;
	}

	/* Type Text */
	.type-text {
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		max-width: 240px;
	}

	.placeholder-dash {
		color: var(--text-muted);
		font-weight: 500;
	}

	/* Prices */
	.price-span {
		font-family: inherit;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}

	.price-span.total {
		color: var(--success);
		font-weight: 600;
	}

	/* Action Buttons */
	.action-buttons-cell {
		display: flex;
		gap: 6px;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.card-row:hover .action-buttons-cell {
		opacity: 1;
	}

	.row-action-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		width: 24px;
		height: 24px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.row-action-btn:hover {
		background: hsla(0, 0%, 100%, 0.08);
		color: hsl(var(--foreground));
	}

	.row-action-btn.delete:hover {
		background: hsla(var(--destructive) / 0.15);
		color: #f87171;
	}

	/* Category Section Header Row Styling */
	.category-header-row td {
		position: sticky;
		top: 37px;
		z-index: 5;
		background: linear-gradient(hsla(0, 0%, 100%, 0.015), hsla(0, 0%, 100%, 0.015)), hsl(var(--background));
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		border-top: none;
		border-right: none !important;
		padding: var(--padding-y) 14px !important;
		height: calc(var(--row-height) * 1.5);
		box-shadow: none;
		transition: background-color 0.15s ease;
	}

	.category-header-row:hover td {
		background: linear-gradient(hsla(0, 0%, 100%, 0.045), hsla(0, 0%, 100%, 0.045)), hsl(var(--background)) !important;
	}

	.category-header-row td.col-actions {
		width: 50px;
		min-width: 50px;
		max-width: 50px;
		padding: 0 !important;
	}

	.category-header-row td.col-price,
	.category-header-row td.col-total {
		padding-right: 14px !important;
		text-align: right;
		vertical-align: middle;
	}

	.category-header-row td.spanned-cat-cell {
		padding: var(--padding-y) 14px !important;
	}

	.category-header-content {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-left: 0;
		gap: 0;
		height: 100%;
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 1;
		transform: translateY(0);
	}

	.category-header-content.fade-out {
		opacity: 0;
		pointer-events: none;
		transform: translateY(-4px); /* Elegant slide out upwards */
	}

	.category-pill-box {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: none !important;
		border: none !important;
		padding: 0 !important;
		border-radius: 0 !important;
		transition: none !important;
		flex-shrink: 0;
	}

	:global(.category-chevron) {
		color: hsl(var(--muted-foreground) / 0.6);
		transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
		flex-shrink: 0;
	}

	:global(.category-chevron.collapsed) {
		transform: rotate(-90deg) !important;
	}

	.category-title {
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--muted-foreground) / 0.85);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.category-count {
		display: inline-block;
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--muted-foreground) / 0.6);
		margin-left: 4px;
	}

	.category-line {
		display: none !important;
	}

	.category-header-row:hover .category-title {
		color: hsl(var(--foreground));
	}

	.category-header-row:hover :global(.category-chevron) {
		color: hsl(var(--foreground));
	}

	.category-header-row:hover .category-count {
		color: hsl(var(--foreground));
	}

	.category-sum {
		color: var(--success);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		transition:
			opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 1;
		transform: translateY(0);
	}

	.category-sum.fade-out {
		opacity: 0;
		pointer-events: none;
		transform: translateY(-4px);
	}

	/* --- Compact Overrides for Clean minimalist table elements --- */
	.compact .qty-text-btn {
		background: transparent;
		border-color: transparent;
		padding: 0;
		min-width: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.compact .qty-text-btn:hover {
		background: transparent;
		border-color: transparent;
		box-shadow: none;
		color: hsl(var(--primary));
		text-shadow: 0 0 8px hsla(var(--primary-hsl), 0.4);
	}

	.compact .cmc-badge {
		background: none;
		border: none;
		width: auto;
		height: auto;
		border-radius: 0;
		font-weight: 500;
		font-size: 0.875rem;
	}

	.compact .color-cat-text {
		padding: 0;
		background: none;
		border: none;
	}

	/* Highlight all card rows in the category ONLY when hovering the header row */
	.category-group:has(.category-header-row:hover) .card-row {
		background-color: hsla(0, 0%, 100%, 0.06) !important;
	}

	.category-group:has(.category-header-row:hover) .card-row:nth-child(even) {
		background-color: hsla(0, 0%, 100%, 0.045) !important;
	}

</style>
