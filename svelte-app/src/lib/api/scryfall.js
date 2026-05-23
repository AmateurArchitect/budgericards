/**
 * Scryfall API Utility with built-in rate limiting and failsafes.
 */

const RATE_LIMIT_DELAY = 100; // ms between requests (restored to standard)
let requestQueue = Promise.resolve();
let isLocked = false;
const inFlightRequests = new Map(); // URL -> Promise

// Persistent Cache for Card Data
const cacheKey = 'scryfall_cache_v1';
/** @type {Record<string, any>} */
let scryfallCache = {};
if (typeof localStorage !== 'undefined') {
	try {
		scryfallCache = JSON.parse(localStorage.getItem(cacheKey) || '{}');
	} catch (e) {
		scryfallCache = {};
	}
}

function saveCache() {
	if (typeof localStorage !== 'undefined') {
		localStorage.setItem(cacheKey, JSON.stringify(scryfallCache));
	}
}

// SAFETY CONTROLS
export const MOCK_MODE = false; 
export let EMERGENCY_STOP = false;
const MAX_QUEUE_DEPTH = 50; // Auto-kill if more than 50 requests are queued
let pendingCount = 0;

// Attach kill switch to window for easy access in console during dev
if (typeof window !== 'undefined') {
	const win = /** @type {any} */ (window);
	
	win['BUDGIE_STOP'] = () => {
		EMERGENCY_STOP = true;
		console.warn('🛑 EMERGENCY STOP ACTIVATED: All Scryfall requests blocked.');
	};

	win['BUDGIE_CLEAR_CACHE'] = () => {
		scryfallCache = {};
		localStorage.removeItem(cacheKey);
		
		// Also wipe the metadata from the saved deck to force a full re-fetch
		const deckData = localStorage.getItem('deck_v1');
		if (deckData) {
			try {
				const parsed = JSON.parse(deckData);
				delete parsed.metadata;
				localStorage.setItem('deck_v1', JSON.stringify(parsed));
			} catch (e) {}
		}

		console.info('🧹 Scryfall cache and deck metadata cleared. Refresh to see the full re-fetch!');
	};

	win['BUDGIE_RESET_DECK'] = () => {
		localStorage.clear();
		location.reload();
	};

	win['BUDGIE_MOCK'] = (on = true) => {
		win['BUDGIE_MOCK_ACTIVE'] = on;
		console.info(`🎭 Mock Mode: ${on ? 'ON' : 'OFF'}`);
	};

	win['BUDGIE_STATS'] = () => {
		console.table({
			'Queue Depth': pendingCount,
			'Circuit Breaker': isLocked ? 'LOCKED' : 'READY',
			'Emergency Stop': EMERGENCY_STOP ? 'ACTIVE' : 'OFF',
			'Cached Items': Object.keys(scryfallCache).length,
			'In-Flight': inFlightRequests.size
		});
	};
}

/**
 * Executes a rate-limited fetch to Scryfall.
 * @param {string} url 
 * @param {RequestInit} options 
 */
