import { deckStore } from "./deck.svelte.js";

/**
 * @param {any} card
 * @param {string} columnKey
 * @returns {any}
 */
function getCardCellValue(card, columnKey) {
	const name = card.name || "";
	const meta = deckStore.metadata[name.toLowerCase()];

	if (columnKey === 'cmc') {
		return card.overrides?.manaValue !== undefined ? card.overrides.manaValue : (meta?.cmc ?? 0);
	}
	if (columnKey === 'type') {
		return card.overrides?.primaryType !== undefined ? card.overrides.primaryType : (meta?.type_line || "Unknown");
	}
	if (columnKey === 'color-cat') {
		if (card.overrides?.colorCategory) return card.overrides.colorCategory;
		const type = (meta?.type_line || "").toLowerCase();
		if (type.includes("land")) return "Lands";
		const colors = meta?.colors || [];
		if (colors.length === 0) return "Colorless";
		if (colors.length > 1) return "Multicolor";
		/** @type {Record<string, string>} */
		const colorNames = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
		return colorNames[colors[0]] || "Colorless";
	}
	if (columnKey === 'qty') {
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		for (const board of boards) {
			if (deckStore[board]) {
				const matches = deckStore[board].filter(c => c.name.toLowerCase() === name.toLowerCase());
				if (matches.length > 0) return matches.length;
			}
		}
		return 1;
	}
	if (columnKey === 'name') {
		return name;
	}
	if (columnKey === 'mana') {
		return meta?.mana_cost || "";
	}
	if (columnKey === 'printing') {
		return card.set ? `${card.set.toUpperCase()} ${card.collector_number || ""}`.trim() : "";
	}
	if (columnKey === 'color-id') {
		return meta?.color_identity?.join("") || "";
	}
	if (columnKey === 'tags') {
		return card.tags?.join(", ") || "";
	}
	if (columnKey === 'price') {
		return card.price ? `${card.price.toFixed(2)}` : "";
	}
	return "";
}

/**
 * @typedef {Object} CardInteractionState
 * @property {any | null} hoveredCard - The card object currently being hovered
 * @property {string | null} hoveredZone - The zone (board) of the hovered card
 * @property {number | null} hoveredPrice - The price of the hovered card
 * @property {any | null} menuCard - The card locked into the context menu
 * @property {string | null} menuZone - The zone of the menu card
 * @property {number | null} menuPrice - The price of the menu card
 * @property {boolean} isMenuOpen - Whether the context menu is currently visible
 * @property {{x: number, y: number} | null} menuPosition
 * @property {any[]} activeAnimations - Array of active card move animations
 * @property {string | null} editingCardId - The ID of the card currently being edited inline
 * @property {Object} quantityModal
 * @property {boolean} quantityModal.isOpen
 * @property {any | null} quantityModal.card
 * @property {string | null} quantityModal.zone
 * @property {number | null} quantityModal.price
 * @property {number} quantityModal.initialValue
 * @property {boolean} quantityModal.isAdding
 * @property {Object} cardDataModal
 * @property {boolean} cardDataModal.isOpen
 * @property {any | null} cardDataModal.card
 * @property {string | null} cardDataModal.zone
 * @property {number | null} cardDataModal.price
 * @property {Set<string>} selectedCells
 * @property {{cardId: string, columnKey: string} | null} selectionAnchor
 * @property {{cardId: string, columnKey: string} | null} selectionFocus
 * @property {string[]} visibleColumnsOrder
 * @property {any[]} currentVisibleCardIds
 * @property {any[]} copiedCards
 * @property {boolean} isCut
 * @property {string | null} hoveredColumnKey
 * @property {number} generateTagsTrigger
 * @property {string[] | null} copiedCellValues
 * @property {string | null} copiedColumnKey
 * @property {{cardId: string, columnKey: string, initialKey: string} | null} inlineEditTrigger
 */

