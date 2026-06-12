import { compareColors } from "$lib/utils/colors.js";
import { deckStore } from "$lib/stores/deck.svelte.js";
import { settingsStore } from "$lib/stores/settings.svelte.js";
import { checkLegality } from "$lib/utils/legality.js";

export function parseManaCost(manaCostStr) {
	if (!manaCostStr) return [];
	if (manaCostStr.includes("//")) {
		const parts = manaCostStr.split("//");
		const left = parseManaCost(parts[0].trim());
		const right = parseManaCost(parts[1].trim());
		return [...left, "//", ...right];
	}
	const matches = manaCostStr.match(/\{[^}]+\}/g);
	if (!matches) return [];
	/** @type {string[]} */
	const result = [];
	for (const m of matches) {
		result.push(m.slice(1, -1).toLowerCase().replace("/", ""));
	}
	return result;
}

/**
 * @typedef {Object} CategoryGroup
 * @property {string} name
 * @property {any[]} cards
 * @property {number} totalQty
 * @property {number} totalPrice
 * @property {string} [totalQtyText]
 */

/**
 * @returns {CategoryGroup[]}
 */
export function getGroupedCategories() {
	const grouping = deckStore.grouping?.toLowerCase() || "cmc";
	const effectiveGrouping =
		grouping === "freeform"
			? deckStore.lastNaturalGrouping || "cmc"
			: grouping;

	let boardCards = deckStore.currentBoardCards;
	const categories = [];

	// Prepend Commanders and Companions if viewing the mainboard
	if (deckStore.activeBoard === "mainboard") {
		if (deckStore.commander.length > 0) {
			categories.push(
				processCategory(
					"Commanders",
					deckStore.commander,
					"commander",
				),
			);
		}
		if (deckStore.companion.length > 0) {
			categories.push(
				processCategory(
					"Companions",
					deckStore.companion,
					"companion",
				),
			);
		}
	}

	// Group current board cards
	/** @type {Record<string, any[]>} */
	const groups = {};

	for (const card of boardCards) {
		const metadata = deckStore.metadata[card.name.toLowerCase()];
		const details = card.type_line ? card : metadata;

		let groupKey = "Other";

		if (!details) {
			groupKey = "Unknown";
		} else {
			const overrides = card.overrides || {};
			const manaValue = overrides.manaValue !== undefined ? overrides.manaValue : (card.cmc !== undefined ? card.cmc : (metadata?.cmc || 0));
			const colors = overrides.colors !== undefined ? overrides.colors : (card.colors !== undefined ? card.colors : (metadata?.colors || []));
			const colorIdentity = overrides.colorIdentity !== undefined ? overrides.colorIdentity : (card.color_identity !== undefined ? card.color_identity : (metadata?.color_identity || []));
			const typeLineStr = (overrides.primaryType !== undefined ? overrides.primaryType : (details.type_line || "")).toLowerCase();
			const isCreatureOverride = overrides.creature !== undefined ? overrides.creature : null;
			const isCreature = isCreatureOverride !== null ? isCreatureOverride : typeLineStr.includes("creature");

			const basicLandNames = [
				"plains",
				"island",
				"swamp",
				"mountain",
				"forest",
				"wastes",
			];
			const isBasicLand = basicLandNames.some((name) =>
				card.name.toLowerCase().includes(name),
			);
			const isLand = (typeLineStr.includes("land") || isBasicLand) && !typeLineStr.includes("//");

			if (effectiveGrouping === "none") {
				groupKey = "Deck";
			} else if (effectiveGrouping === "primarytag") {
				groupKey = card.primaryTag || "No Tag";
			} else if (effectiveGrouping === "creature") {
				if (isLand) {
					groupKey = "Lands";
				} else if (isCreature) {
					groupKey = "Creatures";
				} else {
					groupKey = "Non-Creatures";
				}
			} else if (effectiveGrouping === "color") {
				if (overrides.colorCategory) {
					groupKey = overrides.colorCategory;
				} else if (isLand) {
					groupKey = "Lands";
				} else {
					const colorIds = settingsStore.useColorIdentity ? colorIdentity : colors;
					if (colorIds.length === 0) groupKey = "Colorless";
					else if (colorIds.length > 1) groupKey = "Multicolor";
					else {
						/** @type {Record<string, string>} */
						const colorNames = {
							W: "White",
							U: "Blue",
							B: "Black",
							R: "Red",
							G: "Green",
						};
						groupKey = colorNames[colorIds[0]] || "Colorless";
					}
				}
			} else if (effectiveGrouping === "cmc") {
				if (isLand) {
					groupKey = "Lands";
				} else {
					const floorCmc = Math.floor(manaValue);
					if (
						settingsStore.combine01Drops &&
						(floorCmc === 0 || floorCmc === 1)
					)
						groupKey = "0-1 Drop";
					else if (settingsStore.combine6PlusDrops && manaValue >= 6)
						groupKey = "6-Drop+";
					else groupKey = `${floorCmc}-Drop`;
				}
			} else if (effectiveGrouping === "type") {
				if (isLand) {
					groupKey = "Lands";
				} else if (typeLineStr.includes("creature"))
					groupKey = "Creatures";
				else if (typeLineStr.includes("planeswalker"))
					groupKey = "Planeswalkers";
				else if (typeLineStr.includes("instant")) groupKey = "Instants";
				else if (typeLineStr.includes("sorcery"))
					groupKey = "Sorceries";
				else if (typeLineStr.includes("artifact"))
					groupKey = "Artifacts";
				else if (typeLineStr.includes("enchantment"))
					groupKey = "Enchantments";
				else if (typeLineStr.includes("battle"))
					groupKey = "Battles";
				else groupKey = "Other";
			}
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
		orderedKeys = [
			"0-1 Drop",
			"0-Drop",
			"1-Drop",
			"2-Drop",
			"3-Drop",
			"4-Drop",
			"5-Drop",
			"6-Drop+",
			"Unknown",
			"Lands",
		];
	} else if (effectiveGrouping === "color") {
		orderedKeys = [
			"White",
			"Blue",
			"Black",
			"Red",
			"Green",
			"Multicolor",
			"Colorless",
			"Unknown",
			"Lands",
		];
	} else {
		orderedKeys = [
			"Creatures",
			"Planeswalkers",
			"Artifacts",
			"Enchantments",
			"Battles",
			"Sorceries",
			"Instants",
			"Other",
			"Unknown",
			"Lands",
		];
	}

	for (const key of Object.keys(groups)) {
		if (!orderedKeys.includes(key)) {
			orderedKeys.push(key);
		}
	}

	// For primary-tag grouping, always push "No Tag" to the very end
	if (effectiveGrouping === "primarytag") {
		const noTagIdx = orderedKeys.indexOf("No Tag");
		if (noTagIdx !== -1) {
			orderedKeys.splice(noTagIdx, 1);
			orderedKeys.push("No Tag");
		}
	}

	for (const key of orderedKeys) {
		const cardsInGroup = groups[key] || [];
		if (cardsInGroup.length > 0) {
			categories.push(
				processCategory(key, cardsInGroup, deckStore.activeBoard),
			);
		}
	}

	if (effectiveGrouping === "type") {
		for (const category of categories) {
			const key = category.name;
			let secondaryCount = 0;
			for (const card of boardCards) {
				const cardPrimaryKey = getCardPrimaryKey(card);
				if (cardPrimaryKey !== key && cardMatchesKey(card, key)) {
					secondaryCount++;
				}
			}
			if (secondaryCount > 0) {
				category.totalQtyText = `${category.totalQty} + ${secondaryCount}`;
			}
		}
	}

	return categories;
}

/**
 * @param {string} groupName
 * @param {any[]} rawCards
 * @param {string} zone
 * @returns {CategoryGroup}
 */
function processCategory(groupName, rawCards, zone) {
	const grouped = new Map();

	for (const card of rawCards) {
		let entry = grouped.get(card.name);
		if (!entry) {
			const metadata = deckStore.metadata[card.name.toLowerCase()];
			const details = card.type_line ? card : metadata;

			const price =
				card.price !== null &&
				card.price !== undefined &&
				card.price !== 0
					? card.price
					: details?.prices?.usd ||
						details?.prices?.usd_foil ||
						0;

			const overrides = card.overrides || {};
			const manaValue = overrides.manaValue !== undefined ? overrides.manaValue : (card.cmc !== undefined ? card.cmc : (details?.cmc || 0));
			const colors = overrides.colors !== undefined ? overrides.colors : (card.colors !== undefined ? card.colors : (details?.colors || []));
			const colorIdentity = overrides.colorIdentity !== undefined ? overrides.colorIdentity : (card.color_identity !== undefined ? card.color_identity : (details?.color_identity || []));
			const typeLine = overrides.primaryType !== undefined ? overrides.primaryType : (details?.type_line || "Unknown");

			const detailsWithOverrides = {
				...(details || card),
				cmc: manaValue,
				colors,
				color_identity: colorIdentity,
				type_line: typeLine
			};
			const legality = checkLegality(detailsWithOverrides);

			entry = {
				name: card.name,
				card: detailsWithOverrides,
				zone,
				price: parseFloat(price) || 0,
				quantity: 0,
				instances: [],
				artUrl:
					details?.image_uris?.art_crop ||
					details?.card_faces?.[0]?.image_uris?.art_crop ||
					"",
				imgUrl:
					details?.image_uris?.normal ||
					details?.card_faces?.[0]?.image_uris?.normal ||
					"",
				type: typeLine,
				manaSymbols: parseManaCost(
					details?.mana_cost ||
						details?.card_faces?.[0]?.mana_cost ||
						"",
				),
				isIllegal: !legality.isLegal,
				legalityReasons: legality.reasons,
				addedAt: card.addedAt || 0,
				cmc: manaValue,
				color_identity: colorIdentity,
				colors: colors,
			};
			grouped.set(card.name, entry);
		}
		entry.quantity++;
		entry.instances.push(card);
	}

	const cardRows = Array.from(grouped.values());

	// Sort the processed card rows
	const sortFn = createSortFn(deckStore.sorting);
	cardRows.sort(sortFn);

	const totalQty = cardRows.reduce((sum, r) => sum + r.quantity, 0);
	const totalPrice = cardRows.reduce(
		(sum, r) => sum + r.price * r.quantity,
		0,
	);

	return {
		name: groupName,
		cards: cardRows,
		totalQty,
		totalPrice,
	};
}

/**
 * @param {string} sorting
 */
function createSortFn(sorting) {
	return (/** @type {any} */ a, /** @type {any} */ b) => {
		const aIsBasic = isBasicLand(a.name);
		const bIsBasic = isBasicLand(b.name);
		
		const effectiveGrouping = deckStore.grouping?.toLowerCase() === 'freeform' 
			? (deckStore.lastNaturalGrouping || 'cmc') 
			: (deckStore.grouping?.toLowerCase() || 'cmc');
		const isGroupNone = effectiveGrouping === 'none';

		if (aIsBasic && !bIsBasic) return isGroupNone ? 1 : -1;
		if (!aIsBasic && bIsBasic) return isGroupNone ? -1 : 1;
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
		const colorWeights = {
			"": 0,
			W: 1,
			U: 2,
			B: 3,
			R: 4,
			G: 5,
			WU: 6,
			UB: 7,
			BR: 8,
			RG: 9,
			WG: 10,
			WB: 11,
			UR: 12,
			BG: 13,
			WR: 14,
			UG: 15,
		};
		const getWeight = (/** @type {any} */ id) =>
			colorWeights[
				[...(id || [])]
					.sort(
						(/** @type {any} */ a, /** @type {any} */ b) =>
							"WUBRG".indexOf(a) - "WUBRG".indexOf(b),
					)
					.join("")
			] ?? 99;
		return (
			getWeight(a.color_identity || a.colors) -
			getWeight(b.color_identity || b.colors)
		);
	}
	if (factor === "type")
		return (a.type || "").localeCompare(b.type || "");
	if (factor === "qty") return a.quantity - b.quantity;
	if (factor === "printing")
		return (a.card?.set || "").localeCompare(b.card?.set || "");
	if (factor === "color") {
		return compareColors(a, b, settingsStore.useColorIdentity);
	}
	return 0;
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

