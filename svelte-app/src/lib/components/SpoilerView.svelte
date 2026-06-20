<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { getGroupedCategories } from "$lib/layouts/grouping.svelte.js";
	import CardShell from "./CardShell.svelte";
	import CardArt from "./CardArt.svelte";
	import { ChevronDown, AlertTriangle, Layers, Info } from "lucide-svelte";
	import { fade, slide } from "svelte/transition";
	import { SvelteSet } from "svelte/reactivity";

	let isDragOver = $state(false);
	let collapsedCategories = $state(new SvelteSet());
	let containerWidth = $state(0);

	/** @param {HTMLInputElement} node */
	function selectOnMount(node) {
		node.focus();
		node.select();
	}

	/** @param {MouseEvent} e */
	function handleWindowClick(e) {
		if (interactionStore.editingCardId) {
			const target = /** @type {HTMLElement} */ (e.target);
			if (!target.closest(".stack-badge-input") && !target.closest(".spoiler-badge-input")) {
				if (document.activeElement instanceof HTMLElement) {
					document.activeElement.blur();
				}
			}
		}
	}

	// Premium Card Sizing Engine for Visual Spoiler
	const gridGeometry = $derived.by(() => {
		const width = containerWidth || 1200;
		const gap = layoutStore.columnGap; // Dynamic spacing matching compact/spacious settings!

		// Calculate Target Card Width directly from settingsStore multiplier of actual card size!
		const targetCardWidth = settingsStore.physicalCardWidth * settingsStore.spoilerCardSize;

		// 3. Calculate how many columns can fit roughly at this target card width
		// Formula: W + G = N * (C + G) => N = round((W + G) / (T + G))
		const rawCols = (width + gap) / (targetCardWidth + gap);
		const numColumns = Math.max(1, Math.round(rawCols));

		// 4. Calculate exact card width so that the grid spans the container width with zero remainder gaps!
		// Formula: C = (W - (N - 1) * G) / N
		const exactCardWidth = (width - (numColumns - 1) * gap) / numColumns;

		return {
			numColumns,
			cardWidth: exactCardWidth,
			gap
		};
	});

	/** @param {string} categoryName */
	function toggleCategoryCollapse(categoryName) {
		if (collapsedCategories.has(categoryName)) {
			collapsedCategories.delete(categoryName);
		} else {
			collapsedCategories.add(categoryName);
		}
	}

	// Group and sort card rows using the shared grouping engine (supports all grouping modes)
	const groupedCategories = $derived.by(getGroupedCategories);

	const allSpoilerCards = $derived.by(() => {
		const cards = [];
		for (const category of groupedCategories) {
			cards.push(...category.cards);
		}
		return cards;
	});

	// Sync visible card IDs for Cmd+A / Esc selection shortcuts
	$effect(() => {
		interactionStore.currentVisibleCardIds = allSpoilerCards
			.map((/** @type {any} */ item) => item.instances[0]?.id)
			.filter(/** @param {any} id */ id => !!id);
	});

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
		const internalData = e.dataTransfer.getData("application/x-budgericard");
		if (internalData) {
			e.preventDefault();
			e.stopPropagation();
			const data = JSON.parse(internalData);
			const cardsToProcess = data.selectedCards || [data];
			deckStore.batchUpdate(() => {
				for (const item of cardsToProcess) {
					if (!item.fromDeck || item.sourceBoard !== deckStore.activeBoard) {
						const isLocalSource = [
							"sideboard",
							"maybeboard",
							"commander",
							"companion",
							"mainboard",
						].includes(item.sourceBoard);

						if (item.sourceBoard !== deckStore.activeBoard) {
							if (isLocalSource) {
								deckStore.moveCard(
									item.name,
									item.sourceBoard,
									deckStore.activeBoard,
									item.id,
									item.price,
								);
							} else {
								deckStore.addCard(
									item.name,
									deckStore.activeBoard,
									item.price,
									item.card,
								);
							}
						}
					}
				}
			});
		}
	}

	/** @param {any} card */
	function getCardPrimaryKey(card) {
		const metadata = deckStore.metadata[card.name.toLowerCase()];
		const details = card.type_line ? card : metadata;
		if (!details) return "Unknown";
		if (details.notFound || card.notFound) return "Unknown";
		
		const basicLandNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
		const isBasicLandName = basicLandNames.some(name => card.name.toLowerCase().includes(name));
		const typeLineStr = (details.type_line || "").toLowerCase();
		const isLand = (typeLineStr.includes("land") || isBasicLandName) && !typeLineStr.includes("//");
		
		if (isLand) return "Lands";
		
		const tl = typeLineStr;
		if (tl.includes("creature")) return "Creatures";
		else if (tl.includes("planeswalker")) return "Planeswalkers";
		else if (tl.includes("instant")) return "Instants";
		else if (tl.includes("sorcery")) return "Sorceries";
		else if (tl.includes("artifact")) return "Artifacts";
		else if (tl.includes("enchantment")) return "Enchantments";
		else if (tl.includes("battle")) return "Battles";
		return "Other";
	}

	/**
	 * @param {any} card
	 * @param {string} key
	 */
	function cardMatchesKey(card, key) {
		const metadata = deckStore.metadata[card.name.toLowerCase()];
		const details = card.type_line ? card : metadata;
		if (!details) return false;
		const typeLineStr = (details.type_line || "").toLowerCase();
		
		if (key === "Creatures") return typeLineStr.includes("creature");
		if (key === "Planeswalkers") return typeLineStr.includes("planeswalker");
		if (key === "Instants") return typeLineStr.includes("instant");
		if (key === "Sorceries") return typeLineStr.includes("sorcery");
		if (key === "Artifacts") return typeLineStr.includes("artifact");
		if (key === "Enchantments") return typeLineStr.includes("enchantment");
		if (key === "Battles") return typeLineStr.includes("battle");
		if (key === "Lands") {
			const basicLandNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
			const isBasicLandName = basicLandNames.some(name => card.name.toLowerCase().includes(name));
			return typeLineStr.includes("land") || isBasicLandName;
		}
		return false;
	}
