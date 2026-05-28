/**
 * localSearch.ts
 *
 * Client-side card search engine backed by IndexedDB (via Dexie).
 * Parses a Scryfall-compatible query string into filter conditions,
 * runs the most restrictive index query available, then filters the
 * remaining candidate set in memory.
 *
 * Supported tokens:
 *   bare text            → name contains (case-insensitive)
 *   t: / type:           → type contains
 *   o: / oracle:         → text contains
 *   c: / color:          → colors includes (e.g. c:r or c>=rg)
 *   id: / identity:      → color identity (e.g. id<=bug)
 *   cmc: / mv:           → numeric compare (e.g. cmc>=3 cmc=2 mv<5)
 *   f: / format:         → formats includes (e.g. f:commander)
 *   k: / keyword:        → keywords includes (e.g. k:flying)
 *   price:               → numeric compare against prices table
 *   -prefix              → negates any condition (e.g. -t:land)
 *
 * Printing-specific tokens (set:, cn:, artist:, etc.) are NOT handled here
 * and should be passed through to Scryfall instead. Use isPrintingQuery() to
 * detect these before calling runLocalSearch().
 */

import { db, type CleanCard } from '$lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Operator = ':' | '=' | '<' | '>' | '<=' | '>=';

interface Condition {
	key: string;
	op: Operator;
	value: string;
	negate: boolean;
}

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the query contains any token that requires Scryfall
 * (printing-specific lookups that don't exist in our local schema).
 */
export function isPrintingQuery(query: string): boolean {
	return /\b(set|cn|collector_number|lang|artist|flavor|watermark|border|game|new|order|dir|prefer|in|is)\s*[:<>=]/.test(
		query
	);
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

const TOKEN_RE =
	/(-?)([a-z_]+)\s*(<=|>=|<|>|:|=)\s*"([^"]+)"|(-?)([a-z_]+)\s*(<=|>=|<|>|:|=)\s*(\S+)|(-?)("([^"]+)"|(\S+))/gi;

function parse(query: string): Condition[] {
	const conditions: Condition[] = [];
	let match: RegExpExecArray | null;

	// Reset lastIndex before using exec in a loop
	TOKEN_RE.lastIndex = 0;

	while ((match = TOKEN_RE.exec(query)) !== null) {
		if (match[2]) {
			// key op "quoted value"
			conditions.push({
				key:    match[2].toLowerCase(),
				op:     match[3] as Operator,
				value:  match[4].toLowerCase(),
				negate: match[1] === '-'
			});
		} else if (match[6]) {
			// key op value
			conditions.push({
				key:    match[6].toLowerCase(),
				op:     match[7] as Operator,
				value:  match[8].toLowerCase(),
				negate: match[5] === '-'
			});
		} else {
			// bare word (name search)
			const raw = (match[11] || match[12] || '').toLowerCase();
			if (raw) {
				conditions.push({
					key:    'name',
					op:     ':',
					value:  raw,
					negate: match[9] === '-'
				});
			}
		}
	}

	return conditions;
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

function evalNumeric(left: number, op: Operator, right: number): boolean {
	switch (op) {
		case '>':  return left > right;
		case '<':  return left < right;
		case '>=': return left >= right;
		case '<=': return left <= right;
		default:   return left === right; // ':' and '=' both mean equals for numerics
	}
}

/**
 * Expand color shorthand: 'bug' → ['B','U','G'], 'r' → ['R'], etc.
 */
function expandColors(raw: string): string[] {
	const colorMap: Record<string, string> = {
		w: 'W', u: 'U', b: 'B', r: 'R', g: 'G',
		// guild shorthands
		uw: 'UW', wb: 'WB', br: 'BR', rg: 'RG', gu: 'GU',
		// shard / wedge shorthand (expand individually below)
	};
	// Try direct alias first, then expand character by character
	if (colorMap[raw]) return [colorMap[raw]];
	return raw.split('').map(c => c.toUpperCase()).filter(c => 'WUBRG'.includes(c));
}

/**
 * Evaluates one condition against one card. Returns true if it matches.
 */
function evalCondition(card: CleanCard, cond: Condition, priceOverride?: number): boolean {
	const { key, op, value } = cond;

	let match: boolean;

	switch (key) {
		case 'name':
			match = card.name.toLowerCase().includes(value);
			break;

		case 't':
		case 'type':
			match = card.type.toLowerCase().includes(value);
			break;

		case 'o':
		case 'oracle':
			match = (card.text ?? '').toLowerCase().includes(value);
			break;

		case 'k':
		case 'keyword':
			match = card.keywords.some(k => k.toLowerCase().includes(value));
			break;

		case 'f':
		case 'format':
			match = card.formats.map(f => f.toLowerCase()).includes(value);
			break;

		case 'c':
		case 'color': {
			const targets = expandColors(value);
			if (op === ':' || op === '=') {
				// Exact color match (subset)
				match = targets.every(t => card.colors.includes(t));
			} else if (op === '>=') {
				match = targets.every(t => card.colors.includes(t));
			} else if (op === '<=') {
				match = card.colors.every(c => targets.includes(c));
			} else if (op === '>') {
				match = targets.every(t => card.colors.includes(t)) && card.colors.length > targets.length;
			} else {
				match = card.colors.every(c => targets.includes(c)) && card.colors.length < targets.length;
			}
			break;
		}

		case 'id':
		case 'identity': {
			const targets = expandColors(value);
			if (op === ':' || op === '=') {
				// Identity exactly equals
				match =
					targets.every(t => card.identity.includes(t)) &&
					card.identity.every(c => targets.includes(c));
			} else if (op === '>=') {
				// Card's identity is a superset
				match = targets.every(t => card.identity.includes(t));
			} else if (op === '<=') {
				// Card's identity is a subset (fits within commander identity)
				match = card.identity.every(c => targets.includes(c));
			} else if (op === '>') {
				match = targets.every(t => card.identity.includes(t)) && card.identity.length > targets.length;
			} else {
				match = card.identity.every(c => targets.includes(c)) && card.identity.length < targets.length;
			}
			break;
		}

		case 'cmc':
		case 'mv':
			match = evalNumeric(card.cmc ?? 0, op, parseFloat(value));
			break;

		case 'power':
			match = evalNumeric(parseFloat(card.power ?? 'NaN'), op, parseFloat(value));
			break;

		case 'toughness':
			match = evalNumeric(parseFloat(card.toughness ?? 'NaN'), op, parseFloat(value));
			break;

		case 'loyalty':
			match = evalNumeric(parseFloat(card.loyalty ?? 'NaN'), op, parseFloat(value));
			break;

		case 'price':
			if (priceOverride === undefined) {
				// No price data loaded yet — skip filter (include card)
				match = true;
			} else {
				match = evalNumeric(priceOverride, op, parseFloat(value));
			}
			break;

		default:
			// Unknown key — skip (don't reject the card)
			match = true;
	}

	return cond.negate ? !match : match;
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export interface LocalSearchOptions {
	/** Extra color identity constraint (from commander filter in the UI) */
	commanderIdentity?: string[];
	/** Whether lands bypass the color identity check */
	bypassIdentityForLands?: boolean;
	/** Max results to return (default: 175) */
	limit?: number;
}

export async function runLocalSearch(
	query: string,
	options: LocalSearchOptions = {}
): Promise<CleanCard[]> {
	const { commanderIdentity, bypassIdentityForLands = true, limit = 175 } = options;

	const trimmed = query.trim();
	if (!trimmed) return [];

	const conditions = parse(trimmed);
	if (conditions.length === 0) return [];

	// ------------------------------------------------------------------
	// 1. Index-assisted pre-filter using the most selective condition
	// ------------------------------------------------------------------

	// Check if we need price lookups
	const needsPrice = conditions.some(c => c.key === 'price');

	// Find a good primary index condition (type or format — both are indexed)
	const typeCond   = conditions.find(c => (c.key === 't' || c.key === 'type') && !c.negate);
	const formatCond = conditions.find(c => (c.key === 'f' || c.key === 'format') && !c.negate);

	let candidates: CleanCard[];

	if (typeCond) {
		// Use the type index for a prefix scan; we'll refine in-memory
		candidates = await db.cards
			.where('type')
			.startsWithIgnoreCase(typeCond.value)
			.toArray();

		// Also include cards where type *contains* (not just starts with) the term
		// because Dexie's startsWith only covers prefix matches
		if (!typeCond.value.startsWith(typeCond.value)) {
			const broader = await db.cards
				.filter(c => c.type.toLowerCase().includes(typeCond.value))
				.toArray();
			const ids = new Set(candidates.map(c => c.id));
			for (const c of broader) if (!ids.has(c.id)) candidates.push(c);
		}
	} else if (formatCond) {
		// Multi-value index — where('*formats').equals(value)
		candidates = await db.cards
			.where('formats')
			.equals(formatCond.value)
			.toArray();
	} else {
		// No suitable index — full table scan (IndexedDB is fast enough for 30k cards)
		candidates = await db.cards.toArray();
	}

	// ------------------------------------------------------------------
	// 2. Fetch prices for price-filtered candidates (single bulk read)
	// ------------------------------------------------------------------

	let priceMap: Map<string, number> | undefined;
	if (needsPrice) {
		const priceRecords = await db.prices.bulkGet(candidates.map(c => c.id));
		priceMap = new Map();
		for (let i = 0; i < candidates.length; i++) {
			const rec = priceRecords[i];
			if (rec) priceMap.set(candidates[i].id, rec.price);
		}
	}

	// ------------------------------------------------------------------
	// 3. In-memory filter pass
	// ------------------------------------------------------------------

	const results: CleanCard[] = [];

	for (const card of candidates) {
		// Skip if we're over the limit
		if (results.length >= limit) break;

		const price = priceMap?.get(card.id);

		// Check all conditions
		let pass = true;
		for (const cond of conditions) {
			if (!evalCondition(card, cond, price)) {
				pass = false;
				break;
			}
		}

		if (!pass) continue;

		// Commander identity check (applied after condition pass)
		if (commanderIdentity && commanderIdentity.length > 0) {
			const isLand = card.type.toLowerCase().includes('land');
			if (!(bypassIdentityForLands && isLand)) {
				const withinIdentity = card.identity.every(c => commanderIdentity.includes(c));
				if (!withinIdentity) continue;
			}
		}

		results.push(card);
	}

	return results;
}

/**
 * Convenience wrapper: look up a single card by exact name.
 * Used for metadata hydration in the deck store.
 */
export async function getCardByName(name: string): Promise<CleanCard | undefined> {
	const lower = name.toLowerCase();
	return db.cards
		.filter(c => c.name.toLowerCase() === lower)
		.first();
}

/**
 * Convenience wrapper: look up multiple cards by oracle_id.
 */
export async function getCardsById(ids: string[]): Promise<CleanCard[]> {
	return db.cards.bulkGet(ids).then(results =>
		results.filter((c): c is CleanCard => c !== undefined)
	);
}