function createInteractionStore() {
	/** @type {CardInteractionState} */
	let state = $state({
		hoveredCard: null,
		hoveredZone: null,
		hoveredPrice: null,
		menuCard: null,
		menuZone: null,
		menuPrice: null,
		isMenuOpen: false,
		menuPosition: null,
		activeAnimations: [],
		editingCardId: null,
		quantityModal: {
			isOpen: false,
			card: null,
			zone: null,
			price: null,
			initialValue: 1,
			isAdding: false
		},
		cardDataModal: {
			isOpen: false,
			card: null,
			zone: null,
			price: null
		},
		selectedCells: new Set(),
		selectionAnchor: null, // { cardId, columnKey }
		selectionFocus: null,  // { cardId, columnKey }
		/** @type {string[]} */
		visibleColumnsOrder: [],
		/** @type {any[]} */
		currentVisibleCardIds: [],
		copiedCards: [],
		isCut: false,
		hoveredColumnKey: null,
		generateTagsTrigger: 0,
		/** @type {string[] | null} */
		copiedCellValues: null,
		/** @type {string | null} */
		copiedColumnKey: null,
		inlineEditTrigger: null // { cardId, columnKey, initialKey }
	});

	// Global key listener
	if (typeof window !== 'undefined') {
		window.addEventListener('keydown', (e) => {
			// Don't trigger shortcuts if typing in an input
			const target = /** @type {HTMLElement} */ (e.target);
			if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

			if (state.isMenuOpen) return;

			const isCmdCtrl = e.metaKey || e.ctrlKey;
			const key = e.key.toLowerCase();

			// 1. Global Clipboard/Selection Shortcuts (don't require hover)
			if (isCmdCtrl && key === 'a') {
				e.preventDefault();
				state.selectedCells.clear();
				if (state.currentVisibleCardIds.length > 0 && state.visibleColumnsOrder.length > 0) {
					for (const id of state.currentVisibleCardIds) {
						for (const col of state.visibleColumnsOrder) {
							state.selectedCells.add(`${id}:${col}`);
						}
					}
				}
				state.selectedCells = new Set(state.selectedCells);
				return;
			}

			if (isCmdCtrl && key === 'c') {
				e.preventDefault();
				interactionStore.copySelected();
				return;
			}

			if (isCmdCtrl && key === 'x') {
				e.preventDefault();
				interactionStore.cutSelected();
				return;
			}

			if (isCmdCtrl && key === 'v') {
				e.preventDefault();
				interactionStore.pasteSelected(state.hoveredColumnKey);
				return;
			}

			// Backspace/Delete works on selected cards globally if there is a selection
			if ((e.key === 'Backspace' || e.key === 'Delete') && state.selectedCells.size > 0) {
				e.preventDefault();
				interactionStore.deleteSelected();
				return;
			}

			// Escape clears selection
			if (e.key === 'Escape') {
				if (state.selectedCells.size > 0) {
					state.selectedCells.clear();
					state.selectionAnchor = null;
					state.selectionFocus = null;
					state.selectedCells = new Set();
					return;
				}
			}

			// Grid Navigation
			if (state.selectionFocus && !e.metaKey && !e.ctrlKey) {
				const focusId = state.selectionFocus.cardId;
				const focusCol = state.selectionFocus.columnKey;

				let rIdx = state.currentVisibleCardIds.indexOf(focusId);
				let cIdx = state.visibleColumnsOrder.indexOf(focusCol);

				if (rIdx !== -1 && cIdx !== -1) {
					let moved = false;
					if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
						cIdx++; moved = true;
					} else if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
						cIdx--; moved = true;
					} else if (e.key === 'ArrowDown' || (e.key === 'Enter' && !e.shiftKey)) {
						rIdx++; moved = true;
					} else if (e.key === 'ArrowUp' || (e.key === 'Enter' && e.shiftKey)) {
						rIdx--; moved = true;
					}

					if (moved) {
						e.preventDefault();
						rIdx = Math.max(0, Math.min(state.currentVisibleCardIds.length - 1, rIdx));
						cIdx = Math.max(0, Math.min(state.visibleColumnsOrder.length - 1, cIdx));
						const nextId = state.currentVisibleCardIds[rIdx];
						const nextCol = state.visibleColumnsOrder[cIdx];
						
						if (e.shiftKey && e.key.startsWith('Arrow')) {
							interactionStore.handleCardSelectClick(nextId, true, false, nextCol);
						} else {
							interactionStore.handleCardSelectClick(nextId, false, false, nextCol);
						}
						return;
					}
				}
			}

			// Typing to edit
			if (e.key.length === 1 && !isCmdCtrl && !e.altKey && state.selectionFocus) {
				if (state.selectedCells.size > 0) {
					const focusId = state.selectionFocus.cardId;
					const focusCol = state.selectionFocus.columnKey;
					
					state.selectedCells.clear();
					state.selectedCells.add(`${focusId}:${focusCol}`);
					state.selectionAnchor = { cardId: focusId, columnKey: focusCol };

					state.inlineEditTrigger = { cardId: focusId, columnKey: focusCol, initialKey: e.key };
					state.selectedCells = new Set(state.selectedCells);
					e.preventDefault();
					return;
				}
			}

			if (!state.hoveredCard) return;

			const name = /** @type {string} */ (state.hoveredCard.name);
			const zone = /** @type {string} */ (state.hoveredZone);
			const price = state.hoveredPrice;
			const card = state.hoveredCard;

			switch (e.key.toLowerCase()) {
				case 's':
					if (zone === 'sideboard') {
						deckStore.moveCard(name, 'sideboard', 'mainboard', card.id, price);
					} else {
						deckStore.moveCard(name, zone, 'sideboard', card.id, price);
					}
					break;
				case 'm':
					if (zone === 'maybeboard') {
						deckStore.moveCard(name, 'maybeboard', 'mainboard', card.id, price);
					} else {
						deckStore.moveCard(name, zone, 'maybeboard', card.id, price);
					}
					break;
				case 'o':
					window.open(`https://scryfall.com/search?q=!"${name}"`, '_blank');
					break;
				case 'p':
					import('./search.svelte.js').then(({ searchStore }) => {
						searchStore.collection = 'scryfall';
						searchStore.query = `!"${name}" unique:prints`;
					});
					break;
				case 'q':
					if (['mainboard', 'sideboard', 'maybeboard', 'commander', 'companion'].includes(zone)) {
						interactionStore.startEditing(card.id, zone, price);
					} else {
						interactionStore.showQuantityModal(card, zone, price);
					}
					break;
				case 'delete':
				case 'backspace':
					if (e.shiftKey) {
						deckStore.removeAllCopies(name, zone);
					} else {
						deckStore.removeCard(name, zone, card.id);
					}
					break;
				case '=':
				case '+':
					if (e.shiftKey) {
						deckStore.addCard(name, deckStore.activeBoard, price, card);
					}
					break;
			}
		});
	}

	return {
		get hoveredCard() { return state.hoveredCard; },
		get hoveredZone() { return state.hoveredZone; },
		get hoveredPrice() { return state.hoveredPrice; },
		get menuCard() { return state.menuCard; },
		get menuZone() { return state.menuZone; },
		get menuPrice() { return state.menuPrice; },
		get isMenuOpen() { return state.isMenuOpen; },
		set isMenuOpen(val) {
			state.isMenuOpen = val;
			if (!val) {
				state.menuCard = null;
				state.menuZone = null;
				state.menuPrice = null;
			}
		},
		get menuPosition() { return state.menuPosition; },
		get editingCardId() { return state.editingCardId; },
		get quantityModal() { return state.quantityModal; },
		get cardDataModal() { return state.cardDataModal; },
		get selectedCells() { return state.selectedCells; },
		get selectionAnchor() { return state.selectionAnchor; },
		get selectionFocus() { return state.selectionFocus; },
		get visibleColumnsOrder() { return state.visibleColumnsOrder; },
		set visibleColumnsOrder(val) { state.visibleColumnsOrder = val; },
		get hoveredColumnKey() { return state.hoveredColumnKey; },
		set hoveredColumnKey(val) { state.hoveredColumnKey = val; },
		get inlineEditTrigger() { return state.inlineEditTrigger; },
		clearInlineEditTrigger() { state.inlineEditTrigger = null; },
		get currentVisibleCardIds() { return state.currentVisibleCardIds; },
		set currentVisibleCardIds(val) { state.currentVisibleCardIds = val; },
		get generateTagsTrigger() { return state.generateTagsTrigger; },
		triggerGenerateTags() { state.generateTagsTrigger++; },

		clearSelection() {
			state.selectedCells.clear();
			state.selectionAnchor = null;
			state.selectionFocus = null;
			state.selectedCells = new Set();
		},

		/**
		 * @param {string} cardId
		 * @param {boolean} isShift
		 * @param {boolean} isCmdCtrl
		 * @param {string | null} [columnKey]
		 */
		handleCardSelectClick(cardId, isShift, isCmdCtrl, columnKey = null) {
			console.log("handleCardSelectClick called:", { cardId, isShift, isCmdCtrl, columnKey, currentCellsSize: state.selectedCells.size });
			const col = columnKey || 'name';

			if (isShift && state.selectionAnchor) {
				const rStart = state.currentVisibleCardIds.indexOf(state.selectionAnchor.cardId);
				const rEnd = state.currentVisibleCardIds.indexOf(cardId);
				const cStart = state.visibleColumnsOrder.indexOf(state.selectionAnchor.columnKey);
				const cEnd = state.visibleColumnsOrder.indexOf(col);

				if (rStart !== -1 && rEnd !== -1 && cStart !== -1 && cEnd !== -1) {
					const rMin = Math.min(rStart, rEnd);
					const rMax = Math.max(rStart, rEnd);
					const cMin = Math.min(cStart, cEnd);
					const cMax = Math.max(cStart, cEnd);

					if (!isCmdCtrl) {
						state.selectedCells.clear();
					}
					for (let r = rMin; r <= rMax; r++) {
						const rId = state.currentVisibleCardIds[r];
						for (let c = cMin; c <= cMax; c++) {
							const cKey = state.visibleColumnsOrder[c];
							state.selectedCells.add(`${rId}:${cKey}`);
						}
					}
					state.selectionFocus = { cardId, columnKey: col };
				}
			} else if (isCmdCtrl) {
				const cellKey = `${cardId}:${col}`;
				if (state.selectedCells.has(cellKey)) {
					state.selectedCells.delete(cellKey);
				} else {
					state.selectedCells.add(cellKey);
				}
				state.selectionAnchor = { cardId, columnKey: col };
				state.selectionFocus = { cardId, columnKey: col };
			} else {
				state.selectedCells.clear();
				state.selectedCells.add(`${cardId}:${col}`);
				state.selectionAnchor = { cardId, columnKey: col };
				state.selectionFocus = { cardId, columnKey: col };
			}
			state.selectedCells = new Set(state.selectedCells);
		},

		copySelected() {
			if (state.selectedCells.size === 0) return;

			const selectedRowIds = state.currentVisibleCardIds.filter(id => 
				state.visibleColumnsOrder.some(col => state.selectedCells.has(`${id}:${col}`))
			);
			const selectedCols = state.visibleColumnsOrder.filter(col => 
				state.currentVisibleCardIds.some(id => state.selectedCells.has(`${id}:${col}`))
			);

			if (selectedRowIds.length === 0 || selectedCols.length === 0) return;

			const tsvRows = [];
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			
			const cardsToCopy = [];
			for (const id of selectedRowIds) {
				for (const board of boards) {
					if (deckStore[board]) {
						const card = deckStore[board].find(c => c.id === id);
						if (card) {
							cardsToCopy.push({ ...card, sourceBoard: board });
							break;
						}
					}
				}
			}
			state.copiedCards = cardsToCopy;
			state.isCut = false;

			for (const id of selectedRowIds) {
				let card = null;
				for (const board of boards) {
					if (deckStore[board]) {
						card = deckStore[board].find(c => c.id === id);
						if (card) break;
					}
				}
				if (!card) continue;

				const rowVals = [];
				for (const col of selectedCols) {
					if (state.selectedCells.has(`${id}:${col}`)) {
						rowVals.push(String(getCardCellValue(card, col)));
					} else {
						rowVals.push("");
					}
				}
				tsvRows.push(rowVals.join('\t'));
			}

			const tsvText = tsvRows.join('\n');
			if (typeof navigator !== 'undefined' && navigator.clipboard) {
				navigator.clipboard.writeText(tsvText).catch(() => {});
			}
			state.copiedCellValues = tsvRows;
			state.copiedColumnKey = selectedCols.length === 1 ? selectedCols[0] : null;
		},

		cutSelected() {
			this.copySelected();
			state.isCut = true;
			this.deleteSelected();
		},

		deleteSelected(forceDeleteCard = false) {
			if (state.selectedCells.size === 0) return;

			const cellMap = new Map();
			for (const cell of state.selectedCells) {
				const [id, col] = cell.split(':');
				if (!cellMap.has(id)) {
					cellMap.set(id, new Set());
				}
				cellMap.get(id).add(col);
			}

			deckStore.batchUpdate(() => {
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				
				for (const [id, cols] of cellMap.entries()) {
					if (forceDeleteCard || cols.has('name')) {
						for (const board of boards) {
							if (deckStore[board]) {
								const card = deckStore[board].find(c => c.id === id);
								if (card) {
									deckStore.removeCard(card.name, board, id);
									break;
								}
							}
						}
					} else {
						for (const col of cols) {
							if (col === 'cmc') {
								deckStore.resetCardOverride(id, 'manaValue');
							} else if (col === 'type') {
								deckStore.resetCardOverride(id, 'primaryType');
							} else if (col === 'color-cat') {
								deckStore.resetCardOverride(id, 'colorCategory');
								deckStore.resetCardOverride(id, 'colors');
								deckStore.resetCardOverride(id, 'colorIdentity');
							}
						}
					}
				}
			});

			const allCardIds = new Set(
				['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard']
					.flatMap(b => deckStore[b] ? deckStore[b].map(c => c.id) : [])
			);
			for (const cell of [...state.selectedCells]) {
				const [id] = cell.split(':');
				if (!allCardIds.has(id)) {
					state.selectedCells.delete(cell);
				}
			}
		},

		/**
		 * @param {string | null} targetColumnName
		 */
		async pasteSelected(targetColumnName = null) {
			let text = "";
			try {
				if (typeof navigator !== 'undefined' && navigator.clipboard) {
					text = await navigator.clipboard.readText();
				}
			} catch (e) {}

			if (!text && state.copiedCellValues) {
				text = state.copiedCellValues.join('\n');
			}

			if (text) {
				const rows = text.split(/\r?\n/).map(line => line.split('\t'));
				if (rows.length > 0) {
					const selectedRowIds = state.currentVisibleCardIds.filter(id => 
						state.visibleColumnsOrder.some(col => state.selectedCells.has(`${id}:${col}`))
					);
					const selectedCols = state.visibleColumnsOrder.filter(col => 
						state.currentVisibleCardIds.some(id => state.selectedCells.has(`${id}:${col}`))
					);

					let startCardId = state.selectionFocus?.cardId;
					let startColKey = state.selectionFocus?.columnKey;

					if (!startCardId && selectedRowIds.length > 0) {
						startCardId = selectedRowIds[0];
					}
					if (!startColKey && selectedCols.length > 0) {
						startColKey = selectedCols[0];
					}

					if (startCardId && startColKey) {
						const startRowIdx = state.currentVisibleCardIds.indexOf(startCardId);
						const startColIdx = state.visibleColumnsOrder.indexOf(startColKey);

						if (startRowIdx !== -1 && startColIdx !== -1) {
							deckStore.batchUpdate(() => {
								for (let r = 0; r < rows.length; r++) {
									const rowIdx = startRowIdx + r;
									if (rowIdx >= state.currentVisibleCardIds.length) break;
									const cardId = state.currentVisibleCardIds[rowIdx];
									const rowData = rows[r];

									for (let c = 0; c < rowData.length; c++) {
										const colIdx = startColIdx + c;
										if (colIdx >= state.visibleColumnsOrder.length) break;
										const colKey = state.visibleColumnsOrder[colIdx];
										const val = rowData[c]?.trim();
										if (val !== undefined) {
											if (colKey === 'cmc') {
												const num = parseInt(val, 10);
												if (!isNaN(num)) {
													deckStore.setCardOverride(cardId, 'manaValue', num);
												}
											} else if (colKey === 'type') {
												deckStore.setCardOverride(cardId, 'primaryType', val);
											} else if (colKey === 'color-cat') {
												const formatted = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
												const validOptions = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"];
												const matched = validOptions.find(o => o.toLowerCase() === formatted.toLowerCase()) || formatted;
												deckStore.setCardOverride(cardId, 'colorCategory', matched);
												/** @type {Record<string, string[]>} */
												const mapColors = { "White": ["W"], "Blue": ["U"], "Black": ["B"], "Red": ["R"], "Green": ["G"] };
												if (mapColors[matched]) {
													deckStore.setCardOverride(cardId, 'colors', mapColors[matched]);
													deckStore.setCardOverride(cardId, 'colorIdentity', mapColors[matched]);
												} else if (matched === "Colorless") {
													deckStore.setCardOverride(cardId, 'colors', []);
													deckStore.setCardOverride(cardId, 'colorIdentity', []);
												}
											}
										}
									}
								}
							});
							return;
						}
					}
				}
			}

			if (!state.copiedCards || state.copiedCards.length === 0) return;
			
			deckStore.batchUpdate(() => {
				const grouping = deckStore.grouping?.toLowerCase();
				for (const card of state.copiedCards) {
					const newId = deckStore.addCard(card.name, deckStore.activeBoard, card.price, card._metadata);
					if (newId) {
						if (grouping === 'freeform') {
							// Set freeform target col if supported
						} else if (grouping === 'cmc') {
							let val = parseInt(targetColumnName || '', 10);
							if (targetColumnName === '0-1') val = 1;
							if (targetColumnName === '6+') val = 6;
							if (!isNaN(val)) deckStore.setCardOverride(newId, 'manaValue', val);
						} else if (grouping === 'color') {
							const category = targetColumnName;
							/** @type {Record<string, string[]>} */
							const mapColors = { "White": ["W"], "Blue": ["U"], "Black": ["B"], "Red": ["R"], "Green": ["G"] };
							if (category) {
								deckStore.setCardOverride(newId, 'colorCategory', category);
								if (mapColors[category]) {
									deckStore.setCardOverride(newId, 'colors', mapColors[category]);
									deckStore.setCardOverride(newId, 'colorIdentity', mapColors[category]);
								}
							}
						} else if (grouping === 'creature') {
							if (targetColumnName) {
								deckStore.setCardOverride(newId, 'creature', targetColumnName === 'Creatures');
							}
						} else if (grouping === 'type') {
							let typeVal = targetColumnName;
							if (targetColumnName === 'Creatures') typeVal = 'Creature';
							else if (targetColumnName === 'Planeswalkers') typeVal = 'Planeswalker';
							else if (targetColumnName === 'Instants') typeVal = 'Instant';
							else if (targetColumnName === 'Sorceries') typeVal = 'Sorcery';
							else if (targetColumnName === 'Artifacts') typeVal = 'Artifact';
							else if (targetColumnName === 'Enchantments') typeVal = 'Enchantment';
							else if (targetColumnName === 'Battles') typeVal = 'Battle';
							else if (targetColumnName === 'Lands') typeVal = 'Land';
							if (typeVal) deckStore.setCardOverride(newId, 'primaryType', typeVal);
						} else if (grouping === 'primarytag') {
							if (targetColumnName && targetColumnName !== 'No Tag') {
								deckStore.setPrimaryTag(newId, targetColumnName);
							}
						}
					}
				}
			});
		},

		/**
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 * @param {boolean} isAdding
		 */
		showQuantityModal(card, zone, price, isAdding = false) {
			state.quantityModal = {
				isOpen: true,
				card,
				zone,
				price,
				initialValue: card.stackCount || 1,
				isAdding
			};
		},

		closeQuantityModal() {
			state.quantityModal.isOpen = false;
		},

		/**
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 */
		showCardDataModal(card, zone, price) {
			state.cardDataModal = {
				isOpen: true,
				card,
				zone,
				price
			};
		},

		closeCardDataModal() {
			state.cardDataModal.isOpen = false;
		},

		/**
		 * @param {string | null} id 
		 * @param {string} zone 
		 * @param {number | null} price 
		 */
		startEditing(id, zone, price) {
			state.editingCardId = id;
			state.hoveredCard = null; // Prevent tooltip while editing
			state.isMenuOpen = false;
		},

		stopEditing() {
			state.editingCardId = null;
		},

		/**
		 * @param {MouseEvent} e
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 */
		showMenu(e, card, zone, price) {
			e.preventDefault();
			e.stopPropagation();
			state.hoveredCard = card;
			state.hoveredZone = zone;
			state.hoveredPrice = price;
			state.menuCard = card;
			state.menuZone = zone;
			state.menuPrice = price;
			state.menuPosition = { x: e.clientX, y: e.clientY };
			state.isMenuOpen = true;
		},

		get menuItems() {
			if (!state.menuCard) return [];
			const name = /** @type {string} */ (state.menuCard.name);
			const zone = /** @type {string} */ (state.menuZone);
			const price = state.menuPrice;
			const card = state.menuCard;

			const isFromSearch = zone === 'scryfall' || zone === 'budget-edh-26.2' || zone === 'budget-staples' || zone === 'garbage';

			const meta = card.type_line ? card : deckStore.metadata[name.toLowerCase()];
			const typeLine = meta?.type_line || "";
			const oracleText = meta?.oracle_text || "";
			const isLegendary = typeLine.includes("Legendary");
			const isCreature = typeLine.includes("Creature");
			const isPlaneswalker = typeLine.includes("Planeswalker");
			const isCompanion = meta?.oracle_text?.includes("Companion") || typeLine.includes("Companion");

			const hasPartner = /partner|friends forever|choose a background/i.test(oracleText);

			// Commander eligibility
			const canBeCommander = (isLegendary && isCreature) ||
				(isPlaneswalker && ['Brawl', 'Oathbreaker', 'Commander'].includes(deckStore.format));

			const items = [];

			if (isFromSearch) {
				items.push({
					label: "Add One to Deck",
					shortcuts: ["="],
					action: () => deckStore.addCard(name, deckStore.activeBoard, price, card)
				});
				items.push({
					label: "Add Multiple to Deck...",
					shortcuts: ["Q"],
					action: () => this.showQuantityModal(card, zone, price, true)
				});
			} else {
				items.push({
					label: "Add One",
					shortcuts: ["Shift + ="],
					action: () => deckStore.addCard(name, zone, price, card)
				});
				items.push({
					label: "Delete One",
					shortcuts: ["Delete"],
					action: () => deckStore.removeCard(name, zone, card.id)
				});
				items.push({
					label: "Delete All",
					shortcuts: ["Shift + Delete"],
					action: () => deckStore.removeAllCopies(name, zone)
				});
				items.push({
					label: "Set Quantity",
					shortcuts: ["Q"],
					action: () => {
						if (['mainboard', 'sideboard', 'maybeboard', 'commander', 'companion'].includes(zone)) {
							this.startEditing(card.id, zone, price);
						} else {
							this.showQuantityModal(card, zone, price, false);
						}
					}
				});
				items.push({
					label: "Edit Card Data...",
					action: () => {
						this.showCardDataModal(card, zone, price);
					}
				});
				const hasOverrides = (card.overrides && Object.keys(card.overrides).length > 0) || 
					(card.customColumn !== undefined && card.customColumn !== null && card.customColumn !== "") ||
					(card.tags && card.tags.length > 0) || 
					(card.primaryTag !== undefined && card.primaryTag !== null);
				if (hasOverrides) {
					items.push({
						label: "Reset Card Data",
						action: () => {
							deckStore.resetAllOverridesForCard(card.id);
						}
					});
				}
			}

			items.push({ divider: true });

			const existingCommander = deckStore.commander[0];
			const existingMeta = existingCommander ? deckStore.metadata[existingCommander.name.toLowerCase()] : null;

			/** 
			 * @param {string} name 
			 * @param {any} meta 
			 */
			const getPartnerLogic = (name, meta) => {
				const text = meta?.oracle_text || "";
				const type = meta?.type_line || "";
				
				if (text.toLowerCase().includes("partner with ")) {
					const match = text.match(/Partner with ([^(\n\.,]+)/i);
					return { type: 'specific', target: match ? match[1].trim() : null };
				}
				if (text.includes("Friends forever")) return { type: 'friends' };
				if (text.includes("Choose a Background")) return { type: 'commander-background' };
				if (type.includes("Background") && type.includes("Enchantment")) return { type: 'background' };
				if (text.includes("Doctor's companion")) return { type: 'doctors-companion' };
				if (type.includes("Doctor") && type.includes("Time Lord")) return { type: 'doctor' };
				if (text.includes("Partner")) return { type: 'global' };
				
				return null;
			};

			/**
			 * @param {any} logicA
			 * @param {string} nameA
			 * @param {any} logicB
			 * @param {string} nameB
			 */
			const canPair = (logicA, nameA, logicB, nameB) => {
				if (!logicA || !logicB) return false;
				
				// 1. Global Partners
				if (logicA.type === 'global' && logicB.type === 'global') return true;
				
				// 2. Friends Forever
				if (logicA.type === 'friends' && logicB.type === 'friends') return true;
				
				// 3. Specific Partners ("Partner with [Name]")
				if (logicA.type === 'specific' && nameB.toLowerCase().includes(logicA.target?.toLowerCase() || "")) return true;
				if (logicB.type === 'specific' && nameA.toLowerCase().includes(logicB.target?.toLowerCase() || "")) return true;
				
				// 4. Backgrounds
				if (logicA.type === 'commander-background' && logicB.type === 'background') return true;
				if (logicB.type === 'commander-background' && logicA.type === 'background') return true;
				
				// 5. Doctor's Companion
				if (logicA.type === 'doctors-companion' && logicB.type === 'doctor') return true;
				if (logicB.type === 'doctors-companion' && logicA.type === 'doctor') return true;
				
				return false;
			};

			const newLogic = getPartnerLogic(name, meta);
			const existingLogic = getPartnerLogic(existingCommander?.name || "", existingMeta);
			const isLegalPair = canPair(newLogic, name, existingLogic, existingCommander?.name || "");

			// Robust slot detection
			const isInCommander = zone === 'commander' || deckStore.commander.some(/** @param {any} c */ c => c.id === card.id);
			const isInCompanion = zone === 'companion' || deckStore.companion.some(/** @param {any} c */ c => c.id === card.id);

			// Commander Item
			if (canBeCommander || isInCommander) {
				items.push({
					label: isInCommander ? "Remove Commander" : "Set Commander",
					action: () => {
						if (isInCommander) {
							// Find the actual board instance to move
							const instance = deckStore.commander.find(c => c.id === card.id) || card;
							deckStore.moveCard(instance.name, 'commander', 'mainboard', instance.id, instance.price);
						} else {
							if (deckStore.format === 'List') deckStore.format = 'Commander';

							// Swap logic: only add without swapping if they are a legal pair and there's room
							const shouldSwap = !(isLegalPair && deckStore.commander.length === 1);

							if (shouldSwap && deckStore.commander.length > 0) {
								const targetZone = isFromSearch ? 'garbage' : zone;
								[...deckStore.commander].forEach(c => {
									if (isFromSearch) {
										deckStore.removeCard(c.name, 'commander', c.id);
									} else {
										deckStore.moveCard(c.name, 'commander', targetZone, c.id, c.price);
									}
								});
							}

							if (isFromSearch) {
								deckStore.addCard(name, 'commander', price, card);
							} else {
								deckStore.moveCard(name, zone, 'commander', card.id, price);
							}
						}
					}
				});
			}

			// Companion Item
			if (isCompanion || isInCompanion) {
				items.push({
					label: isInCompanion ? "Remove Companion" : "Set Companion",
					action: () => {
						if (isInCompanion) {
							const instance = deckStore.companion.find(/** @param {any} c */ c => c.id === card.id) || card;
							deckStore.moveCard(instance.name, 'companion', 'mainboard', instance.id, instance.price);
						} else {
							// Swap logic: move existing companions back to the source zone
							if (deckStore.companion.length > 0) {
								const targetZone = isFromSearch ? 'garbage' : zone;
								[...deckStore.companion].forEach(c => {
									if (isFromSearch) {
										deckStore.removeCard(c.name, 'companion', c.id);
									} else {
										deckStore.moveCard(c.name, 'companion', targetZone, c.id, c.price);
									}
								});
							}

							if (isFromSearch) {
								deckStore.addCard(name, 'companion', price, card);
							} else {
								deckStore.moveCard(name, zone, 'companion', card.id, price);
							}
						}
					}
				});
			}

			items.push({ divider: true });

			// Board Items
			if (zone !== 'sideboard') {
				items.push({
					label: "Sideboard",
					shortcuts: ["S"],
					action: () => {
						if (isFromSearch) {
							deckStore.addCard(name, 'sideboard', price, card);
						} else {
							deckStore.moveCard(name, zone, 'sideboard', card.id, price);
						}
					}
				});
			} else {
				items.push({
					label: "Move to Mainboard",
					shortcuts: ["S"],
					action: () => deckStore.moveCard(name, 'sideboard', 'mainboard', card.id, price)
				});
			}

			if (zone !== 'maybeboard') {
				items.push({
					label: "Maybeboard",
					shortcuts: ["M"],
					action: () => {
						if (isFromSearch) {
							deckStore.addCard(name, 'maybeboard', price, card);
						} else {
							deckStore.moveCard(name, zone, 'maybeboard', card.id, price);
						}
					}
				});
			} else {
				items.push({
					label: "Move to Mainboard",
					shortcuts: ["M"],
					action: () => deckStore.moveCard(name, 'maybeboard', 'mainboard', card.id, price)
				});
			}

			items.push({ divider: true });

			items.push({
				label: isFromSearch ? "See all prints" : "Change Printing",
				shortcuts: ["P"],
				action: () => {
					import('./search.svelte.js').then(({ searchStore }) => {
						searchStore.collection = 'scryfall';
						searchStore.query = `!"${name}" unique:prints`;
					});
				}
			});

			items.push({
				label: "Set Deck Image",
				action: () => {
					const isDfc = card.card_faces && card.card_faces.length > 1;
					const artUrl = isDfc ? card.card_faces[0].image_uris?.art_crop : card.image_uris?.art_crop;
					if (artUrl) deckStore.coverArt = artUrl;
				}
			});

			items.push({
				label: "Open in Scryfall",
				shortcuts: ["O"],
				action: () => window.open(meta?.scryfall_uri || `https://scryfall.com/search?q=!"${name}"`, '_blank')
			});

			// Clean up dividers: remove leading/trailing or consecutive dividers
			/** @type {any[]} */
			const filteredItems = items.reduce(/** @param {any[]} acc, @param {any} item */ (acc, item) => {
				if (item.divider) {
					if (acc.length === 0 || acc[acc.length - 1].divider) return acc;
				}
				acc.push(item);
				return acc;
			}, []);

			if (filteredItems.length > 0 && filteredItems[filteredItems.length - 1].divider) {
				filteredItems.pop();
			}

			return filteredItems;
		},

		/**
		 * @param {any} card
		 * @param {string} zone
		 * @param {number | null} price
		 */
		registerHover(card, zone, price) {
			if (state.hoveredCard?.id === card.id && state.hoveredZone === zone) return;
			state.hoveredCard = card;
			state.hoveredZone = zone;
			state.hoveredPrice = price;
		},

		unregisterHover() {
			if (!state.isMenuOpen) {
				state.hoveredCard = null;
				state.hoveredZone = null;
				state.hoveredPrice = null;
			}
		},

		get activeAnimations() { return state.activeAnimations; },

		/**
		 * @param {any} card 
		 * @param {DOMRect} sourceRect 
		 * @param {string} board
		 */
		triggerMoveAnimation(card, sourceRect, board) {
			const id = Math.random().toString(36).substring(7);
			const animation = {
				id,
				card,
				sourceRect,
				board,
				startTime: Date.now()
			};
			state.activeAnimations.push(animation);

			// Auto-cleanup after animation duration (e.g., 600ms)
			setTimeout(() => {
				state.activeAnimations = state.activeAnimations.filter(a => a.id !== id);
			}, 800);
		}
	};
}

export const interactionStore = createInteractionStore();
