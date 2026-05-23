/**
 * @param {any} card
 * @param {boolean} isLand
 * @param {string[]} colorIds
 * @returns {number}
 */
export function getColorCategory(card, isLand, colorIds) {
	if (isLand) return 8; // Lands
	if (colorIds.length === 0) return 7; // Colorless
	if (colorIds.length > 1) return 6; // Multicolored
	
	// Monocolor
	if (colorIds[0] === 'W') return 1;
	if (colorIds[0] === 'U') return 2;
	if (colorIds[0] === 'B') return 3;
	if (colorIds[0] === 'R') return 4;
	if (colorIds[0] === 'G') return 5;
	
	return 7;
}

/**
 * @param {string[]} colorIds
 * @returns {number}
 */
export function getColorWeight(colorIds) {
	const id = [...(colorIds || [])].sort((a, b) => "WUBRG".indexOf(a) - "WUBRG".indexOf(b)).join("");
	
	/** @type {Record<string, number>} */
	const weights = {
		"": 0,
		// Monocolor
		W: 1, U: 2, B: 3, R: 4, G: 5,
		// 2-Color Allied
		WU: 6, UB: 7, BR: 8, RG: 9, WG: 10,
		// 2-Color Enemy
		WB: 11, UR: 12, BG: 13, WR: 14, UG: 15,
		// 3-Color Shards
		WUB: 16, UBR: 17, BRG: 18, WRG: 19, WUG: 20,
		// 3-Color Wedges
		WBG: 21, WUR: 22, UBG: 23, WBR: 24, URG: 25,
		// 4-Color
		WUBR: 26, UBRG: 27, WBRG: 28, WURG: 29, WUBG: 30,
		// 5-Color
		WUBRG: 31
	};
	
	return weights[id] ?? 99;
}

/**
 * @param {any} a
 * @param {any} b
 * @param {boolean} useColorIdentity
 * @returns {number}
 */
export function compareColors(a, b, useColorIdentity) {
	// 1. Determine IsLand
	const aType = (a.type_line || a.type || "").toLowerCase();
	const bType = (b.type_line || b.type || "").toLowerCase();
	const aIsLand = aType.includes("land");
	const bIsLand = bType.includes("land");

	// 2. Fetch Colors (Identity vs Casting Cost)
	const aIds = (useColorIdentity || aIsLand) ? (a.color_identity || []) : (a.colors || []);
	const bIds = (useColorIdentity || bIsLand) ? (b.color_identity || []) : (b.colors || []);

	// 3. Category Sort
	const aCat = getColorCategory(a, aIsLand, aIds);
	const bCat = getColorCategory(b, bIsLand, bIds);

	if (aCat !== bCat) {
		return aCat - bCat;
	}

	// 4. Weight Sort
	return getColorWeight(aIds) - getColorWeight(bIds);
}
