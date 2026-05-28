/**
 * localSearch.ts
 *
 * Client-side card search engine backed by IndexedDB (via Dexie).
 * Parses a Scryfall-compatible query string into an AST using @sillvva/search,
 * runs the most restrictive index query available, then filters the
 * remaining candidate set in memory by evaluating the AST.
 */

import { db, type CleanCard } from '$lib/db';
import { QueryParser, type ASTNode, type ConditionNode, type NumericOperator } from '@sillvva/search';

// Subclass QueryParser to expose the protected _parse method publicly
class LocalQueryParser extends QueryParser {
	public parse(query: string) {
		return this._parse(query);
	}
}

const parser = new LocalQueryParser({
	validKeys: [
		't', 'type', 'o', 'oracle', 'c', 'color', 'cmc', 'mv', 'price',
		'f', 'format', 'k', 'keyword', 'id', 'identity', 'power', 'toughness', 'loyalty'
	],
	defaultKey: 'name'
});

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
// Condition evaluation
// ---------------------------------------------------------------------------

function evalNumeric(left: number, op: NumericOperator, right: number): boolean {
	switch (op) {
		case '>':  return left > right;
		case '<':  return left < right;
		case '>=': return left >= right;
		case '<=': return left <= right;
		default:   return left === right;
	}
}

/**
 * Expand color shorthand: 'bug' → ['B','U','G'], 'r' → ['R'], etc.
 */
function expandColors(raw: string): string[] {
	const colorMap: Record<string, string> = {
		w: 'W', u: 'U', b: 'B', r: 'R', g: 'G',
		uw: 'UW', wb: 'WB', br: 'BR', rg: 'RG', gu: 'GU',
	};
	if (colorMap[raw]) return [colorMap[raw]];
	return raw.split('').map(c => c.toUpperCase()).filter(c => 'WUBRG'.includes(c));
}

/**
 * Evaluates one condition node against one card. Returns true if it matches.
 */
function evalCondition(card: CleanCard, cond: ConditionNode, priceOverride?: number): boolean {
	const key = cond.key || 'name';
	const op = cond.operator || ':';
	const rawValue = String(cond.value).toLowerCase();

	let match: boolean;

	switch (key) {
		case 'name':
			match = card.name.toLowerCase().includes(rawValue);
			break;

		case 't':
		case 'type':
			match = card.type.toLowerCase().includes(rawValue);
			break;

		case 'o':
		case 'oracle':
			match = (card.text ?? '').toLowerCase().includes(rawValue);
			break;

		case 'k':
		case 'keyword':
			match = card.keywords.some(k => k.toLowerCase().includes(rawValue));
			break;

		case 'f':
		case 'format':
			match = card.formats.map(f => f.toLowerCase()).includes(rawValue);
			break;

		case 'c':
		case 'color': {
			const targets = expandColors(rawValue);
			if (op === ':' || op === '=') {
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
			const targets = expandColors(rawValue);
			if (op === ':' || op === '=') {
				match =
					targets.every(t => card.identity.includes(t)) &&
					card.identity.every(c => targets.includes(c));
			} else if (op === '>=') {
				match = targets.every(t => card.identity.includes(t));
			} else if (op === '<=') {
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
			match = evalNumeric(card.cmc ?? 0, op as NumericOperator, parseFloat(rawValue));
			break;

		case 'power':
			match = evalNumeric(parseFloat(card.power ?? 'NaN'), op as NumericOperator, parseFloat(rawValue));
			break;

		case 'toughness':
			match = evalNumeric(parseFloat(card.toughness ?? 'NaN'), op as NumericOperator, parseFloat(rawValue));
			break;

		case 'loyalty':
			match = evalNumeric(parseFloat(card.loyalty ?? 'NaN'), op as NumericOperator, parseFloat(rawValue));
			break;

		case 'price':
			if (priceOverride === undefined) {
				match = true;
			} else {
				match = evalNumeric(priceOverride, op as NumericOperator, parseFloat(rawValue));
			}
			break;

		default:
			match = true;
	}

	return match;
}

/**
 * Recursively evaluates an ASTNode against a card.
 */
function evaluateNode(node: ASTNode, card: CleanCard, price?: number): boolean {
	let match = false;

	if (node.type === 'binary') {
		const leftMatch = evaluateNode(node.left, card, price);
		if (node.operator === 'AND' || node.operator === '&') {
			match = leftMatch && evaluateNode(node.right, card, price);
		} else if (node.operator === 'OR' || node.operator === '|') {
			match = leftMatch || evaluateNode(node.right, card, price);
		} else {
			match = leftMatch;
		}
	} else if (node.type === 'condition') {
		match = evalCondition(card, node, price);
	}

	return node.negated ? !match : match;
}

// ---------------------------------------------------------------------------
// Main search function
// ---------------------------------------------------------------------------

export interface LocalSearchOptions {
	commanderIdentity?: string[];
	bypassIdentityForLands?: boolean;
	limit?: number;
}

export async function runLocalSearch(
	query: string,
	options: LocalSearchOptions = {}
): Promise<CleanCard[]> {
	const { commanderIdentity, bypassIdentityForLands = true, limit = 175 } = options;

	const trimmed = query.trim();
	if (!trimmed) return [];

	const parseResult = parser.parse(trimmed);
	if (!parseResult.ast) return [];

	const needsPrice = parseResult.astConditions.some(c => c.key === 'price');

	// Determine if the query features logical OR operators.
	// If it does, we avoid using index pre-filtering to prevent subset issues.
	const hasOr = trimmed.toLowerCase().includes(' or ') || trimmed.includes('|');
	let candidates: CleanCard[];

	if (!hasOr) {
		const typeCond = parseResult.astConditions.find(c => (c.key === 't' || c.key === 'type') && !c.isNegated);
		const formatCond = parseResult.astConditions.find(c => (c.key === 'f' || c.key === 'format') && !c.isNegated);

		if (typeCond) {
			const typeVal = String(typeCond.value);
			candidates = await db.cards
				.where('type')
				.startsWithIgnoreCase(typeVal)
				.toArray();

			if (!typeVal.startsWith(typeVal)) {
				const broader = await db.cards
					.filter(c => c.type.toLowerCase().includes(typeVal.toLowerCase()))
					.toArray();
				const ids = new Set(candidates.map(c => c.id));
				for (const c of broader) if (!ids.has(c.id)) candidates.push(c);
			}
		} else if (formatCond) {
			candidates = await db.cards
				.where('formats')
				.equals(String(formatCond.value))
				.toArray();
		} else {
			candidates = await db.cards.toArray();
		}
	} else {
		candidates = await db.cards.toArray();
	}

	let priceMap: Map<string, number> | undefined;
	if (needsPrice) {
		const priceRecords = await db.prices.bulkGet(candidates.map(c => c.id));
		priceMap = new Map();
		for (let i = 0; i < candidates.length; i++) {
			const rec = priceRecords[i];
			if (rec) priceMap.set(candidates[i].id, rec.price);
		}
	}

	const results: CleanCard[] = [];

	for (const card of candidates) {
		if (results.length >= limit) break;

		const price = priceMap?.get(card.id);
		const pass = evaluateNode(parseResult.ast, card, price);

		if (!pass) continue;

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
