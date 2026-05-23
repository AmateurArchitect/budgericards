import { compareColors } from '$lib/utils/colors.js';
import { deckStore } from '$lib/stores/deck.svelte.js';
import { settingsStore } from '$lib/stores/settings.svelte.js';

/**
 * @typedef {Object} StackData
 * @property {any[]} cards
 * @property {string} id
 * @property {string} [label]
 */

/**
 * @typedef {Object} ColumnData
 * @property {string} key
 * @property {string} [label]
 * @property {StackData[]} stacks
 */

/**
 * @typedef {Object} RowData
 * @property {string} id
 * @property {string} [label]
 * @property {ColumnData[]} columns
 */

export function createStacksEngine() {

	function calculateLayout({ freeformLayout, freeformColumnOrder }) {
		const grouping = deckStore.grouping?.toLowerCase() || "cmc";
		const effectiveGrouping = grouping === 'freeform' ? (deckStore.lastNaturalGrouping || 'cmc') : grouping;
		const sorting = deckStore.sorting;
		const splitView = deckStore.splitView;

		let cards = deckStore.currentBoardCards;
		const commanderFormats = ["Commander", "Brawl", "Oathbreaker"];
		const isCommanderFormat = commanderFormats.includes(deckStore.format);
		const isListFormat = deckStore.format === "List";

		// If we're looking at the mainboard, we also want to show commanders and companions in the layout
		if (deckStore.activeBoard === 'mainboard') {
			const isIllegal = !isCommanderFormat && !isListFormat;
			cards = [
				...deckStore.commander.map(c => ({ ...c, _forceColumn: "Special", _forceStack: "Commanders", _isIllegalFormat: isIllegal })),
				...deckStore.companion.map(c => ({ ...c, _forceColumn: "Special", _forceStack: "Companions" })),
				...cards
			];
		}

		/** @type {Record<string, { top: any[], bottom: any[] }>} */
		const columnMap = {};

		for (const card of cards) {
			const metadata = deckStore.metadata[card.name.toLowerCase()];
			const details = card.type_line ? card : metadata;

			if (!details) {
				if (!columnMap["Loading"]) columnMap["Loading"] = { top: [], bottom: [] };
				columnMap["Loading"].top.push({ ...card, _metadata: metadata });
				continue;
			}

			const basicLandNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
			const isBasicLandName = basicLandNames.some(name => card.name.toLowerCase().includes(name));
			const typeLineStr = (details.type_line || "").toLowerCase();
			const isLand = (typeLineStr.includes("land") || isBasicLandName) && !typeLineStr.includes("//");

			let key = "Other";

			if (card._forceColumn) {
				key = card._forceColumn;
			} else if (grouping === 'freeform') {
				if (freeformLayout.has(card.id)) {
					key = /** @type {string} */ (freeformLayout.get(card.id));
				} else if (freeformLayout.size > 0 && freeformColumnOrder.length > 0) {
					key = freeformColumnOrder[0];
				}
			}

			if (key === "Other") {
				if (details.notFound || card.notFound) {
					key = "Unknown";
				} else if (effectiveGrouping === "color") {
					// Funnel lands to the special column ONLY if we are NOT in split view.
					// In split view, we want them in their color columns (Spells Top / Lands Bottom).
					if (isLand && !splitView) {
						key = "Lands";
					} else {
						const colorIds = (settingsStore.useColorIdentity || isLand) ? (details.color_identity || []) : (details.colors || []);
						if (colorIds.length === 0) key = "Colorless";
						else if (colorIds.length > 1) key = "Multicolor";
						else {
							/** @type {Record<string, string>} */
							const colorNames = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
							key = colorNames[colorIds[0]] || "Colorless";
						}
					}
				} else {
					if (effectiveGrouping === "none") {
						key = "Deck";
					} else if (isLand) {
						key = "Lands";
					} else if (effectiveGrouping === "creature") {
						if (typeLineStr.includes("creature")) key = "Creatures";
						else key = "Non-Creatures";
					} else if (effectiveGrouping === "cmc") {
						const cmc = details.cmc || 0;
						const floorCmc = Math.floor(cmc);
						if (settingsStore.combine01Drops && (floorCmc === 0 || floorCmc === 1)) key = "0-1";
						else if (settingsStore.combine6PlusDrops && cmc >= 6) key = "6+";
						else key = floorCmc.toString();
					} else if (effectiveGrouping === "type") {
						const tl = typeLineStr;
						if (tl.includes("creature")) key = "Creatures";
						else if (tl.includes("planeswalker")) key = "Planeswalkers";
						else if (tl.includes("instant")) key = "Instants";
						else if (tl.includes("sorcery")) key = "Sorceries";
						else if (tl.includes("artifact")) key = "Artifacts";
						else if (tl.includes("enchantment")) key = "Enchantments";
						else key = "Other";
					}
				}
			}

			if (!columnMap[key]) columnMap[key] = { top: [], bottom: [] };

			let isTop = true;
			if (card._forceColumn) {
				isTop = true;
			} else if (splitView && effectiveGrouping !== 'type') {
				if (effectiveGrouping === "color") {
					isTop = !isLand;
				} else {
					if (isLand) isTop = true;
					else isTop = (details.type_line || "").includes("Creature");
				}
			}

			const finalCard = { ...metadata, ...card, _metadata: metadata };
			if (isTop) columnMap[key].top.push(finalCard);
			else columnMap[key].bottom.push(finalCard);
		}

		if (effectiveGrouping === "cmc") ensureCmcColumns(columnMap);

		const colOrder = getColumnOrder(columnMap, grouping, effectiveGrouping, freeformColumnOrder);

		// Pre-initialize columnMap for all expected columns to prevent crashes
		colOrder.forEach(key => {
			if (!columnMap[key]) columnMap[key] = { top: [], bottom: [] };
		});

		// Identify master column set for "Matched Columns"
		const activeColumns = colOrder.filter(key => {
			if (deckStore.activeBoard === 'mainboard') {
				if (key === "Special") {
					// Show if format has a commander, OR if cards are set
					return isCommanderFormat || deckStore.commander.length > 0 || deckStore.companion.length > 0;
				}
			}
			const data = columnMap[key];
			if (!data) return false;
			if (effectiveGrouping === "cmc" && key !== "Unknown" && key !== "Lands" && key !== "6+") return true;
			return data.top.length > 0 || data.bottom.length > 0;
		});

		/** @type {RowData[]} */
		const rows = [];
		const sortFn = createSortFn(sorting);

		// Determine Row Headers
		let topRowLabel = undefined;
		let bottomRowLabel = undefined;
		if (splitView && effectiveGrouping !== 'type') {
			if (effectiveGrouping === "color") { topRowLabel = "Spells"; bottomRowLabel = "Lands"; }
			else { topRowLabel = "Creatures"; bottomRowLabel = "Non-creatures"; }
		}

		// Create Top Row
		const topRow = { id: "top", label: topRowLabel, columns: [] };
		for (const key of activeColumns) {
			const data = columnMap[key];
			data.top.sort(sortFn);

			/** @type {StackData[]} */
			let stacks = [];

			if (key === "Special") {
				const commanderCards = data.top.filter(c => c._forceStack === "Commanders");
				const companionCards = data.top.filter(c => c._forceStack === "Companions");

				// Only show Commanders stack if format has one OR a card is set
				if (isCommanderFormat || commanderCards.length > 0) {
					stacks.push({ id: "commanders", label: "Commanders", cards: groupCards(commanderCards, splitView, effectiveGrouping) });
				}

				// Only show Companions stack if a card is set
				if (companionCards.length > 0) {
					stacks.push({ id: "companions", label: "Companions", cards: groupCards(companionCards, splitView, effectiveGrouping) });
				}
			} else {
				const grouped = groupCards(data.top, splitView, effectiveGrouping);
				// Only merge bottom cards into the top row if we're not in split view 
				// OR if it's the special spanning Lands column in CMC/Type modes.
				const shouldCombine = !splitView || (effectiveGrouping !== 'color' && key === 'Lands');
				const allCards = shouldCombine ? [...grouped, ...groupCards(data.bottom, splitView, effectiveGrouping)] : grouped;

				if (allCards.length > 0) {
					stacks.push({ id: `${key}-top`, cards: allCards });
				}
			}

			topRow.columns.push({
				key,
				label: getCmcLabel(key, columnMap[key]),
				stacks
			});
		}
		if (topRow.columns.length > 0) rows.push(topRow);

		// Special Grouping metadata for Type split view
		let typeGroups = [];
		const columnTrackMap = new Map();
		let currentTrack = 1;

		// The "Special" column (Commanders/Companions) always takes track 1 if it exists
		if (activeColumns.includes("Special")) {
			columnTrackMap.set("Special", 1);
			currentTrack = 2;
		}

		if (splitView && effectiveGrouping === "type") {
			const groupSpecs = [
				{ label: "Creatures", keys: ["Creatures"] },
				{ label: "Non-Creature Permanents", keys: ["Planeswalkers", "Artifacts", "Enchantments", "Other"] },
				{ label: "Nonpermanents", keys: ["Instants", "Sorceries", "Unknown"] },
				{ label: "Lands", keys: ["Lands"] }
			];

			groupSpecs.forEach((spec, gIdx) => {
				const keys = spec.keys.filter(k => activeColumns.includes(k));
				if (keys.length > 0) {
					const count = keys.reduce((sum, k) => {
						const col = columnMap[k];
						return sum + col.top.length + col.bottom.length;
					}, 0);

					const isLast = gIdx === groupSpecs.length - 1;
					typeGroups.push({
						label: spec.label,
						keys,
						count,
						startTrack: currentTrack,
						span: keys.length + (isLast ? 0 : 1)
					});

					keys.forEach(k => {
						columnTrackMap.set(k, currentTrack);
						currentTrack++;
					});

					if (!isLast) currentTrack++; // Spacer track
				}
			});
		} else {
			// Standard layout track mapping
			activeColumns.filter(k => k !== "Special").forEach((k, idx) => {
				columnTrackMap.set(k, currentTrack + idx);
			});
			currentTrack += activeColumns.filter(k => k !== "Special").length;
		}

		const masterColCount = currentTrack - 1;

		// Create Bottom Row (Only if NOT Lands column in CMC/Type mode)
		if (splitView && effectiveGrouping !== 'type') {
			const bottomRow = { id: "bottom", label: bottomRowLabel, columns: [] };
			for (const key of activeColumns) {
				if (effectiveGrouping !== "color" && key === "Lands") {
					// Skip Lands in bottom row for CMC/Type, they span from top
					bottomRow.columns.push({ key, label: "", stacks: [] });
					continue;
				}
				const data = columnMap[key];
				data.bottom.sort(sortFn);
				const cards = groupCards(data.bottom, splitView, effectiveGrouping);
				bottomRow.columns.push({
					key,
					label: getCmcLabel(key, columnMap[key]),
					stacks: cards.length > 0 ? [{ id: `${key}-bottom`, cards }] : []
				});
			}
			if (bottomRow.columns.length > 0) rows.push(bottomRow);
		}

		return { rows, typeGroups, columnTrackMap, masterColCount };
	}

	function getColumnOrder(columnMap, grouping, effectiveGrouping, freeformColumnOrder) {
		if (grouping === 'freeform') return freeformColumnOrder;

		const special = [];
		if (deckStore.activeBoard === 'mainboard') {
			special.push("Special");
		}

		if (effectiveGrouping === "none") {
			return [...special, "Deck"];
		} else if (effectiveGrouping === "creature") {
			return [...special, "Creatures", "Non-Creatures", "Lands"];
		} else if (effectiveGrouping === "cmc") {
			const numericKeys = Object.keys(columnMap).filter((k) => k.match(/^\d+$/) || k === "0-1").sort((a, b) => {
				if (a === "0-1") return -1;
				if (b === "0-1") return 1;
				return parseInt(a) - parseInt(b);
			});
			return [...special, ...numericKeys, "6+", "Unknown", "Lands"];
		} else if (effectiveGrouping === "color") {
			return [...special, "White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Unknown", "Lands"];
		} else {
			return [...special, "Creatures", "Planeswalkers", "Instants", "Sorceries", "Artifacts", "Enchantments", "Other", "Unknown", "Lands"];
		}
	}

	function ensureCmcColumns(columnMap) {
		if (settingsStore.combine01Drops) { if (!columnMap["0-1"]) columnMap["0-1"] = { top: [], bottom: [] }; }
		else { if (!columnMap["1"]) columnMap["1"] = { top: [], bottom: [] }; }
		for (let i = 2; i <= 3; i++) { if (!columnMap[i.toString()]) columnMap[i.toString()] = { top: [], bottom: [] }; }
	}

	function createSortFn(sorting) {
		return (a, b) => {

			const primary = compare(a, b, sorting);
			if (primary !== 0) {
				// DeckStore sorting fallback check in Stacks since we can read it
				if (deckStore.sortAscending !== undefined) {
					return deckStore.sortAscending ? primary : -primary;
				}
				return primary;
			}

			// If tied, float basic lands to the top of their group
			const aIsBasic = isBasicLand(a.name);
			const bIsBasic = isBasicLand(b.name);
			if (aIsBasic && !bIsBasic) return -1;
			if (!aIsBasic && bIsBasic) return 1;

			return a.name.localeCompare(b.name);
		};
	}

	function compare(a, b, factor) {
		if (factor === "name") return a.name.localeCompare(b.name);
		if (factor === "added") return b.addedAt - a.addedAt;
		if (factor === "price") {
			const getPrice = (c) => parseFloat(c.prices?.usd || c.prices?.usd_foil || "0");
			return getPrice(a) - getPrice(b);
		}
		if (factor === "cmc") {
			const aIsLand = (a.type_line || "").toLowerCase().includes("land");
			const bIsLand = (b.type_line || "").toLowerCase().includes("land");
			const aCmc = aIsLand ? -1 : (a.cmc || 0);
			const bCmc = bIsLand ? -1 : (b.cmc || 0);
			return aCmc - bCmc;
		}
		if (factor === "type") return (a.type_line || "").localeCompare(b.type_line || "");
		if (factor === "color") {
		return compareColors(a, b, settingsStore.useColorIdentity);
	}
		return 0;
	}

	function groupCards(arr, splitView, effectiveGrouping) {
		const setting = settingsStore.combineDuplicates;
		
		// If setting is 'never', return raw cards but ensure we haven't carried over any stack metadata
		if (setting === "never" || arr.length === 0) {
			return arr.map(c => ({ ...c, isStack: false, stackCount: undefined, stackIds: undefined }));
		}
		
		const groups = new Map();
		for (const card of arr) {
			let group = groups.get(card.name);
			if (!group) { group = []; groups.set(card.name, group); }
			group.push(card);
		}
		const result = [];
		for (const [name, group] of groups) {
			let shouldStack = setting === "always" ? group.length > 1 : group.length > 4;

			// Force unstack basic lands in Color Split view if setting is "auto"
			if (setting !== "always" && splitView && effectiveGrouping === "color") {
				const firstCard = group[0];
				const basicLandNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
				const isBasic = basicLandNames.some(n => (firstCard.name || "").toLowerCase().includes(n));
				if (isBasic) shouldStack = false;
			}

			if (shouldStack) {
				result.push({ ...group[0], isStack: true, stackCount: group.length, stackIds: group.map(c => c.id) });
			} else { 
				result.push(...group.map(c => ({ ...c, isStack: false, stackCount: undefined, stackIds: undefined }))); 
			}
		}
		return result;
	}

	return { calculateLayout, getStackCount, getCmcLabel };
}

