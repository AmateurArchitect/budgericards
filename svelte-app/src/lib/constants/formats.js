/**
 * Centralized list of formats and format categories across Budgericards.
 */

/**
 * @typedef {Object} FormatCategory
 * @property {string} id - Unique identifier for the category
 * @property {string} name - Display title for the section/group
 * @property {string[]} formats - Formats belonging to this category
 */

/** @type {FormatCategory[]} */
export const FORMAT_CATEGORIES = [
	{
		id: 'commander',
		name: 'COMMANDER',
		formats: ['Commander', 'Brawl', 'Oathbreaker', 'Duel Commander']
	},
	{
		id: 'constructed',
		name: 'CONSTRUCTED',
		formats: ['Standard', 'Pioneer', 'Modern', 'Legacy', 'Vintage', 'Pauper', 'Premodern']
	},
	{
		id: 'limited',
		name: 'LIMITED',
		formats: ['Cube', 'Draft', 'Sealed']
	},
	{
		id: 'list',
		name: 'LIST',
		formats: ['List']
	}
];

/** All unique supported formats in order */
export const ALL_FORMATS = FORMAT_CATEGORIES.flatMap((c) => c.formats);

/** Formats that use commander deckbuilding rules */
export const COMMANDER_FORMATS = FORMAT_CATEGORIES.find((c) => c.id === 'commander')?.formats || [
	'Commander',
	'Brawl',
	'Oathbreaker',
	'Duel Commander'
];

/**
 * Check if a given format is a commander-style format
 * @param {string | null | undefined} format
 * @returns {boolean}
 */
export function isCommanderFormat(format) {
	if (!format) return false;
	const lower = format.toLowerCase();
	return COMMANDER_FORMATS.some((f) => f.toLowerCase() === lower);
}
