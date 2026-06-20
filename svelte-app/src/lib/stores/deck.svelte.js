import { fetchCollection } from '$lib/api/scryfall.js';
import { settingsStore } from '$lib/stores/settings.svelte.js';
import { authStore } from '$lib/stores/auth.svelte.js';
import { syncService } from '$lib/syncService';
import { getCardByName } from '$lib/localSearch';
import { db } from '$lib/db';
import { parseDecklist } from '$lib/utils/decklistParser.js';
import { untrack } from 'svelte';
import { toastStore } from '$lib/stores/toast.svelte.js';

const browser = typeof window !== 'undefined';

/** 
 * @typedef {Object} DeckCard
 * @property {string} id
 * @property {string} name
 * @property {number | null} price
 * @property {number} addedAt
 * @property {string} [customColumn]
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

function createDeckState(initialData = null) {
	const deckId = initialData?.id || generateId();
	
	let cachedActiveBoard = null;
	let cachedGrouping = null;
	let cachedSorting = null;
	let cachedSortAscending = null;
	let cachedSplitView = null;
	
	if (typeof sessionStorage !== 'undefined' && initialData?.id) {
		cachedActiveBoard = sessionStorage.getItem(`budgericards_activeboard_${initialData.id}`);
		cachedGrouping = sessionStorage.getItem(`budgericards_grouping_${initialData.id}`);
		cachedSorting = sessionStorage.getItem(`budgericards_sorting_${initialData.id}`);
		const sortAscVal = sessionStorage.getItem(`budgericards_sortascending_${initialData.id}`);
		if (sortAscVal !== null) {
			cachedSortAscending = sortAscVal === 'true';
		}
		const splitViewVal = sessionStorage.getItem(`budgericards_splitview_${initialData.id}`);
		if (splitViewVal !== null) {
			cachedSplitView = splitViewVal === 'true';
		}
	}

	let deck = $state({
		id: deckId,
		name: initialData?.name || '',
		commander: initialData?.commander || [],
		companion: initialData?.companion || [],
		mainboard: initialData?.mainboard || [],
		sideboard: initialData?.sideboard || [],
		maybeboard: initialData?.maybeboard || [],
		garbage: initialData?.garbage || [],
		activeBoard: cachedActiveBoard || initialData?.activeBoard || 'mainboard',
		grouping: cachedGrouping || initialData?.grouping || 'cmc',
		sorting: cachedSorting || initialData?.sorting || 'color',
		sortAscending: cachedSortAscending !== null ? cachedSortAscending : (initialData?.sortAscending !== false),
		splitView: cachedSplitView !== null ? cachedSplitView : !!initialData?.splitView,
		coverArt: initialData?.coverArt || null,
		format: initialData?.format || 'List',
		lastNaturalGrouping: initialData?.lastNaturalGrouping || 'cmc'
	});

	let metadata = $state({
		createdBy: initialData?.metadata?.createdBy || 'Anonymous',
		createdAt: initialData?.metadata?.createdAt || Date.now(),
		updatedAt: initialData?.metadata?.updatedAt || (initialData?.id ? 0 : Date.now()),
		...(initialData?.metadata || {})
	});

	let history = $state([]);
	let redoStack = $state([]);
	let importText = $state(initialData?.importText || '');
	let autoCommanderPending = $state(false);
	let firstPastedName = $state('');
	let lastPastedName = $state('');
	let isImagePreloading = $state(false);

	return {
		get deck() { return deck; },
		set deck(val) { deck = val; },
		get metadata() { return metadata; },
		set metadata(val) { metadata = val; },
		get history() { return history; },
		set history(val) { history = val; },
		get redoStack() { return redoStack; },
		set redoStack(val) { redoStack = val; },
		get importText() { return importText; },
		set importText(val) { importText = val; },
		get autoCommanderPending() { return autoCommanderPending; },
		set autoCommanderPending(val) { autoCommanderPending = val; },
		get firstPastedName() { return firstPastedName; },
		set firstPastedName(val) { firstPastedName = val; },
		get lastPastedName() { return lastPastedName; },
		set lastPastedName(val) { lastPastedName = val; },
		get isImagePreloading() { return isImagePreloading; },
		set isImagePreloading(val) { isImagePreloading = val; }
	};
}

/**
 * @param {any} card
 * @param {any} metadata
 * @param {string} fieldName
 * @param {any} value
 * @returns {boolean}
 */
function isDefaultValue(card, metadata, fieldName, value) {
	if (value === undefined || value === null) return true;

	if (fieldName === 'manaValue' || fieldName === 'cmc') {
		const defaultVal = metadata?.cmc !== undefined ? metadata.cmc : (card.cmc !== undefined ? card.cmc : 0);
		return Number(value) === Number(defaultVal);
	}

	if (fieldName === 'primaryType') {
		const defaultVal = metadata?.type_line || card.type_line || "Unknown";
		return String(value).trim().toLowerCase() === defaultVal.trim().toLowerCase();
	}

	if (fieldName === 'colorCategory') {
		const typeLine = metadata?.type_line || card.type_line || "";
		const colors = metadata?.colors || card.colors || [];
		let defaultCat = "Colorless";
		if (typeLine.toLowerCase().includes("land")) {
			defaultCat = "Lands";
		} else if (colors.length > 1) {
			defaultCat = "Multicolor";
		} else if (colors.length === 1) {
			/** @type {Record<string, string>} */
			const colorNames = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
			defaultCat = colorNames[colors[0]] || "Colorless";
		}
		const norm = (s) => String(s).toLowerCase().trim().replace(/s$/, "");
		return norm(value) === norm(defaultCat);
	}

	if (fieldName === 'colors' || fieldName === 'colorIdentity') {
		const defaultArr = fieldName === 'colors'
			? (metadata?.colors || card.colors || [])
			: (metadata?.color_identity || card.color_identity || []);
		if (!Array.isArray(value) || !Array.isArray(defaultArr)) return false;
		return [...value].sort().join(',') === [...defaultArr].sort().join(',');
	}

	return false;
}

