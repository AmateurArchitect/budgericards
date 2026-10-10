import { supabase } from '$lib/supabase';

/**
 * @typedef {Object} DetectedUrl
 * @property {'cubecobra' | 'moxfield' | 'archidekt' | 'scryfall'} platform
 * @property {string} id
 * @property {string} url
 */

/**
 * Detects if a string is or contains a supported deck/cube URL.
 * @param {string} input
 * @returns {DetectedUrl | null}
 */
export function detectDeckUrl(input) {
	if (!input || typeof input !== 'string') return null;
	const trimmed = input.trim();

	// CubeCobra: cubecobra.com/cube/overview/<id> or cubecobra.com/c/<id> or cubecobra.com/cube/list/<id>
	const cubeCobraMatch = trimmed.match(
		/(?:https?:\/\/)?(?:www\.)?cubecobra\.com\/(?:cube\/(?:overview|list|playtest|analysis|history)\/|c\/)?([a-zA-Z0-9_\-]+)/i
	);
	if (cubeCobraMatch && cubeCobraMatch[1]) {
		// Avoid matching static files or top-level keywords
		const id = cubeCobraMatch[1].toLowerCase();
		if (['about', 'contact', 'donate', 'login', 'register', 'explore', 'search'].includes(id)) {
			return null;
		}
		return {
			platform: 'cubecobra',
			id: cubeCobraMatch[1],
			url: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
		};
	}

	// Moxfield: moxfield.com/decks/<id>
	const moxfieldMatch = trimmed.match(
		/(?:https?:\/\/)?(?:www\.)?moxfield\.com\/decks\/([a-zA-Z0-9_\-]+)/i
	);
	if (moxfieldMatch && moxfieldMatch[1]) {
		return {
			platform: 'moxfield',
			id: moxfieldMatch[1],
			url: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
		};
	}

	// Archidekt: archidekt.com/decks/<id>
	const archidektMatch = trimmed.match(
		/(?:https?:\/\/)?(?:www\.)?archidekt\.com\/decks\/(\d+)/i
	);
	if (archidektMatch && archidektMatch[1]) {
		return {
			platform: 'archidekt',
			id: archidektMatch[1],
			url: trimmed.startsWith('http') ? trimmed : `https://${trimmed}`
		};
	}

	return null;
}

/**
 * Fetches a cube directly from CubeCobra's open JSON API.
 * @param {string} cubeId
 * @returns {Promise<{ success: boolean, title: string, cardCount: number, decklistText: string, error?: string }>}
 */
export async function fetchCubeCobraDeck(cubeId) {
	try {
		const res = await fetch(`https://cubecobra.com/cube/api/cubeJSON/${encodeURIComponent(cubeId)}`);
		if (!res.ok) {
			// Fallback to plaintext endpoint
			const txtRes = await fetch(`https://cubecobra.com/cube/api/cubelist/${encodeURIComponent(cubeId)}`);
			if (txtRes.ok) {
				const text = await txtRes.text();
				const lines = text.split('\n').filter(l => l.trim()).map(l => `1 ${l.trim()}`);
				return {
					success: true,
					title: cubeId,
					cardCount: lines.length,
					decklistText: lines.join('\n')
				};
			}
			throw new Error(`CubeCobra returned status ${res.status}`);
		}

		const data = await res.json();
		const cubeName = data.name || cubeId;
		const mainboard = Array.isArray(data.cards?.mainboard) ? data.cards.mainboard : [];
		const maybeboard = Array.isArray(data.cards?.maybeboard) ? data.cards.maybeboard : [];

		/**
		 * @param {any[]} cardList
		 * @returns {string[]}
		 */
		function formatCards(cardList) {
			/** @type {Map<string, { name: string, set: string, num: string, tags: string[], qty: number }>} */
			const grouped = new Map();
			for (const c of cardList) {
				const name = c.details?.name || c.cardID || 'Unknown Card';
				const set = c.details?.set ? c.details.set.toUpperCase() : '';
				const num = c.details?.collector_number || '';
				const tags = Array.isArray(c.tags) ? c.tags.filter(Boolean) : [];
				const key = `${name.toLowerCase()}|${set}|${num}|${tags.join(',')}`;

				const existing = grouped.get(key);
				if (existing) {
					existing.qty += 1;
				} else {
					grouped.set(key, { name, set, num, tags, qty: 1 });
				}
			}

			return Array.from(grouped.values()).map(g => {
				const setPart = g.set ? ` (${g.set})` : '';
				const numPart = g.num ? ` ${g.num}` : '';
				const tagsPart = g.tags.length ? ' ' + g.tags.map(t => `#${t.trim()}`).join(' ') : '';
				return `${g.qty} ${g.name}${setPart}${numPart}${tagsPart}`;
			});
		}

		const mainLines = formatCards(mainboard);
		const maybeLines = formatCards(maybeboard);

		let fullText = mainLines.join('\n');
		if (maybeLines.length > 0) {
			fullText += '\n\n// Maybeboard\n' + maybeLines.join('\n');
		}

		return {
			success: true,
			title: cubeName,
			cardCount: mainboard.length + maybeboard.length,
			decklistText: fullText
		};
	} catch (err) {
		console.error('Failed to fetch CubeCobra deck:', err);
		return {
			success: false,
			title: cubeId,
			cardCount: 0,
			decklistText: '',
			error: err instanceof Error ? err.message : 'Unknown error'
		};
	}
}

/**
 * Universal deck URL importer.
 * Calls CubeCobra directly or routes through Supabase Edge Function for CORS-restricted sites.
 * @param {string} urlInput
 * @returns {Promise<{ success: boolean, title: string, cardCount: number, decklistText: string, error?: string, needsProxy?: boolean }>}
 */
export async function importDeckFromUrl(urlInput) {
	const detected = detectDeckUrl(urlInput);
	if (!detected) {
		return {
			success: false,
			title: '',
			cardCount: 0,
			decklistText: '',
			error: 'Unsupported or invalid deck URL.'
		};
	}

	if (detected.platform === 'cubecobra') {
		return await fetchCubeCobraDeck(detected.id);
	}

	// For Moxfield & Archidekt, attempt Supabase edge function proxy
	try {
		const { data, error } = await supabase.functions.invoke('fetch-deck', {
			body: { url: detected.url, platform: detected.platform, id: detected.id }
		});

		if (error) {
			let message = error.message;
			// If context has json error
			if (error && typeof error === 'object' && 'context' in error) {
				try {
					const body = await /** @type {any} */ (error).context.json();
					if (body?.error) message = body.error;
				} catch {
					// fallback to message
				}
			}
			return {
				success: false,
				title: '',
				cardCount: 0,
				decklistText: '',
				needsProxy: true,
				error: message || `${detected.platform.charAt(0).toUpperCase() + detected.platform.slice(1)} request failed.`
			};
		}

		if (!data || !data.decklistText) {
			return {
				success: false,
				title: '',
				cardCount: 0,
				decklistText: '',
				needsProxy: true,
				error: (data && data.error) || `${detected.platform.charAt(0).toUpperCase() + detected.platform.slice(1)} requires the 'fetch-deck' Edge Function to be deployed.`
			};
		}

		return {
			success: true,
			title: data.title || `${detected.platform} deck`,
			cardCount: data.cardCount || 0,
			decklistText: data.decklistText
		};
	} catch (err) {
		return {
			success: false,
			title: '',
			cardCount: 0,
			decklistText: '',
			needsProxy: true,
			error: err instanceof Error ? err.message : `${detected.platform.charAt(0).toUpperCase() + detected.platform.slice(1)} requires a proxy due to browser CORS policies.`
		};
	}
}