export function getStackCount(cards) {
	return (cards || []).reduce((sum, item) => sum + (item.isStack ? item.stackCount : 1), 0);
}

export function getCmcLabel(key, columnData) {
	if (key === "0-1") {
		let has0 = false;
		let has1 = false;

		if (columnData) {
			const checkCards = (cards) => {
				for (const card of cards) {
					const cmc = Math.floor(card.cmc || 0);
					if (cmc === 0) has0 = true;
					if (cmc === 1) has1 = true;
					if (has0 && has1) return true;
				}
				return false;
			};

			if (columnData.top && checkCards(columnData.top)) {
				// has0/has1 updated
			}
			if (!(has0 && has1) && columnData.bottom && checkCards(columnData.bottom)) {
				// has0/has1 updated
			}
			
			// Backward compatibility if someone passes { stacks }
			if (!(has0 && has1) && columnData.stacks) {
				for (const stack of columnData.stacks) {
					if (checkCards(stack.cards || [])) break;
				}
			}
		}

		if (has0 && has1) return "0-1 Drop";
		if (has0) return "0-Drop";
		if (has1) return "1-Drop";
		return "0-1 Drop";
	}
	if (key === "6+") return "6-Drop+";
	if (key.match(/^\d+$/)) return `${key}-Drop`;
	return key;
}


function isBasicLand(name) {
	if (!name) return false;
	const n = name.toLowerCase();
	const basicNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
	return basicNames.some(b => n.includes(b));
}

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