export async function scryfallFetch(url, options = {}) {
	if (EMERGENCY_STOP) {
		throw new Error('Scryfall request blocked: EMERGENCY_STOP is active.');
	}

	// 1. Check Cache first (for GET requests)
	const isCacheable = !options.method || options.method === 'GET';
	const requestKey = `${options.method || 'GET'}:${url}:${options.body || ''}`;
	
	if (isCacheable && scryfallCache[requestKey]) {
		return new Response(JSON.stringify(scryfallCache[requestKey]), {
			status: 200,
			headers: { 'Content-Type': 'application/json', 'X-From-Cache': 'true' }
		});
	}

	// Automatic Circuit Breaker
	if (pendingCount > MAX_QUEUE_DEPTH) {
		const win = /** @type {any} */ (window);
		if (win['BUDGIE_STOP']) win['BUDGIE_STOP']();
		throw new Error(`CRITICAL: Scryfall Queue Depth exceeded ${MAX_QUEUE_DEPTH}. Possible infinite loop detected. App stopped to prevent API spam.`);
	}

	if (MOCK_MODE) {
		await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
		pendingCount--;
		return new Response(JSON.stringify({ object: 'list', data: [] }));
	}

	pendingCount++;

	// 2. Check if we already have an identical request in progress
	if (inFlightRequests.has(requestKey)) {
		pendingCount--;
		return inFlightRequests.get(requestKey).then((/** @type {Response} */ res) => res.clone());
	}

	// 3. Queue this request to ensure serial execution with delay
	const promise = new Promise((resolve, reject) => {
		requestQueue = requestQueue.catch(() => {}).then(async () => {
			// 4. Check if the request was aborted while waiting in the queue
			if (options.signal?.aborted) {
				pendingCount--;
				reject(new DOMException('Aborted', 'AbortError'));
				return;
			}

			// 5. Check for circuit breaker lock
			while (isLocked) {
				await new Promise(r => setTimeout(r, 100));
			}

			try {
				const response = await executeFetch(url, options);
				
				// 6. Handle Rate Limit errors (429)
				if (response.status === 429) {
					console.warn('Scryfall Rate Limit hit (429). Activating failsafe lockout...');
					isLocked = true;
					setTimeout(() => {
						isLocked = false;
						console.info('Scryfall failsafe unlocked.');
					}, 2000);
					
					// Retry this specific request (will go to the back of the queue)
					resolve(scryfallFetch(url, options));
					return;
				}

				// 7. Save to cache if successful
				if (response.ok && isCacheable) {
					const clonedResponse = response.clone();
					clonedResponse.json().then(data => {
						scryfallCache[requestKey] = data;
						saveCache();
					}).catch(() => {});
				}

				resolve(response);
			} catch (error) {
				reject(error);
			} finally {
				// 8. Cleanup in-flight cache and wait the delay
				pendingCount--;
				inFlightRequests.delete(requestKey);
				await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY));
			}
		});
	});

	inFlightRequests.set(requestKey, promise);
	return promise;
}

/**
 * Internal fetch wrapper with default headers
 * @param {string} url
 * @param {RequestInit} options
 */
async function executeFetch(url, options) {
	try {
		/** @type {Record<string, any>} */
		const headers = {
			'User-Agent': 'Budgericards/1.0',
			'Accept': 'application/json',
			...options.headers
		};

		if (options.body && !headers['Content-Type']) {
			headers['Content-Type'] = 'application/json';
		}

		const response = await fetch(url, {
			...options,
			headers
		});
		return response;
	} catch (err) {
		const error = /** @type {any} */ (err);
		if (error.name === 'AbortError') throw error;
		
		console.error('Scryfall Network Error. This is often caused by a hidden 429 Rate Limit error being blocked by CORS:', error);
		
		// If we're seeing ERR_FAILED or TypeError, it might be a rate limit masquerading as CORS
		if (error instanceof TypeError) {
			console.warn('Network failure detected. If this is a 429, the app will auto-retry shortly.');
		}
		
		throw error;
	}
}

/**
 * Fetches a collection of cards from Scryfall.
 * Max 75 cards per request.
 * @param {Array<{name?: string, id?: string, set?: string, collector_number?: string}>} identifiers
 */
export async function fetchCollection(identifiers) {
	if (identifiers.length === 0) return { data: [] };
	
	// Scryfall limit is 75 per request
	const chunks = [];
	for (let i = 0; i < identifiers.length; i += 75) {
		chunks.push(identifiers.slice(i, i + 75));
	}

	const allData = [];
	const allNotFound = [];
	for (const chunk of chunks) {
		const response = await scryfallFetch('https://api.scryfall.com/cards/collection', {
			method: 'POST',
			body: JSON.stringify({ identifiers: chunk })
		});

		if (response.ok) {
			const result = await response.json();
			allData.push(...(result.data || []));
			if (result.not_found) {
				allNotFound.push(...result.not_found);
			}
		}
	}

	return { data: allData, not_found: allNotFound };
}
