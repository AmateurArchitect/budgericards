import { deckStore } from "./deck.svelte.js";
import { parseDecklist } from "../utils/decklistParser.js";

/**
 * Parses a single text cell/column value into card details
 * @param {string} str
 * @returns {any}
 */
function parseCardText(str) {
	str = str.trim();
	if (!str) return null;

	if (/^\d+$/.test(str)) {
		return { quantity: parseInt(str, 10) };
	}

	// 1. Check Scryfall ID / URL
	const uuidPattern = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
	const uuidMatch = str.match(uuidPattern);
	if (uuidMatch) {
		return { scryfallId: uuidMatch[1].toLowerCase() };
	}

	// Check Scryfall card URL with set/collector
	const scryfallCardUrlPattern = /\/card\/([a-zA-Z0-9]{2,6})\/([a-zA-Z0-9\-]+)/i;
	const scryfallUrlMatch = str.match(scryfallCardUrlPattern);
	if (scryfallUrlMatch) {
		return {
			set: scryfallUrlMatch[1].toLowerCase(),
			collector_number: scryfallUrlMatch[2].toLowerCase()
		};
	}

	// 2. Check Set + Collector Number only (e.g. "2ED 123", "2ED/123", "[2ED] 123", etc.)
	const setCollPattern = /^[([]?([A-Za-z0-9]{2,6})[)\]]?[\s\-\/]+(\d+[a-zA-Z]*)$/i;
	const setCollMatch = str.match(setCollPattern);
	if (setCollMatch) {
		return {
			set: setCollMatch[1].toLowerCase(),
			collector_number: setCollMatch[2]
		};
	}

	// 3. Check for Quantity + Name + optional Set/Collector
	const qtyNamePattern = /^(?:x\s*(\d+)|(\d+)\s*x?)\s+(.+)$/i;
	const qtyNameMatch = str.match(qtyNamePattern);
	if (qtyNameMatch) {
		const qty = parseInt(qtyNameMatch[1] || qtyNameMatch[2], 10);
		const remaining = qtyNameMatch[3].trim();
		
		const setCollSuffixPattern = /(?:\s*[([\|]([A-Za-z0-9]{2,6})[)\]]?\s*(\d+[a-zA-Z]*)?|\s+([A-Za-z0-9]{3,4})\s+(\d+[a-zA-Z]*))$/i;
		const suffixMatch = remaining.match(setCollSuffixPattern);
		if (suffixMatch) {
			const name = remaining.slice(0, suffixMatch.index).trim();
			const set = suffixMatch[1] || suffixMatch[3];
			const collector_number = suffixMatch[2] || suffixMatch[4];
			return {
				quantity: qty,
				name,
				set: set ? set.toLowerCase() : undefined,
				collector_number: collector_number || undefined
			};
		}
		
		return {
			quantity: qty,
			name: remaining
		};
	}

	// 4. Default: Name + optional Set/Collector
	const setCollSuffixPattern = /(?:\s*[([\|]([A-Za-z0-9]{2,6})[)\]]?\s*(\d+[a-zA-Z]*)?|\s+([A-Za-z0-9]{3,4})\s+(\d+[a-zA-Z]*))$/i;
	const suffixMatch = str.match(setCollSuffixPattern);
	if (suffixMatch) {
		const name = str.slice(0, suffixMatch.index).trim();
		const set = suffixMatch[1] || suffixMatch[3];
		const collector_number = suffixMatch[2] || suffixMatch[4];
		if (name) {
			return {
				name,
				set: set ? set.toLowerCase() : undefined,
				collector_number: collector_number || undefined
			};
		}
	}

	return {
		name: str
	};
}

/**
 * Helper to determine if a string matches MTG metadata (e.g. mana cost, type line, color category)
 * rather than a card name, to prevent spreadsheet columns from overwriting card names during paste.
 * @param {string} str
 * @returns {boolean}
 */
