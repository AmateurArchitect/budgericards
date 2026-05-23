/**
 * @typedef {Object} ParsedCard
 * @property {string} name
 * @property {number} quantity
 * @property {string} [board] - 'mainboard', 'sideboard', 'maybeboard', 'commander'
 */

/**
 * Parses a MTG decklist string into an array of objects.
 * Handles formats:
 * - 1x Card Name
 * - 1 Card Name
 * - Card Name
 * - 1 Card Name (SET) 123
 * - // Mainboard
 * - Sideboard:
 * 
 * @param {string} text
 * @returns {ParsedCard[]}
 */
export function parseDecklist(text) {
	const lines = text.split(/\r?\n/);
	/** @type {ParsedCard[]} */
	const result = [];
	let currentBoard = 'mainboard';

	for (let line of lines) {
		line = line.trim();
		if (!line) continue;

		// 1. Handle board section headers
		const lowerLine = line.toLowerCase();
		const knownBoards = ['deck', 'main', 'mainboard', 'commander', 'companion', 'sideboard', 'maybeboard'];
		const isKnownBoard = knownBoards.includes(lowerLine);
		const isHeader = line.startsWith('//') || line.endsWith(':') || isKnownBoard;

		if (isHeader) {
			if (lowerLine === 'deck' || lowerLine === 'main' || lowerLine.includes('mainboard') || lowerLine.startsWith('// main')) {
				currentBoard = 'mainboard';
				continue;
			} else if (lowerLine.includes('commander')) {
				currentBoard = 'commander';
				continue;
			} else if (lowerLine.includes('companion')) {
				currentBoard = 'companion';
				continue;
			} else if (lowerLine.includes('sideboard') || lowerLine.startsWith('// side')) {
				currentBoard = 'sideboard';
				continue;
			} else if (lowerLine.includes('maybeboard') || lowerLine.startsWith('// maybe')) {
				currentBoard = 'maybeboard';
				continue;
			}
		}

		// 2. Skip obvious non-card lines (comments)
		if (line.startsWith('//') || line.startsWith('#')) continue;

		// 3. Extract quantity and raw name
		// Supports: "1 Card", "1x Card", "x1 Card", "* 1 Card", "> 1 Card"
		let quantity = 1;
		let name = line;

		// Remove leading Markdown/List markers
		name = name.replace(/^[*\->+]\s+/, '').trim();

		// Match quantity at start: "1x ", "1 ", "x1 "
		const qtyMatch = name.match(/^(?:x\s*(\d+)|(\d+)\s*x?)\s+(.+)$/);
		if (qtyMatch) {
			quantity = parseInt(qtyMatch[1] || qtyMatch[2], 10);
			name = qtyMatch[3];
		}

		// 4. Clean up the card name from metadata tags
		
		// Remove set info and collector numbers: (SET) 123 or [SET] 123 or | SET
		// Also handles set codes from 2 to 6 chars (e.g. 'GP', 'MTGA1')
		name = name.replace(/\s*[([][A-Za-z0-9]{2,6}[)\]](\s+[A-Za-z0-9★\-]+)?/g, '');
		name = name.replace(/\s*\|\s*[A-Za-z0-9]{2,6}(\s+[A-Za-z0-9★\-]+)?/g, '');
		
		// Remove foil tags, frame tags, etc. (e.g. *F*, *E*, *RE*)
		name = name.replace(/\s+\*([^*]+)\*/gi, '');
		
		// Remove Archidekt categories or custom tags starting with #
		name = name.split('#')[0];
		
		// Remove trailing price info ($1.23, 1.23€, etc.)
		name = name.replace(/\s+[\$€£]\s*\d+([.,]\d+)?/g, '');
		name = name.replace(/\s+\d+([.,]\d+)?\s*[\$€£]/g, '');
		
		// 5. Normalize split card/DFCs separators
		// Scryfall collection API prefers "Card A // Card B"
		// If user provides "Card A / Card B", normalize it.
		if (name.includes(' / ') && !name.includes(' // ')) {
			name = name.replace(' / ', ' // ');
		}

		name = name.trim();

		if (name && !isNaN(quantity)) {
			result.push({
				name,
				quantity,
				board: currentBoard
			});
		}
	}

	return result;
}
