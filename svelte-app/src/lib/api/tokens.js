import { fetchCollection } from './scryfall.js';
import { db } from '$lib/db';

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   type_line?: string,
 *   oracle_text?: string,
 *   power?: string,
 *   toughness?: string,
 *   image_uri?: string | null,
 *   sourceCards: string[]
 * }} RequiredToken
 */

const BASIC_LANDS = new Set([
	'plains', 'island', 'swamp', 'mountain', 'forest', 'wastes',
	'snow-covered plains', 'snow-covered island', 'snow-covered swamp',
	'snow-covered mountain', 'snow-covered forest', 'snow-covered wastes'
]);

// Heuristic regex to identify cards whose text might produce or require tokens / game markers
const TOKEN_CANDIDATE_REGEX = /token|create\s|manifest|incubate|populate|investigate|amass|role\b|treasure|food\b|clue\b|blood\b|map\b|junk\b|monarch|initiative|dungeon|daybound|nightbound|tempts you|city's blessing|ascend|emblem/i;

const CARD_TOKENS_CACHE_KEY = 'budgie_card_tokens_v1';
const TOKEN_DETAILS_CACHE_KEY = 'budgie_token_details_v1';

/** @type {Map<string, Array<{ id: string, name: string, type_line?: string }>>} */
const cardTokensMap = new Map();

/** @type {Map<string, any>} */
const tokenDetailsMap = new Map();

let cacheLoaded = false;

function loadLocalCache() {
	if (cacheLoaded || typeof localStorage === 'undefined') return;
	cacheLoaded = true;
	try {
		const rawCardTokens = localStorage.getItem(CARD_TOKENS_CACHE_KEY);
		if (rawCardTokens) {
			const parsed = JSON.parse(rawCardTokens);
			for (const [k, v] of Object.entries(parsed)) {
				cardTokensMap.set(k, /** @type {any} */ (v));
			}
		}
		const rawTokenDetails = localStorage.getItem(TOKEN_DETAILS_CACHE_KEY);
		if (rawTokenDetails) {
			const parsed = JSON.parse(rawTokenDetails);
			for (const [k, v] of Object.entries(parsed)) {
				tokenDetailsMap.set(k, v);
			}
		}
	} catch (e) {
		console.warn('Failed to parse tokens cache from localStorage:', e);
	}
}

function persistLocalCache() {
	if (typeof localStorage === 'undefined') return;
	try {
		/** @type {Record<string, any>} */
		const cardTokensObj = {};
		for (const [k, v] of cardTokensMap.entries()) {
			cardTokensObj[k] = v;
		}
		localStorage.setItem(CARD_TOKENS_CACHE_KEY, JSON.stringify(cardTokensObj));

		/** @type {Record<string, any>} */
		const tokenDetailsObj = {};
		for (const [k, v] of tokenDetailsMap.entries()) {
			tokenDetailsObj[k] = v;
		}
		localStorage.setItem(TOKEN_DETAILS_CACHE_KEY, JSON.stringify(tokenDetailsObj));
	} catch (e) {
		// Quota or storage write error
		console.warn('Failed to persist tokens cache to localStorage:', e);
	}
}

/**
 * Checks if a related_card part represents a token, marker, or auxiliary game piece.
 * @param {any} part
 */
function isTokenOrMarker(part) {
	if (!part) return false;
	if (part.component === 'token') return true;
	const type = part.type_line || '';
	if (type.includes('Token') || type.includes('Emblem') || type.includes('Dungeon')) return true;
	const specialMarkers = [
		'The Monarch',
		'The Initiative',
		"City's Blessing",
		'Day // Night',
		'The Ring // The Ring Tempts You'
	];
	if (specialMarkers.includes(part.name)) return true;
	return false;
}

/**
 * Fetches and resolves all required tokens for a given list of cards in a deck.
 * @param {Array<{ name: string, oracle_text?: string, text?: string }>} cards
 * @returns {Promise<RequiredToken[]>}
 */