function isMetadataString(str) {
	const s = str.trim().toLowerCase();
	if (!s) return true;
	// Mana cost
	if (/^(\{[a-z0-9\/]+\})+$/i.test(s)) return true;
	// Color categories (exact match)
	const colorCats = ["white", "blue", "black", "red", "green", "multicolor", "colorless", "lands"];
	if (colorCats.includes(s)) return true;
	// Color identities (exact match)
	const colorIds = ["w", "u", "b", "r", "g", "c", "wubrg", "wubr", "wub", "wu", "ub", "br", "rg", "wg", "wb", "ur", "bg", "wr", "ug", "—", "-"];
	if (colorIds.includes(s)) return true;
	// Type lines containing em-dash or dash (e.g. "Creature — Zombie")
	if (s.includes("—") || s.includes(" - ")) return true;
	// Exact card types or ending with core type words
	const types = ["creature", "planeswalker", "instant", "sorcery", "artifact", "enchantment", "battle", "land"];
	if (types.includes(s)) return true;
	if (/\b(creature|planeswalker|instant|sorcery|artifact|enchantment|battle|land)s?$/i.test(s)) return true;
	// Prices (e.g. $0.10 or 0.10)
	if (/^\$?\d+(\.\d{2})?$/.test(s)) return true;
	return false;
}

/**
 * Parses tab-separated spreadsheet data or standard MTG decklists
 * @param {string} text
 * @returns {any[]}
 */
