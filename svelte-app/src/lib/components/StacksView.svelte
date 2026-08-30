<script>
	import { onMount } from "svelte";
	import { flip } from "svelte/animate";
	import { fade } from "svelte/transition";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import {
		createStacksEngine,
		getStackCount,
	} from "$lib/layouts/stacks.svelte.js";

	import CardShell from "./CardShell.svelte";
	import CardArt from "./CardArt.svelte";
	import StackHeader from "./StackHeader.svelte";
	import {
		getPartnerLogic,
		canPair,
		canCardBeCommander,
	} from "$lib/utils/legality.js";

	const engine = createStacksEngine();

	let isInitialLoad = $state(true);
	const ENTRY_ANIM_DURATION = 200; // ms (normally 200)
	const ENTRY_STAGGER_DELAY = 20;  // ms (normally 20)

	function generateTagsFromCurrentStacks() {
		const cardsToUpdate = [];
		let hasAnyExistingTags = false;

		for (const row of rows) {
			for (const col of row.columns) {
				const colName = col.key;
				if (
					colName === "Special" ||
					colName === "Commanders" ||
					colName === "Companions"
				)
					continue;
				const tagName = colName.trim();
				if (!tagName) continue;

				for (const stack of col.stacks) {
					for (const card of stack.cards) {
						const realCards =
							card.isStack && card.stackIds
								? card.stackIds
								: [card.id];
						for (const id of realCards) {
							const cardRes = deckStore.findCardById(id);
							if (cardRes && cardRes.card) {
								if (
									cardRes.card.tags &&
									cardRes.card.tags.length > 0
								) {
									hasAnyExistingTags = true;
								}
								cardsToUpdate.push({ cardId: id, tagName });
							}
						}
					}
				}
			}
		}

		if (cardsToUpdate.length === 0) return;

		let overwrite = false;
		if (hasAnyExistingTags) {
			overwrite = confirm(
				"Some cards already have tags. Do you want to overwrite existing tags? (Cancel will append the new tags instead)",
			);
		}

		for (const item of cardsToUpdate) {
			if (overwrite) {
				deckStore.reorderCardTags(item.cardId, [item.tagName]);
			} else {
				deckStore.addCardTag(item.cardId, item.tagName);
			}
		}
	}

	let lastTriggerVal = $state(interactionStore.generateTagsTrigger);
	$effect(() => {
		if (interactionStore.generateTagsTrigger > lastTriggerVal) {
			lastTriggerVal = interactionStore.generateTagsTrigger;
			generateTagsFromCurrentStacks();
		}
	});

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
			if (
				!target.closest(".stack-badge-input") &&
				!target.closest(".spoiler-badge-input")
			) {
				if (document.activeElement instanceof HTMLElement) {
					document.activeElement.blur();
				}
			}
		}
	}
	/** @type {string[]} */
	let freeformColumnOrder = $state([]);

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

	let renamingColumn = $state(/** @type {string | null} */ (null));
	let renameValue = $state("");
	let insertDropZoneActive = $state(/** @type {number | null} */ (null));
	let isDraggingCard = $state(false);
	const activeColKeys = $derived(rows[0] ? rows[0].columns.filter((/** @type {any} */ c) => c.key !== "Special").map((/** @type {any} */ c) => c.key) : []);
	const activeInsertIndices = $derived(Array.from({ length: activeColKeys.length + 1 }, (_, i) => i));
	const activeTagColsCount = $derived(activeColKeys.filter((/** @type {string} */ k) => k !== "No Tag" && k !== "Loading" && k !== "Unknown").length);
	const emptyStateStartTrack = $derived(
		(columnTrackMap.has("Special") ? 1 : 0) + activeTagColsCount + 1
	);
	const emptyStateEndTrack = $derived(
		columnTrackMap.has("No Tag")
			? Math.max(columnTrackMap.get("No Tag") || 0, layoutStore.numCols)
			: -1
	);
	const shouldShift = $derived(insertDropZoneActive !== null && !isBigGap(insertDropZoneActive));

	/** 
	 * @param {number} activeIndex 
	 * @returns {number}
	 */
	function mapActiveToFreeformIndex(activeIndex) {
		if (activeIndex === 0) return 0;
		if (activeIndex === activeColKeys.length) return freeformColumnOrder.length;
		
		const prevColKey = activeColKeys[activeIndex - 1];
		const freeformIdx = freeformColumnOrder.indexOf(prevColKey);
		if (freeformIdx !== -1) {
			return freeformIdx + 1;
		}
		return activeIndex;
	}

	/** @param {DragEvent} e */
	function handleGlobalDragStart(e) {
		if (e.dataTransfer && e.dataTransfer.types.includes("application/x-budgericard")) {
			isDraggingCard = true;
		}
	}

	function handleGlobalDragEnd() {
		isDraggingCard = false;
		insertDropZoneActive = null;
	}

	/** @param {string} colKey */
	function getEffectiveTrack(colKey) {
		if (!colKey) return 0;
		const colTrack = columnTrackMap.get(colKey);
		if (colTrack === undefined) return 0;
		const isLands = colKey === "Lands" || colKey === "No Tag";
		return isLands && typeGroups.length === 0
			? Math.max(colTrack, layoutStore.numCols)
			: colTrack;
	}

	/**
	 * @param {number} i
	 * @returns {boolean}
	 */
	function isBigGap(i) {
		const N = activeColKeys.length;
		if (i <= 0 || i >= N) return false;
		const colLeft = activeColKeys[i - 1];
		const colRight = activeColKeys[i];
		const trackLeft = getEffectiveTrack(colLeft);
		const trackRight = getEffectiveTrack(colRight);
		return (trackRight - trackLeft) > 1;
	}

	/** 
	 * @param {number} i 
	 * @returns {{ left: string, width: string }}
	 */
	function getDropZonePosition(i) {
		const N = activeColKeys.length;
		const hasSpecial = columnTrackMap.has("Special");
		const specialOffset = hasSpecial ? 1 : 0;
		
		if (N === 0) {
			return { left: "0px", width: "100%" };
		}

		let leftStr = "0px";
		let widthStr = "100%";

		if (i === 0) {
			const firstCol = activeColKeys[0];
			const firstTrack = getEffectiveTrack(firstCol) || (specialOffset + 1);
			if (hasSpecial) {
				leftStr = "calc(1 * var(--card-width) - 12px)";
			} else {
				leftStr = "0px";
			}
			const rightLimit = `calc((${firstTrack - 1} * (var(--card-width) + var(--column-gap))) + 12px)`;
			widthStr = `calc(${rightLimit} - ${leftStr})`;
		} else if (i === N) {
			const lastCol = activeColKeys[N - 1];
			const lastTrack = getEffectiveTrack(lastCol) || (specialOffset + N);
			leftStr = `calc(${lastTrack} * var(--card-width) + ${lastTrack - 1} * var(--column-gap) - 12px)`;
			widthStr = `calc(100% - ${leftStr})`;
		} else {
			const colLeft = activeColKeys[i - 1];
			const colRight = activeColKeys[i];
			const trackLeft = getEffectiveTrack(colLeft) || (specialOffset + i);
			const trackRight = getEffectiveTrack(colRight) || (specialOffset + i + 1);
			
			// Shift left edge 12px to the left
			leftStr = `calc(${trackLeft} * var(--card-width) + ${trackLeft - 1} * var(--column-gap) - 12px)`;
			// Shift right edge 12px to the right
			const rightLimit = `calc((${trackRight - 1}) * (var(--card-width) + var(--column-gap)) + 12px)`;
			
			widthStr = `calc(${rightLimit} - ${leftStr})`;
		}

		return { left: leftStr, width: widthStr };
	}

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
		if (deckStore.grouping === "freeform") {
			freeformColumnOrder = freeformColumnOrder.map((k) =>
				k === oldKey ? newKey : k,
			);
			const newMap = new Map(freeformLayout);
			for (const [id, col] of freeformLayout) {
				if (col === oldKey) newMap.set(id, newKey);
			}
			freeformLayout = newMap;
		} else if (deckStore.grouping === "primarytag") {
			deckStore.renameDeckTag(oldKey, newKey);
		}
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

	/**
	 * @param {any} data
	 * @param {HTMLElement | null} targetCol
	 * @param {HTMLElement | null} targetStack
	 */
	function executeCardDrop(data, targetCol, targetStack) {
		if (!data) return;
		const colKey = targetCol?.dataset.columnKey;
		const stackId = targetStack?.dataset.stackId;

		let targetBoard = deckStore.activeBoard;
		if (colKey === "Special") {
			const meta = data.card?.type_line ? data.card : (deckStore.metadata[data.name?.toLowerCase()] || data.card);
			const oracle = (meta?.oracle_text || "").toLowerCase();
			const facesOracle = (meta?.card_faces || [])
				.map((/** @type {any} */ f) =>
					(f.oracle_text || "").toLowerCase(),
				)
				.join(" ");

			const isCompanion =
				oracle.includes("companion —") ||
				oracle.includes("companion\n") ||
				facesOracle.includes("companion —") ||
				facesOracle.includes("companion\n");

			if (stackId === "companions") {
				if (!isCompanion) return;
				targetBoard = "companion";
			} else {
				const canBeCommander = canCardBeCommander(data.card || { name: data.name }, deckStore.format, deckStore.commander);
				if (!canBeCommander) return;
				targetBoard = "commander";
			}
		}

		const cardsToProcess = data.selectedCards || [data];
		deckStore.batchUpdate(() => {
			const newFreeformLayout = new Map(freeformLayout);
			for (const item of cardsToProcess) {
				let itemTargetBoard = targetBoard;
				if (colKey === "Special") {
					const meta = item.card?.type_line ? item.card : (deckStore.metadata[item.name.toLowerCase()] || item.card);
					const oracle = (meta?.oracle_text || "").toLowerCase();
					const facesOracle = (meta?.card_faces || [])
						.map((/** @type {any} */ f) =>
							(f.oracle_text || "").toLowerCase(),
						)
						.join(" ");

					const isCompanion =
						oracle.includes("companion —") ||
						oracle.includes("companion\n") ||
						facesOracle.includes("companion —") ||
						facesOracle.includes("companion\n");

					if (stackId === "companions") {
						if (!isCompanion) continue;
						itemTargetBoard = "companion";
					} else {
						const canBeCommander = canCardBeCommander(item.card || { name: item.name }, deckStore.format, deckStore.commander);
						if (!canBeCommander) continue;
						itemTargetBoard = "commander";
					}
				}

				let addedId = null;
				if (
					!item.fromDeck ||
					colKey === "Special" ||
					item.sourceBoard !== itemTargetBoard
				) {
					const isLocalSource = [
						"sideboard",
						"maybeboard",
						"commander",
						"companion",
						"mainboard",
					].includes(item.sourceBoard);

					if (item.sourceBoard !== itemTargetBoard) {
						if (itemTargetBoard === "companion") {
							const currentCards = deckStore.companion;
							if (currentCards.length > 0) {
								[...currentCards].forEach((c) => {
									deckStore.moveCard(
										c.name,
										"companion",
										item.sourceBoard && item.sourceBoard !== "companion" ? item.sourceBoard : "mainboard",
										c.id,
										c.price,
									);
								});
							}
						} else if (itemTargetBoard === "commander") {
							if (deckStore.format === "List" || !deckStore.format || deckStore.format === "None") {
								deckStore.format = "Commander";
							}
							const currentCards = deckStore.commander;
							let shouldSwap = true;

							if (currentCards.length === 1) {
								const existingCommander = currentCards[0];
								const existingMeta = deckStore.metadata[existingCommander.name.toLowerCase()] || existingCommander;
								const existingLogic = getPartnerLogic(existingCommander.name, existingMeta);

								const newMeta = item.card?.type_line ? item.card : (deckStore.metadata[item.name.toLowerCase()] || item.card);
								const newLogic = getPartnerLogic(item.name, newMeta);

								const isLegalPair = canPair(newLogic, item.name, existingLogic, existingCommander.name);
								if (isLegalPair) {
									shouldSwap = false;
								}
							}

							if (shouldSwap && currentCards.length > 0) {
								[...currentCards].forEach((c) => {
									deckStore.moveCard(
										c.name,
										"commander",
										item.sourceBoard && item.sourceBoard !== "commander" ? item.sourceBoard : "mainboard",
										c.id,
										c.price,
									);
								});
							}
						}

						addedId = isLocalSource
							? deckStore.moveCard(
									item.name,
									item.sourceBoard,
									itemTargetBoard,
									item.id,
									item.price,
								)
							: deckStore.addCard(
									item.name,
									itemTargetBoard,
									item.price,
									item.card,
								);
					} else {
						addedId = item.id;
					}

					if (
						deckStore.grouping === "freeform" &&
						addedId &&
						itemTargetBoard === deckStore.activeBoard
					) {
						const targetKey =
							colKey &&
							colKey !== "special" &&
							colKey !== "Commanders" &&
							colKey !== "Companions"
								? colKey
								: freeformColumnOrder[0];
						newFreeformLayout.set(String(addedId), targetKey);
					}
				} else if (
					deckStore.grouping === "freeform" &&
					colKey &&
					colKey !== "special" &&
					colKey !== "Commanders" &&
					colKey !== "Companions"
				) {
					newFreeformLayout.set(item.id, colKey);
				} else if (
					colKey &&
					colKey !== "Special" &&
					colKey !== "Commanders" &&
					colKey !== "Companions"
				) {
					const grouping = deckStore.grouping?.toLowerCase();
					if (grouping === "cmc") {
						let val = parseInt(colKey, 10);
						if (colKey === "0-1") val = 1;
						if (colKey === "6+") val = 6;
						if (!isNaN(val)) {
							deckStore.setCardOverride(item.id, "manaValue", val);
						}
					} else if (grouping === "color") {
						const category = colKey;
						/** @type {Record<string, string[]>} */
						const mapColors = {
							White: ["W"],
							Blue: ["U"],
							Black: ["B"],
							Red: ["R"],
							Green: ["G"],
						};
						deckStore.setCardOverride(
							item.id,
							"colorCategory",
							category,
						);
						if (mapColors[category]) {
							deckStore.setCardOverride(
								item.id,
								"colors",
								mapColors[category],
							);
							deckStore.setCardOverride(
								item.id,
								"colorIdentity",
								mapColors[category],
							);
						}
					} else if (grouping === "creature") {
						const isCreature = colKey === "Creatures";
						deckStore.setCardOverride(item.id, "creature", isCreature);
					} else if (grouping === "type") {
						let typeVal = colKey;
						if (colKey === "Creatures") typeVal = "Creature";
						else if (colKey === "Planeswalkers")
							typeVal = "Planeswalker";
						else if (colKey === "Instants") typeVal = "Instant";
						else if (colKey === "Sorceries") typeVal = "Sorcery";
						else if (colKey === "Artifacts") typeVal = "Artifact";
						else if (colKey === "Enchantments") typeVal = "Enchantment";
						else if (colKey === "Battles") typeVal = "Battle";
						else if (colKey === "Lands") typeVal = "Land";
						deckStore.setCardOverride(item.id, "primaryType", typeVal);
					} else if (grouping === "primarytag") {
						deckStore.setPrimaryTag(item.id, colKey);
					}
				}
			}

			if (deckStore.grouping === "freeform") {
				freeformLayout = newFreeformLayout;
				pruneEmptyFreeformColumns();
			}
		});
	}

	/**
	 * @param {any} data
	 * @param {number} activeIndex
	 */
	function executeInsertDrop(data, activeIndex) {
		if (!data) return;
		if (deckStore.grouping === "freeform") {
			const insertIndex = mapActiveToFreeformIndex(activeIndex);
			
			let colNum = freeformColumnOrder.length + 1;
			let newColKey = `Column ${colNum}`;
			while (freeformColumnOrder.includes(newColKey)) {
				colNum++;
				newColKey = `Column ${colNum}`;
			}
			const newOrder = [...freeformColumnOrder];
			newOrder.splice(insertIndex, 0, newColKey);
			freeformColumnOrder = newOrder;

			const cardsToProcess = data.selectedCards || [data];
			deckStore.batchUpdate(() => {
				const newMap = new Map(freeformLayout);
				for (const item of cardsToProcess) {
					if (item.fromDeck) {
						newMap.set(item.id, newColKey);
					} else {
						const addedId = deckStore.addCard(
							item.name,
							deckStore.activeBoard,
							item.price,
							item.card,
						);
						if (addedId) {
							newMap.set(String(addedId), newColKey);
						}
					}
				}
				freeformLayout = newMap;
			});
			pruneEmptyFreeformColumns();
		} else if (deckStore.grouping === "primarytag") {
			let tagNum = 1;
			let newTag = `new tag ${tagNum}`;
			while (activeColKeys.includes(newTag)) {
				tagNum++;
				newTag = `new tag ${tagNum}`;
			}
			
			const cardsToProcess = data.selectedCards || [data];
			deckStore.batchUpdate(() => {
				for (const item of cardsToProcess) {
					if (item.fromDeck) {
						deckStore.setPrimaryTag(item.id, newTag);
					} else {
						const addedId = deckStore.addCard(
							item.name,
							deckStore.activeBoard,
							item.price,
							item.card,
						);
						if (addedId) {
							deckStore.setPrimaryTag(String(addedId), newTag);
						}
					}
				}
			});
		}
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
			handleGlobalDragEnd();
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

			executeCardDrop(data, targetCol, targetStack);
		}
	}

	/** @param {any} e */
	function handlePointerDrop(e) {
		if (!e.detail?.data) return;
		e.stopPropagation();
		const { data, clientX, clientY } = e.detail;
		const targetEl = e.target instanceof HTMLElement ? e.target : document.elementFromPoint(clientX, clientY);
		if (!targetEl) return;

		const insertZone = targetEl.closest(".insert-drop-zone");
		if (insertZone && insertZone instanceof HTMLElement && insertZone.dataset.index) {
			const idx = parseInt(insertZone.dataset.index, 10);
			if (!isNaN(idx)) {
				executeInsertDrop(data, idx);
				return;
			}
		}

		const targetCol = targetEl.closest(".grid-cell");
		const targetStack = targetEl.closest(".curve-col-stack") || targetEl.closest(".ghost-stack");
		executeCardDrop(data, targetCol, targetStack);
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} activeIndex
	 */
	function handleInsertZoneDrop(e, activeIndex) {
		insertDropZoneActive = null;
		if (!e.dataTransfer || (deckStore.grouping !== "freeform" && deckStore.grouping !== "primarytag")) return;
		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (!internalData) return;
		e.preventDefault();
		e.stopPropagation();
		handleGlobalDragEnd();
		const data = JSON.parse(internalData);
		executeInsertDrop(data, activeIndex);
	}

	let prevCardsCount = $state(0);
	const allCardsCount = $derived(
		(deckStore.commander?.length || 0) +
		(deckStore.companion?.length || 0) +
		(deckStore.mainboard?.length || 0) +
		(deckStore.sideboard?.length || 0) +
		(deckStore.maybeboard?.length || 0)
	);

	let isFirstLoadSession = $state(true);
	let lastPasteTime = $state(0);
	/** @type {any} */
	let animationTimeoutId = null;

	$effect(() => {
		const count = allCardsCount;
		if (count > prevCardsCount) {
			isInitialLoad = true;
			lastPasteTime = Date.now();
			if (animationTimeoutId) clearTimeout(animationTimeoutId);
			const totalDuration = Math.max(1200, (count * ENTRY_STAGGER_DELAY) + ENTRY_ANIM_DURATION);
			animationTimeoutId = setTimeout(() => {
				isInitialLoad = false;
				isFirstLoadSession = false;
			}, totalDuration);
		}
		prevCardsCount = count;

		return () => {
			if (animationTimeoutId) clearTimeout(animationTimeoutId);
		};
	});

	$effect(() => {
		/** @type {string[]} */
		const visibleIds = [];
		for (const row of rows) {
			for (const col of row.columns) {
				for (const stack of col.stacks) {
					for (const card of stack.cards) {
						if (card.isStack && card.stackIds) {
							visibleIds.push(...card.stackIds);
						} else {
							visibleIds.push(card.id);
						}
					}
				}
			}
		}
		interactionStore.currentVisibleCardIds = visibleIds;
	});

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

