/**
 * Utility functions for MTG card classification and type analysis.
 */

export const BASIC_LAND_NAMES = [
	"plains",
	"island",
	"swamp",
	"mountain",
	"forest",
	"wastes",
	"waste"
];

/**
 * Checks if a card name is a basic land.
 * @param {string | null | undefined} cardName
 * @returns {boolean}
 */
export function isBasicLand(cardName) {
	if (!cardName) return false;
	const nameLower = cardName.toLowerCase();
	return BASIC_LAND_NAMES.some(
		land => nameLower === land || nameLower === `snow-covered ${land}` || nameLower.includes(land)
	);
}

/**
 * Checks if a card should be categorized as a Land.
 *
 * Rules:
 * - Basic lands (by name) count as Lands.
 * - Single-faced cards with "land" in their type_line count as Lands.
 * - Double-faced / MDFC cards: Count as a Land if ALL faces are lands (e.g. Pathways: Land // Land).
 *   MDFCs where only one side is a land (e.g. Bala Ged Recovery: Sorcery // Land) do NOT count as pure lands.
 *
 * @param {string | null | undefined} typeLine - Card's type_line (e.g. "Land // Land", "Basic Land — Forest")
 * @param {string | null | undefined} [cardName] - Card name (to check basic lands)
 * @param {any[]} [cardFaces] - Optional Scryfall card_faces array
 * @returns {boolean}
 */
export function isLandCard(typeLine, cardName = "", cardFaces = null) {
	if (cardName && isBasicLand(cardName)) {
		return true;
	}

	if (cardFaces && Array.isArray(cardFaces) && cardFaces.length > 0) {
		return cardFaces.every(face => (face.type_line || "").toLowerCase().includes("land"));
	}

	const tl = (typeLine || "").toLowerCase().trim();
	if (!tl) return false;

	if (tl.includes("//")) {
		const faces = tl.split("//").map(s => s.trim());
		return faces.length > 0 && faces.every(face => face.includes("land"));
	}

	return tl.includes("land");
}