function parseSpreadsheetText(text) {
	const lines = text.split(/\r?\n/);
	const parsedCards = [];
	
	for (let line of lines) {
		line = line.trim();
		if (!line) continue;
		
		if (line.includes('\t')) {
			const cols = line.split('\t').map(c => c.trim());
			let qty = 1;
			let name = "";
			let set = "";
			let collectorNumber = "";
			let scryfallId = "";
			
			for (let i = 0; i < cols.length; i++) {
				const col = cols[i];
				if (!col) continue;

				const parsedCell = parseCardText(col);
				if (!parsedCell) continue;

				if (parsedCell.scryfallId) {
					scryfallId = parsedCell.scryfallId;
				}
				if (parsedCell.quantity !== undefined) {
					// Only accept quantity from the first column or if it has an explicit 'x'
					if (i === 0 || col.toLowerCase().includes('x')) {
						qty = parsedCell.quantity;
					}
				}
				if (parsedCell.set) {
					set = parsedCell.set;
				}
				if (parsedCell.collector_number) {
					collectorNumber = parsedCell.collector_number;
				}
				if (parsedCell.name) {
					if (!isMetadataString(parsedCell.name)) {
						name = parsedCell.name;
					}
				}
			}
			
			if (scryfallId) {
				parsedCards.push({
					scryfallId,
					quantity: qty
				});
				continue;
			}
			
			if (name || (set && collectorNumber)) {
				parsedCards.push({
					name: name || undefined,
					quantity: qty,
					set: set || undefined,
					collector_number: collectorNumber || undefined
				});
				continue;
			}
		} else {
			const stdParsed = parseDecklist(line);
			if (stdParsed && stdParsed.length > 0) {
				parsedCards.push(...stdParsed);
			}
		}
	}
	return parsedCards;
}


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
			const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
			if (boardArray) {
				const matches = boardArray.filter(c => c.name.toLowerCase() === name.toLowerCase());
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
 * @property {Object} changePrintingsModal
 * @property {boolean} changePrintingsModal.isOpen
 * @property {any[]} changePrintingsModal.selectedCards
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
		changePrintingsModal: {
			isOpen: false,
			selectedCards: []
		},
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
					} else if (e.key === 'ArrowDown') {
						rIdx++; moved = true;
					} else if (e.key === 'ArrowUp') {
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

			// Enter key to edit
			if (e.key === 'Enter' && state.selectionFocus) {
				const focusId = state.selectionFocus.cardId;
				const focusCol = state.selectionFocus.columnKey;
				
				const newSelection = new Set();
				for (const cell of state.selectedCells) {
					if (cell.endsWith(`:${focusCol}`)) {
						newSelection.add(cell);
					}
				}
				newSelection.add(`${focusId}:${focusCol}`);
				state.selectedCells = newSelection;
				state.selectionAnchor = { cardId: focusId, columnKey: focusCol };

				state.inlineEditTrigger = { cardId: focusId, columnKey: focusCol, initialKey: "" };
				e.preventDefault();
				return;
			}

			// Typing to edit
			if (e.key.length === 1 && !isCmdCtrl && !e.altKey && state.selectionFocus) {
				if (state.selectedCells.size > 0) {
					const focusId = state.selectionFocus.cardId;
					const focusCol = state.selectionFocus.columnKey;
					
					const newSelection = new Set();
					for (const cell of state.selectedCells) {
						if (cell.endsWith(`:${focusCol}`)) {
							newSelection.add(cell);
						}
					}
					newSelection.add(`${focusId}:${focusCol}`);
					state.selectedCells = newSelection;
					state.selectionAnchor = { cardId: focusId, columnKey: focusCol };

					state.inlineEditTrigger = { cardId: focusId, columnKey: focusCol, initialKey: e.key };
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
		get menuHeader() {
			if (!state.menuCard) return "";
			const isFromSearch = state.menuZone === 'scryfall' || state.menuZone === 'budget-edh-26.2' || state.menuZone === 'budget-staples' || state.menuZone === 'garbage';
			if (isFromSearch) return state.menuCard.name;

			const selectedIds = new Set(
				[...state.selectedCells].map(cell => cell.split(':')[0])
			);
			if (selectedIds.size > 1) {
				return `${selectedIds.size} Cards selected`;
			}
			return state.menuCard.name;
		},
		get changePrintingsModal() { return state.changePrintingsModal; },
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

		filterSelectionToColumn(columnKey) {
			const newSelection = new Set();
			for (const cell of state.selectedCells) {
				if (cell.endsWith(`:${columnKey}`)) {
					newSelection.add(cell);
				}
			}
			state.selectedCells = newSelection;
		},

		setSelectedCells(cellsSet) {
			state.selectedCells = cellsSet;
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
					const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
					if (boardArray) {
						const card = boardArray.find(c => c.id === id);
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
					const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
					if (boardArray) {
						card = boardArray.find(c => c.id === id);
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
							const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
							if (boardArray) {
								const card = boardArray.find(c => c.id === id);
								if (card) {
									deckStore.removeAllCopies(card.name, board);
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
					.flatMap(b => {
						const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[b]);
						return boardArray ? boardArray.map(c => c.id) : [];
					})
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
				const isSingleCellSelected = state.selectedCells.size === 1;
				const isRangeSelected = state.selectedCells.size > 1;

				const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
				const looksLikeCardList = lines.length > 1 || /^(?:x\s*(\d+)|(\d+)\s*x?)\s+(.+)$/i.test(lines[0]) || !isRangeSelected;

				if (isRangeSelected || (isSingleCellSelected && !looksLikeCardList)) {
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
												} else if (colKey === 'qty') {
													const num = parseInt(val, 10);
													if (!isNaN(num) && num >= 0) {
														const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
														for (const board of boards) {
															const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
															if (boardArray) {
																const card = boardArray.find(c => c.id === cardId);
																if (card) {
																	deckStore.setQuantity(card.name, board, num, card.price, card._metadata);
																	break;
																}
															}
														}
													}
												} else if (colKey === 'name') {
													const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
													for (const board of boards) {
														const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
														if (boardArray) {
															const card = boardArray.find(c => c.id === cardId);
															if (card) {
																deckStore.renameCard(card.name, val, card.price, card._metadata);
																break;
															}
														}
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
				} else {
					const parsed = parseSpreadsheetText(text);
					if (parsed && parsed.length > 0) {
						/** @type {any[]} */
						const cardsToAdd = [];
						for (const item of parsed) {
							if (item.scryfallId) {
								try {
									const res = await fetch(`https://api.scryfall.com/cards/${item.scryfallId}`);
									if (res.ok) {
										const scryfallCard = await res.json();
										cardsToAdd.push({
											name: scryfallCard.name,
											quantity: item.quantity,
											price: parseFloat(scryfallCard.prices?.usd || scryfallCard.prices?.usd_foil) || 0,
											metadata: scryfallCard
										});
									}
								} catch (e) {
									console.error("Failed to fetch card by Scryfall ID:", e);
								}
							} else if (item.set && item.collector_number) {
								try {
									const res = await fetch(`https://api.scryfall.com/cards/${item.set.toLowerCase()}/${item.collector_number}`);
									if (res.ok) {
										const scryfallCard = await res.json();
										cardsToAdd.push({
											name: scryfallCard.name,
											quantity: item.quantity,
											price: parseFloat(scryfallCard.prices?.usd || scryfallCard.prices?.usd_foil) || 0,
											metadata: scryfallCard
										});
									} else if (item.name) {
										cardsToAdd.push({
											name: item.name,
											quantity: item.quantity,
											set: item.set,
											collector_number: item.collector_number
										});
									}
								} catch (e) {
									console.error("Failed to fetch card by Set/Collector:", e);
									if (item.name) {
										cardsToAdd.push({
											name: item.name,
											quantity: item.quantity,
											set: item.set,
											collector_number: item.collector_number
										});
									}
								}
							} else if (item.name) {
								cardsToAdd.push({
									name: item.name,
									quantity: item.quantity
								});
							}
						}

					if (cardsToAdd.length > 0) {
							const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
							const wasDeckEmpty = boards.every(b => {
								const arr = /** @type {any[]} */ (/** @type {any} */ (deckStore)[b]);
								return !arr || arr.length === 0;
							});

							deckStore.batchUpdate(() => {
								const board = deckStore.activeBoard || 'mainboard';
								for (const card of cardsToAdd) {
									const metadata = card.metadata || (card.set ? { set: card.set.toLowerCase(), collector_number: card.collector_number } : null);
									
									const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]) || [];
									const existingCount = boardArray.filter(c => c.name.toLowerCase() === card.name.toLowerCase()).length;
									
									deckStore.setQuantity(card.name, board, existingCount + card.quantity, card.price || null, metadata);
								}
							});

							if (wasDeckEmpty && deckStore.commander.length === 0) {
								const totalAfter = boards.reduce((sum, b) => {
									const arr = /** @type {any[]} */ (/** @type {any} */ (deckStore)[b]);
									return sum + (arr?.length ?? 0);
								}, 0);
								if (totalAfter >= 98 && totalAfter <= 103) {
									deckStore.scheduleAutoCommanderCheck(
										cardsToAdd[0]?.name || '',
										cardsToAdd[cardsToAdd.length - 1]?.name || ''
									);
								}
							}
						}
						return;
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

		/** @param {any[]} selectedCards */
		showChangePrintingsModal(selectedCards) {
			state.changePrintingsModal.selectedCards = selectedCards;
			state.changePrintingsModal.isOpen = true;
			state.isMenuOpen = false;
		},

		closeChangePrintingsModal() {
			state.changePrintingsModal.isOpen = false;
			state.changePrintingsModal.selectedCards = [];
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

			const isFromSearch = zone === 'scryfall' || zone === 'budget-edh-26.2' || zone === 'budget-staples' || zone === 'garbage';
			if (card && card.id && !isFromSearch) {
				const isCardSelected = [...state.selectedCells].some(cell => cell.startsWith(`${card.id}:`));
				if (!isCardSelected) {
					state.selectedCells.clear();
					state.selectedCells.add(`${card.id}:name`);
					state.selectionFocus = { cardId: card.id, columnKey: 'name' };
					state.selectionAnchor = { cardId: card.id, columnKey: 'name' };
					state.selectedCells = new Set(state.selectedCells);
				}
			}

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

			const selectedIds = new Set(
				[...state.selectedCells].map(cell => cell.split(':')[0])
			);

			if (selectedIds.size > 1 && !isFromSearch) {
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				const selectedCards = [];
				for (const id of selectedIds) {
					for (const b of boards) {
						const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[b]);
						if (boardArray) {
							const foundCard = boardArray.find(c => c.id === id);
							if (foundCard) {
								selectedCards.push({ ...foundCard, board: b });
								break;
							}
						}
					}
				}

				const items = [];
				items.push({
					label: "Add one of each",
					action: () => {
						deckStore.batchUpdate(() => {
							for (const card of selectedCards) {
								const meta = deckStore.metadata[card.name.toLowerCase()];
								deckStore.addCard(card.name, card.board, card.price, meta);
							}
						});
					}
				});
				items.push({
					label: "Delete one of each",
					action: () => {
						deckStore.batchUpdate(() => {
							for (const card of selectedCards) {
								deckStore.removeCard(card.name, card.board, card.id);
							}
						});
					}
				});
				items.push({
					label: "Delete all",
					action: () => {
						deckStore.batchUpdate(() => {
							for (const card of selectedCards) {
								deckStore.removeAllCopies(card.name, card.board);
							}
						});
					}
				});
				items.push({
					label: "Set quantity",
					action: () => {
						const qtyStr = prompt("Enter quantity for all selected cards:");
						if (qtyStr !== null) {
							const qty = parseInt(qtyStr, 10);
							if (!isNaN(qty) && qty >= 0) {
								deckStore.batchUpdate(() => {
									for (const card of selectedCards) {
										const meta = deckStore.metadata[card.name.toLowerCase()];
										deckStore.setQuantity(card.name, card.board, qty, card.price, meta);
									}
								});
							}
						}
					}
				});

				const anyHasOverrides = selectedCards.some(card => 
					(card.overrides && Object.keys(card.overrides).length > 0) || 
					(card.customColumn !== undefined && card.customColumn !== null && card.customColumn !== "") ||
					(card.tags && card.tags.length > 0) || 
					(card.primaryTag !== undefined && card.primaryTag !== null)
				);
				if (anyHasOverrides) {
					items.push({
						label: "Reset Card Data",
						action: () => {
							deckStore.batchUpdate(() => {
								for (const card of selectedCards) {
									deckStore.resetAllOverridesForCard(card.id);
								}
							});
						}
					});
				}

				items.push({ divider: true });

				const allInSideboard = selectedCards.every(c => c.board === 'sideboard');
				const allInMaybeboard = selectedCards.every(c => c.board === 'maybeboard');

				if (!allInSideboard) {
					items.push({
						label: "Sideboard",
						action: () => {
							deckStore.batchUpdate(() => {
								for (const card of selectedCards) {
									deckStore.moveCard(card.name, card.board, 'sideboard', card.id, card.price);
								}
							});
						}
					});
				} else {
					items.push({
						label: "Move to Mainboard",
						action: () => {
							deckStore.batchUpdate(() => {
								for (const card of selectedCards) {
									deckStore.moveCard(card.name, card.board, 'mainboard', card.id, card.price);
								}
							});
						}
					});
				}

				if (!allInMaybeboard) {
					items.push({
						label: "Maybeboard",
						action: () => {
							deckStore.batchUpdate(() => {
								for (const card of selectedCards) {
									deckStore.moveCard(card.name, card.board, 'maybeboard', card.id, card.price);
								}
							});
						}
					});
				} else if (!allInSideboard) {
					items.push({
						label: "Move to Mainboard",
						action: () => {
							deckStore.batchUpdate(() => {
								for (const card of selectedCards) {
									deckStore.moveCard(card.name, card.board, 'mainboard', card.id, card.price);
								}
							});
						}
					});
				}

				items.push({ divider: true });

				items.push({
					label: "Change Printings",
					action: () => {
						this.showChangePrintingsModal(selectedCards);
					}
				});

				items.push({
					label: "Copy card names",
					submenu: [
						{
							label: "Copy names only",
							action: () => {
								const val = selectedCards.map(c => c.name).join("\n");
								navigator.clipboard.writeText(val);
							}
						},
						{
							label: "Copy with quantities",
							action: () => {
								const val = selectedCards.map(c => {
									const qty = getCardCellValue(c, 'qty');
									return `${qty} ${c.name}`;
								}).join("\n");
								navigator.clipboard.writeText(val);
							}
						},
						{
							label: "Copy with printings",
							action: () => {
								const val = selectedCards.map(c => {
									const meta = deckStore.metadata[c.name.toLowerCase()] || {};
									const set = c.set || meta.set;
									const num = c.collector_number || meta.collector_number;
									if (set) {
										return `${c.name} (${set.toUpperCase()}) ${num || ""}`.trim();
									}
									return c.name;
								}).join("\n");
								navigator.clipboard.writeText(val);
							}
						},
						{
							label: "Copy with quantities and printings",
							action: () => {
								const val = selectedCards.map(c => {
									const qty = getCardCellValue(c, 'qty');
									const meta = deckStore.metadata[c.name.toLowerCase()] || {};
									const set = c.set || meta.set;
									const num = c.collector_number || meta.collector_number;
									if (set) {
										return `${qty} ${c.name} (${set.toUpperCase()}) ${num || ""}`.trim();
									}
									return `${qty} ${c.name}`;
								}).join("\n");
								navigator.clipboard.writeText(val);
							}
						},
						{
							label: "Copy Scryfall IDs",
							action: () => {
								const val = selectedCards.map(c => {
									const meta = deckStore.metadata[c.name.toLowerCase()] || {};
									return c.scryfallId || meta.id || "";
								}).filter(Boolean).join("\n");
								navigator.clipboard.writeText(val);
							}
						}
					]
				});

				return items;
			}

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
							const instance = deckStore.commander.find(/** @param {any} c */ c => c.id === card.id) || card;
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