</script>

<svelte:window onclickcapture={handleWindowClick} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div 
	class="spoiler-view-container"
	bind:clientWidth={containerWidth}
	class:drag-over={isDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	style="--spoiler-cols: {gridGeometry.numColumns}; --card-width: {gridGeometry.cardWidth}px; --spoiler-gap: {gridGeometry.gap}px;"
>
	{#if groupedCategories.length === 0}
		<div class="empty-state" in:fade={{ duration: 400 }}>
			<div class="empty-card-illusion">
				<Layers size={40} class="empty-icon" />
			</div>
			<h3>Your visual board is empty</h3>
			<p>Drag and drop cards here or shift-click from Search results to build your deck list visually!</p>
		</div>
	{:else}
		{#snippet card(/** @type {any} */ item)}
			<div 
				class="spoiler-card-wrapper"
				class:is-editing={interactionStore.editingCardId === item.instances[0]?.id}
				class:is-illegal={item.isIllegal}
			>
				<CardShell
					card={item.instances[0] || item.card}
					price={item.price}
					inSearchPanel={false}
					zone={item.zone}
					disableTooltip={settingsStore.spoilerCardSize >= 0.60}
				>
					{#snippet children({
						isFlipped,
						isRotated,
						toggleFlip,
						toggleRotate,
					})}
						{#if interactionStore.editingCardId === item.instances[0]?.id}
							<input
								type="number"
								class="spoiler-badge-input"
								value={item.quantity}
								min="0"
								max="999"
								use:selectOnMount
								onclick={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
								onmousedown={(/** @type {MouseEvent} */ e) => e.stopPropagation()}
								onkeydown={(/** @type {KeyboardEvent} */ e) => {
									if (e.key === "Enter") {
										if (e.currentTarget instanceof HTMLInputElement) {
											const val = parseInt(e.currentTarget.value, 10);
											if (!isNaN(val) && val >= 0) {
												deckStore.setQuantity(item.name, item.zone, val, item.price, item.card);
											}
										}
										interactionStore.stopEditing();
									} else if (e.key === "Escape") {
										interactionStore.stopEditing();
									}
								}}
								onblur={(/** @type {FocusEvent} */ e) => {
									if (e.currentTarget instanceof HTMLInputElement) {
										const val = parseInt(e.currentTarget.value, 10);
										if (!isNaN(val) && val >= 0) {
											deckStore.setQuantity(item.name, item.zone, val, item.price, item.card);
										}
									}
									interactionStore.stopEditing();
								}}
							/>
						{:else if item.quantity > 1}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<button 
								type="button"
								class="spoiler-badge"
								onclick={(/** @type {MouseEvent} */ e) => {
									e.stopPropagation();
									e.preventDefault();
									interactionStore.startEditing(item.instances[0].id, item.zone, item.price);
								}}
								title="Click to edit quantity"
							>
								<span class="multiplier">&times;</span>{item.quantity}
							</button>
						{/if}
						{#if item.isIllegal}
							<div class="illegal-badge">
								FORMAT MISMATCH
							</div>
						{/if}

						{@const spoilerMeta = item.card?._metadata || item.card}
						{@const spoilerIsDfc = spoilerMeta?.card_faces && spoilerMeta.card_faces.length > 1 && spoilerMeta.card_faces[0]?.image_uris}
						<CardArt
							card={item.card}
							price={item.price}
							{isFlipped}
							{isRotated}
							{toggleFlip}
							{toggleRotate}
							showPrice={settingsStore.showPrices}
							loading={!item.card}
							hideControlsUntilHover={!spoilerIsDfc}
							flipBelowNameBar={true}
							lazy={deckStore.totalCount > 125}
						/>
					{/snippet}
				</CardShell>
			</div>
		{/snippet}

		<div class="spoiler-scroll-wrapper">
			{#if deckStore.splitView}
				{#each groupedCategories as category (category.name)}
					{#if category.cards.length > 0}
						<div class="category-section" in:fade={{ duration: 300 }}>
							<!-- Category Header (Interactive Collapse) -->
							<button 
								type="button"
								class="category-header"
								onclick={() => toggleCategoryCollapse(category.name)}
								aria-expanded={!collapsedCategories.has(category.name)}
							>
								<ChevronDown 
									size={14} 
									class="category-chevron {collapsedCategories.has(category.name) ? 'collapsed' : ''}"
								/>
								<span class="category-title">{category.name}</span>
								<span class="category-count">{category.totalQtyText || category.totalQty}</span>
								<div class="category-line"></div>
							</button>

							<!-- Cards Grid -->
							{#if !collapsedCategories.has(category.name)}
								<div 
									class="card-grid"
									transition:slide={{ duration: 250 }}
								>
									{#each category.cards as item (item.name)}
										{@render card(item)}
									{/each}
								</div>
							{/if}
						</div>
					{/if}
				{/each}
			{:else}
				<div class="card-grid">
					{#each allSpoilerCards as item (item.name)}
						{@render card(item)}
					{/each}
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.spoiler-view-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		overflow-x: hidden;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1), transparent);
		transition: background-color 0.2s ease;
		padding: 1.25rem var(--base-margin);
		scrollbar-gutter: stable;
	}

	.spoiler-view-container.drag-over {
		background: hsl(var(--primary) / 0.05);
	}

	.spoiler-scroll-wrapper {
		display: flex;
		flex-direction: column;
		gap: 2rem;
		padding-bottom: 3rem;
	}

	/* --- Category Header Styling --- */
	.category-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.category-header {
		display: flex;
		align-items: center;
		width: 100%;
		background: none;
		border: none;
		outline: none;
		cursor: pointer;
		padding: 0.75rem 0;
		text-align: left;
		gap: 0.5rem;
		transition: color 0.2s ease;
	}

	.category-header:hover .category-title {
		color: hsl(var(--foreground));
	}

	.category-header:hover :global(.category-chevron) {
		color: hsl(var(--foreground));
		transform: translateY(1px);
	}

	.category-header:hover :global(.category-chevron.collapsed) {
		transform: rotate(-90deg) translateX(-1px);
	}

	:global(.category-chevron) {
		color: hsl(var(--muted-foreground) / 0.6);
		transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), color 0.2s ease;
		flex-shrink: 0;
	}

	:global(.category-chevron.collapsed) {
		transform: rotate(-90deg);
	}

	.category-title {
		font-size: 0.75rem;
		font-weight: 700;
		color: hsl(var(--muted-foreground) / 0.85);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		transition: color 0.2s ease;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.category-count {
		font-size: 0.7rem;
		font-weight: 700;
		background: hsl(var(--foreground) / 0.06);
		color: hsl(var(--muted-foreground));
		padding: 3px 8px;
		border-radius: var(--radius-sm);
		line-height: 1;
		font-family: inherit;
		flex-shrink: 0;
		transition: background-color 0.2s, color 0.2s;
	}

	.category-header:hover .category-count {
		background: hsl(var(--foreground) / 0.12);
		color: hsl(var(--foreground));
	}

	.category-line {
		flex: 1;
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin-left: 0.75rem;
		transition: background-color 0.2s ease;
	}

	.category-header:hover .category-line {
		background: hsl(var(--border));
	}


	/* --- Card Grid Layout --- */
	.card-grid {
		display: grid;
		grid-template-columns: repeat(var(--spoiler-cols, 5), 1fr);
		gap: var(--spoiler-gap, 1.5rem);
		padding: 0.5rem 0;
	}

	.spoiler-card-wrapper {
		position: relative;
		width: 100%;
		aspect-ratio: 2.5 / 3.5;
		border-radius: 4.75% / 3.5%;
		transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
		will-change: transform;
	}

	.spoiler-card-wrapper:hover {
		transform: translateY(-6px) scale(1.03);
		z-index: 10;
	}

	.spoiler-card-wrapper.is-editing {
		z-index: 200;
		transform: none !important;
	}

	.spoiler-card-wrapper.is-illegal {
		outline: 2px solid hsl(var(--destructive));
		outline-offset: -2px;
		border-radius: var(--radius-md);
		box-shadow: 0 0 15px hsl(var(--destructive) / 0.3);
	}

	/* --- Overlay Badges --- */
	.spoiler-badge {
		position: absolute;
		top: 10px;
		right: 10px;
		background: rgba(0, 0, 0, 0.6);
		color: white;
		font-size: var(--font-xs);
		font-weight: 700;
		padding: 3px 8px;
		border-radius: 4px;
		z-index: 20;
		cursor: pointer;
		border: 1px solid rgba(255, 255, 255, 0.15);
		outline: none;
		font-family: inherit;
		backdrop-filter: blur(8px);
		line-height: 1;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
	}

	.spoiler-badge:hover {
		background: rgba(0, 0, 0, 0.85);
		transform: scale(1.1);
		border-color: hsl(var(--primary));
		box-shadow: 0 0 15px hsl(var(--primary) / 0.4);
	}

	.multiplier {
		opacity: 0.7;
		margin-right: 1px;
	}

	.spoiler-badge-input {
		position: absolute;
		top: 10px;
		right: 10px;
		background: rgba(0, 0, 0, 0.9);
		color: white;
		font-size: var(--font-xs);
		font-weight: 750;
		width: 46px;
		height: 22px;
		border-radius: 4px;
		z-index: 110;
		border: 1.5px solid #0066ff;
		outline: none;
		text-align: center;
		padding: 0;
		margin: 0;
		font-family: inherit;
		box-sizing: border-box;
		box-shadow: 0 0 8px rgba(0, 102, 255, 0.5);
		appearance: textfield;
		-moz-appearance: textfield;
	}
	.spoiler-badge-input::-webkit-outer-spin-button,
	.spoiler-badge-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}


	.illegal-badge {
		position: absolute;
		top: 10px;
		left: 50%;
		transform: translateX(-50%);
		background: hsl(var(--destructive));
		color: white;
		font-size: 8px;
		font-weight: 900;
		padding: 2px 6px;
		border-radius: 4px;
		z-index: 20;
		white-space: nowrap;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		pointer-events: none;
	}

	/* --- Empty State Styling --- */
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		text-align: center;
		padding: 4rem 2rem;
		color: hsl(var(--muted-foreground));
	}

	.empty-card-illusion {
		width: 100px;
		height: 140px;
		border: 2px dashed hsl(var(--border) / 0.8);
		border-radius: var(--radius-lg);
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--muted) / 0.05);
		box-shadow: inset 0 0 20px rgba(0, 0, 0, 0.2);
		transform: rotate(-3deg);
		transition: all 0.3s ease;
	}

	.empty-state:hover .empty-card-illusion {
		transform: rotate(0deg) scale(1.05);
		border-color: hsl(var(--primary) / 0.5);
		background: hsl(var(--muted) / 0.1);
		color: hsl(var(--foreground));
	}

	:global(.empty-icon) {
		opacity: 0.3;
		transition: opacity 0.3s ease;
	}

	.empty-state:hover :global(.empty-icon) {
		opacity: 0.6;
	}

	.empty-state h3 {
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.empty-state p {
		font-size: 0.875rem;
		max-width: 320px;
		line-height: 1.5;
		margin: 0;
	}
</style>
