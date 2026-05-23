<script>
	import { onMount } from "svelte";
	import { flip } from "svelte/animate";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import {
		createStacksEngine,
		getStackCount,
	} from "$lib/layouts/stacks.svelte.js";

	import CardShell from "./CardShell.svelte";
	import CardArt from "./CardArt.svelte";
	import StackHeader from "./StackHeader.svelte";

	const engine = createStacksEngine();

	let isInitialLoad = $state(true);

	// --- FREEFORM EPHEMERAL STATE ---
	let freeformLayout = $state(new Map());

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
	/** @type {string[]} */
	let freeformColumnOrder = $state([]);
	let renamingColumn = $state(/** @type {string | null} */ (null));
	let renameValue = $state("");
	let insertDropZoneActive = $state(/** @type {number | null} */ (null));

	// The Layout Brain (Now derived below to handle grouping)
	let scrollContainer = $state(/** @type {HTMLElement | null} */ (null));

	// --- FREEFORM LOGIC ---
	$effect(() => {
		if (deckStore.grouping === "freeform") {
			if (freeformColumnOrder.length === 0 && rows.length > 0) {
				const flatCols = rows[0].columns;
				let order = flatCols.map((/** @type {any} */ c) => c.key);
				freeformColumnOrder = order.length > 0 ? order : ["Column 1"];

				const newMap = new Map();
				for (const row of rows) {
					for (const col of row.columns) {
						col.stacks.forEach((/** @type {any} */ s) =>
							s.cards.forEach((/** @type {any} */ c) =>
								newMap.set(c.id, col.key),
							),
						);
					}
				}
				freeformLayout = newMap;
			}
		} else {
			if (freeformLayout.size > 0) freeformLayout = new Map();
			if (freeformColumnOrder.length > 0) freeformColumnOrder = [];
			renamingColumn = null;
		}
	});

	/** @param {string} colKey */
	function startRename(colKey) {
		renamingColumn = colKey;
		renameValue = colKey;
	}

	/** @param {string} oldKey */
	function commitRename(oldKey) {
		const newKey = renameValue.trim();
		if (!newKey || newKey === oldKey) {
			renamingColumn = null;
			return;
		}
		freeformColumnOrder = freeformColumnOrder.map((k) =>
			k === oldKey ? newKey : k,
		);
		const newMap = new Map(freeformLayout);
		for (const [id, col] of freeformLayout) {
			if (col === oldKey) newMap.set(id, newKey);
		}
		freeformLayout = newMap;
		renamingColumn = null;
	}

	function pruneEmptyFreeformColumns() {
		if (deckStore.grouping !== "freeform" || rows.length === 0) return;
		const activeKeys = new Set();
		for (const row of rows) {
			for (const col of row.columns) {
				if (
					col.stacks.some(
						(/** @type {any} */ s) => s.cards.length > 0,
					)
				)
					activeKeys.add(col.key);
			}
		}
		freeformColumnOrder = freeformColumnOrder.filter((k) =>
			activeKeys.has(k),
		);
	}

	// --- WHEEL HANDLING ---
	/** @param {WheelEvent} e */
	function handleWheel(e) {
		const container = /** @type {HTMLElement} */ (e.currentTarget);
		if (e.shiftKey && container.scrollWidth > container.clientWidth) {
			container.scrollLeft += e.deltaY;
			e.preventDefault();
			return;
		}
		if (
			container.scrollWidth > container.clientWidth &&
			container.scrollHeight <= container.clientHeight &&
			Math.abs(e.deltaY) > Math.abs(e.deltaX)
		) {
			container.scrollLeft += e.deltaY;
			e.preventDefault();
		}
	}

	// --- DRAG & DROP ---
	let isDragOver = $state(false);
	/** @param {DragEvent} e */
	function handleDragOver(e) {
		e.preventDefault();
		isDragOver = true;
	}
	function handleDragLeave() {
		isDragOver = false;
	}

	/** @param {DragEvent} e */
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
			const targetCol =
				e.target instanceof HTMLElement
					? /** @type {HTMLElement | null} */ (
							e.target.closest(".grid-cell")
						)
					: null;
			const targetStack =
				e.target instanceof HTMLElement
					? /** @type {HTMLElement | null} */ (
							e.target.closest(".curve-col-stack") ||
								e.target.closest(".ghost-stack")
						)
					: null;

			const colKey = targetCol?.dataset.columnKey;
			const stackId = targetStack?.dataset.stackId;

			let targetBoard = deckStore.activeBoard;
			if (colKey === "Special") {
				const typeLine = (data.card.type_line || "").toLowerCase();
				const oracle = (data.card.oracle_text || "").toLowerCase();
				const facesOracle = (data.card.card_faces || [])
					.map((/** @type {any} */ f) =>
						(f.oracle_text || "").toLowerCase(),
					)
					.join(" ");

				const isLegendaryCreature =
					typeLine.includes("legendary") &&
					typeLine.includes("creature");
				const isPlaneswalker = typeLine.includes("planeswalker");
				const isCompanion =
					oracle.includes("companion —") ||
					facesOracle.includes("companion —");

				if (stackId === "companions") {
					if (!isCompanion) return;
					targetBoard = "companion";
				} else {
					const canBeCommander =
						isLegendaryCreature ||
						(["Brawl", "Oathbreaker"].includes(deckStore.format) &&
							isPlaneswalker);
					if (!canBeCommander) return;
					targetBoard = "commander";
				}
			}

			let addedId = null;
			if (
				!data.fromDeck ||
				colKey === "Special" ||
				data.sourceBoard !== targetBoard
			) {
				const isLocalSource = [
					"sideboard",
					"maybeboard",
					"garbage",
					"commander",
					"companion",
					"mainboard",
				].includes(data.sourceBoard);

				// If it's a move to a special board, or from a different board
				if (data.sourceBoard !== targetBoard) {
					// Swap logic for special boards: if targeting commander/companion and it's full, move existing back
					if (
						targetBoard === "commander" ||
						targetBoard === "companion"
					) {
						const currentCards = deckStore[targetBoard];
						if (currentCards.length > 0) {
							// For commander, check if we should swap (non-partner case)
							const isCommander = targetBoard === "commander";
							const existingCommander = currentCards[0];

							// Simple swap logic: if it's already occupied, move the first one back
							// (Future: support partner logic here too, but for now swap is safer)
							[...currentCards].forEach((c) => {
								deckStore.moveCard(
									c.name,
									targetBoard,
									"mainboard",
									c.id,
									c.price,
								);
							});
						}
					}

					addedId = isLocalSource
						? deckStore.moveCard(
								data.name,
								data.sourceBoard,
								targetBoard,
								data.id,
								data.price,
							)
						: deckStore.addCard(
								data.name,
								targetBoard,
								data.price,
								data.card,
							);
				}

				if (
					deckStore.grouping === "freeform" &&
					addedId &&
					targetBoard === deckStore.activeBoard
				) {
					const targetKey =
						colKey &&
						colKey !== "special" &&
						colKey !== "Commanders" &&
						colKey !== "Companions"
							? colKey
							: freeformColumnOrder[0];
					const newMap = new Map(freeformLayout);
					newMap.set(String(addedId), targetKey);
					freeformLayout = newMap;
				}
			} else if (
				deckStore.grouping === "freeform" &&
				colKey &&
				colKey !== "special" &&
				colKey !== "Commanders" &&
				colKey !== "Companions"
			) {
				const newMap = new Map(freeformLayout);
				newMap.set(data.id, colKey);
				freeformLayout = newMap;
				pruneEmptyFreeformColumns();
			}
		}
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} insertIndex
	 */
	function handleInsertZoneDrop(e, insertIndex) {
		insertDropZoneActive = null;
		if (!e.dataTransfer || deckStore.grouping !== "freeform") return;
		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (!internalData) return;
		e.preventDefault();
		e.stopPropagation();
		const data = JSON.parse(internalData);
		const newColKey = `Column ${freeformColumnOrder.length + 1}`;
		const newOrder = [...freeformColumnOrder];
		newOrder.splice(insertIndex, 0, newColKey);
		freeformColumnOrder = newOrder;

		if (data.fromDeck) {
			const newMap = new Map(freeformLayout);
			newMap.set(data.id, newColKey);
			freeformLayout = newMap;
		} else {
			const addedId = deckStore.addCard(
				data.name,
				deckStore.activeBoard,
				data.price,
				data.card,
			);
			if (addedId) {
				const newMap = new Map(freeformLayout);
				newMap.set(String(addedId), newColKey);
				freeformLayout = newMap;
			}
		}
		pruneEmptyFreeformColumns();
	}

	onMount(() => {
		const timer = setTimeout(() => (isInitialLoad = false), 1200);
		return () => clearTimeout(timer);
	});

	const layoutData = $derived(
		engine.calculateLayout({
			freeformLayout,
			freeformColumnOrder,
		}),
	);
	/** @type {any[]} */
	const rows = $derived(layoutData.rows || layoutData); // Handle both old and new return types
	/** @type {any[]} */
	const typeGroups = $derived(layoutData.typeGroups || []);
	const columnTrackMap = $derived(layoutData.columnTrackMap || new Map());
	const masterColCount = $derived(layoutData.masterColCount || 0);

	const gridTemplateColumns = $derived.by(() => {
		const baseCount = Math.max(masterColCount, layoutStore.numCols);

		if (typeGroups.length === 0) {
			return `repeat(${baseCount}, var(--card-width))`;
		}

		// Build specific track widths for Type Split view
		const tracks = [];
		for (let i = 1; i <= baseCount; i++) {
			const isColumn = Array.from(columnTrackMap.values()).includes(i);
			if (isColumn) {
				tracks.push("var(--card-width)");
			} else {
				// It's a spacer track or empty track padding
				tracks.push("var(--column-gap)");
			}
		}
		return tracks.join(" ");
	});

	const gridGap = $derived("var(--column-gap)");

	const showCompanionGhost = $derived.by(() => {
		// If we already have a companion selected, hide the ghost
		if (deckStore.companion.length > 0) return false;

		// Only show the ghost if a companion-capable card is present in the deck
		return [
			...deckStore.mainboard,
			...deckStore.sideboard,
			...deckStore.maybeboard,
		].some((c) => {
			const m = deckStore.metadata[c.name.toLowerCase()];
			const oracle = (m?.oracle_text || "").toLowerCase();
			const facesOracle = /** @type {any[]} */ (m?.card_faces || [])
				.map((/** @type {any} */ f) =>
					(f.oracle_text || "").toLowerCase(),
				)
				.join(" ");
			return (
				oracle.includes("companion —") ||
				facesOracle.includes("companion —")
			);
		});
	});
