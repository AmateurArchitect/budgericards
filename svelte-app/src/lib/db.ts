import Dexie, { type Table } from 'dexie';

/**
 * Matches the output schema of build-database.mjs exactly.
 * Stored in IndexedDB keyed by oracle_id.
 */
export interface CleanCard {
	id: string;       // oracle_id — primary key
	name: string;
	mana: string;
	cmc: number;
	type: string;
	text: string;
	colors: string[];
	identity: string[];
	formats: string[];
	keywords: string[];
	image: string;
	power?: string;
	toughness?: string;
	loyalty?: string;
}

export interface PriceRecord {
	id: string;    // oracle_id — primary key
	price: number;
}

export class LocalCardDatabase extends Dexie {
	cards!: Table<CleanCard, string>;
	prices!: Table<PriceRecord, string>;

	constructor() {
		super('BudgericardsLocal');
		this.version(1).stores({
			// Indexed fields: id (pk), name, type, cmc, + multi-value arrays
			cards:  'id, name, type, cmc, *colors, *identity, *formats, *keywords',
			prices: 'id, price'
		});
	}
}

export const db = new LocalCardDatabase();
