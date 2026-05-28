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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

// During dev, PUBLIC_R2_BASE_URL is unset → falls back to '/'.
// In production, set it to your Cloudflare R2 public bucket URL,
// e.g. https://pub-xxxxxxxx.r2.dev
const BASE_URL: string =
	(typeof import.meta !== 'undefined' &&
		(import.meta as Record<string, any>).env?.PUBLIC_R2_BASE_URL) ||
	'';

const MANIFEST_URL   = BASE_URL ? `${BASE_URL}/manifest.json`  : '/manifest.json';
const CARDS_BASE_URL = BASE_URL ? `${BASE_URL}/cards.json`      : '/cards.json';

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
 * Downloads cards.json and bulk-inserts all records into IndexedDB.
 * Reports progress (0-100) as it goes.
 */
async function downloadAndPopulateCards(version: string): Promise<void> {
	const res = await fetch(CARDS_BASE_URL);
	if (!res.ok) throw new Error(`Failed to fetch cards.json: ${res.status}`);

	const cards: CleanCard[] = await res.json();
	const total = cards.length;

	// Clear the existing table before re-populating
	await db.cards.clear();

	// Bulk-insert in chunks so we can report progress
	for (let i = 0; i < total; i += CHUNK_SIZE) {
		const chunk = cards.slice(i, i + CHUNK_SIZE);
		await db.cards.bulkPut(chunk);
		progress = Math.round(((i + chunk.length) / total) * 100);
	}

	// Persist the version so we skip the download next time
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
