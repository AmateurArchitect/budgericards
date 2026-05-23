<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { checkLegality } from "$lib/utils/legality.js";
	import { compareColors } from "$lib/utils/colors.js";
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

	// Parse mana symbols from Scryfall format
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
			result.push(m.slice(1, -1).toLowerCase().replace('/', ''));
		}
		return result;
	}

	// Group and sort card rows Reactively in Svelte 5
	const groupedCategories = $derived.by(() => {
		const grouping = deckStore.grouping?.toLowerCase() || "cmc";
		const effectiveGrouping = grouping === 'freeform' ? (deckStore.lastNaturalGrouping || 'cmc') : grouping;
		
		let boardCards = deckStore.currentBoardCards;
		const categories = [];

		// Prepend Commanders and Companions if viewing the mainboard
		if (deckStore.activeBoard === 'mainboard') {
			if (deckStore.commander.length > 0) {
				categories.push(processCategory("Commanders", deckStore.commander, 'commander'));
			}
			if (deckStore.companion.length > 0) {
				categories.push(processCategory("Companions", deckStore.companion, 'companion'));
			}
		}

		// Group current board cards
		/** @type {Record<string, any[]>} */
		const groups = {};

		for (const card of boardCards) {
			const metadata = deckStore.metadata[card.name.toLowerCase()];
			const details = card.type_line ? card : metadata;

			let groupKey = "Other";

			const basicLandNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
			const isBasicLand = details ? basicLandNames.some(name => card.name.toLowerCase().includes(name)) : false;
			const typeLineStr = details?.type_line?.toLowerCase() || "";
			const isLand = details ? ((typeLineStr.includes("land") || isBasicLand) && !typeLineStr.includes("//")) : false;

			if (!details) {
				groupKey = "Unknown";
			} else if (effectiveGrouping === "none") {
				groupKey = "Deck";
			} else if (effectiveGrouping === "creature") {
				if (isLand) {
					groupKey = "Lands";
				} else if (typeLineStr.includes("creature")) {
					groupKey = "Creatures";
				} else {
					groupKey = "Non-Creatures";
				}
			} else if (effectiveGrouping === "color") {
				if (isLand) {
					groupKey = "Lands";
				} else {
					const colorIds = settingsStore.useColorIdentity ? (details.color_identity || []) : (details.colors || []);
					if (colorIds.length === 0) groupKey = "Colorless";
					else if (colorIds.length > 1) groupKey = "Multicolor";
					else {
						/** @type {Record<string, string>} */
						const colorNames = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
						groupKey = colorNames[colorIds[0]] || "Colorless";
					}
				}
			} else if (effectiveGrouping === "cmc") {
				if (isLand) {
					groupKey = "Lands";
				} else {
					const cmc = details.cmc || 0;
					const floorCmc = Math.floor(cmc);
					if (settingsStore.combine01Drops && (floorCmc === 0 || floorCmc === 1)) groupKey = "0-1 Drop";
					else if (settingsStore.combine6PlusDrops && cmc >= 6) groupKey = "6-Drop+";
					else groupKey = `${floorCmc}-Drop`;
				}
			} else if (effectiveGrouping === "type") {
				if (isLand) {
					groupKey = "Lands";
				} else if (typeLineStr.includes("creature")) groupKey = "Creatures";
				else if (typeLineStr.includes("planeswalker")) groupKey = "Planeswalkers";
				else if (typeLineStr.includes("instant")) groupKey = "Instants";
				else if (typeLineStr.includes("sorcery")) groupKey = "Sorceries";
				else if (typeLineStr.includes("artifact")) groupKey = "Artifacts";
				else if (typeLineStr.includes("enchantment")) groupKey = "Enchantments";
				else groupKey = "Other";
			}

			if (!groups[groupKey]) groups[groupKey] = [];
			groups[groupKey].push(card);
		}

		// Group key ordering logic
		let orderedKeys = [];
		if (effectiveGrouping === "none") {
			orderedKeys = ["Deck"];
		} else if (effectiveGrouping === "creature") {
			orderedKeys = ["Creatures", "Non-Creatures", "Unknown", "Lands"];
		} else if (effectiveGrouping === "cmc") {
			orderedKeys = ["0-1 Drop", "0-Drop", "1-Drop", "2-Drop", "3-Drop", "4-Drop", "5-Drop", "6-Drop+", "Unknown", "Lands"];
		} else if (effectiveGrouping === "color") {
			orderedKeys = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Unknown", "Lands"];
		} else {
			orderedKeys = ["Creatures", "Planeswalkers", "Instants", "Sorceries", "Artifacts", "Enchantments", "Other", "Unknown", "Lands"];
		}

		for (const key of Object.keys(groups)) {
			if (!orderedKeys.includes(key)) {
				orderedKeys.push(key);
			}
		}

		for (const key of orderedKeys) {
			const cardsInGroup = groups[key] || [];
			if (cardsInGroup.length > 0) {
				categories.push(processCategory(key, cardsInGroup, deckStore.activeBoard));
			}
		}
		return categories;
	});

	const allSpoilerCards = $derived.by(() => {
		const cards = [];
		for (const category of groupedCategories) {
			cards.push(...category.cards);
		}
		return cards;
	});

	// Process category cards: sum quantities, fetch prices, parse mana, and sort internally
	/**
	 * @param {string} groupName
	 * @param {any[]} rawCards
	 * @param {string} zone
	 */
	function processCategory(groupName, rawCards, zone) {
		const grouped = new Map();

		for (const card of rawCards) {
			let entry = grouped.get(card.name);
			if (!entry) {
				const metadata = deckStore.metadata[card.name.toLowerCase()];
				const details = card.type_line ? card : metadata;

				const price = card.price !== null && card.price !== undefined && card.price !== 0 
					? card.price 
					: (details?.prices?.usd || details?.prices?.usd_foil || 0);

				const legality = checkLegality(details || card);

				entry = {
					name: card.name,
					card: details || card,
					zone,
					price: parseFloat(price) || 0,
					quantity: 0,
					instances: [],
					artUrl: details?.image_uris?.art_crop || details?.card_faces?.[0]?.image_uris?.art_crop || "",
					imgUrl: details?.image_uris?.normal || details?.card_faces?.[0]?.image_uris?.normal || "",
					type: details?.type_line || "Unknown",
					manaSymbols: parseManaCost(details?.mana_cost || ""),
					isIllegal: !legality.isLegal,
					legalityReasons: legality.reasons,
					addedAt: card.addedAt || 0,
					cmc: details?.cmc !== undefined ? details.cmc : 0,
					color_identity: details?.color_identity || [],
					colors: details?.colors || []
				};
				grouped.set(card.name, entry);
			}
			entry.quantity++;
			// Keep scryCount updated with quantity for InlineQuantityEditor compat
			const instanceWithQty = {
				...card,
				stackCount: entry.quantity
			};
			entry.instances.push(instanceWithQty);
		}

		// Update instances array with final stack counts
		const cardRows = Array.from(grouped.values()).map(row => {
			row.instances.forEach((/** @type {any} */ inst) => {
				inst.stackCount = row.quantity;
			});
			return row;
		});

		// Sort the processed card rows
		const sortFn = createSortFn(deckStore.sorting);
		cardRows.sort(sortFn);

		const totalQty = cardRows.reduce((sum, r) => sum + r.quantity, 0);
		const totalPrice = cardRows.reduce((sum, r) => sum + (r.price * r.quantity), 0);

		return {
			name: groupName,
			cards: cardRows,
			totalQty,
			totalPrice
		};
	}

	/** @param {string} name */
	function isBasicLand(name) {
		if (!name) return false;
		const n = name.toLowerCase();
		const basicNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
		return basicNames.some(b => n.includes(b));
	}

	/** @param {string} name */
	function getBasicLandWeight(name) {
		if (!name) return 99;
		const n = name.toLowerCase();
		if (n.includes("plains")) return 1;
		if (n.includes("island")) return 2;
		if (n.includes("swamp")) return 3;
		if (n.includes("mountain")) return 4;
		if (n.includes("forest")) return 5;
		if (n.includes("wastes")) return 6;
		return 99;
	}

	/**
	 * @param {string} sorting
	 */
	function createSortFn(sorting) {
		return (/** @type {any} */ a, /** @type {any} */ b) => {
			const aIsBasic = isBasicLand(a.name);
			const bIsBasic = isBasicLand(b.name);
			
			// Push basic lands to the END in visual spoiler
			if (aIsBasic && !bIsBasic) return 1;
			if (!aIsBasic && bIsBasic) return -1;
			if (aIsBasic && bIsBasic) {
				const weightDiff = getBasicLandWeight(a.name) - getBasicLandWeight(b.name);
				if (weightDiff !== 0) return weightDiff;
			}

			const primary = compare(a, b, sorting);
			if (primary !== 0) {
				return deckStore.sortAscending ? primary : -primary;
			}
			return a.name.localeCompare(b.name);
		};
	}

	/**
	 * @param {any} a
	 * @param {any} b
	 * @param {string} factor
	 */
	function compare(a, b, factor) {
		if (factor === "name") return a.name.localeCompare(b.name);
		if (factor === "added") return a.addedAt - b.addedAt;
		if (factor === "price") return a.price - b.price;
		if (factor === "cmc") {
			const aIsLand = (a.type || "").toLowerCase().includes("land");
			const bIsLand = (b.type || "").toLowerCase().includes("land");
			const aCmc = aIsLand ? -1 : (a.cmc || 0);
			const bCmc = bIsLand ? -1 : (b.cmc || 0);
			return aCmc - bCmc;
		}
		if (factor === "mana") {
			const cmcDiff = (a.cmc || 0) - (b.cmc || 0);
			if (cmcDiff !== 0) return cmcDiff;
			
			/** @type {Record<string, number>} */
			const colorWeights = { "": 0, W: 1, U: 2, B: 3, R: 4, G: 5, WU: 6, UB: 7, BR: 8, RG: 9, WG: 10, WB: 11, UR: 12, BG: 13, WR: 14, UG: 15 };
			const getWeight = (/** @type {any} */ id) => colorWeights[[...(id || [])].sort((/** @type {any} */ a, /** @type {any} */ b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b)).join("")] ?? 99;
			return getWeight(a.color_identity || a.colors) - getWeight(b.color_identity || b.colors);
		}
		if (factor === "type") return (a.type || "").localeCompare(b.type || "");
		if (factor === "qty") return a.quantity - b.quantity;
		if (factor === "printing") return (a.card?.set || "").localeCompare(b.card?.set || "");
		if (factor === "color") {
			return compareColors(a, b, settingsStore.useColorIdentity);
		}
		return 0;
	}

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
					card={item.card}
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
								onclick={(e) => e.stopPropagation()}
								onmousedown={(e) => e.stopPropagation()}
								onkeydown={(e) => {
									if (e.key === "Enter") {
										const val = parseInt(e.currentTarget.value, 10);
										if (!isNaN(val) && val >= 0) {
											deckStore.setQuantity(item.name, item.zone, val, item.price, item.card);
										}
										interactionStore.stopEditing();
									} else if (e.key === "Escape") {
										interactionStore.stopEditing();
									}
								}}
								onblur={(e) => {
									const val = parseInt(e.currentTarget.value, 10);
									if (!isNaN(val) && val >= 0) {
										deckStore.setQuantity(item.name, item.zone, val, item.price, item.card);
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
								onclick={(e) => {
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

						<CardArt
							card={item.card}
							price={item.price}
							{isFlipped}
							{isRotated}
							{toggleFlip}
							{toggleRotate}
							showPrice={settingsStore.showPrices}
							loading={!item.card}
							hideControlsUntilHover={true}
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
								<span class="category-count">{category.totalQty}</span>
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
		background: rgba(var(--primary-hsl), 0.05);
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
		box-shadow: 0 0 15px hsla(var(--primary-hsl), 0.4);
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
