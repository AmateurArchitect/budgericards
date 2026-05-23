import { scryfallFetch } from "$lib/api/scryfall.js";
import { priceStore } from "$lib/stores/prices.svelte.js";
import { deckStore } from "$lib/stores/deck.svelte.js";
import { settingsStore } from "$lib/stores/settings.svelte.js";

function createSearch() {
	let state = $state({
		query: "",
		results: /** @type {any[]} */ ([]),
		isSearching: false,
		error: "",
		collection: "scryfall", // 'scryfall', 'budget-edh-26.2', 'budget-staples', 'sideboard', 'maybeboard', 'deleted'
		isCollapsed: false,
		isFocused: false,
		hasTriggered: false,
		filters: {
			colors: /** @type {string[]} */ ([]),
		},
		activeSorts: /** @type {{type: string, direction: string}[]} */ ([]),
	});

	/** @type {Map<string, any>} */
	const searchCache = new Map();

	/** @type {Record<string, string>} */
	const companionRestrictions = {
		"gyruda, doom of depths": "cmc:even",
		"obosh, the prey-piercer": "cmc:odd",
		"lurrus of the dream-den": "(cmc<=2 or t:land)",
		"keruga, the macrosage": "(cmc>=3 or t:land)",
		"jegantha, the wellspring": "-(mana:/{W}{W}/ or mana:/{U}{U}/ or mana:/{B}{B}/ or mana:/{R}{R}/ or mana:/{G}{G}/ or mana:/{C}{C}/)",
		"kaheera, the orphanguard": "(t:cat or t:elemental or t:nightmare or t:dinosaur or t:beast or t:land)",
		"zirda, the dawnwaker": "(o:/{T}:/ or t:land)",
		"umori, the collector": "", // Requires choosing a type, hard to automate search
		"lutri, the spellchaser": "", // No search restriction
		"yorion, sky nomad": "" // No search restriction
	};

	/** @type {Record<string, string>} */
	const sortLabels = {
		"color-cat": "Color Category",
		"color-id": "Color Identity",
		cmc: "Mana Value",
		type: "Card Type",
		name: "Alphabetical",
		price: "Price",
		rarity: "Rarity",
	};

	/** @type {Record<string, Record<string, string>>} */
	const sortOrderLabels = {
		"color-cat": { default: "WUBRG", reverse: "GRBUW" },
		"color-id": { default: "WUBRG", reverse: "GRBUW" },
		cmc: { default: "Low to High", reverse: "High to Low" },
		type: { default: "A to Z", reverse: "Z to A" },
		name: { default: "A to Z", reverse: "Z to A" },
		price: { default: "High to Low", reverse: "Low to High" },
		rarity: { default: "Common to Mythic", reverse: "Mythic to Common" },
	};

	/** @param {string} type */
	function getDefaultDirection(type) {
		if (type === "price") return "reverse";
		return "default";
	}

	/** @param {string} query */
	function isPrintingSpecificQuery(query) {
		return query.includes("set:") || query.includes("id:") || query.includes("cn:");
	}

	/** 
	 * @param {any} a 
	 * @param {any} b 
	 * @param {string} type 
	 * @param {number} direction 
	 */
	function compareCards(a, b, type, direction) {
		let comparison = 0;
		if (type === "name") {
			comparison = a.name.localeCompare(b.name);
		} else if (type === "cmc") {
			comparison = (a.cmc || 0) - (b.cmc || 0);
		} else if (type === "price") {
			const aP = a.prices?.usd ? parseFloat(a.prices.usd) : 0;
			const bP = b.prices?.usd ? parseFloat(b.prices.usd) : 0;
			comparison = aP - bP;
		} else if (type === "rarity") {
			const rarityMap = { common: 0, uncommon: 1, rare: 2, mythic: 3, special: 4, bonus: 5 };
			// @ts-ignore
			comparison = (rarityMap[a.rarity] || 0) - (rarityMap[b.rarity] || 0);
		} else if (type === "type") {
			comparison = (a.type_line || "").localeCompare(b.type_line || "");
		} else if (type === "is-creature") {
			const aIs = a.type_line?.includes("Creature") ? 0 : 1;
			const bIs = b.type_line?.includes("Creature") ? 0 : 1;
			comparison = aIs - bIs;
		} else if (type === "color-cat") {
			const catOrder = { W: 0, U: 1, B: 2, R: 3, G: 4, C: 5, Gold: 6, L: 7 };
			/** @param {any} c */
			const getCat = (c) => {
				if (c.type_line?.includes("Land")) return "L";
				if (!c.color_identity || c.color_identity.length === 0) return "C";
				if (c.color_identity.length > 1) return "Gold";
				return c.color_identity[0];
			};
			// @ts-ignore
			comparison = (catOrder[getCat(a)] ?? 8) - (catOrder[getCat(b)] ?? 8);
		} else if (type === "color-id") {
			const colorOrder = { W: 0, U: 1, B: 2, R: 3, G: 4 };
			/** @type {any} */
			const order = colorOrder;
			const aColors = [...(a.color_identity || [])].sort((x, y) => order[x] - order[y]).join("");
			const bColors = [...(b.color_identity || [])].sort((x, y) => order[x] - order[y]).join("");
			comparison = aColors.localeCompare(bColors);
		}
		return comparison * direction;
	}

	const sortedResults = $derived(() => {
		let res = [...state.results];
		const implicitOrder = ["color-cat", "color-id", "cmc", "is-creature", "name"];

		res.sort((a, b) => {
			// 1. Explicit User Sorts (from UI)
			for (const sort of state.activeSorts) {
				const activeDir = sort.direction === "default" ? getDefaultDirection(sort.type) : sort.direction;
				const dir = activeDir === "reverse" ? -1 : 1;
				const comp = compareCards(a, b, sort.type, dir);
				if (comp !== 0) return comp;
			}

			// 2. Implicit Sorts (The persistent fallback chain)
			for (const type of implicitOrder) {
				// Skip if this type was already handled by activeSorts
				if (state.activeSorts.some(s => s.type === type)) continue;

				const comp = compareCards(a, b, type, 1);
				if (comp !== 0) return comp;
			}
			return 0;
		});

		return res;
	});

	let abortController = /** @type {AbortController | null} */ (null);

	/** 
	 * @param {any} card 
	 * @param {string} companionName 
	 */
	function isCompanionLegal(card, companionName) {
		const name = companionName.toLowerCase();
		const cmc = card.cmc || 0;
		const isLand = card.type_line?.includes("Land");
		
		if (name.includes("gyruda")) return cmc % 2 === 0;
		if (name.includes("obosh")) return cmc % 2 !== 0;
		if (name.includes("lurrus")) return isLand || cmc <= 2;
		if (name.includes("keruga")) return isLand || cmc >= 3;
		if (name.includes("jegantha")) {
			const cost = card.mana_cost || "";
			const symbols = cost.match(/\{([^}]+)\}/g) || [];
			/** @type {Record<string, number>} */
			const counts = {};
			for (const s of symbols) {
				counts[s] = (counts[s] || 0) + 1;
				if (counts[s] > 1 && !s.includes("/")) return false;
			}
			return true;
		}
		if (name.includes("kaheera")) {
			const types = ["Cat", "Elemental", "Nightmare", "Dinosaur", "Beast"];
			return isLand || types.some(t => card.type_line?.includes(t));
		}
		if (name.includes("zirda")) {
			return isLand || card.oracle_text?.includes(":") || card.card_faces?.[0]?.oracle_text?.includes(":");
		}
		return true;
	}

	async function performSearch() {
		const signal = abortController?.signal;
		try {
			state.isSearching = true;
			state.error = "";

			if (abortController) abortController.abort();
			abortController = new AbortController();
			const signal = abortController.signal;

			// Handle local board browsing
			if (['sideboard', 'maybeboard', 'deleted'].includes(state.collection)) {
				const q = state.query.toLowerCase();
				const boardKey = state.collection === 'deleted' ? 'garbage' : state.collection;
				/** @type {any[]} */
				const source = (/** @type {any} */ (deckStore))[boardKey];

				const seenNames = new Set();
				/** @type {any[]} */
				const results = [];

				source.forEach(/** @param {any} c */ c => {
					const nameMatch = c.name.toLowerCase().includes(q);
					const meta = deckStore.metadata[c.name.toLowerCase()];
					
					// Apply filters if they exist
					let filterMatch = true;
					if (state.filters.colors.length > 0 && meta) {
						const colors = state.filters.colors;
						const standardColors = colors.filter((c) => "WUBRG".includes(c));
						const hasM = colors.includes("M");
						const hasC = colors.includes("C");
						const hasL = colors.includes("L");

						const isLand = meta.type_line?.includes("Land");
						const cardColors = (settingsStore.useColorIdentity || isLand ? meta.color_identity : meta.colors) || [];
						
						let colorMatch = false;
						const hasColorFilter = standardColors.length > 0 || hasM || hasC;

						if (hasM) {
							// Gold Mode: AND logic + Multicolor requirement
							const isMulti = cardColors.length > 1;
							if (standardColors.length > 0) {
								colorMatch = isMulti && standardColors.every(col => cardColors.includes(col));
							} else {
								colorMatch = isMulti;
							}
						} else {
							// Standard Mode: OR logic
							if (standardColors.length > 0) {
								colorMatch = standardColors.some(col => cardColors.includes(col));
							}
							if (hasC && cardColors.length === 0) colorMatch = true;
						}
						
						// If only Land filter is active, colorMatch is implicitly true (we only care about t:land)
						if (!hasColorFilter && hasL) colorMatch = true;

						// Hard Land Toggle: If filters are active, we show ONLY lands or ONLY non-lands
						const landMatch = hasL ? isLand : !isLand;

						filterMatch = colorMatch && landMatch;
					}

					// Commander Identity Restriction
					if (filterMatch && settingsStore.useCommanderColors && deckStore.commander.length > 0 && meta) {
						const identity = new Set();
						deckStore.commander.forEach(c => {
							const m = deckStore.metadata[c.name.toLowerCase()];
							if (m?.color_identity) m.color_identity.forEach(/** @param {string} col */ col => identity.add(col));
						});
						if (identity.size > 0) {
							const cardId = meta.color_identity || [];
							filterMatch = cardId.every(/** @param {string} col */ col => identity.has(col));
						}
					}

					// Companion Restriction
					if (filterMatch && settingsStore.matchCompanion && deckStore.companion.length > 0 && meta) {
						filterMatch = isCompanionLegal(meta, deckStore.companion[0].name);
					}

					if (!seenNames.has(c.name.toLowerCase()) && (q === '' || nameMatch) && filterMatch) {
						seenNames.add(c.name.toLowerCase());
						if (meta) {
							results.push({
								...meta,
								// Use the price from the instance in the board
								prices: { ...meta.prices, usd: c.price }
							});
						} else {
							// Basic fallback if metadata hasn't loaded yet
							results.push({
								id: c.id || c.name,
								name: c.name,
								prices: { usd: c.price },
								type_line: "Loading...",
								cmc: 0
							});
						}
					}
				});

				state.results = results;
				state.isSearching = false;
				return;
			}

			// External searches
			let q = state.query.trim();
			if (!q && !['sideboard', 'maybeboard', 'deleted'].includes(state.collection)) {
				state.results = [];
				state.isSearching = false;
				return;
			}
			if (state.filters.colors.length > 0) {
				const colors = state.filters.colors;
				const standardColors = colors.filter((c) => "WUBRG".includes(c));
				const hasM = colors.includes("M");
				const hasC = colors.includes("C");
				const hasL = colors.includes("L");

				let colorPart = "";
				const prefix = (settingsStore.useColorIdentity || hasL) ? 'id' : 'c';

				if (hasM) {
					// Gold Mode: AND logic + Multicolor requirement
					if (standardColors.length > 0) {
						colorPart = standardColors.map(c => `${prefix}>=${c}`).join(" ");
						colorPart += ` identity>1`;
					} else {
						colorPart = "identity>1";
					}
				} else {
					// Standard Mode: OR logic
					if (standardColors.length > 0) {
						const parts = standardColors.map(c => `${prefix}>=${c}`);
						colorPart = parts.length > 1 ? `(${parts.join(" or ")})` : parts[0];
					}
					if (hasC) {
						if (colorPart) {
							colorPart = `(${colorPart} or ${prefix}:c)`;
						} else {
							colorPart = `${prefix}:c`;
						}
					}
				}

				if (colorPart) {
					q += ` ${colorPart}`;
				}

				// Hard Land Toggle: If filters are active, we show ONLY lands or ONLY non-lands
				if (hasL) {
					q += " t:land";
				} else {
					q += " -t:land";
				}
			}

			// Add Commander Identity Restriction
			if (settingsStore.useCommanderColors && deckStore.commander.length > 0) {
				const identity = new Set();
				deckStore.commander.forEach(c => {
					const meta = deckStore.metadata[c.name.toLowerCase()];
					if (meta?.color_identity) {
						meta.color_identity.forEach(/** @param {string} col */ col => identity.add(col));
					}
				});
				if (identity.size > 0) {
					const idStr = [...identity].join('').toLowerCase() || 'c';
					q += ` id<=${idStr}`;
				}
			}

			// Add Companion Restriction
			if (settingsStore.matchCompanion && deckStore.companion.length > 0) {
				const companion = deckStore.companion[0];
				const restriction = companionRestrictions[companion.name.toLowerCase()];
				if (restriction) {
					q += ` ${restriction}`;
				}
			}

			// Check cache
			const cacheKey = `${state.collection}:${q}`;
			if (searchCache.has(cacheKey) && !['sideboard', 'maybeboard', 'deleted'].includes(state.collection)) {
				const data = searchCache.get(cacheKey);
				state.isSearching = true;
				await processResults(data, signal);
				state.isSearching = false;
				return;
			}

			const response = await scryfallFetch(
				`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`,
				{ signal }
			);

			if (signal.aborted) return;

			if (!response.ok) {
				state.results = [];
				state.isSearching = false;
				return;
			}

			const data = await response.json();
			if (signal.aborted) return;

			if (data.object === "error") {
				state.error = data.details || "Unknown Scryfall error";
				state.results = [];
				state.isSearching = false;
				return;
			}

			if (!['sideboard', 'maybeboard', 'deleted'].includes(state.collection)) {
				searchCache.set(cacheKey, data);
			}
			await processResults(data, signal);
		} catch (err) {
			const e = /** @type {any} */ (err);
			if (e.name !== "AbortError") {
				console.error("Search error:", e);
				state.results = [];
				state.isSearching = false;
			}
		} finally {
			if (abortController?.signal === signal) {
				state.isSearching = false;
			}
		}
	}

	/** 
	 * @param {any} data 
	 * @param {AbortSignal} signal 
	 */
	async function processResults(data, signal) {
		/** @type {any[]} */
		let results = data.data || [];

		// Post-process for Budget Collections
		if (state.collection === 'budget-edh-26.2' || state.collection === 'budget-staples') {
			const isStaples = state.collection === 'budget-staples';

			// 1. Filter by relevant list
			results = results.filter(/** @param {any} c */ c => {
				if (isStaples) return priceStore.getStaplePrice(c.name) !== null;
				return priceStore.getPrice(c.name) !== null;
			});

			// 2. Override prices from local dataset
			results = results.map(/** @param {any} c */ c => {
				const localPrice = isStaples ? priceStore.getStaplePrice(c.name) : priceStore.getPrice(c.name);
				return {
					...c,
					prices: {
						...c.prices,
						usd: localPrice
					}
				};
			});

			// 3. Art Override (Printing-Specific)
			if (!isPrintingSpecificQuery(state.query)) {
				const mapSource = isStaples ? priceStore.staples : priceStore.map;
				const idsToFetch = results
					.map(/** @param {any} c */ c => mapSource.get(c.name.toLowerCase())?.id)
					.filter(/** @param {any} id */ id => !!id && id !== undefined);

				if (idsToFetch.length > 0) {
					const collResponse = await scryfallFetch('https://api.scryfall.com/cards/collection', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ identifiers: idsToFetch.map(/** @param {any} id */ id => ({ id })) }),
						signal
					});

					if (collResponse.ok) {
						const collData = await collResponse.json();
						const replacementMap = new Map(collData.data.map(/** @param {any} c */(c) => [c.name.toLowerCase(), c]));

						results = results.map(/** @param {any} c */(c) => {
							const replacement = replacementMap.get(c.name.toLowerCase());
							const currentPrice = isStaples ? priceStore.getStaplePrice(c.name) : priceStore.getPrice(c.name);
							if (replacement) {
								return { ...replacement, prices: { ...replacement.prices, usd: currentPrice } };
							}
							return c;
						});
					}
				}
			}
		}

		state.error = "";
		state.results = results;
		state.isSearching = false;
	}

	$effect.root(() => {
		$effect(() => {
			const _ = state.query;
			const __ = state.filters.colors.length;
			const ___ = state.collection;
			const ____ = settingsStore.useCommanderColors;
			const _____ = settingsStore.matchCompanion;

			const isLocal = ['sideboard', 'maybeboard', 'deleted'].includes(state.collection);

			if (isLocal) {
				performSearch();
			} else {
				const timeout = setTimeout(performSearch, 300);
				return () => clearTimeout(timeout);
			}
		});
	});

	return {
		get query() { return state.query; },
		set query(val) {
			state.query = val;
			if (val.length === 0) {
				performSearch();
			} else {
				state.hasTriggered = true;
			}
		},

		get collection() { return state.collection; },
		set collection(val) {
			state.collection = val;
			performSearch();
		},
		get results() { return sortedResults(); },
		get isSearching() { return state.isSearching; },
		get error() { return state.error; },
		get isCollapsed() { return state.isCollapsed; },
		get isFocused() { return state.isFocused; },
		get hasTriggered() { return state.hasTriggered; },
		get isExpanded() {
			return (
				state.isSearching ||
				state.query.length > 0 ||
				state.results.length > 0 ||
				(state.hasTriggered && state.results.length === 0) ||
				["sideboard", "maybeboard", "deleted"].includes(state.collection)
			);
		},
		get filters() { return state.filters; },
		get activeSorts() { return state.activeSorts; },
		get sortLabels() { return sortLabels; },
		get sortOrderLabels() { return sortOrderLabels; },
		getDefaultDirection,

		/** @param {boolean} val */
		setFocus(val) {
			state.isFocused = val;
			if (val) {
				if (['sideboard', 'maybeboard', 'deleted'].includes(state.collection) && state.query === '') {
					performSearch();
				}
			} else {
				state.hasTriggered = false;
			}
		},

		/** @param {string} color */
		toggleColor(color) {
			const idx = state.filters.colors.indexOf(color);
			if (idx === -1) {
				state.filters.colors = [...state.filters.colors, color];
			} else {
				state.filters.colors = state.filters.colors.filter(c => c !== color);
			}
		},

		/** @param {string} type */
		setSort(type) {
			const existing = state.activeSorts.find(s => s.type === type);
			const direction = existing ? existing.direction : 'default';
			const filtered = state.activeSorts.filter(s => s.type !== type);
			state.activeSorts = [{ type, direction }, ...filtered];
		},

		/** @param {number} index */
		removeSort(index) {
			state.activeSorts = state.activeSorts.filter(/** @param {any} _, @param {number} i */(_, i) => i !== index);
		},

		/** 
		 * @param {number} index 
		 * @param {number} direction
		 */
		moveSort(index, direction) {
			this.reorderSort(index, index + direction);
		},

		/** 
		 * @param {number} from 
		 * @param {number} to
		 */
		reorderSort(from, to) {
			if (to < 0 || to >= state.activeSorts.length || from === to) return;
			const newSorts = [...state.activeSorts];
			const [item] = newSorts.splice(from, 1);
			newSorts.splice(to, 0, item);
			state.activeSorts = newSorts;
		},

		/** 
		 * @param {number} index 
		 * @param {string} direction
		 */
		setSortOrder(index, direction) {
			state.activeSorts[index].direction = direction;
			state.activeSorts = [...state.activeSorts]; // Trigger reactivity
		},

		clearSorts() {
			state.activeSorts = [];
		},

		toggleCollapsed() {
			state.isCollapsed = !state.isCollapsed;
		}
	};
}

export const searchStore = createSearch();
