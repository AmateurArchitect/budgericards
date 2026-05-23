import { fetchCollection } from '$lib/api/scryfall.js';
import { settingsStore } from '$lib/stores/settings.svelte.js';

const browser = typeof window !== 'undefined';

/** 
 * @typedef {Object} DeckCard
 * @property {string} id
 * @property {string} name
 * @property {number | null} price
 * @property {number} addedAt
 */

export const generateId = () => {
	if (browser && typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
		try {
			return window.crypto.randomUUID();
		} catch (e) {
			// Fallback below
		}
	}
	return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
};

function createDeck() {
	/** @type {Record<string, any> & { name: string, commander: DeckCard[], mainboard: DeckCard[], sideboard: DeckCard[], maybeboard: DeckCard[], garbage: DeckCard[], activeBoard: string, grouping: string, sorting: string, splitView: boolean, coverArt: string | null }} */
	let deck = $state({
		name: 'Untitled Deck',
		commander: [],
		companion: [],
		mainboard: [],
		sideboard: [],
		maybeboard: [],
		garbage: [],
		activeBoard: 'mainboard',
		grouping: 'cmc', 
		sorting: 'color', 
		sortAscending: true,
		splitView: false,
		coverArt: null,
		format: 'List',
		lastNaturalGrouping: 'cmc'
	});

	/** @type {Record<string, any>} */
	let metadata = $state({
		createdBy: 'Anonymous',
		createdAt: Date.now(),
		updatedAt: Date.now()
	});

	/** @type {string[]} */
	let history = $state([]);
	/** @type {string[]} */
	let redoStack = $state([]);


	function saveHistory() {
		const snapshot = JSON.stringify($state.snapshot({
			commander: deck.commander,
			companion: deck.companion,
			mainboard: deck.mainboard,
			sideboard: deck.sideboard,
			maybeboard: deck.maybeboard,
			garbage: deck.garbage,
			name: deck.name,
			coverArt: deck.coverArt,
			format: deck.format,
			lastNaturalGrouping: deck.lastNaturalGrouping
		}));
		// Only save if different from last history entry
		if (history.length === 0 || history[history.length - 1] !== snapshot) {
			history.push(snapshot);
			if (history.length > 50) history.shift();
			redoStack = [];
			metadata.updatedAt = Date.now();
		}
	}

	if (browser) {
		const saved = localStorage.getItem('budgericards_deck');
		if (saved) {
			try {
				const parsed = JSON.parse(saved);
				// Migration: if cards have 'qty' but no 'id', expand them
				/** @param {any[]} board */
				const expandBoard = (board) => {
					/** @type {DeckCard[]} */
					const expanded = [];
					(board || []).forEach(/** @param {any} c */ c => {
						const qty = c.qty || 1;
						for (let i = 0; i < qty; i++) {
							expanded.push({
								id: c.id && qty === 1 ? c.id : generateId(),
								name: c.name,
								price: c.price || 0,
								addedAt: c.addedAt || Date.now()
							});
						}
					});
					return expanded;
				};

				deck.name = parsed.name || 'Untitled Deck';
				deck.commander = expandBoard(parsed.commander);
				deck.companion = expandBoard(parsed.companion);
				deck.mainboard = expandBoard(parsed.mainboard);
				deck.sideboard = expandBoard(parsed.sideboard);
				deck.maybeboard = expandBoard(parsed.maybeboard);
				deck.garbage = expandBoard(parsed.garbage);
				deck.activeBoard = parsed.activeBoard || 'mainboard';
				deck.grouping = parsed.grouping || 'cmc';
				deck.sorting = parsed.sorting || 'color';
				deck.sortAscending = parsed.sortAscending !== false;
				deck.splitView = !!parsed.splitView;
				deck.coverArt = parsed.coverArt || null;
				deck.format = parsed.format || 'Commander';
				if (parsed.metadata) {
					Object.assign(metadata, parsed.metadata);
				}
			} catch (e) {
				console.error('Failed to parse saved deck:', e);
			}
		}
	}

	function persist() {
		if (!browser) return;
		try {
			const dataToSave = $state.snapshot({
				name: deck.name,
				commander: deck.commander,
				companion: deck.companion,
				mainboard: deck.mainboard,
				sideboard: deck.sideboard,
				maybeboard: deck.maybeboard,
				garbage: deck.garbage,
				activeBoard: deck.activeBoard,
				grouping: deck.grouping,
				sorting: deck.sorting,
				sortAscending: deck.sortAscending,
				splitView: deck.splitView,
				coverArt: deck.coverArt,
				format: deck.format,
				lastNaturalGrouping: deck.lastNaturalGrouping,
				metadata: metadata
			});
			localStorage.setItem('budgericards_deck', JSON.stringify(dataToSave));
		} catch (err) {
			const e = /** @type {any} */ (err);
			if (e.name === 'QuotaExceededError') {
				console.error('LocalStorage quota exceeded for budgericards_deck. Changes may not be saved.');
			} else {
				console.error('Failed to save deck to localStorage:', e);
			}
		}
	}

	$effect.root(() => {
		// Auto-sync metadata for missing cards
		$effect(() => {
			if (browser) {
				const allCards = [...deck.commander, ...deck.companion, ...deck.mainboard, ...deck.sideboard, ...deck.maybeboard];
				const missingMetadata = allCards.some(c => !metadata[c.name.toLowerCase()]);
				if (missingMetadata) {
					syncMetadata();
				}
			}
		});
	});

	let isSyncing = false;
	async function syncMetadata() {
		if (isSyncing || !browser) return;
		
		const allCards = [...deck.commander, ...deck.companion, ...deck.mainboard, ...deck.sideboard, ...deck.maybeboard];
		const missingNames = [...new Set(allCards.map(c => c.name))]
			.filter(name => name && !metadata[name.toLowerCase()]);

		if (missingNames.length === 0) return;

		isSyncing = true;
		try {
			console.info(`🔄 Auto-syncing metadata for ${missingNames.length} missing cards...`);
			const results = await fetchCollection(missingNames.map(name => ({ name })));
			
			// Map results for quick lookup
			/** @type {Map<string, any>} */
			const resultMap = new Map();
			results.data.forEach(card => {
				if (card.name) {
					resultMap.set(card.name.toLowerCase(), card);
					// Also index by card faces for split cards
					if (card.card_faces) {
						card.card_faces.forEach((/** @type {any} */ face) => {
							if (face.name) resultMap.set(face.name.toLowerCase(), card);
						});
					}
				}
			});

			missingNames.forEach(requestedName => {
				const lowName = requestedName.toLowerCase();
				// Support both "A / B" and "A // B"
				const normalizedName = lowName.replace(/\s+\/\s+/g, ' // ');
				
				// Try to find the card in the results
				const card = resultMap.get(lowName) || resultMap.get(normalizedName);
				
				if (card) {
					metadata[lowName] = {
						image_uris: card.image_uris || null,
						card_faces: card.card_faces || [],
						type_line: card.type_line,
						mana_cost: card.mana_cost || card.card_faces?.[0]?.mana_cost || "",
						cmc: card.cmc,
						colors: card.colors || card.card_faces?.[0]?.colors || [],
						color_identity: card.color_identity || [],
						oracle_text: card.oracle_text || card.card_faces?.[0]?.oracle_text || "",
						prices: card.prices
					};
				} else {
					// Check if it was explicitly not found
					const wasNotFound = results.not_found?.some((/** @type {any} */ nf) => 
						nf.name?.toLowerCase() === lowName || nf.name?.toLowerCase() === normalizedName
					);
					
					if (wasNotFound || true) { // Fallback safety: if it's not in data, it's effectively not found
						metadata[lowName] = { 
							notFound: true,
							name: requestedName,
							type_line: 'Unknown',
							cmc: 0
						};
					}
				}
			});

			metadata.updatedAt = Date.now();
		} catch (e) {
			console.error('Metadata sync failed:', e);
		} finally {
			// Small delay to prevent rapid-fire re-triggers
			setTimeout(() => { isSyncing = false; }, 100);
		}
	}

	return {
		get name() { return deck.name; },
		set name(val) { saveHistory(); deck.name = val; persist(); },
		get activeBoard() { return deck.activeBoard; },
		set activeBoard(val) { deck.activeBoard = val; },
		get grouping() { return deck.grouping; },
		set grouping(val) { deck.grouping = val; },
		get sorting() { return deck.sorting; },
		set sorting(val) { deck.sorting = val; },
		get sortAscending() { return deck.sortAscending ?? true; },
		set sortAscending(val) { saveHistory(); deck.sortAscending = val; persist(); },
		get splitView() { return deck.splitView; },
		set splitView(val) { deck.splitView = val; },
		get coverArt() { return deck.coverArt; },
		set coverArt(val) { saveHistory(); deck.coverArt = val; persist(); },
		get format() { return deck.format; },
		set format(val) { saveHistory(); deck.format = val; persist(); },
		get lastNaturalGrouping() { return deck.lastNaturalGrouping || 'cmc'; },
		set lastNaturalGrouping(val) { deck.lastNaturalGrouping = val; persist(); },
		
		get commander() { return deck.commander; },
		get companion() { return deck.companion; },
		get mainboard() { return deck.mainboard; },
		get sideboard() { return deck.sideboard; },
		get maybeboard() { return deck.maybeboard; },
		get garbage() { return deck.garbage; },
		
		get metadata() { return metadata; },
		/** @param {Record<string, any>} newMetadata */
		updateMetadata(newMetadata) {
			Object.assign(metadata, newMetadata);
		},

		get currentBoardCards() {
			return deck[deck.activeBoard] || [];
		},

		/**
		 * @param {string} cardName
		 * @param {string} zone
		 * @param {number | null} price
		 * @param {any} cardMetadata
		 */
		addCard(cardName, zone, price, cardMetadata = null) {
			const targetZoneName = zone || deck.activeBoard;
			const targetZone = deck[targetZoneName];
			if (!targetZone) return;

			if (cardMetadata) {
				metadata[cardName.toLowerCase()] = cardMetadata;
			}

			saveHistory();
			const newId = generateId();
			targetZone.push({ 
				id: newId,
				name: cardName, 
				price: price || 0,
				addedAt: Date.now()
			});

			// Auto-toggle restrictions
			if (targetZoneName === 'commander') {
				settingsStore.useCommanderColors = true;
			} else if (targetZoneName === 'companion') {
				settingsStore.matchCompanion = true;
			}

			persist();
			return newId;
		},

		/**
		 * @param {string} cardName
		 * @param {string} fromZone
		 * @param {string} toZone
		 * @param {string | null} instanceId
		 * @param {number | null} price
		 */
		moveCard(cardName, fromZone, toZone, instanceId, price) {
			if (fromZone === toZone) return;
			
			const source = deck[fromZone];
			const target = deck[toZone];
			if (!source || !target) return;

			let index = -1;
			if (instanceId) {
				index = source.findIndex(/** @param {any} c */ c => c.id === instanceId);
			}
			if (index === -1) {
				index = source.findIndex(/** @param {any} c */ c => c.name === cardName);
			}

			if (index !== -1) {
				saveHistory();
				const [card] = source.splice(index, 1);
				target.push({
					...card,
					id: generateId(), // New ID for new zone
					price: price !== null ? price : card.price,
					addedAt: Date.now()
				});
				persist();
				return instanceId;
			}
		},

		/**
		 * @param {string} cardId
		 * @param {string} column
		 */
		setCustomColumn(cardId, column) {
			const boards = ['commander', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				const card = deck[board].find(/** @param {any} c */ c => c.id === cardId);
				if (card) {
					saveHistory();
					card.customColumn = column;
					persist();
					return;
				}
			}
		},

		/**
		 * @param {string} cardName
		 * @param {string} zone
		 * @param {string | null} instanceId
		 */
		removeCard(cardName, zone, instanceId = null) {
			const targetZoneName = zone || deck.activeBoard;
			const targetZone = deck[targetZoneName];
			if (!targetZone) return;

			let index = -1;
			if (instanceId) {
				index = targetZone.findIndex(/** @param {any} c */ c => c.id === instanceId);
			} 
			
			// If not found by ID or no ID provided, fall back to name
			if (index === -1) {
				// Remove the most recently added copy of that card
				const sameCards = targetZone
					.map(/** @param {any} c, @param {number} i */ (c, i) => ({ ...c, originalIndex: i }))
					.filter(/** @param {any} c */ c => c.name === cardName);
				
				if (sameCards.length > 0) {
					sameCards.sort(/** @param {any} a, @param {any} b */ (a, b) => b.addedAt - a.addedAt);
					index = sameCards[0].originalIndex;
				}
			}

			if (index !== -1) {
				saveHistory();
				const removed = targetZone.splice(index, 1)[0];
				
				// Move to garbage if it's not already from garbage
				if (targetZoneName !== 'garbage') {
					deck.garbage.unshift({
						...removed,
						id: generateId(), // New ID for garbage instance
						addedAt: Date.now()
					});
					if (deck.garbage.length > 20) {
						deck.garbage.pop();
					}
				}
				persist();
			}
		},

		clearGarbage() {
			saveHistory();
			deck.garbage = [];
			persist();
		},

		undo() {
			if (history.length === 0) return;
			
			const currentState = JSON.stringify({
				commander: deck.commander,
				mainboard: deck.mainboard,
				sideboard: deck.sideboard,
				maybeboard: deck.maybeboard,
				garbage: deck.garbage,
				name: deck.name,
				coverArt: deck.coverArt,
				lastNaturalGrouping: deck.lastNaturalGrouping
			});
			redoStack.push(currentState);
			const lastHistory = history.pop();
			if (!lastHistory) return;

			const previous = JSON.parse(lastHistory);
			deck.commander = previous.commander;
			deck.mainboard = previous.mainboard;
			deck.sideboard = previous.sideboard;
			deck.maybeboard = previous.maybeboard;
			deck.garbage = previous.garbage || [];
			deck.name = previous.name;
			deck.coverArt = previous.coverArt || null;
			deck.lastNaturalGrouping = previous.lastNaturalGrouping || 'cmc';
		},

		redo() {
			if (redoStack.length === 0) return;

			const currentState = JSON.stringify({
				commander: deck.commander,
				mainboard: deck.mainboard,
				sideboard: deck.sideboard,
				maybeboard: deck.maybeboard,
				garbage: deck.garbage,
				name: deck.name,
				coverArt: deck.coverArt,
				lastNaturalGrouping: deck.lastNaturalGrouping
			});
			history.push(currentState);
			const lastRedo = redoStack.pop();
			if (!lastRedo) return;

			const next = JSON.parse(lastRedo);
			deck.commander = next.commander;
			deck.mainboard = next.mainboard;
			deck.sideboard = next.sideboard;
			deck.maybeboard = next.maybeboard;
			deck.garbage = next.garbage || [];
			deck.name = next.name;
			deck.coverArt = next.coverArt || null;
			deck.lastNaturalGrouping = next.lastNaturalGrouping || 'cmc';
		},

		get canUndo() { return history.length > 0; },
		get canRedo() { return redoStack.length > 0; },

		/** @param {any} newDeck */
		setDeck(newDeck) {
			saveHistory();
			deck.name = newDeck.name || 'Untitled Deck';
			deck.commander = newDeck.commander || [];
			deck.mainboard = newDeck.mainboard || [];
			deck.sideboard = newDeck.sideboard || [];
			deck.maybeboard = newDeck.maybeboard || [];
			deck.garbage = newDeck.garbage || [];
			deck.coverArt = newDeck.coverArt || null;
			persist();
		},

		get totalCost() {
			const cCost = deck.commander.reduce(/** @param {number} sum, @param {DeckCard} c */ (sum, c) => sum + (c.price || 0), 0);
			const cpCost = deck.companion.reduce(/** @param {number} sum, @param {DeckCard} c */ (sum, c) => sum + (c.price || 0), 0);
			const mCost = deck.mainboard.reduce(/** @param {number} sum, @param {DeckCard} c */ (sum, c) => sum + (c.price || 0), 0);
			const sCost = deck.sideboard.reduce(/** @param {number} sum, @param {DeckCard} c */ (sum, c) => sum + (c.price || 0), 0);
			const yCost = deck.maybeboard.reduce(/** @param {number} sum, @param {DeckCard} c */ (sum, c) => sum + (c.price || 0), 0);
			return cCost + cpCost + mCost + sCost + yCost;
		},

		get totalCount() {
			return deck.commander.length + deck.companion.length + deck.mainboard.length + deck.sideboard.length + deck.maybeboard.length;
		},

		get currentBoardCount() {
			const baseCount = (deck[deck.activeBoard] || []).length;
			if (deck.activeBoard === 'mainboard') {
				return baseCount + deck.commander.length + deck.companion.length;
			}
			return baseCount;
		},

		/**
		 * @param {string} cardName
		 * @param {string} zone
		 */
		removeAllCopies(cardName, zone) {
			const targetZoneName = zone || deck.activeBoard;
			const targetZone = deck[targetZoneName];
			if (!targetZone) return;

			saveHistory();
			const initialLength = targetZone.length;
			
			// Filter out all copies
			const remaining = targetZone.filter(/** @param {any} c */ c => c.name !== cardName);
			const removedCount = initialLength - remaining.length;

			if (removedCount > 0) {
				// Update the board
				deck[targetZoneName] = remaining;

				// Move one copy to garbage as a representative
				if (targetZoneName !== 'garbage') {
					const example = targetZone.find(/** @param {any} c */ c => c.name === cardName);
					deck.garbage.unshift({
						...example,
						id: generateId(),
						addedAt: Date.now()
					});
					if (deck.garbage.length > 20) deck.garbage.pop();
				}
				persist();
			}
		},

		/**
		 * @param {string} cardName
		 * @param {string} zone
		 * @param {number} quantity
		 * @param {number | null} price
		 * @param {any} cardMetadata
		 */
		setQuantity(cardName, zone, quantity, price = null, cardMetadata = null) {
			const targetZoneName = zone || deck.activeBoard;
			const targetZone = deck[targetZoneName];
			if (!targetZone) return;

			if (cardMetadata) {
				metadata[cardName.toLowerCase()] = cardMetadata;
			}

			saveHistory();
			
			// Remove all existing copies
			const otherCards = targetZone.filter(/** @param {any} c */ c => c.name !== cardName);
			const existingCard = targetZone.find(/** @param {any} c */ c => c.name === cardName);
			const finalPrice = price !== null ? price : (existingCard?.price || 0);

			// Add back N copies
			const newCopies = [];
			for (let i = 0; i < quantity; i++) {
				newCopies.push({
					id: generateId(),
					name: cardName,
					price: finalPrice,
					addedAt: Date.now()
				});
			}

			deck[targetZoneName] = [...otherCards, ...newCopies];
			persist();
		},

		/**
		 * @param {any[]} parsedCards
		 * @param {{ replace: boolean }} options
		 */
		importCards(parsedCards, { replace }) {
			if (replace) {
				saveHistory();
				deck.commander = [];
				deck.companion = [];
				deck.mainboard = [];
				deck.sideboard = [];
				deck.maybeboard = [];
			}

			saveHistory();
			
			for (const pc of parsedCards) {
				const boardName = pc.board || deck.activeBoard;
				const targetBoard = deck[boardName];
				if (!targetBoard) continue;

				for (let i = 0; i < pc.quantity; i++) {
					targetBoard.push({
						id: generateId(),
						name: pc.name,
						price: 0,
						addedAt: Date.now()
					});
				}
			}

			metadata.updatedAt = Date.now();
			persist();
			// syncMetadata() will be triggered by the $effect automatically
		}
	};
}

export const deckStore = createDeck();