</script>

<svelte:window onclickcapture={handleWindowClick} />

<div
	class="deck-curve-container"
	onwheel={handleWheel}
	bind:this={scrollContainer}
	class:drag-over={isDragOver}
	class:initial-load={isInitialLoad}
	class:condensed={layoutStore.isCondensed}
	class:spacious={settingsStore.curveSpacing === "spacious"}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
	aria-label="Deck stacks view"
	data-board={deckStore.activeBoard}
>
	<div class="scroll-spacer-left"></div>

	<div
		class="curve-layout"
		style="grid-template-columns: {gridTemplateColumns}; column-gap: {gridGap};"
	>
		{#if typeGroups.length > 0}
			{#each typeGroups as group}
				<div
					class="grid-cell group-header-cell"
					style="grid-column: {group.startTrack} / span {group.span}; grid-row: 1;"
				>
					<StackHeader
						label={group.label}
						count={group.count}
						type="row"
					/>
				</div>
			{/each}
		{/if}

		{#each rows as row, rowIdx (row.id)}
			<!-- Row Headers -->
			{#if row.label}
				{@const totalCols = Math.max(
					masterColCount,
					layoutStore.numCols,
				)}
				{@const hasSpecial = columnTrackMap.has("Special")}
				{@const hasSpanningLands = row.columns.some(
					(/** @type {any} */ c) => c.key === "Lands",
				)}
				<div
					class="grid-cell row-header-cell"
					style="grid-column: {hasSpecial ? 2 : 1} / span {totalCols -
						(hasSpecial ? 1 : 0) -
						(hasSpanningLands
							? 1
							: 0)}; grid-row: {typeGroups.length > 0
						? rowIdx * 3 + 2
						: rowIdx * 3 + 1};"
				>
					<StackHeader
						label={row.label}
						count={row.columns.reduce(
							(/** @type {number} */ sum, /** @type {any} */ c) =>
								sum +
								c.stacks.reduce(
									(
										/** @type {number} */ ss,
										/** @type {any} */ s,
									) => ss + getStackCount(s.cards),
									0,
								),
							0,
						)}
						type="row"
					/>
				</div>
			{/if}

			{#each row.columns as column, colIdx (column.key)}
				<!-- Column Header -->
				{#if settingsStore.showColumnHeaders && column.label && column.key !== "Special"}
					{@const isLands = column.key === "Lands"}
					{@const colTrack = columnTrackMap.get(column.key)}
					{@const finalColTrack =
						isLands && typeGroups.length === 0
							? Math.max(colTrack, layoutStore.numCols)
							: colTrack}
					<div
						class="grid-cell column-header-cell"
						data-column-key={column.key}
						style="grid-column: {finalColTrack}; grid-row: {typeGroups.length >
						0
							? rowIdx * 3 + 3
							: isLands
								? 2
								: rowIdx * 3 + 2};"
					>
						<StackHeader
							label={column.label}
							count={column.stacks.reduce(
								(
									/** @type {number} */ sum,
									/** @type {any} */ s,
								) => sum + getStackCount(s.cards),
								0,
							)}
							type="column"
							colKey={column.key}
							{renamingColumn}
							{renameValue}
							onRename={startRename}
							onCommit={commitRename}
							onCancel={() => (renamingColumn = null)}
						/>
					</div>
				{/if}

				<!-- Stacks -->
				{@const isLands = column.key === "Lands"}
				{@const colTrack = columnTrackMap.get(column.key)}
				{@const finalColTrack =
					isLands && typeGroups.length === 0
						? Math.max(colTrack, layoutStore.numCols)
						: colTrack}
				<div
					class="grid-cell stack-container-cell"
					data-column-key={column.key}
					style="grid-column: {finalColTrack}; 
							grid-row: {typeGroups.length > 0
						? column.key === 'Special'
							? `${rowIdx * 3 + 3} / span 2`
							: rowIdx * 3 + 4
						: isLands
							? '3 / span 10'
							: column.key === 'Special'
								? `${rowIdx * 3 + 2} / span 2`
								: rowIdx * 3 + 3};"
				>
					{#if column.key === "Special"}
						<!-- Commanders Slot -->
						{@const commanderStack = column.stacks.find(
							(/** @type {any} */ s) => s.id === "commanders",
						)}
						{#if commanderStack}
							<div class="special-slot-container">
								<StackHeader
									label="Commanders"
									count={getStackCount(commanderStack.cards)}
									type="stack"
								/>
								{#if commanderStack.cards.length > 0}
									<div
										class="curve-col-stack"
										data-stack-id="commanders"
									>
										{#each commanderStack.cards as item, idx (item.id)}
											<div
												animate:flip={{ duration: 200 }}
												class="curve-card-item"
												class:has-badge={item.isStack}
												class:illegal-format={item._isIllegalFormat}
												class:is-editing={interactionStore.editingCardId === item.id}
												style="z-index: {idx +
													1}; --delay: {idx * 20}ms;"
											>
												<CardShell
													card={item}
													price={item.price}
													inSearchPanel={false}
													zone="commander"
												>
													{#snippet children({
														isFlipped,
														isRotated,
														toggleFlip,
														toggleRotate,
													})}
														{#if interactionStore.editingCardId === item.id}
															<input
																type="number"
																class="stack-badge-input"
																value={item.stackCount || 1}
																min="0"
																max="999"
																use:selectOnMount
																onclick={(e) => e.stopPropagation()}
																onmousedown={(e) => e.stopPropagation()}
																onkeydown={(e) => {
																	if (e.key === "Enter") {
																		const val = parseInt(e.currentTarget.value, 10);
																		if (!isNaN(val) && val >= 0) {
																			deckStore.setQuantity(item.name, "commander", val, item.price, item);
																		}
																		interactionStore.stopEditing();
																	} else if (e.key === "Escape") {
																		interactionStore.stopEditing();
																	}
																}}
																onblur={(e) => {
																	const val = parseInt(e.currentTarget.value, 10);
																	if (!isNaN(val) && val >= 0) {
																		deckStore.setQuantity(item.name, "commander", val, item.price, item);
																	}
																	interactionStore.stopEditing();
																}}
															/>
														{:else if item.isStack}
															<!-- svelte-ignore a11y_click_events_have_key_events -->
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<button 
																type="button"
																class="stack-badge"
																onclick={(e) => {
																	e.stopPropagation();
																	e.preventDefault();
																	interactionStore.startEditing(item.id, "commander", item.price);
																}}
															>
																<span
																	class="multiplier"
																	>&times;</span
																>{item.stackCount}
															</button>
														{/if}
														{#if item._isIllegalFormat}
															<div class="illegal-badge">
																FORMAT MISMATCH
															</div>
														{/if}
														<CardArt
															card={item}
															price={item.price}
															{isFlipped}
															{isRotated}
															{toggleFlip}
															{toggleRotate}
															showPrice={false}
															loading={!item._metadata}
															hideControlsUntilHover={true}
														/>
													{/snippet}
												</CardShell>
											</div>
										{/each}
									</div>
								{:else}
									<div
										class="ghost-stack"
										data-stack-id="commanders"
									>
										<div class="ghost-card">
											<span class="ghost-label"
												>ADD COMMANDER</span
											>
										</div>
									</div>
								{/if}
							</div>
						{/if}
						
						<!-- Companions Slot -->
						{@const companionStack = column.stacks.find(
							(/** @type {any} */ s) => s.id === "companions",
						)}
						{#if showCompanionGhost || (companionStack && companionStack.cards.length > 0)}
							<div class="special-slot-container">
								<StackHeader
									label="Companions"
									count={getStackCount(
										companionStack?.cards || [],
									)}
									type="stack"
								/>
								{#if companionStack && companionStack.cards.length > 0}
									<div
										class="curve-col-stack"
										data-stack-id="companions"
									>
										{#each companionStack.cards as item, idx (item.id)}
											<div
												animate:flip={{ duration: 200 }}
												class="curve-card-item"
												class:has-badge={item.isStack}
												class:illegal-format={item._isIllegalFormat}
												class:is-editing={interactionStore.editingCardId === item.id}
												style="z-index: {idx +
													1}; --delay: {idx * 20}ms;"
											>
												<CardShell
													card={item}
													price={item.price}
													inSearchPanel={false}
													zone="companion"
												>
													{#snippet children({
														isFlipped,
														isRotated,
														toggleFlip,
														toggleRotate,
													})}
														{#if interactionStore.editingCardId === item.id}
															<input
																type="number"
																class="stack-badge-input"
																value={item.stackCount || 1}
																min="0"
																max="999"
																use:selectOnMount
																onclick={(e) => e.stopPropagation()}
																onmousedown={(e) => e.stopPropagation()}
																onkeydown={(e) => {
																	if (e.key === "Enter") {
																		const val = parseInt(e.currentTarget.value, 10);
																		if (!isNaN(val) && val >= 0) {
																			deckStore.setQuantity(item.name, "companion", val, item.price, item);
																		}
																		interactionStore.stopEditing();
																	} else if (e.key === "Escape") {
																		interactionStore.stopEditing();
																	}
																}}
																onblur={(e) => {
																	const val = parseInt(e.currentTarget.value, 10);
																	if (!isNaN(val) && val >= 0) {
																		deckStore.setQuantity(item.name, "companion", val, item.price, item);
																	}
																	interactionStore.stopEditing();
																}}
															/>
														{:else if item.isStack}
															<!-- svelte-ignore a11y_click_events_have_key_events -->
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<button 
																type="button"
																class="stack-badge"
																onclick={(e) => {
																	e.stopPropagation();
																	e.preventDefault();
																	interactionStore.startEditing(item.id, "companion", item.price);
																}}
															>
																<span
																	class="multiplier"
																	>&times;</span
																>{item.stackCount}
															</button>
														{/if}
														{#if item._isIllegalFormat}
															<div class="illegal-badge">
																FORMAT MISMATCH
															</div>
														{/if}
														<CardArt
															card={item}
															price={item.price}
															{isFlipped}
															{isRotated}
															{toggleFlip}
															{toggleRotate}
															showPrice={false}
															loading={!item._metadata}
															hideControlsUntilHover={true}
														/>
													{/snippet}
												</CardShell>
											</div>
										{/each}
									</div>
								{:else}
									<div
										class="ghost-stack"
										data-stack-id="companions"
									>
										<div class="ghost-card">
											<span class="ghost-label"
												>ADD COMPANION</span
											>
										</div>
									</div>
								{/if}
							</div>
						{/if}
					{/if}

					{#if column.key !== "Special"}
						{#each column.stacks as stack, stackIdx (stack.id)}
							<div
								class="curve-col-stack"
								class:empty-stack={stack.cards.length === 0}
								data-stack-id={stack.id}
							>
								{#if stack.label}
									<StackHeader
										label={stack.label}
										count={getStackCount(stack.cards)}
										type="stack"
									/>
								{/if}
								{#each stack.cards as item, idx (item.id)}
									<div
										animate:flip={{ duration: 200 }}
										class="curve-card-item"
										class:has-badge={item.isStack}
										class:illegal-format={item._isIllegalFormat}
										class:is-editing={interactionStore.editingCardId === item.id}
										style="z-index: {idx +
											1}; --delay: {idx * 20}ms;"
									>
										<CardShell
											card={item}
											price={item.price}
											inSearchPanel={false}
										>
											{#snippet children({
												isFlipped,
												isRotated,
												toggleFlip,
												toggleRotate,
											})}
														{#if interactionStore.editingCardId === item.id}
															<input
																type="number"
																class="stack-badge-input"
																value={item.stackCount || 1}
																min="0"
																max="999"
																use:selectOnMount
																onclick={(e) => e.stopPropagation()}
																onmousedown={(e) => e.stopPropagation()}
																onkeydown={(e) => {
																	if (e.key === "Enter") {
																		const val = parseInt(e.currentTarget.value, 10);
																		if (!isNaN(val) && val >= 0) {
																			deckStore.setQuantity(item.name, deckStore.activeBoard, val, item.price, item);
																		}
																		interactionStore.stopEditing();
																	} else if (e.key === "Escape") {
																		interactionStore.stopEditing();
																	}
																}}
																onblur={(e) => {
																	const val = parseInt(e.currentTarget.value, 10);
																	if (!isNaN(val) && val >= 0) {
																		deckStore.setQuantity(item.name, deckStore.activeBoard, val, item.price, item);
																	}
																	interactionStore.stopEditing();
																}}
															/>
														{:else if item.isStack}
															<!-- svelte-ignore a11y_click_events_have_key_events -->
															<!-- svelte-ignore a11y_no_static_element_interactions -->
															<button 
																type="button"
																class="stack-badge"
																onclick={(e) => {
																	e.stopPropagation();
																	e.preventDefault();
																	interactionStore.startEditing(item.id, deckStore.activeBoard, item.price);
																}}
															>
																<span class="multiplier"
																	>&times;</span
																>{item.stackCount}
															</button>
														{/if}
														{#if item._isIllegalFormat}
															<div class="illegal-badge">
																FORMAT MISMATCH
															</div>
														{/if}
														<CardArt
															card={item}
															price={item.price}
															{isFlipped}
															{isRotated}
															{toggleFlip}
															{toggleRotate}
															showPrice={false}
															loading={!item._metadata}
															hideControlsUntilHover={true}
														/>
													{/snippet}
												</CardShell>
									</div>
								{/each}
							</div>
						{/each}

						<!-- Ghost Cards -->
						{#if column.key !== "Lands" && column.stacks.length === 0}
							<div class="ghost-card"></div>
						{/if}
					{/if}
				</div>
			{/each}
		{/each}
	</div>

	<div class="scroll-spacer-right"></div>
</div>

<style>
	.deck-curve-container {
		flex: 1;
		display: flex;
		align-items: flex-start;
		overflow-x: auto;
		overflow-y: auto;
		scrollbar-gutter: stable;
		padding: 1.25rem 0;
		scroll-behavior: smooth;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.1), transparent);
	}

	.curve-layout {
		display: grid;
		column-gap: var(--column-gap);
		row-gap: 0;
		padding-bottom: 2rem;
		align-items: start;
		align-content: start;
		/* Enforce header rows to stay compact while allowing stacks to grow */
		grid-template-rows: repeat(2, min-content) 1fr;
	}

	.grid-cell.group-header-cell {
		grid-row: 1;
		width: 100%;
		padding: 0;
		margin-bottom: 0;
	}

	.grid-cell {
		width: var(--card-width);
	}

	.row-header-cell {
		/* Add space before row headers except the first one */
		margin-top: 2.5rem;
	}
	.row-header-cell:first-child {
		margin-top: 0;
	}

	.curve-col-stack {
		display: flex;
		flex-direction: column;
		position: relative;
		padding-bottom: calc(var(--card-width) * 1.4 * 0.85);
	}
	.curve-col-stack.empty-stack {
		padding-bottom: 0;
	}

	.special-slot-container {
		display: flex;
		flex-direction: column;
		margin-bottom: 2rem;
	}
	.special-slot-container:last-child {
		margin-bottom: 0;
	}

	.curve-col-stack::-webkit-scrollbar {
		display: none;
	}
	.curve-col-stack {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}

	/* --- Card Stack Styling (Derived from documentation) --- */
	:root {
		--stack-overlap: -0.85;
		--stack-lift: -0.05;
		--stack-push: 0.05;
	}

	.deck-curve-container.condensed {
		--stack-overlap: -0.888;
		--stack-lift: -0.02;
		--stack-push: 0.04;
	}

	.deck-curve-container.spacious {
		--stack-overlap: -0.84;
		--stack-lift: -0.05;
		--stack-push: 0.05;
	}

	:global(.curve-card-item) {
		position: relative;
		width: 100%;
		height: calc(
			var(--card-width) * 1.4 * (1 + var(--stack-overlap))
		) !important;
		border-radius: 4.5% / 3.2%;
		background: transparent;
		flex-shrink: 0;
		transition: transform 0.2s ease;
		cursor: pointer;
		user-select: none;
		overflow: visible !important;
		z-index: 1;
	}

	/* Adjust overlap to make room for stack badge (x4, etc) */
	/* Calculated from compact overlap (-0.888) which marks the name-bar boundary */
	:global(.curve-card-item.has-badge) {
		height: calc(var(--card-width) * 1.4 * 0.22) !important;
	}

	:global(.curve-card-item.is-editing) {
		height: auto !important;
		min-height: calc(var(--card-width) * 1.4 * 0.22 + 120px) !important;
		margin-bottom: 16px;
	}


	:global(.curve-card-item:hover .card-shell) {
		transform: translateY(
			calc(var(--card-width) * 1.4 * var(--stack-lift))
		);
		box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.7);
	}

	:global(.curve-card-item:hover ~ .curve-card-item .card-shell) {
		transform: translateY(
			calc(var(--card-width) * 1.4 * var(--stack-push))
		);
	}

	.curve-card-item.illegal-format {
		outline: 2px solid hsl(var(--destructive));
		outline-offset: -2px;
		border-radius: var(--radius-md);
		box-shadow: 0 0 15px hsl(var(--destructive) / 0.3);
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
		z-index: 100;
		white-space: nowrap;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
		pointer-events: none;
	}

	.stack-badge {
		position: absolute;
		top: 11.2%; /* Anchored immediately below name bar */
		right: 6px;
		background: rgba(0, 0, 0, 0.5);
		color: hsl(var(--foreground) / 0.8);
		font-size: var(--font-xxs);
		font-weight: 700;
		padding: 3px 8px;
		border-radius: 4px;
		z-index: 10;
		cursor: pointer;
		border: none;
		outline: none;
		font-family: inherit;
		backdrop-filter: blur(8px);
		line-height: 1;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.stack-badge:hover {
		background: rgba(0, 0, 0, 0.8);
		transform: scale(1.1);
		color: hsl(var(--foreground));
	}

	:global(.curve-card-item:hover .stack-badge) {
		background: rgba(0, 0, 0, 0.75);
		color: hsl(var(--foreground));
		border-color: hsl(var(--foreground) / 0.3);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		transform: scale(1.05);
	}

	.multiplier {
		opacity: 0.7;
	}

	.stack-badge-input {
		position: absolute;
		top: 11.2%; /* Anchored immediately below name bar */
		right: 6px;
		background: rgba(0, 0, 0, 0.9);
		color: white;
		font-size: var(--font-xxs);
		font-weight: 750;
		width: 44px;
		height: 20px;
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
	.stack-badge-input::-webkit-outer-spin-button,
	.stack-badge-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}


	.ghost-card {
		width: var(--card-width);
		aspect-ratio: 5/7;
		border: 2px dashed hsl(var(--border) / 0.5);
		border-radius: var(--radius-md);
		background: hsl(var(--muted) / 0.1);
		opacity: 0.5;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		transition: all 0.2s ease;
	}

	.ghost-label {
		font-size: 10px;
		font-weight: 800;
		color: hsl(var(--muted-foreground));
		letter-spacing: 0.05em;
		line-height: 1.2;
		pointer-events: none;
	}

	.ghost-stack {
		margin-bottom: 1.5rem;
	}

	.ghost-stack:hover .ghost-card {
		opacity: 0.8;
		background: hsl(var(--muted) / 0.2);
		border-color: hsl(var(--primary) / 0.5);
	}

	.scroll-spacer-left {
		min-width: var(--base-margin);
		flex-shrink: 0;
	}

	.scroll-spacer-right {
		/* Subtract the scrollbar gutter to maintain visual symmetry */
		min-width: calc(var(--base-margin) - var(--scrollbar-width));
		flex-shrink: 0;
	}

	.drag-over {
		background: rgba(var(--primary-hsl), 0.05);
	}

	@keyframes card-entrance {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	:global(.initial-load .curve-card-item) {
		animation: card-entrance 0.2s ease backwards;
		animation-delay: var(--delay);
	}

	:global(.curve-card-item) {
		animation: card-bloom 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	@keyframes card-bloom {
		from {
			opacity: 0.9;
			transform: scale(0.97);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>