<svelte:window 
	onclickcapture={handleWindowClick} 
	ondragstart={handleGlobalDragStart} 
	ondragend={handleGlobalDragEnd}
	ondrop={handleGlobalDragEnd}
	onbudgericard-pointer-drop={handlePointerDrop}
/>

<div
	class="deck-curve-container"
	onwheel={handleWheel}
	bind:this={scrollContainer}
	class:drag-over={isDragOver}
	class:condensed={layoutStore.isCondensed}
	class:spacious={settingsStore.curveSpacing === "spacious"}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	onbudgericard-pointer-drop={handlePointerDrop}
	role="region"
	aria-label="Deck stacks view"
	data-board={deckStore.activeBoard}
>
	{#if deckStore.currentBoardCount === 0}
		<div class="deck-empty-state-canvas" in:fade={{ duration: 150 }}>
			<div class="deck-empty-content">
				<p class="empty-state-text">
					To get started, <button class="empty-action-link" onclick={() => (settingsStore.deckViewMode = 'list')}>paste a decklist</button> or <button class="empty-action-link" onclick={() => searchStore.openSearch()}>search for cards</button>
				</p>
			</div>
		</div>
	{/if}

	<div class="scroll-spacer-left"></div>

	<div
		class="curve-layout"
		style="grid-template-columns: {gridTemplateColumns}; column-gap: {gridGap};"
	>
		{#if settingsStore.showColumnHeaders && typeGroups.length > 0}
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
			{#if settingsStore.showColumnHeaders && row.label}
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
				{@const activeColIdx = activeColKeys.indexOf(column.key)}
				<!-- Column Header -->
				{#if settingsStore.showColumnHeaders && column.label && column.key !== "Special"}
					{@const isLands = column.key === "Lands" || column.key === "No Tag"}
					{@const colTrack = columnTrackMap.get(column.key)}
					{@const finalColTrack =
						isLands && typeGroups.length === 0
							? Math.max(colTrack, layoutStore.numCols)
							: colTrack}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="grid-cell column-header-cell"
						class:shifted-right={shouldShift && insertDropZoneActive !== null && activeColIdx !== -1 && activeColIdx >= insertDropZoneActive}
						data-column-key={column.key}
						style="grid-column: {finalColTrack}; grid-row: {typeGroups.length >
						0
							? rowIdx * 3 + 3
							: isLands
								? 2
								: rowIdx * 3 + 2};"
						onclick={(e) => {
							if (renamingColumn === column.key) return;
							const target = /** @type {HTMLElement} */ (e.target);
							if (target.closest('.freeform-renameable') || target.closest('.col-rename-input')) return;
							
							const columnCards = [];
							for (const s of column.stacks) {
								for (const c of s.cards) {
									columnCards.push(c);
								}
							}
							interactionStore.showColumnMenu(e, column.label || column.key, columnCards);
						}}
						oncontextmenu={(e) => {
							if (renamingColumn === column.key) return;
							const columnCards = [];
							for (const s of column.stacks) {
								for (const c of s.cards) {
									columnCards.push(c);
								}
							}
							interactionStore.showColumnMenu(e, column.label || column.key, columnCards);
						}}
					>
						<StackHeader
							label={column.label}
							count={column.displayCount !== undefined
								? column.displayCount
								: column.stacks.reduce(
										(
											/** @type {number} */ sum,
											/** @type {any} */ s,
										) => sum + getStackCount(s.cards),
										0,
									)}
							type="column"
							colKey={column.key}
							{renamingColumn}
							bind:renameValue
							onRename={startRename}
							onCommit={commitRename}
							onCancel={() => (renamingColumn = null)}
						/>
					</div>
				{/if}

				<!-- Stacks -->
				{@const isLands = column.key === "Lands" || column.key === "No Tag"}
				{@const colTrack = columnTrackMap.get(column.key)}
				{@const finalColTrack =
					isLands && typeGroups.length === 0
						? Math.max(colTrack, layoutStore.numCols)
						: colTrack}
				<div
					class="grid-cell stack-container-cell"
					class:shifted-right={shouldShift && insertDropZoneActive !== null && activeColIdx !== -1 && activeColIdx >= insertDropZoneActive}
					class:row-spacer={!settingsStore.showColumnHeaders && rowIdx > 0}
					role="presentation"
					data-column-key={column.key}
					onmouseenter={() => {
						interactionStore.hoveredColumnKey = column.key;
					}}
					onmouseleave={() => {
						if (interactionStore.hoveredColumnKey === column.key)
							interactionStore.hoveredColumnKey = null;
					}}
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
								{#if settingsStore.showColumnHeaders}
									<StackHeader
										label={getStackCount(
											commanderStack.cards,
										) > 1
											? "Commanders"
											: "Commander"}
										count={getStackCount(
											commanderStack.cards,
										)}
										type="stack"
									/>
								{/if}
								{#if commanderStack.cards.length > 0}
									<div
										class="curve-col-stack"
										data-stack-id="commanders"
									>
										{#each commanderStack.cards as item, idx (item.id)}
											<div
												animate:flip={{ duration: 200 }}
												class="curve-card-item"
												class:stagger-entry={isInitialLoad && (isFirstLoadSession || (item.addedAt && item.addedAt >= lastPasteTime - 1000))}
												class:has-badge={item.isStack}
												class:illegal-format={item._isIllegalFormat}
												class:is-editing={interactionStore.editingCardId ===
													item.id}
												style="z-index: {idx +
													1}; --delay: {idx * ENTRY_STAGGER_DELAY}ms;"
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
																value={item.stackCount ||
																	1}
																min="0"
																max="999"
																use:selectOnMount
																onclick={(
																	/** @type {MouseEvent} */ e,
																) =>
																	e.stopPropagation()}
																onmousedown={(
																	/** @type {MouseEvent} */ e,
																) =>
																	e.stopPropagation()}
																onkeydown={(
																	/** @type {any} */ e,
																) => {
																	if (
																		e.key ===
																		"Enter"
																	) {
																		const val =
																			parseInt(
																				e
																					.currentTarget
																					.value,
																				10,
																			);
																		if (
																			!isNaN(
																				val,
																			) &&
																			val >=
																				0
																		) {
																			deckStore.setQuantity(
																				item.name,
																				"commander",
																				val,
																				item.price,
																				item,
																			);
																		}
																		interactionStore.stopEditing();
																	} else if (
																		e.key ===
																		"Escape"
																	) {
																		interactionStore.stopEditing();
																	}
																}}
																onblur={(/** @type {any} */ e) => {
																	const val =
																		parseInt(
																			e
																				.currentTarget
																				.value,
																			10,
																		);
																	if (
																		!isNaN(
																			val,
																		) &&
																		val >= 0
																	) {
																		deckStore.setQuantity(
																			item.name,
																			"commander",
																			val,
																			item.price,
																			item,
																		);
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
																onclick={(
																	e,
																) => {
																	e.stopPropagation();
																	e.preventDefault();
																	interactionStore.startEditing(
																		item.id,
																		"commander",
																		item.price,
																	);
																}}
															>
																<span
																	class="multiplier"
																	>&times;</span
																>{item.stackCount}
															</button>
														{/if}
														{#if item._isIllegalFormat}
															<div
																class="illegal-badge"
															>
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
															lazy={deckStore.totalCount > 125}
														/>
													{/snippet}
												</CardShell>
											</div>
										{/each}
									</div>
								{:else if deckStore.currentBoardCount > 0}
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
								{#if settingsStore.showColumnHeaders}
									<StackHeader
										label="Companions"
										count={getStackCount(
											companionStack?.cards || [],
										)}
										type="stack"
									/>
								{/if}
								{#if companionStack && companionStack.cards.length > 0}
									<div
										class="curve-col-stack"
										data-stack-id="companions"
									>
										{#each companionStack.cards as item, idx (item.id)}
											<div
												animate:flip={{ duration: 200 }}
												class="curve-card-item"
												class:stagger-entry={isInitialLoad && (isFirstLoadSession || (item.addedAt && item.addedAt >= lastPasteTime - 1000))}
												class:has-badge={item.isStack}
												class:illegal-format={item._isIllegalFormat}
												class:is-editing={interactionStore.editingCardId ===
													item.id}
												style="z-index: {idx +
													1}; --delay: {idx * ENTRY_STAGGER_DELAY}ms;"
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
																value={item.stackCount ||
																	1}
																min="0"
																max="999"
																use:selectOnMount
																onclick={(
																	/** @type {MouseEvent} */ e,
																) =>
																	e.stopPropagation()}
																onmousedown={(
																	/** @type {MouseEvent} */ e,
																) =>
																	e.stopPropagation()}
																onkeydown={(
																	/** @type {any} */ e,
																) => {
																	if (
																		e.key ===
																		"Enter"
																	) {
																		const val =
																			parseInt(
																				e
																					.currentTarget
																					.value,
																				10,
																			);
																		if (
																			!isNaN(
																				val,
																			) &&
																			val >=
																				0
																		) {
																			deckStore.setQuantity(
																				item.name,
																				"companion",
																				val,
																				item.price,
																				item,
																			);
																		}
																		interactionStore.stopEditing();
																	} else if (
																		e.key ===
																		"Escape"
																	) {
																		interactionStore.stopEditing();
																	}
																}}
																onblur={(/** @type {any} */ e) => {
																	const val =
																		parseInt(
																			e
																				.currentTarget
																				.value,
																			10,
																		);
																	if (
																		!isNaN(
																			val,
																		) &&
																		val >= 0
																	) {
																		deckStore.setQuantity(
																			item.name,
																			"companion",
																			val,
																			item.price,
																			item,
																		);
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
																onclick={(
																	e,
																) => {
																	e.stopPropagation();
																	e.preventDefault();
																	interactionStore.startEditing(
																		item.id,
																		"companion",
																		item.price,
																	);
																}}
															>
																<span
																	class="multiplier"
																	>&times;</span
																>{item.stackCount}
															</button>
														{/if}
														{#if item._isIllegalFormat}
															<div
																class="illegal-badge"
															>
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
															lazy={deckStore.totalCount > 125}
														/>
													{/snippet}
												</CardShell>
											</div>
										{/each}
									</div>
								{:else if deckStore.currentBoardCount > 0}
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
										class:stagger-entry={isInitialLoad && (isFirstLoadSession || (item.addedAt && item.addedAt >= lastPasteTime - 1000))}
										class:has-badge={item.isStack}
										class:illegal-format={item._isIllegalFormat}
										class:is-editing={interactionStore.editingCardId ===
											item.id}
										style="z-index: {idx +
											1}; --delay: {idx * ENTRY_STAGGER_DELAY}ms;"
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
														value={item.stackCount ||
															1}
														min="0"
														max="999"
														use:selectOnMount
														onclick={(
															/** @type {MouseEvent} */ e,
														) =>
															e.stopPropagation()}
														onmousedown={(/** @type {MouseEvent} */ e) =>
															e.stopPropagation()}
														onkeydown={(/** @type {any} */ e) => {
															if (
																e.key ===
																"Enter"
															) {
																const val =
																	parseInt(
																		e
																			.currentTarget
																			.value,
																		10,
																	);
																if (
																	!isNaN(
																		val,
																	) &&
																	val >= 0
																) {
																	deckStore.setQuantity(
																		item.name,
																		deckStore.activeBoard,
																		val,
																		item.price,
																		item,
																	);
																}
																interactionStore.stopEditing();
															} else if (
																e.key ===
																"Escape"
															) {
																interactionStore.stopEditing();
															}
														}}
														onblur={(/** @type {any} */ e) => {
															const val =
																parseInt(
																	e
																		.currentTarget
																		.value,
																	10,
																);
															if (
																!isNaN(val) &&
																val >= 0
															) {
																deckStore.setQuantity(
																	item.name,
																	deckStore.activeBoard,
																	val,
																	item.price,
																	item,
																);
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
															interactionStore.startEditing(
																item.id,
																deckStore.activeBoard,
																item.price,
															);
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
													lazy={deckStore.totalCount > 125}
												/>
											{/snippet}
										</CardShell>
									</div>
								{/each}
							</div>
						{/each}
					{/if}
				</div>
			{/each}
		{/each}

		{#if (deckStore.grouping === 'freeform' || deckStore.grouping === 'primarytag') && isDraggingCard}
			<div class="freeform-drop-zones-visual-overlay">
				{#each activeInsertIndices as i (i)}
					{@const pos = getDropZonePosition(i)}
					<div
						class="insert-zone-visual-container"
						style="left: {pos.left}; width: {pos.width};"
					>
						<div
							class="insert-zone-visual"
							class:active={insertDropZoneActive === i}
							class:shifted={shouldShift && insertDropZoneActive !== null && i > insertDropZoneActive}
							class:widened={shouldShift && insertDropZoneActive === i}
						>
							<div class="insert-zone-line" class:big-gap={isBigGap(i)}></div>
						</div>
					</div>
				{/each}
			</div>

			<div class="freeform-drop-zones-hitbox-overlay">
				{#each activeInsertIndices as i (i)}
					{@const pos = getDropZonePosition(i)}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="freeform-insert-zone"
						style="left: {pos.left}; width: {pos.width};"
						ondragover={(e) => {
							e.preventDefault();
							insertDropZoneActive = i;
						}}
						ondragleave={() => {
							if (insertDropZoneActive === i) insertDropZoneActive = null;
						}}
						ondrop={(e) => handleInsertZoneDrop(e, i)}
					></div>
				{/each}
			</div>
		{/if}

		{#if deckStore.grouping === 'primarytag' && activeTagColsCount < 4 && !isDraggingCard}
			<div 
				class="tag-empty-state-cell"
				style="grid-column: {emptyStateStartTrack} / {emptyStateEndTrack};"
			>
				<div class="tag-empty-state-card">
					<svg class="tag-empty-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
						<path d="M12 20h9"/>
						<path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
					</svg>
					<h3>Organize with Tags</h3>
					<p>Drag and drop cards into the empty space on the right to create a new tag column, or move cards between columns to change their tags.</p>
				</div>
			</div>
		{/if}
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
		position: relative;
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
		position: relative;
		isolation: isolate;
	}

	.freeform-drop-zones-visual-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: -1;
	}

	.freeform-drop-zones-hitbox-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		z-index: 50;
	}

	.freeform-insert-zone {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: auto;
		cursor: cell;
	}

	.insert-zone-visual-container {
		position: absolute;
		top: 0;
		bottom: 0;
		pointer-events: none;
	}

	.insert-zone-visual {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		pointer-events: none;
		display: flex;
		justify-content: center;
		align-items: center;
		box-sizing: border-box;
		border: 2px dashed transparent;
		border-radius: var(--radius-md);
		transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1), width 0.25s cubic-bezier(0.25, 1, 0.5, 1), background-color 0.15s ease, border-color 0.15s ease;
		transition-delay: 50ms, 50ms, 0s, 0s;
		transform-origin: left center;
		width: 100%;
	}

	.insert-zone-visual.shifted {
		transform: translateX(24px);
	}

	.insert-zone-visual.widened {
		width: calc(100% + 24px);
	}

	.insert-zone-line {
		width: 4px;
		height: 100%;
		background: hsl(var(--primary) / 0.15);
		border-radius: 2px;
		transition: opacity 0.15s ease, background-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
	}

	.insert-zone-line.big-gap {
		width: calc(100% - 24px);
		border-radius: var(--radius-md);
		background: hsl(var(--primary) / 0.04);
		border: 1px dashed hsl(var(--primary) / 0.12);
	}

	.insert-zone-visual.active {
		border-color: hsl(var(--primary) / 0.4);
		background-color: hsl(var(--primary) / 0.04);
	}

	.insert-zone-visual.active .insert-zone-line {
		opacity: 0;
	}

	.grid-cell.group-header-cell {
		grid-row: 1;
		width: 100%;
		padding: 0;
		margin-bottom: 0;
	}

	.column-header-cell {
		cursor: pointer;
		user-select: none;
	}

	.grid-cell {
		width: var(--card-width);
		transition: transform 0.25s cubic-bezier(0.25, 1, 0.5, 1);
		will-change: transform;
	}

	.grid-cell.shifted-right {
		transform: translateX(24px);
		transition-delay: 50ms;
	}

	.row-header-cell {
		/* Add space before row headers except the first one */
		margin-top: 2.5rem;
	}
	.row-header-cell:first-child {
		margin-top: 0;
	}

	.stack-container-cell.row-spacer {
		margin-top: 2.5rem;
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

	:global(.curve-card-item:hover .card-shell.is-selected) {
		box-shadow: 0 0 0 3px hsl(var(--primary)), 0 12px 30px -10px rgba(0, 0, 0, 0.7);
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

	/* 
	   Combined bloom keyframes that handle both staggered page entrance 
	   and individual new card insertion animations.
	*/
	@keyframes card-bloom {
		from {
			opacity: 0;
			transform: scale(0.97) translateY(8px);
		}
		to {
			opacity: 1;
			transform: scale(1) translateY(0);
		}
	}

	/* 
	   CRITICAL BROWSER WORKAROUND:
	   When Svelte removes the '.initial-load' class from the parent container after 1.2s,
	   the browser switches card styling from this selector to the generic '.curve-card-item' below.
	   If these selectors used different animation-names (e.g. 'card-entrance' vs 'card-bloom'), 
	   the browser would re-evaluate the style change as a brand new animation and re-trigger 
	   the bloom for ALL cards at once. 
	   
	   By standardizing on the SAME animation-name ('card-bloom') for both, the browser knows 
	   the animation is already completed and does not restart it when '.initial-load' is removed.
	*/
	:global(.curve-card-item.stagger-entry) {
		animation-name: card-bloom;
		animation-duration: 200ms;
		animation-timing-function: ease;
		animation-delay: var(--delay);
		animation-fill-mode: backwards;
	}

	:global(.curve-card-item) {
		animation: card-bloom 200ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
	}

	.tag-empty-state-cell {
		grid-row: 1 / -1;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
		box-sizing: border-box;
		pointer-events: none;
		min-height: 300px;
	}

	.tag-empty-state-card {
		background: hsla(var(--muted) / 0.15);
		border: 1px dashed hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		gap: 0.75rem;
		max-width: 400px;
		width: 100%;
		pointer-events: auto;
		position: sticky;
		top: calc(50vh - 200px);
	}

	.tag-empty-icon {
		width: 32px;
		height: 32px;
		color: hsl(var(--primary) / 0.6);
		margin-bottom: 0.25rem;
	}

	.tag-empty-state-card h3 {
		font-size: 0.875rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.tag-empty-state-card p {
		font-size: 0.75rem;
		line-height: 1.4;
		color: hsl(var(--muted-foreground));
		margin: 0;
		text-wrap: balance;
	}

	.deck-empty-state-canvas {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		pointer-events: none;
		z-index: 10;
		padding: 2rem;
	}

	.deck-empty-content {
		pointer-events: auto;
		background: none;
		border: none;
		box-shadow: none;
		backdrop-filter: none;
		padding: 0;
	}

	.empty-state-text {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 400;
		color: hsl(var(--muted-foreground));
		text-align: center;
		letter-spacing: -0.01em;
	}

	.empty-action-link {
		background: none;
		border: none;
		padding: 0;
		color: hsl(var(--foreground) / 0.85);
		font-weight: 500;
		cursor: pointer;
		text-decoration: none;
		transition: color 0.15s ease;
	}

	.empty-action-link:hover {
		color: hsl(var(--foreground));
	}
</style>
