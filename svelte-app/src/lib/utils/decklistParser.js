/**
 * @typedef {Object} ParsedCard
 * @property {string} [name]
 * @property {number} quantity
 * @property {string} [board] - 'mainboard', 'sideboard', 'maybeboard', 'commander'
 * @property {string} [set]
 * @property {string} [collector_number]
 * @property {string} [scryfallId]
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
			if (lowerLine === 'deck' || lowerLine === 'main' || lowerLine.includes('mainboard') || lowerLine.startsWith('// main') || lowerLine.startsWith('// deck')) {
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

		// 2.5. Support for TSV style lines
		let lineBoard = currentBoard;
		if (line.includes('\t')) {
			const parts = line.split('\t').map(p => p.trim());
			let quantity = 1;
			let name = '';
			let set = undefined;
			let collector_number = undefined;

			if (/^\d+$/.test(parts[0])) {
				quantity = parseInt(parts[0], 10);
				name = parts[1];
			} else if (parts[1] && /^\d+$/.test(parts[1])) {
				quantity = parseInt(parts[1], 10);
				name = parts[0];
			} else {
				name = parts[0];
			}

			for (let i = 2; i < parts.length; i++) {
				const part = parts[i];
				if (/^[a-zA-Z0-9]{3,4}$/.test(part) && !set) {
					set = part.toLowerCase();
				} else if (/^\d+[a-zA-Z]*$/.test(part) && set && !collector_number) {
					collector_number = part;
				}
			}

			if (name) {
				result.push({
					name,
					quantity,
					board: lineBoard,
					set,
					collector_number
				});
				continue;
			}
		}

		// 3. Extract inline board prefixes (e.g. "SB: 1 Duress")
		let name = line;
		const boardPrefixMatch = name.match(/^(sb|sideboard|commander|companion|maybeboard):\s*/i);
		if (boardPrefixMatch) {
			const prefix = boardPrefixMatch[1].toLowerCase();
			if (prefix === 'sb' || prefix === 'sideboard') {
				lineBoard = 'sideboard';
			} else if (prefix === 'commander') {
				lineBoard = 'commander';
			} else if (prefix === 'companion') {
				lineBoard = 'companion';
			} else if (prefix === 'maybeboard') {
				lineBoard = 'maybeboard';
			}
			name = name.slice(boardPrefixMatch[0].length).trim();
		}

		// 4. Extract quantity and raw name
		// Supports: "1 Card", "1x Card", "x1 Card", "* 1 Card", "> 1 Card"
		let quantity = 1;

		// Remove leading Markdown/List markers
		name = name.replace(/^[*\->+]\s+/, '').trim();

		// Match quantity at start: "1x ", "1 ", "x1 "
		const qtyMatch = name.match(/^(?:x\s*(\d+)|(\d+)\s*x?)\s+(.+)$/);
		if (qtyMatch) {
			quantity = parseInt(qtyMatch[1] || qtyMatch[2], 10);
			name = qtyMatch[3];
		}

		// Check for UUID (Scryfall ID)
		const uuidPattern = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
		const uuidMatch = name.match(uuidPattern);
		if (uuidMatch) {
			result.push({
				scryfallId: uuidMatch[1].toLowerCase(),
				quantity,
				board: lineBoard
			});
			continue;
		}

		// Check for Scryfall URL
		const scryfallCardUrlPattern = /\/card\/([a-zA-Z0-9]{2,6})\/([a-zA-Z0-9\-]+)/i;
		const scryfallUrlMatch = name.match(scryfallCardUrlPattern);
		if (scryfallUrlMatch) {
			result.push({
				set: scryfallUrlMatch[1].toLowerCase(),
				collector_number: scryfallUrlMatch[2].toLowerCase(),
				quantity,
				board: lineBoard
			});
			continue;
		}

		// 5. Clean up the card name and extract metadata tags
		let set = undefined;
		let collector_number = undefined;

		// Extract set and collector number: (SET) 123 or [SET] 123 or | SET
		const setMatch = name.match(/\s*[([\|]([A-Za-z0-9\-\/]{2,7})[)\]]?\s*([A-Za-z0-9★\-]+)?/);
		if (setMatch) {
			set = setMatch[1].toLowerCase();
			if (setMatch[2]) {
				collector_number = setMatch[2];
			}
			name = name.replace(/\s*[([\|][A-Za-z0-9\-\/]{2,7}[)\]]?\s*([A-Za-z0-9★\-]+)?/, '');
		}

		// If no set was matched yet, check for space-separated set and collector number at the end
		if (!set) {
			const spaceCollMatch = name.match(/\s+([A-Za-z0-9]{3,4})\s+(\d+[a-zA-Z]*)$/);
			if (spaceCollMatch) {
				set = spaceCollMatch[1].toLowerCase();
				collector_number = spaceCollMatch[2];
				name = name.slice(0, spaceCollMatch.index);
			}
		}

		// Remove foil tags, frame tags, etc. (e.g. *F*, *E*, *RE*)
		name = name.replace(/\s+\*([^*]+)\*/gi, '');
		
		// Remove Archidekt categories or custom tags starting with # or caret ^
		name = name.split('#')[0].split('^')[0];
		
		// Remove trailing price info ($1.23, 1.23€, etc.)
		name = name.replace(/\s+[\$€£]\s*\d+([.,]\d+)?/g, '');
		name = name.replace(/\s+\d+([.,]\d+)?\s*[\$€£]/g, '');
		
		// 6. Normalize split card/DFCs separators
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
				board: lineBoard,
				set,
				collector_number
			});
		}
	}

	return result;
}