export async function getDeckTokens(cards) {
	loadLocalCache();

	if (!cards || cards.length === 0) return [];

	// 1. Deduplicate card names and identify candidates
	/** @type {Map<string, string>} */
	const uniqueCardNames = new Map(); // lowercase -> original display name
	for (const card of cards) {
		if (!card || !card.name) continue;
		const trimmed = card.name.trim();
		const low = trimmed.toLowerCase();
		if (BASIC_LANDS.has(low)) continue;
		if (!uniqueCardNames.has(low)) {
			uniqueCardNames.set(low, trimmed);
		}
	}

	// 2. Identify candidate cards needing Scryfall lookup
	/** @type {string[]} */
	const candidatesToLookup = [];

	for (const [lowName, displayName] of uniqueCardNames.entries()) {
		if (cardTokensMap.has(lowName)) {
			continue;
		}

		// Check if we have the card's text locally to avoid unnecessary Scryfall requests
		const cardObj = cards.find(c => c.name.toLowerCase() === lowName);
		let oracleText = cardObj?.oracle_text || cardObj?.text || '';

		if (!oracleText && db?.cards) {
			try {
				const localCard = await db.cards.where('name').equalsIgnoreCase(lowName).first();
				if (localCard) {
					oracleText = localCard.text || '';
				}
			} catch (_) {}
		}

		if (oracleText && !TOKEN_CANDIDATE_REGEX.test(oracleText)) {
			// Card definitively does not produce or reference tokens
			cardTokensMap.set(lowName, []);
			continue;
		}

		candidatesToLookup.push(displayName);
	}

	// 3. Batch query Scryfall for un-cached candidate cards
	if (candidatesToLookup.length > 0) {
		try {
			const identifiers = candidatesToLookup.map(name => ({ name }));
			const response = await fetchCollection(identifiers);
			const returnedCards = response.data || [];

			const foundNames = new Set();
			for (const scryfallCard of returnedCards) {
				const nameKey = scryfallCard.name.toLowerCase();
				foundNames.add(nameKey);
				if (scryfallCard.name.includes(' // ')) {
					foundNames.add(scryfallCard.name.split(' // ')[0].trim().toLowerCase());
				}

				/** @type {Array<{ id: string, name: string, type_line?: string }>} */
				const parts = [];
				if (scryfallCard.all_parts && Array.isArray(scryfallCard.all_parts)) {
					for (const part of scryfallCard.all_parts) {
						if (isTokenOrMarker(part)) {
							parts.push({
								id: part.id,
								name: part.name,
								type_line: part.type_line
							});
						}
					}
				}

				cardTokensMap.set(nameKey, parts);
			}

			// Any candidates not found or lacking tokens get marked empty
			for (const cand of candidatesToLookup) {
				const candLow = cand.toLowerCase();
				if (!cardTokensMap.has(candLow)) {
					cardTokensMap.set(candLow, []);
				}
			}
		} catch (err) {
			console.error('Failed to fetch card metadata for tokens:', err);
		}
	}

	// 4. Collect and group tokens across all cards in the deck
	/** @type {Map<string, { id: string, name: string, type_line?: string, sourceCards: Set<string> }>} */
	const groupedTokens = new Map();

	for (const [lowName, displayName] of uniqueCardNames.entries()) {
		const parts = cardTokensMap.get(lowName) || [];
		for (const part of parts) {
			// Group by name + type_line so multiple cards creating the same token are combined
			const groupKey = `${part.name}::${part.type_line || ''}`.toLowerCase();
			if (!groupedTokens.has(groupKey)) {
				groupedTokens.set(groupKey, {
					id: part.id,
					name: part.name,
					type_line: part.type_line,
					sourceCards: new Set([displayName])
				});
			} else {
				groupedTokens.get(groupKey)?.sourceCards.add(displayName);
			}
		}
	}

	// 5. Resolve images & metadata for missing token details
	/** @type {string[]} */
	const missingTokenIds = [];
	for (const token of groupedTokens.values()) {
		if (!tokenDetailsMap.has(token.id)) {
			missingTokenIds.push(token.id);
		}
	}

	if (missingTokenIds.length > 0) {
		try {
			const tokenResp = await fetchCollection(missingTokenIds.map(id => ({ id })));
			for (const tCard of tokenResp.data || []) {
				const img = tCard.image_uris?.normal ||
					tCard.card_faces?.[0]?.image_uris?.normal ||
					`https://api.scryfall.com/cards/${tCard.id}?format=image&version=normal`;

				tokenDetailsMap.set(tCard.id, {
					id: tCard.id,
					name: tCard.name,
					type_line: tCard.type_line,
					oracle_text: tCard.oracle_text || '',
					power: tCard.power,
					toughness: tCard.toughness,
					image_uri: img
				});
			}
		} catch (err) {
			console.warn('Failed to fetch detailed token card metadata:', err);
		}

		// Provide fallback redirect image for any tokens still missing details
		for (const id of missingTokenIds) {
			if (!tokenDetailsMap.has(id)) {
				tokenDetailsMap.set(id, {
					id,
					image_uri: `https://api.scryfall.com/cards/${id}?format=image&version=normal`
				});
			}
		}
	}

	persistLocalCache();

	// 6. Build final list of RequiredToken objects
	/** @type {RequiredToken[]} */
	const results = [];
	for (const item of groupedTokens.values()) {
		const detail = tokenDetailsMap.get(item.id) || {};
		results.push({
			id: item.id,
			name: detail.name || item.name,
			type_line: detail.type_line || item.type_line || 'Token',
			oracle_text: detail.oracle_text || '',
			power: detail.power,
			toughness: detail.toughness,
			image_uri: detail.image_uri || `https://api.scryfall.com/cards/${item.id}?format=image&version=normal`,
			sourceCards: Array.from(item.sourceCards)
		});
	}

	// Sort alphabetically by token name
	results.sort((a, b) => a.name.localeCompare(b.name));

	return results;
}