function createDeck() {
	// A reactive map of loaded decks in this tab session
	/** @type {Record<string, ReturnType<typeof createDeckState>>} */
	let loadedDecks = $state({});
	let activeDeckId = $state('');

	// Derived helper to get the active deck state
	const activeDeck = $derived.by(() => {
		if (!activeDeckId) {
			return createDeckState();
		}
		if (!loadedDecks[activeDeckId]) {
			// Try to load from localStorage drafts or cache without mutating state
			const loaded = loadFromStorage(activeDeckId);
			return loaded || createDeckState({ id: activeDeckId });
		}
		return loadedDecks[activeDeckId];
	});

	function loadFromStorage(id) {
		if (!browser) return null;
		// 1. Check local drafts
		const drafts = JSON.parse(localStorage.getItem('budgericards_local_drafts') || '[]');
		const draft = drafts.find(/** @param {any} d */ d => d.id === id);
		if (draft) return createDeckState(draft);

		// 2. Check cached decks
		const cached = JSON.parse(localStorage.getItem('budgericards_cached_decks') || '{}');
		if (cached[id]) return createDeckState(cached[id]);

		return null;
	}

	// Initialize active deck on load
	if (browser) {
		const urlParams = new URLSearchParams(window.location.search);
		if (urlParams.get('new_deck') === 'true') {
			sessionStorage.removeItem('budgericards_active_deck_id');
			sessionStorage.setItem('budgericards_is_new_draft', 'true');
			try {
				const cleanUrl = window.location.protocol + "//" + window.location.host + window.location.pathname;
				window.history.replaceState({ path: cleanUrl }, '', cleanUrl);
			} catch (e) {
				// Fallback
			}
		}

		let activeId = sessionStorage.getItem('budgericards_active_deck_id') || '';
		if (!activeId) {
			// Start a fresh unnamed draft
			activeId = generateId();
			sessionStorage.setItem('budgericards_active_deck_id', activeId);
			const freshDraft = createDeckState({ id: activeId });
			loadedDecks[activeId] = freshDraft;
		}
		if (!loadedDecks[activeId]) {
			const loaded = loadFromStorage(activeId);
			loadedDecks[activeId] = loaded || createDeckState({ id: activeId });
		}
		activeDeckId = activeId;
	}

	let isBatching = false;
	let batchNeedsPersist = false;

	function batchUpdate(fn) {
		if (isBatching) {
			fn();
			return;
		}
		saveHistory(activeDeck);
		isBatching = true;
		batchNeedsPersist = false;

		try {
			fn();
		} finally {
			isBatching = false;
			if (batchNeedsPersist) {
				persist(activeDeck);
				triggerCloudSync(activeDeck);
			}
		}
	}

	/** @param {ReturnType<typeof createDeckState>} deckState */
	function getPrintingsSnapshot(deckState) {
		const printingsSnapshot = {};
		for (const cardName in deckState.metadata) {
			const meta = deckState.metadata[cardName];
			if (meta && (meta.id || meta.set)) {
				printingsSnapshot[cardName] = {
					id: meta.id,
					set: meta.set,
					collector_number: meta.collector_number
				};
			}
		}
		return printingsSnapshot;
	}

	/**
	 * @param {ReturnType<typeof createDeckState>} deckState
	 * @param {{ name: string, id?: string, set?: string, collector_number?: string }[]} toFetch
	 */
	async function resolveAndApplyPrintings(deckState, toFetch) {
		try {
			const identifiers = toFetch.map(item => {
				if (item.id) return { id: item.id };
				return { set: item.set?.toLowerCase(), collector_number: item.collector_number?.toLowerCase() };
			});

			const response = await fetchCollection(identifiers);
				const nextMetadata = { ...deckState.metadata };
				response.data.forEach(card => {
					if (card.name) {
						nextMetadata[card.name.toLowerCase()] = card;
					}
				});
				nextMetadata.updatedAt = Date.now();
				deckState.metadata = nextMetadata;
				persist(deckState);
		} catch (e) {
			console.error("resolveAndApplyPrintings failed:", e);
		}
	}

	/** @param {ReturnType<typeof createDeckState>} deckState */
	function saveHistory(deckState) {
		if (isBatching) {
			batchNeedsPersist = true;
			return;
		}
		const snapshot = JSON.stringify($state.snapshot({
			commander: deckState.deck.commander,
			companion: deckState.deck.companion,
			mainboard: deckState.deck.mainboard,
			sideboard: deckState.deck.sideboard,
			maybeboard: deckState.deck.maybeboard,
			garbage: deckState.deck.garbage,
			name: deckState.deck.name,
			coverArt: deckState.deck.coverArt,
			format: deckState.deck.format,
			lastNaturalGrouping: deckState.deck.lastNaturalGrouping,
			printings: getPrintingsSnapshot(deckState)
		}));
		if (deckState.history.length === 0 || deckState.history[deckState.history.length - 1] !== snapshot) {
			deckState.history.push(snapshot);
			if (deckState.history.length > 50) deckState.history.shift();
			deckState.redoStack = [];
			deckState.metadata.updatedAt = Date.now();
		}
	}

	let syncState = $state({
		isSyncing: false,
		lastSynced: null,
		error: null
	});

	let syncTimeout = null;
	/** @param {ReturnType<typeof createDeckState>} deckState */
	function triggerCloudSync(deckState) {
		if (!browser || !authStore.isAuthenticated) return;

		if (syncTimeout) clearTimeout(syncTimeout);
		syncTimeout = setTimeout(async () => {
			await triggerCloudSyncNow(deckState);
		}, 1000);
	}

	/** @param {ReturnType<typeof createDeckState>} deckState */
	async function triggerCloudSyncNow(deckState) {
		if (!browser || !authStore.isAuthenticated) return;

		const isUnnamed = !deckState.deck.name || deckState.deck.name.trim() === '' || deckState.deck.name === 'Untitled Deck';
		if (isUnnamed) {
			console.log("Deck is unnamed or default. Skipping cloud sync.");
			return;
		}

		syncState.isSyncing = true;
		try {
			const deckData = $state.snapshot({
				name: deckState.deck.name,
				commander: deckState.deck.commander,
				companion: deckState.deck.companion,
				mainboard: deckState.deck.mainboard,
				sideboard: deckState.deck.sideboard,
				maybeboard: deckState.deck.maybeboard,
				garbage: deckState.deck.garbage,
				activeBoard: deckState.deck.activeBoard,
				grouping: deckState.deck.grouping,
				sorting: deckState.deck.sorting,
				sortAscending: deckState.deck.sortAscending,
				splitView: deckState.deck.splitView,
				coverArt: deckState.deck.coverArt,
				format: deckState.deck.format,
				lastNaturalGrouping: deckState.deck.lastNaturalGrouping,
				metadata: deckState.metadata
			});

			const { data, error, updatedId } = await syncService.saveDeck(deckState.deck.id, deckData);
			if (error) throw error;

			if (updatedId) {
				const oldId = deckState.deck.id;
				deckState.deck.id = updatedId;

				if (sessionStorage.getItem('budgericards_active_deck_id') === oldId) {
					sessionStorage.setItem('budgericards_active_deck_id', updatedId);
				}
				if (activeDeckId === oldId) {
					activeDeckId = updatedId;
				}
				loadedDecks[updatedId] = deckState;
				delete loadedDecks[oldId];

				let cached = JSON.parse(localStorage.getItem('budgericards_cached_decks') || '{}');
				cached[updatedId] = deckData;
				delete cached[oldId];
				localStorage.setItem('budgericards_cached_decks', JSON.stringify(cached));
			}

			syncState.lastSynced = Date.now();
			syncState.error = null;
		} catch (err) {
			console.error("Cloud sync failed:", err);
			syncState.error = err.message || String(err);
		} finally {
			syncState.isSyncing = false;
		}
	}

	function loadDeckData(cloudDeck) {
		const targetState = activeDeck;
		targetState.deck.id = cloudDeck.id;
		targetState.deck.name = cloudDeck.name;
		targetState.deck.commander = cloudDeck.cards.commander || [];
		targetState.deck.companion = cloudDeck.cards.companion || [];
		targetState.deck.mainboard = cloudDeck.cards.mainboard || [];
		targetState.deck.sideboard = cloudDeck.cards.sideboard || [];
		targetState.deck.maybeboard = cloudDeck.cards.maybeboard || [];
		targetState.deck.garbage = cloudDeck.cards.garbage || [];
		targetState.deck.activeBoard = cloudDeck.cards.activeBoard || 'mainboard';
		targetState.deck.grouping = cloudDeck.cards.grouping || 'cmc';
		targetState.deck.sorting = cloudDeck.cards.sorting || 'color';
		targetState.deck.sortAscending = cloudDeck.cards.sortAscending !== false;
		targetState.deck.splitView = !!cloudDeck.cards.splitView;
		targetState.deck.coverArt = cloudDeck.cards.coverArt || null;
		targetState.deck.format = cloudDeck.cards.format || 'Commander';
		targetState.deck.lastNaturalGrouping = cloudDeck.cards.lastNaturalGrouping || 'cmc';

		targetState.metadata = {
			...targetState.metadata,
			...(cloudDeck.cards.metadata || {}),
			updatedAt: new Date(cloudDeck.updated_at).getTime()
		};
		persist(targetState);
	}

	async function pullDecksFromCloud() {
		syncState.isSyncing = true;
		try {
			const { data, error } = await syncService.fetchDecks();
			if (error) throw error;
			const targetState = activeDeck;
			if (data && data.length > 0) {
				const cloudDeck = data.find(d => d.id === targetState.deck.id);
				if (cloudDeck) {
					const cloudTime = new Date(cloudDeck.updated_at).getTime();
					const localTime = targetState.metadata.updatedAt || 0;
					if (cloudTime > localTime) {
						console.log("Loading newer cloud version of deck:", cloudDeck.name);
						loadDeckData(cloudDeck);
					} else if (localTime > cloudTime) {
						console.log("Pushing newer local version of deck to cloud:", targetState.deck.name);
						await triggerCloudSyncNow(targetState);
					}
				} else {
					const isNewDraft = sessionStorage.getItem('budgericards_is_new_draft') === 'true';
					if (isNewDraft) {
						console.log("Preserving new blank draft. Skipping cloud auto-load.");
					} else {
						const isEmpty = targetState.deck.commander.length === 0 && targetState.deck.companion.length === 0 && targetState.deck.mainboard.length === 0 && targetState.deck.sideboard.length === 0 && targetState.deck.maybeboard.length === 0;
						if (isEmpty && (!targetState.deck.name || targetState.deck.name === 'Untitled Deck')) {
							console.log("Loading latest cloud deck onto empty default local:", data[0].name);
							loadDeckData(data[0]);
						} else {
							const isUnnamed = !targetState.deck.name || targetState.deck.name.trim() === '' || targetState.deck.name === 'Untitled Deck';
							if (!isUnnamed) {
								console.log("Saving local deck as a new cloud deck:", targetState.deck.name);
								await triggerCloudSyncNow(targetState);
							}
						}
					}
				}
			} else {
				const isUnnamed = !targetState.deck.name || targetState.deck.name.trim() === '' || targetState.deck.name === 'Untitled Deck';
				if (!isUnnamed) {
					console.log("No cloud decks found. Backing up current local deck to cloud.");
					await triggerCloudSyncNow(targetState);
				}
			}
		} catch (err) {
			console.error("Failed to sync decks with cloud:", err);
			syncState.error = err.message || String(err);
		} finally {
			syncState.isSyncing = false;
		}
	}

	/** @param {ReturnType<typeof createDeckState>} deckState */
	function persist(deckState) {
		if (!browser) return;
		if (isBatching) {
			batchNeedsPersist = true;
			return;
		}
		try {
			const dataToSave = $state.snapshot({
				id: deckState.deck.id,
				name: deckState.deck.name,
				commander: deckState.deck.commander,
				companion: deckState.deck.companion,
				mainboard: deckState.deck.mainboard,
				sideboard: deckState.deck.sideboard,
				maybeboard: deckState.deck.maybeboard,
				garbage: deckState.deck.garbage,
				activeBoard: deckState.deck.activeBoard,
				grouping: deckState.deck.grouping,
				sorting: deckState.deck.sorting,
				sortAscending: deckState.deck.sortAscending,
				splitView: deckState.deck.splitView,
				coverArt: deckState.deck.coverArt,
				format: deckState.deck.format,
				lastNaturalGrouping: deckState.deck.lastNaturalGrouping,
				metadata: deckState.metadata
			});

			const isUnnamed = !dataToSave.name || dataToSave.name.trim() === '' || dataToSave.name === 'Untitled Deck';
			if (isUnnamed) {
				const totalCards = (dataToSave.commander?.length || 0) +
					(dataToSave.companion?.length || 0) +
					(dataToSave.mainboard?.length || 0) +
					(dataToSave.sideboard?.length || 0) +
					(dataToSave.maybeboard?.length || 0);
				const isEmpty = totalCards === 0;

				let drafts = JSON.parse(localStorage.getItem('budgericards_local_drafts') || '[]');
				if (isEmpty) {
					// Remove from drafts if it is empty
					drafts = drafts.filter(/** @param {any} d */ d => d.id !== dataToSave.id);
				} else {
					const idx = drafts.findIndex(/** @param {any} d */ d => d.id === dataToSave.id);
					if (idx !== -1) {
						drafts[idx] = dataToSave;
					} else {
						drafts.unshift(dataToSave);
						while (drafts.length > 3) {
							drafts.pop();
						}
					}
				}
				localStorage.setItem('budgericards_local_drafts', JSON.stringify(drafts));

				let cached = JSON.parse(localStorage.getItem('budgericards_cached_decks') || '{}');
				if (cached[dataToSave.id]) {
					delete cached[dataToSave.id];
					localStorage.setItem('budgericards_cached_decks', JSON.stringify(cached));
				}
			} else {
				let cached = JSON.parse(localStorage.getItem('budgericards_cached_decks') || '{}');
				cached[dataToSave.id] = dataToSave;
				localStorage.setItem('budgericards_cached_decks', JSON.stringify(cached));

				let drafts = JSON.parse(localStorage.getItem('budgericards_local_drafts') || '[]');
				const newDrafts = drafts.filter(/** @param {any} d */ d => d.id !== dataToSave.id);
				if (newDrafts.length !== drafts.length) {
					localStorage.setItem('budgericards_local_drafts', JSON.stringify(newDrafts));
				}

				triggerCloudSync(deckState);
			}
		} catch (err) {
			const e = /** @type {any} */ (err);
			if (e.name === 'QuotaExceededError') {
				console.error('LocalStorage quota exceeded. Changes may not be saved.');
			} else {
				console.error('Failed to save deck to localStorage:', e);
			}
		}
	}

	function moveCardInternal(cardName, fromZone, toZone, instanceId, price) {
		if (fromZone === toZone) return;

		const source = activeDeck.deck[fromZone];
		const target = activeDeck.deck[toZone];
		if (!source || !target) return;

		let index = -1;
		if (instanceId) {
			index = source.findIndex(/** @param {any} c */ c => c.id === instanceId);
		}
		if (index === -1) {
			index = source.findIndex(/** @param {any} c */ c => c.name === cardName);
		}

		if (index !== -1) {
			saveHistory(activeDeck);
			const [card] = source.splice(index, 1);
			target.push({
				...card,
				id: generateId(),
				price: price !== null ? price : card.price,
				addedAt: Date.now()
			});
			persist(activeDeck);
			return instanceId;
		}
	}

	function runAutoCommanderRecognition(deckState) {
		if (deckState.deck.commander && deckState.deck.commander.length > 0) return;

		const allCards = [
			...(deckState.deck.mainboard || []),
			...(deckState.deck.sideboard || []),
			...(deckState.deck.maybeboard || []),
			...(deckState.deck.companion || [])
		];
		const totalCount = allCards.length;
		if (totalCount < 98 || totalCount > 103) return;

		const deckColorIdentity = new Set();
		const nonLandCards = [];

		for (const card of allCards) {
			const meta = deckState.metadata[card.name.toLowerCase()];
			if (!meta) continue;
			const type = (meta.type_line || "").toLowerCase();
			if (type.includes("land")) continue;

			const colors = meta.color_identity || [];
			for (const color of colors) {
				deckColorIdentity.add(color);
			}
			nonLandCards.push({ card, meta });
		}

		const isLegendaryCreature = (meta) => {
			const type = (meta.type_line || "").toLowerCase();
			return type.includes("legendary") && type.includes("creature");
		};

		const candidates = [];
		for (const { card, meta } of nonLandCards) {
			if (isLegendaryCreature(meta)) {
				const candIdentity = new Set(meta.color_identity || []);
				let matches = true;
				for (const color of deckColorIdentity) {
					if (!candIdentity.has(color)) {
						matches = false;
						break;
					}
				}
				if (matches) {
					if (!candidates.some(c => c.name.toLowerCase() === card.name.toLowerCase())) {
						candidates.push(card);
					}
				}
			}
		}

		if (candidates.length === 0) return;

		let selectedCommander = null;

		if (candidates.length === 1) {
			selectedCommander = candidates[0];
		} else {
			const firstMatch = candidates.find(c => c.name.toLowerCase() === deckState.firstPastedName?.toLowerCase());
			const lastMatch = candidates.find(c => c.name.toLowerCase() === deckState.lastPastedName?.toLowerCase());

			if (firstMatch && !lastMatch) {
				selectedCommander = firstMatch;
			} else if (lastMatch && !firstMatch) {
				selectedCommander = lastMatch;
			}
		}

		if (selectedCommander) {
			const boards = ['mainboard', 'sideboard', 'maybeboard', 'companion'];
			let sourceBoard = '';
			for (const board of boards) {
				const arr = deckState.deck[board];
				if (arr && arr.some(c => c.id === selectedCommander.id)) {
					sourceBoard = board;
					break;
				}
			}

			if (sourceBoard) {
				batchUpdate(() => {
					moveCardInternal(selectedCommander.name, sourceBoard, 'commander', selectedCommander.id, selectedCommander.price);
					deckState.deck.format = 'Commander';
				});
				console.info(`🎯 Automatically set ${selectedCommander.name} as Commander based on color identity heuristics!`);
			}
		}
	}

	$effect.root(() => {
		let lastCleanText = '';
		$effect(() => {
			const currentClean = activeDeck.deck.id ? cleanDecklistTextFor(activeDeck) : '';
			const currentImport = untrack(() => activeDeck.importText);
			if (lastCleanText === '' || currentImport.trim() === lastCleanText) {
				activeDeck.importText = currentClean;
			}
			lastCleanText = currentClean;
		});

		let lastViewMode = '';
		$effect(() => {
			const currentView = settingsStore.deckViewMode;
			if (currentView === 'list' && lastViewMode !== 'list') {
				activeDeck.importText = cleanDecklistTextFor(activeDeck);
			}
			lastViewMode = currentView;
		});

		$effect(() => {
			if (browser && activeDeck.deck.id) {
				const allCards = [
					...activeDeck.deck.commander,
					...activeDeck.deck.companion,
					...activeDeck.deck.mainboard,
					...activeDeck.deck.sideboard,
					...activeDeck.deck.maybeboard
				];
				const missingMetadata = allCards.some(c => needsMetadataSync(activeDeck, c.name));
				if (missingMetadata) {
					syncMetadata(activeDeck);
				} else if (activeDeck.autoCommanderPending) {
					activeDeck.autoCommanderPending = false;
					runAutoCommanderRecognition(activeDeck);
				}
			}
		});

		$effect(() => {
			if (browser && authStore.isAuthenticated && !authStore.isLoading && activeDeck.deck.id) {
				pullDecksFromCloud();
			}
		});
	});

	/**
	 * @param {any} deckState
	 * @param {string} name
	 */
	function needsMetadataSync(deckState, name) {
		const meta = deckState.metadata[name.toLowerCase()];
		if (!meta) return true;
		if ((meta.card_faces?.length === 0 || !meta.card_faces) && 
			((meta.type_line && meta.type_line.includes(" // ")) || 
			 (meta.name && meta.name.includes(" // ")) || 
			 name.includes(" // "))) {
			return true;
		}
		return false;
	}

	/** @param {ReturnType<typeof createDeckState>} deckState */
	function cleanDecklistTextFor(deckState) {
		let text = '';
		const boardsList = [
			{ name: 'commander', label: 'Commander' },
			{ name: 'companion', label: 'Companion' },
			{ name: 'mainboard', label: 'Deck' },
			{ name: 'sideboard', label: 'Sideboard' },
			{ name: 'maybeboard', label: 'Maybeboard' }
		];
		for (const board of boardsList) {
			const cards = deckState.deck[board.name] || [];
			if (cards.length === 0) continue;

			text += `// ${board.label}\n`;
			/** @type {Record<string, number>} */
			const counts = {};
			for (const card of cards) {
				counts[card.name] = (counts[card.name] || 0) + 1;
			}
			const sortedNames = Object.keys(counts).sort((a, b) => a.localeCompare(b));
			for (const name of sortedNames) {
				const qty = counts[name];
				const meta = deckState.metadata[name.toLowerCase()];
				let printingSuffix = "";
				if (meta && meta.set) {
					printingSuffix = ` (${meta.set.toUpperCase()}) ${meta.collector_number || ""}`.trimEnd();
				}
				text += `${qty} ${name}${printingSuffix}\n`;
			}
			text += '\n';
		}
		return text.trim();
	}

	let isSyncing = false;
	/** 
	 * @param {ReturnType<typeof createDeckState>} deckState 
	 * @param {string[]} [customNames]
	 */
	async function syncMetadata(deckState, customNames = null) {
		if (isSyncing || !browser) return;

		let missingNames;
		if (customNames) {
			missingNames = [...new Set(customNames)]
				.filter(name => name && needsMetadataSync(deckState, name));
		} else {
			const allCards = [
				...deckState.deck.commander,
				...deckState.deck.companion,
				...deckState.deck.mainboard,
				...deckState.deck.sideboard,
				...deckState.deck.maybeboard
			];
			missingNames = [...new Set(allCards.map(c => c.name))]
				.filter(name => name && needsMetadataSync(deckState, name));
		}

		if (missingNames.length === 0) return;

		isSyncing = true;
		try {
			const nextMetadata = { ...deckState.metadata };
			/** @type {string[]} */
			const scryfallNames = [];
			/** @type {Map<string, any>} */
			const localCardsMap = new Map();

			for (const requestedName of missingNames) {
				const lowName = requestedName.toLowerCase();
				const normalizedName = lowName.replace(/\s+\/\s+/g, ' // ');

				let localCard = await getCardByName(lowName);
				if (!localCard && normalizedName !== lowName) {
					localCard = await getCardByName(normalizedName);
				}

				if (localCard) {
					localCardsMap.set(lowName, localCard);
				}

				if (localCard && !localCard.name.includes(" // ")) {
					const priceRecord = await db.prices.get(localCard.id);
					const metaObj = {
						image_uris: {
							normal: localCard.image,
							small: localCard.image ? localCard.image.replace('/normal/', '/small/') : null,
							art_crop: localCard.image ? localCard.image.replace('/normal/', '/art_crop/') : null
						},
						card_faces: [],
						type_line: localCard.type,
						mana_cost: localCard.mana,
						cmc: localCard.cmc,
						colors: localCard.colors || [],
						color_identity: localCard.identity || [],
						oracle_text: localCard.text || "",
						prices: {
							usd: priceRecord ? String(priceRecord.price) : null
						}
					};
					nextMetadata[lowName] = metaObj;
				} else {
					scryfallNames.push(requestedName);
				}
			}

			if (scryfallNames.length > 0) {
				console.info(`🔄 Local lookup missed ${scryfallNames.length} cards. Syncing via Scryfall:`, scryfallNames);
				const results = await fetchCollection(scryfallNames.map(name => ({ name })));

				/** @type {Map<string, any>} */
				const resultMap = new Map();
				results.data.forEach(card => {
					if (card.name) {
						resultMap.set(card.name.toLowerCase(), card);
						if (card.card_faces) {
							card.card_faces.forEach((/** @type {any} */ face) => {
								if (face.name) resultMap.set(face.name.toLowerCase(), card);
							});
						}
					}
				});

				scryfallNames.forEach(requestedName => {
					const lowName = requestedName.toLowerCase();
					const normalizedName = lowName.replace(/\s+\/\s+/g, ' // ');
					const card = resultMap.get(lowName) || resultMap.get(normalizedName);
					const localCard = localCardsMap.get(lowName);

					if (card) {
						const metaObj = {
							id: card.id,
							set: card.set,
							collector_number: card.collector_number,
							image_uris: card.image_uris || null,
							card_faces: card.card_faces || [],
							type_line: card.type_line,
							mana_cost: card.mana_cost || (card.card_faces && card.card_faces.length > 0
								? card.card_faces.map(f => f.mana_cost || "").filter(Boolean).join(" // ")
								: ""),
							cmc: card.cmc,
							colors: card.colors || card.card_faces?.[0]?.colors || [],
							color_identity: card.color_identity || [],
							oracle_text: card.oracle_text || card.card_faces?.[0]?.oracle_text || "",
							prices: card.prices
						};
						nextMetadata[lowName] = metaObj;
						if (card.name && card.name.includes(" // ")) {
							nextMetadata[card.name.toLowerCase()] = metaObj;
							const short = card.name.split(" // ")[0].trim().toLowerCase();
							nextMetadata[short] = metaObj;
						}
					} else if (localCard) {
						const localMeta = {
							name: localCard.name,
							image_uris: {
								normal: localCard.image,
								small: localCard.image ? localCard.image.replace('/normal/', '/small/') : null,
								art_crop: localCard.image ? localCard.image.replace('/normal/', '/art_crop/') : null
							},
							card_faces: [],
							type_line: localCard.type,
							mana_cost: localCard.mana,
							cmc: localCard.cmc,
							colors: localCard.colors || [],
							color_identity: localCard.identity || [],
							oracle_text: localCard.text || "",
							prices: {
								usd: null
							}
						};
						nextMetadata[lowName] = localMeta;
						if (localCard.name && localCard.name.includes(" // ")) {
							nextMetadata[localCard.name.toLowerCase()] = localMeta;
							const short = localCard.name.split(" // ")[0].trim().toLowerCase();
							nextMetadata[short] = localMeta;
						}
					} else {
						nextMetadata[lowName] = {
							notFound: true,
							name: requestedName,
							type_line: 'Unknown',
							cmc: 0
						};
					}
				});
			}

			nextMetadata.updatedAt = Date.now();
			deckState.metadata = nextMetadata;
		} catch (e) {
			console.error('Metadata sync failed:', e);
		} finally {
			setTimeout(() => { isSyncing = false; }, 100);
		}
	}

	/** 
	 * @param {ReturnType<typeof createDeckState>} deckState 
	 * @param {string[]} cardNames
	 * @param {number} [timeout]
	 */
	async function preloadDeckImagesForNames(deckState, cardNames, timeout = 200) {
		if (typeof window === 'undefined' || typeof Image === 'undefined') return;
		const imageUrls = [];
		for (const name of cardNames) {
			const meta = deckState.metadata[name.toLowerCase()];
			if (meta) {
				const isDfc = meta.card_faces && meta.card_faces.length > 1 && meta.card_faces[0].image_uris;
				const frontImg = isDfc ? (meta.card_faces[0].image_uris.small || meta.card_faces[0].image_uris.normal) : (meta.image_uris?.small || meta.image_uris?.normal || meta.image || "");
				if (frontImg) imageUrls.push(frontImg);
			}
		}

		if (imageUrls.length === 0) return;

		const uniqueUrls = [...new Set(imageUrls)];

		const preloadPromise = Promise.all(uniqueUrls.map(url => {
			return new Promise((resolve) => {
				const img = new Image();
				img.onload = () => resolve(true);
				img.onerror = () => resolve(false);
				img.src = url;
			});
		}));

		const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), timeout));

		await Promise.race([preloadPromise, timeoutPromise]);
	}

	/** 
	 * @param {ReturnType<typeof createDeckState>} deckState 
	 * @param {string[]} cardNames
	 */
	async function fetchMetadataAndPreloadImages(deckState, cardNames) {
		const shouldPreload = cardNames.length > 5;
		if (shouldPreload) {
			deckState.isImagePreloading = true;
		}
		try {
			await syncMetadata(deckState, cardNames);
			const timeout = shouldPreload ? 500 : 200;
			await preloadDeckImagesForNames(deckState, cardNames, timeout);
		} catch (e) {
			console.error("fetchMetadataAndPreloadImages failed:", e);
		} finally {
			deckState.isImagePreloading = false;
		}
	}

	/** @param {ReturnType<typeof createDeckState>} deckState */
	function importCardsInternal(deckState, parsedCards, { replace }) {
		if (replace) {
			saveHistory(deckState);
			deckState.deck.commander = [];
			deckState.deck.companion = [];
			deckState.deck.mainboard = [];
			deckState.deck.sideboard = [];
			deckState.deck.maybeboard = [];

			deckState.firstPastedName = parsedCards[0]?.name || '';
			deckState.lastPastedName = parsedCards[parsedCards.length - 1]?.name || '';
			deckState.autoCommanderPending = true;

			const newCardNames = new Set(parsedCards.filter(c => c.name).map(c => c.name.toLowerCase()));
			const nextMetadata = {
				createdBy: deckState.metadata.createdBy,
				createdAt: deckState.metadata.createdAt,
				updatedAt: deckState.metadata.updatedAt
			};
			for (const key in deckState.metadata) {
				if (key !== 'createdBy' && key !== 'createdAt' && key !== 'updatedAt') {
					const isMatched = Array.from(newCardNames).some(name => {
						return key === name || 
							(key.includes(" // ") && key.startsWith(name + " //")) ||
							(name.includes(" // ") && name.startsWith(key + " //"));
					});
					if (isMatched) {
						nextMetadata[key] = deckState.metadata[key];
					}
				}
			}
			deckState.metadata = nextMetadata;
		}

		saveHistory(deckState);

		for (const pc of parsedCards) {
			if (!pc.name) continue;
			const boardName = pc.board || deckState.deck.activeBoard;
			const targetBoard = deckState.deck[boardName];
			if (!targetBoard) continue;

			if (pc.metadata) {
				const metaObj = pc.metadata;
				deckState.metadata[pc.name.toLowerCase()] = metaObj;
				if (metaObj.name && metaObj.name.includes(" // ")) {
					deckState.metadata[metaObj.name.toLowerCase()] = metaObj;
					const short = metaObj.name.split(" // ")[0].trim().toLowerCase();
					deckState.metadata[short] = metaObj;
				}
			} else if (pc.set) {
				if (!deckState.metadata[pc.name.toLowerCase()]) {
					deckState.metadata[pc.name.toLowerCase()] = {
						set: pc.set.toLowerCase(),
						collector_number: pc.collector_number
					};
				}
			}

			const price = pc.metadata ? (parseFloat(pc.metadata.prices?.usd || pc.metadata.prices?.usd_foil) || 0) : 0;

			for (let i = 0; i < pc.quantity; i++) {
				targetBoard.push({
					id: generateId(),
					name: pc.name,
					price: price,
					addedAt: Date.now()
				});
			}
		}

		deckState.metadata.updatedAt = Date.now();
		persist(deckState);
	}

	return {
		batchUpdate,
		get id() { return activeDeck.deck.id; },
		get syncState() { return syncState; },
		async syncNow() { await triggerCloudSyncNow(activeDeck); },
		get name() { return activeDeck.deck.name; },
		set name(val) { saveHistory(activeDeck); activeDeck.deck.name = val; persist(activeDeck); },
		get activeBoard() { return activeDeck.deck.activeBoard; },
		set activeBoard(val) { 
			activeDeck.deck.activeBoard = val; 
			if (typeof sessionStorage !== 'undefined' && activeDeck.deck.id) {
				sessionStorage.setItem(`budgericards_activeboard_${activeDeck.deck.id}`, val);
			}
		},
		get grouping() { return activeDeck.deck.grouping; },
		set grouping(val) { 
			activeDeck.deck.grouping = val; 
			if (typeof sessionStorage !== 'undefined' && activeDeck.deck.id) {
				sessionStorage.setItem(`budgericards_grouping_${activeDeck.deck.id}`, val);
			}
		},
		get sorting() { return activeDeck.deck.sorting; },
		set sorting(val) { 
			activeDeck.deck.sorting = val; 
			if (typeof sessionStorage !== 'undefined' && activeDeck.deck.id) {
				sessionStorage.setItem(`budgericards_sorting_${activeDeck.deck.id}`, val);
			}
		},
		get sortAscending() { return activeDeck.deck.sortAscending ?? true; },
		set sortAscending(val) { 
			activeDeck.deck.sortAscending = val; 
			if (typeof sessionStorage !== 'undefined' && activeDeck.deck.id) {
				sessionStorage.setItem(`budgericards_sortascending_${activeDeck.deck.id}`, String(val));
			}
		},
		get splitView() { return activeDeck.deck.splitView; },
		set splitView(val) { 
			activeDeck.deck.splitView = val; 
			if (typeof sessionStorage !== 'undefined' && activeDeck.deck.id) {
				sessionStorage.setItem(`budgericards_splitview_${activeDeck.deck.id}`, String(val));
			}
		},
		get coverArt() { return activeDeck.deck.coverArt; },
		set coverArt(val) { saveHistory(activeDeck); activeDeck.deck.coverArt = val; persist(activeDeck); },
		get format() { return activeDeck.deck.format; },
		set format(val) { saveHistory(activeDeck); activeDeck.deck.format = val; persist(activeDeck); },
		get lastNaturalGrouping() { return activeDeck.deck.lastNaturalGrouping || 'cmc'; },
		set lastNaturalGrouping(val) { activeDeck.deck.lastNaturalGrouping = val; persist(activeDeck); },

		get commander() { return activeDeck.deck.commander; },
		get companion() { return activeDeck.deck.companion; },
		get mainboard() { return activeDeck.deck.mainboard; },
		get sideboard() { return activeDeck.deck.sideboard; },
		get maybeboard() { return activeDeck.deck.maybeboard; },
		get garbage() { return activeDeck.deck.garbage; },

		get metadata() { return activeDeck.metadata; },
		updateMetadata(/** @type {Record<string, any>} */ newMetadata) {
			Object.assign(activeDeck.metadata, newMetadata);
		},

		get currentBoardCards() {
			return activeDeck.deck[activeDeck.deck.activeBoard] || [];
		},

		/**
		 * @param {string} oldName
		 * @param {string} newName
		 * @param {number | null} price
		 * @param {any} cardMetadata
		 */
		renameCard(oldName, newName, price = 0, cardMetadata = null) {
			saveHistory(activeDeck);
			if (cardMetadata) {
				activeDeck.metadata[newName.toLowerCase()] = cardMetadata;
			}
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				if (activeDeck.deck[board]) {
					activeDeck.deck[board].forEach(c => {
						if (c.name.toLowerCase() === oldName.toLowerCase()) {
							c.name = newName;
							c.price = price || 0;
							delete c.overrides;
						}
					});
				}
			}
			persist(activeDeck);
			syncMetadata(activeDeck);
		},

		/**
		 * @param {string} cardName
		 * @param {any} scryfallCard
		 */
		setCardPrinting(cardName, scryfallCard) {
			saveHistory(activeDeck);
			activeDeck.metadata[cardName.toLowerCase()] = scryfallCard;
			const price = parseFloat(scryfallCard.prices?.usd || scryfallCard.prices?.usd_foil) || 0;
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				if (activeDeck.deck[board]) {
					activeDeck.deck[board].forEach(c => {
						if (c.name.toLowerCase() === cardName.toLowerCase()) {
							c.price = price;
						}
					});
				}
			}
			persist(activeDeck);
		},


		/**
		 * @param {string} cardName
		 * @param {string} zone
		 * @param {number | null} price
		 * @param {any} cardMetadata
		 */
		addCard(cardName, zone, price, cardMetadata = null) {
			const targetZoneName = zone || activeDeck.deck.activeBoard;
			const targetZone = activeDeck.deck[targetZoneName];
			if (!targetZone) return;

			if (cardMetadata) {
				activeDeck.metadata[cardName.toLowerCase()] = cardMetadata;
			}

			// Find if there is an existing instance of this card in any board to copy its overrides, tags, and customColumn
			let existingCard = null;
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const b of boards) {
				if (activeDeck.deck[b]) {
					const found = activeDeck.deck[b].find(c => c.name.toLowerCase() === cardName.toLowerCase());
					if (found) {
						existingCard = found;
						break;
					}
				}
			}

			saveHistory(activeDeck);
			const newId = generateId();

			const newCardObj = {
				id: newId,
				name: cardName,
				price: price || 0,
				addedAt: Date.now()
			};
			if (existingCard?.overrides) newCardObj.overrides = JSON.parse(JSON.stringify(existingCard.overrides));
			if (existingCard?.tags) newCardObj.tags = [...existingCard.tags];
			if (existingCard?.primaryTag) newCardObj.primaryTag = existingCard.primaryTag;
			if (existingCard?.customColumn) newCardObj.customColumn = existingCard.customColumn;

			targetZone.push(newCardObj);

			if (targetZoneName === 'commander') {
				settingsStore.useCommanderColors = true;
			} else if (targetZoneName === 'companion') {
				settingsStore.matchCompanion = true;
			}

			persist(activeDeck);
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
			return moveCardInternal(cardName, fromZone, toZone, instanceId, price);
		},

		/**
		 * @param {string} cardId
		 * @param {string} column
		 */
		setCustomColumn(cardId, column) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								c.customColumn = column;
							}
						});
					}
				}
				persist(activeDeck);
			}
		},

		/**
		 * @param {string} cardId
		 */
		findCardById(cardId) {
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				if (activeDeck.deck[board]) {
					const card = activeDeck.deck[board].find(/** @param {any} c */ c => c.id === cardId);
					if (card) return { card, board };
				}
			}
			return null;
		},

		/**
		 * @param {string} cardId
		 * @param {string} fieldName
		 * @param {any} value
		 */
		setCardOverride(cardId, fieldName, value) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const metadata = activeDeck.metadata[cardName.toLowerCase()];

				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								if (!c.overrides) {
									c.overrides = {};
								}
								if (isDefaultValue(c, metadata, fieldName, value)) {
									delete c.overrides[fieldName];
								} else {
									c.overrides[fieldName] = value;
								}
								if (Object.keys(c.overrides).length === 0) {
									delete c.overrides;
								}
							}
						});
					}
				}
				persist(activeDeck);
			}
		},

		/**
		 * @param {string} cardId
		 * @param {string} fieldName
		 */
		resetCardOverride(cardId, fieldName) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								if (c.overrides) {
									delete c.overrides[fieldName];
									if (Object.keys(c.overrides).length === 0) {
										delete c.overrides;
									}
								}
							}
						});
					}
				}
				persist(activeDeck);
			}
		},

		/**
		 * @param {string} cardId
		 */
		resetAllOverridesForCard(cardId) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								delete c.overrides;
								delete c.customColumn;
								delete c.tags;
								delete c.primaryTag;
							}
						});
					}
				}
				persist(activeDeck);
			}
		},

		resetAllOverridesForDeck() {
			saveHistory(activeDeck);
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				if (activeDeck.deck[board]) {
					activeDeck.deck[board] = activeDeck.deck[board].map(card => {
						const copy = { ...card };
						delete copy.overrides;
						return copy;
					});
				}
			}
			persist(activeDeck);
		},

		/**
		 * @param {string} cardId
		 * @param {string} tagName
		 */
		addCardTag(cardId, tagName) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const trimmed = tagName.trim();
				if (trimmed) {
					const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
					for (const board of boards) {
						if (activeDeck.deck[board]) {
							activeDeck.deck[board].forEach(c => {
								if (c.name.toLowerCase() === cardName.toLowerCase()) {
									if (!c.tags) {
										c.tags = [];
									}
									if (!c.tags.includes(trimmed)) {
										c.tags.push(trimmed);
									}
									if (!c.primaryTag && c.tags.length > 0) {
										c.primaryTag = c.tags[0];
									}
								}
							});
						}
					}
				}
				persist(activeDeck);
			}
		},

		/**
		 * @param {string} cardId
		 * @param {string} tagName
		 */
		removeCardTag(cardId, tagName) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								if (c.tags) {
									c.tags = c.tags.filter((/** @type {string} */ t) => t !== tagName);
									if (c.primaryTag === tagName) {
										c.primaryTag = c.tags[0] || undefined;
									}
									if (c.tags.length === 0) {
										delete c.tags;
										delete c.primaryTag;
									}
								}
							}
						});
					}
				}
				persist(activeDeck);
			}
		},

		/**
		 * @param {string} cardId
		 * @param {string} tagName
		 */
		setPrimaryTag(cardId, tagName) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const trimmed = tagName.trim();
				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								if (!c.tags) {
									c.tags = [];
								}
								if (trimmed) {
									const oldPrimary = c.primaryTag;
									const newTagIdx = c.tags.indexOf(trimmed);
									
									if (newTagIdx !== -1) {
										// Case: The new primary tag is already a non-primary tag on the card
										// We swap which of the existing tags is primary and which is not.
										if (oldPrimary) {
											const oldPrimaryIdx = c.tags.indexOf(oldPrimary);
											if (oldPrimaryIdx !== -1) {
												// Swap their positions
												c.tags[newTagIdx] = oldPrimary;
												c.tags[oldPrimaryIdx] = trimmed;
											} else {
												c.tags = [trimmed, ...c.tags.filter(t => t !== trimmed)];
											}
										} else {
											c.tags = [trimmed, ...c.tags.filter(t => t !== trimmed)];
										}
									} else {
										// Case: The new primary tag is not in the tags list.
										// We swap/replace the old primary tag with the new one.
										if (oldPrimary) {
											const oldPrimaryIdx = c.tags.indexOf(oldPrimary);
											if (oldPrimaryIdx !== -1) {
												// Replace old primary with new tag
												c.tags[oldPrimaryIdx] = trimmed;
											} else {
												c.tags.unshift(trimmed);
											}
										} else {
											c.tags.unshift(trimmed);
										}
									}
									c.primaryTag = trimmed;
								} else {
									c.primaryTag = undefined;
								}
							}
						});
					}
				}
				persist(activeDeck);
			}
		},

		/**
		 * @param {string} oldName
		 * @param {string} newName
		 */
		renameDeckTag(oldName, newName) {
			const trimmedOld = oldName.trim();
			const trimmedNew = newName.trim();
			if (!trimmedOld || !trimmedNew || trimmedOld === trimmedNew) return;

			saveHistory(activeDeck);
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				if (activeDeck.deck[board]) {
					activeDeck.deck[board] = activeDeck.deck[board].map(card => {
						const copy = { ...card };
						if (copy.tags && copy.tags.includes(trimmedOld)) {
							const filtered = copy.tags.filter((/** @type {string} */ t) => t !== trimmedOld);
							if (!filtered.includes(trimmedNew)) {
								copy.tags = copy.tags.map((/** @type {string} */ t) => t === trimmedOld ? trimmedNew : t);
							} else {
								copy.tags = filtered;
							}
						}
						if (copy.primaryTag === trimmedOld) {
							copy.primaryTag = trimmedNew;
						}
						return copy;
					});
				}
			}
			persist(activeDeck);
		},

		/**
		 * @param {string} cardId
		 * @param {string[]} tagArray
		 */
		reorderCardTags(cardId, tagArray) {
			const result = this.findCardById(cardId);
			if (result) {
				saveHistory(activeDeck);
				const cardName = result.card.name;
				const uniqueTags = [...new Set(tagArray.map(t => t.trim()).filter(Boolean))];

				const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
				for (const board of boards) {
					if (activeDeck.deck[board]) {
						activeDeck.deck[board].forEach(c => {
							if (c.name.toLowerCase() === cardName.toLowerCase()) {
								if (uniqueTags.length > 0) {
									c.tags = [...uniqueTags];
									c.primaryTag = uniqueTags[0];
								} else {
									delete c.tags;
									delete c.primaryTag;
								}
							}
						});
					}
				}
				persist(activeDeck);
			}
		},


		/**
		 * @param {string} cardName
		 * @param {string} zone
		 * @param {string | null} instanceId
		 */
		removeCard(cardName, zone, instanceId = null) {
			const targetZoneName = zone || activeDeck.deck.activeBoard;
			const targetZone = activeDeck.deck[targetZoneName];
			if (!targetZone) return;

			let index = -1;
			if (instanceId) {
				index = targetZone.findIndex(/** @param {any} c */ c => c.id === instanceId);
			}

			if (index === -1) {
				const sameCards = targetZone
					.map(/** @param {any} c, @param {number} i */(c, i) => ({ ...c, originalIndex: i }))
					.filter(/** @param {any} c */ c => c.name === cardName);

				if (sameCards.length > 0) {
					sameCards.sort(/** @param {any} a, @param {any} b */(a, b) => b.addedAt - a.addedAt);
					index = sameCards[0].originalIndex;
				}
			}

			if (index !== -1) {
				saveHistory(activeDeck);
				const removed = targetZone.splice(index, 1)[0];

				if (targetZoneName !== 'garbage') {
					activeDeck.deck.garbage.unshift({
						...removed,
						id: generateId(),
						addedAt: Date.now()
					});
					if (activeDeck.deck.garbage.length > 20) {
						activeDeck.deck.garbage.pop();
					}
				}
				persist(activeDeck);

				if (settingsStore.showDeletionToasts) {
					const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
					const undoHint = isMac ? '⌘Z' : 'Ctrl+Z';
					toastStore.show(`Removed ${removed.name} from ${targetZoneName}.`, {
						type: 'info',
						action: () => {
							this.undo();
						},
						actionLabel: `Undo (${undoHint})`
					});
				}
			}
		},

		clearGarbage() {
			saveHistory(activeDeck);
			activeDeck.deck.garbage = [];
			persist(activeDeck);
		},

		undo() {
			if (activeDeck.history.length === 0) return;

			const currentState = JSON.stringify({
				commander: activeDeck.deck.commander,
				companion: activeDeck.deck.companion,
				mainboard: activeDeck.deck.mainboard,
				sideboard: activeDeck.deck.sideboard,
				maybeboard: activeDeck.deck.maybeboard,
				garbage: activeDeck.deck.garbage,
				name: activeDeck.deck.name,
				coverArt: activeDeck.deck.coverArt,
				lastNaturalGrouping: activeDeck.deck.lastNaturalGrouping,
				printings: getPrintingsSnapshot(activeDeck)
			});
			activeDeck.redoStack.push(currentState);
			const lastHistory = activeDeck.history.pop();
			if (!lastHistory) return;

			const previous = JSON.parse(lastHistory);
			activeDeck.deck.commander = previous.commander;
			activeDeck.deck.companion = previous.companion || [];
			activeDeck.deck.mainboard = previous.mainboard;
			activeDeck.deck.sideboard = previous.sideboard;
			activeDeck.deck.maybeboard = previous.maybeboard;
			activeDeck.deck.garbage = previous.garbage || [];
			activeDeck.deck.name = previous.name;
			activeDeck.deck.coverArt = previous.coverArt || null;
			activeDeck.deck.lastNaturalGrouping = previous.lastNaturalGrouping || 'cmc';

			if (previous.printings) {
				const toFetch = [];
				for (const cardName in previous.printings) {
					const prevPrint = previous.printings[cardName];
					const currPrint = activeDeck.metadata[cardName];
					const isDifferent = !currPrint ||
						currPrint.id !== prevPrint.id ||
						currPrint.set !== prevPrint.set ||
						currPrint.collector_number !== prevPrint.collector_number;
					if (isDifferent) {
						toFetch.push({
							name: cardName,
							id: prevPrint.id,
							set: prevPrint.set,
							collector_number: prevPrint.collector_number
						});
					}
				}
				if (toFetch.length > 0) {
					resolveAndApplyPrintings(activeDeck, toFetch);
				}
			}
			persist(activeDeck);
		},

		redo() {
			if (activeDeck.redoStack.length === 0) return;

			const currentState = JSON.stringify({
				commander: activeDeck.deck.commander,
				companion: activeDeck.deck.companion,
				mainboard: activeDeck.deck.mainboard,
				sideboard: activeDeck.deck.sideboard,
				maybeboard: activeDeck.deck.maybeboard,
				garbage: activeDeck.deck.garbage,
				name: activeDeck.deck.name,
				coverArt: activeDeck.deck.coverArt,
				lastNaturalGrouping: activeDeck.deck.lastNaturalGrouping,
				printings: getPrintingsSnapshot(activeDeck)
			});
			activeDeck.history.push(currentState);
			const lastRedo = activeDeck.redoStack.pop();
			if (!lastRedo) return;

			const next = JSON.parse(lastRedo);
			activeDeck.deck.commander = next.commander;
			activeDeck.deck.companion = next.companion || [];
			activeDeck.deck.mainboard = next.mainboard;
			activeDeck.deck.sideboard = next.sideboard;
			activeDeck.deck.maybeboard = next.maybeboard;
			activeDeck.deck.garbage = next.garbage || [];
			activeDeck.deck.name = next.name;
			activeDeck.deck.coverArt = next.coverArt || null;
			activeDeck.deck.lastNaturalGrouping = next.lastNaturalGrouping || 'cmc';

			if (next.printings) {
				const toFetch = [];
				for (const cardName in next.printings) {
					const nextPrint = next.printings[cardName];
					const currPrint = activeDeck.metadata[cardName];
					const isDifferent = !currPrint ||
						currPrint.id !== nextPrint.id ||
						currPrint.set !== nextPrint.set ||
						currPrint.collector_number !== nextPrint.collector_number;
					if (isDifferent) {
						toFetch.push({
							name: cardName,
							id: nextPrint.id,
							set: nextPrint.set,
							collector_number: nextPrint.collector_number
						});
					}
				}
				if (toFetch.length > 0) {
					resolveAndApplyPrintings(activeDeck, toFetch);
				}
			}
			persist(activeDeck);
		},

		get canUndo() { return activeDeck.history.length > 0; },
		get canRedo() { return activeDeck.redoStack.length > 0; },

		/** @param {any} newDeck */
		setDeck(newDeck) {
			const id = newDeck.id || generateId();
			sessionStorage.setItem('budgericards_active_deck_id', id);
			sessionStorage.removeItem('budgericards_is_new_draft');
			activeDeckId = id;

			const deckState = createDeckState(newDeck);
			loadedDecks[id] = deckState;
			persist(deckState);
		},

		get totalCost() {
			const cCost = activeDeck.deck.commander.reduce(/** @param {number} sum, @param {DeckCard} c */(sum, c) => sum + (c.price || 0), 0);
			const cpCost = activeDeck.deck.companion.reduce(/** @param {number} sum, @param {DeckCard} c */(sum, c) => sum + (c.price || 0), 0);
			const mCost = activeDeck.deck.mainboard.reduce(/** @param {number} sum, @param {DeckCard} c */(sum, c) => sum + (c.price || 0), 0);
			const sCost = activeDeck.deck.sideboard.reduce(/** @param {number} sum, @param {DeckCard} c */(sum, c) => sum + (c.price || 0), 0);
			const yCost = activeDeck.deck.maybeboard.reduce(/** @param {number} sum, @param {DeckCard} c */(sum, c) => sum + (c.price || 0), 0);
			return cCost + cpCost + mCost + sCost + yCost;
		},

		get totalCount() {
			return activeDeck.deck.commander.length + activeDeck.deck.companion.length + activeDeck.deck.mainboard.length + activeDeck.deck.sideboard.length + activeDeck.deck.maybeboard.length;
		},

		get currentBoardCount() {
			const baseCount = (activeDeck.deck[activeDeck.deck.activeBoard] || []).length;
			if (activeDeck.deck.activeBoard === 'mainboard') {
				return baseCount + activeDeck.deck.commander.length + activeDeck.deck.companion.length;
			}
			return baseCount;
		},

		/**
		 * @param {string} cardName
		 * @param {string} zone
		 */
		removeAllCopies(cardName, zone) {
			const targetZoneName = zone || activeDeck.deck.activeBoard;
			const targetZone = activeDeck.deck[targetZoneName];
			if (!targetZone) return;

			saveHistory(activeDeck);
			const initialLength = targetZone.length;

			const remaining = targetZone.filter(/** @param {any} c */ c => c.name !== cardName);
			const removedCount = initialLength - remaining.length;

			if (removedCount > 0) {
				activeDeck.deck[targetZoneName] = remaining;

				if (targetZoneName !== 'garbage') {
					const example = targetZone.find(/** @param {any} c */ c => c.name === cardName);
					activeDeck.deck.garbage.unshift({
						...example,
						id: generateId(),
						addedAt: Date.now()
					});
					if (activeDeck.deck.garbage.length > 20) activeDeck.deck.garbage.pop();
				}
				persist(activeDeck);

				if (settingsStore.showDeletionToasts) {
					const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
					const undoHint = isMac ? '⌘Z' : 'Ctrl+Z';
					toastStore.show(`Removed all copies of ${cardName} from ${targetZoneName}.`, {
						type: 'info',
						action: () => {
							this.undo();
						},
						actionLabel: `Undo (${undoHint})`
					});
				}
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
			const targetZoneName = zone || activeDeck.deck.activeBoard;
			const targetZone = activeDeck.deck[targetZoneName];
			if (!targetZone) return;

			if (cardMetadata) {
				activeDeck.metadata[cardName.toLowerCase()] = cardMetadata;
			}

			saveHistory(activeDeck);

			const otherCards = targetZone.filter(/** @param {any} c */ c => c.name !== cardName);
			const existingCard = targetZone.find(/** @param {any} c */ c => c.name === cardName);
			const finalPrice = price !== null ? price : (existingCard?.price || 0);

			const newCopies = [];
			for (let i = 0; i < quantity; i++) {
				newCopies.push({
					id: generateId(),
					name: cardName,
					price: finalPrice,
					addedAt: Date.now()
				});
			}

			activeDeck.deck[targetZoneName] = [...otherCards, ...newCopies];
			persist(activeDeck);
		},

		/**
		 * @param {any[]} parsedCards
		 * @param {{ replace: boolean }} options
		 */
		importCards(parsedCards, { replace }) {
			importCardsInternal(activeDeck, parsedCards, { replace });
		},

		get importText() { return activeDeck.importText; },
		set importText(val) { activeDeck.importText = val; },
		get cleanDecklistText() { return cleanDecklistTextFor(activeDeck); },
		get isImportDirty() { return activeDeck.importText.trim() !== cleanDecklistTextFor(activeDeck); },

		enterImportMode() {
			activeDeck.importText = cleanDecklistTextFor(activeDeck);
			settingsStore.deckViewMode = 'list';
		},

		/**
		 * Called from external paste handlers (e.g. stacks view) to kick off
		 * commander auto-recognition after a large paste onto an empty deck.
		 * @param {string} firstCardName
		 * @param {string} lastCardName
		 */
		scheduleAutoCommanderCheck(firstCardName, lastCardName) {
			activeDeck.firstPastedName = firstCardName;
			activeDeck.lastPastedName = lastCardName;
			activeDeck.autoCommanderPending = true;
		},

		cancelImport() {
			activeDeck.importText = cleanDecklistTextFor(activeDeck);
			const lastView = localStorage.getItem('budgericards_last_active_view_mode') || 'stacks';
			settingsStore.deckViewMode = lastView;
		},

		async saveImport() {
			const parsedCards = parseDecklist(activeDeck.importText);

			// Resolve any Scryfall IDs or Set/Collector numbers asynchronously in batches, maintaining order
			const toResolve = [];
			const resolvedCards = new Array(parsedCards.length);

			for (let i = 0; i < parsedCards.length; i++) {
				const pc = parsedCards[i];
				if (pc.scryfallId) {
					toResolve.push({
						index: i,
						pc,
						identifier: { id: pc.scryfallId }
					});
				} else if (pc.set && pc.collector_number && !pc.name) {
					toResolve.push({
						index: i,
						pc,
						identifier: { set: pc.set.toLowerCase(), collector_number: pc.collector_number.toLowerCase() }
					});
				} else {
					resolvedCards[i] = pc;
				}
			}

			if (toResolve.length > 0) {
				try {
					const response = await fetchCollection(toResolve.map(item => item.identifier));

					// Build lookup maps from Scryfall response data
					const idMap = new Map();
					const setCollectorMap = new Map();

					response.data.forEach(card => {
						if (card.id) idMap.set(card.id.toLowerCase(), card);
						if (card.set && card.collector_number) {
							const key = `${card.set.toLowerCase()}/${card.collector_number.toLowerCase()}`;
							setCollectorMap.set(key, card);
						}
					});

					for (const item of toResolve) {
						let foundCard = null;
						if (item.pc.scryfallId) {
							foundCard = idMap.get(item.pc.scryfallId.toLowerCase());
						} else if (item.pc.set && item.pc.collector_number) {
							const key = `${item.pc.set.toLowerCase()}/${item.pc.collector_number.toLowerCase()}`;
							foundCard = setCollectorMap.get(key);
						}

						if (foundCard) {
							resolvedCards[item.index] = {
								name: foundCard.name,
								quantity: item.pc.quantity,
								board: item.pc.board,
								metadata: foundCard
							};
						} else {
							resolvedCards[item.index] = item.pc;
						}
					}
				} catch (e) {
					console.error("Failed to batch resolve Scryfall identifiers during import:", e);
					// Fallback to unresolved cards
					for (const item of toResolve) {
						resolvedCards[item.index] = item.pc;
					}
				}
			}

			// Clean up any empty slots just in case
			const finalResolvedCards = resolvedCards.filter(Boolean);

			// Sync metadata and preload images before inserting the cards into the deck state
			const cardNames = finalResolvedCards.filter(c => c.name).map(c => c.name);
			await fetchMetadataAndPreloadImages(activeDeck, cardNames);

			importCardsInternal(activeDeck, finalResolvedCards, { replace: true });
			activeDeck.importText = cleanDecklistTextFor(activeDeck);

			// Return back to last used view mode besides list
			const lastView = localStorage.getItem('budgericards_last_active_view_mode') || 'stacks';
			settingsStore.deckViewMode = lastView;
		},

		async preloadDeckImagesAndShow(cardNames) {
			await fetchMetadataAndPreloadImages(activeDeck, cardNames);
		},
		get isImagePreloading() { return activeDeck.isImagePreloading; },
		clearMetadataAndCards() {
			saveHistory(activeDeck);
			activeDeck.deck.commander = [];
			activeDeck.deck.companion = [];
			activeDeck.deck.mainboard = [];
			activeDeck.deck.sideboard = [];
			activeDeck.deck.maybeboard = [];
			activeDeck.deck.garbage = [];
			activeDeck.metadata = {
				createdBy: activeDeck.metadata.createdBy,
				createdAt: activeDeck.metadata.createdAt,
				updatedAt: activeDeck.metadata.updatedAt
			};
			persist(activeDeck);
		}
	};
}

export const deckStore = createDeck();
