import { compareColors } from "$lib/utils/colors.js";
import { deckStore } from "$lib/stores/deck.svelte.js";
import { settingsStore } from "$lib/stores/settings.svelte.js";
import { checkLegality } from "$lib/utils/legality.js";

/**
 * @param {string} manaCostStr
 * @returns {string[]}
 */
export function parseManaCost(manaCostStr) {
	if (!manaCostStr) return [];
	const matches = manaCostStr.match(/\{[^}]+\}/g);
	if (!matches) return [];
	/** @type {string[]} */
	const result = [];
	for (const m of matches) {
		result.push(m.slice(1, -1).toLowerCase().replace("/", ""));
	}
	return result;
}

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

		const basicLandNames = [
			"plains",
			"island",
			"swamp",
			"mountain",
			"forest",
			"wastes",
		];
		const isBasicLand = details
			? basicLandNames.some((name) =>
					card.name.toLowerCase().includes(name),
				)
			: false;
		const typeLineStr = details?.type_line?.toLowerCase() || "";
		const isLand = details
			? (typeLineStr.includes("land") || isBasicLand) &&
				!typeLineStr.includes("//")
			: false;

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
				const colorIds = settingsStore.useColorIdentity
					? details.color_identity || []
					: details.colors || [];
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
				const cmc = details.cmc || 0;
				const floorCmc = Math.floor(cmc);
				if (
					settingsStore.combine01Drops &&
					(floorCmc === 0 || floorCmc === 1)
				)
					groupKey = "0-1 Drop";
				else if (settingsStore.combine6PlusDrops && cmc >= 6)
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
			"Instants",
			"Sorceries",
			"Artifacts",
			"Enchantments",
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

	for (const key of orderedKeys) {
		const cardsInGroup = groups[key] || [];
		if (cardsInGroup.length > 0) {
			categories.push(
				processCategory(key, cardsInGroup, deckStore.activeBoard),
			);
		}
	}

	return categories;
}

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

			const price =
				card.price !== null &&
				card.price !== undefined &&
				card.price !== 0
					? card.price
					: details?.prices?.usd ||
						details?.prices?.usd_foil ||
						0;

			const legality = checkLegality(details || card);

			entry = {
				name: card.name,
				card: details || card,
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
				type: details?.type_line || "Unknown",
				manaSymbols: parseManaCost(
					details?.mana_cost ||
						details?.card_faces?.[0]?.mana_cost ||
						"",
				),
				isIllegal: !legality.isLegal,
				legalityReasons: legality.reasons,
				addedAt: card.addedAt || 0,
				cmc: details?.cmc !== undefined ? details.cmc : 0,
				color_identity: details?.color_identity || [],
				colors: details?.colors || [],
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
