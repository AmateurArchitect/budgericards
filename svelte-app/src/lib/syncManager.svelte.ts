/**
 * syncManager.svelte.ts
 *
 * Boot-time service that keeps the local IndexedDB card database in sync
 * with the latest data from our CDN (Cloudflare R2 in production, /static
 * during local development).
 *
 * Usage:
 *   import { syncManager } from '$lib/syncManager.svelte';
 *   // In +layout.svelte onMount:
 *   syncManager.init();
 *
 * Reactive state (Svelte 5 runes):
 *   syncManager.isReady     — true once cards table is populated and up-to-date
 *   syncManager.isLoading   — true while downloading or inserting
 *   syncManager.progress    — 0-100 during bulk insert
 *   syncManager.error       — string if something went wrong
 */

import { db, type CleanCard, type PriceRecord } from '$lib/db';
import { PUBLIC_R2_BASE_URL } from '$env/static/public';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// PUBLIC_R2_BASE_URL is set in .env (and in Cloudflare Pages environment variables).
// Leave it blank to fall back to /static/ for local development.
// Example: https://pub-xxxxxxxx.r2.dev
const BASE_URL: string = PUBLIC_R2_BASE_URL || '';

const MANIFEST_URL   = BASE_URL ? `${BASE_URL}/manifest.json` : '/manifest.json';
const CARDS_BASE_URL = BASE_URL ? `${BASE_URL}/cards.jsonl`    : '/cards.jsonl';


const VERSION_KEY = 'budgericards_cards_version';
const CHUNK_SIZE  = 500; // rows per bulk-insert batch

// ---------------------------------------------------------------------------
// Reactive state (Svelte 5 $state)
// ---------------------------------------------------------------------------

let isReady    = $state(false);
let isLoading  = $state(false);
let progress   = $state(0);
let error      = $state('');
let initialized = false;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface Manifest {
	cards_version: string;
	prices_files:  string[];
}

async function fetchManifest(): Promise<Manifest> {
	const res = await fetch(MANIFEST_URL);
	if (!res.ok) throw new Error(`Failed to fetch manifest: ${res.status}`);
	return res.json();
}

/**
 * Downloads cards.jsonl and bulk-inserts all records incrementally into IndexedDB.
 * Reports progress (0-100) reactively as it goes.
 */
async function downloadAndPopulateCards(version: string): Promise<void> {
	const res = await fetch(CARDS_BASE_URL);
	if (!res.ok) throw new Error(`Failed to fetch cards.jsonl: ${res.status}`);

	const reader = res.body?.getReader();
	if (!reader) throw new Error('ReadableStream not supported by browser');

	const decoder = new TextDecoder('utf-8');
	let buffer = '';
	let processedCount = 0;
	let chunkBuffer: CleanCard[] = [];

	// Clear the existing table before re-populating
	await db.cards.clear();

	// We estimate progress based on typical MTG database size of ~32,000 cards
	const estimatedTotalCards = 32000;

	while (true) {
		const { done, value } = await reader.read();
		if (done) break;

		buffer += decoder.decode(value, { stream: true });
		const lines = buffer.split('\n');
		buffer = lines.pop() || ''; // Keep partial line in buffer

		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;

			try {
				const card = JSON.parse(trimmed) as CleanCard;
				chunkBuffer.push(card);
				processedCount++;

				if (chunkBuffer.length >= CHUNK_SIZE) {
					await db.cards.bulkPut(chunkBuffer);
					chunkBuffer = [];
					progress = Math.min(99, Math.round((processedCount / estimatedTotalCards) * 100));
				}
			} catch (err) {
				console.warn('Failed to parse line during sync streaming:', err);
			}
		}
	}

	// Insert any remaining items
	if (buffer.trim()) {
		try {
			const card = JSON.parse(buffer.trim()) as CleanCard;
			chunkBuffer.push(card);
		} catch (err) {
			console.warn('Failed to parse final line in buffer:', err);
		}
	}

	if (chunkBuffer.length > 0) {
		await db.cards.bulkPut(chunkBuffer);
	}

	progress = 100;
	localStorage.setItem(VERSION_KEY, version);
}

/**
 * Fetches a timestamped prices file and replaces the local prices table.
 * Called when the user changes the active price timeline in the UI.
 */
async function loadPriceFile(filename: string): Promise<void> {
	const url = BASE_URL ? `${BASE_URL}/${filename}` : `/${filename}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`Failed to fetch ${filename}: ${res.status}`);

	// prices_YYYY_MM_DD.json is a flat { oracle_id: price } object
	const raw: Record<string, number> = await res.json();

	const records: PriceRecord[] = Object.entries(raw).map(([id, price]) => ({
		id,
		price
	}));

	await db.prices.clear();
	await db.prices.bulkPut(records);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const syncManager = {
	get isReady()   { return isReady; },
	get isLoading() { return isLoading; },
	get progress()  { return progress; },
	get error()     { return error; },

	/**
	 * Call once from +layout.svelte onMount.
	 * Idempotent — safe to call multiple times.
	 */
	async init(): Promise<void> {
		if (initialized) return;
		initialized = true;

		// If the DB already has cards, mark ready immediately so the UI isn't
		// blocked, then check for updates in the background.
		const existingCount = await db.cards.count();
		if (existingCount > 0) {
			isReady = true;
		}

		isLoading = true;
		error = '';

		try {
			const manifest     = await fetchManifest();
			const localVersion = localStorage.getItem(VERSION_KEY) ?? '';

			if (manifest.cards_version !== localVersion || existingCount === 0) {
				// New version available (or first boot) — download and populate
				isReady = false;
				progress = 0;
				await downloadAndPopulateCards(manifest.cards_version);
			}

			// Load the latest price file if missing or updated
			if (manifest.prices_files && manifest.prices_files.length > 0) {
				const latestPriceFile = manifest.prices_files[manifest.prices_files.length - 1];
				const loadedPriceFile = localStorage.getItem('budgericards_loaded_price_file') ?? '';
				const priceCount = await db.prices.count();
				
				if (latestPriceFile !== loadedPriceFile || priceCount === 0) {
					await loadPriceFile(latestPriceFile);
					localStorage.setItem('budgericards_loaded_price_file', latestPriceFile);
				}
			}

			isReady = true;
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[syncManager] Init error:', msg);

			// If we already had cards, stay ready despite the network error
			if (existingCount > 0) {
				isReady = true;
				console.warn('[syncManager] Using cached cards despite update failure.');
			} else {
				error = msg;
			}
		} finally {
			isLoading = false;
		}
	},

	/**
	 * Load a specific price snapshot into the local prices table.
	 * Pass a filename like "prices_2026_05_23.json"
	 */
	async loadPriceFile(filename: string): Promise<void> {
		isLoading = true;
		error = '';
		try {
			await loadPriceFile(filename);
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			console.error('[syncManager] Price load error:', msg);
			error = msg;
		} finally {
			isLoading = false;
		}
	},

	/** Force a fresh re-download of cards regardless of version */
	async forceRefresh(): Promise<void> {
		localStorage.removeItem(VERSION_KEY);
		initialized = false;
		isReady = false;
		await this.init();
	}
};
