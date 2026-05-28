import { supabase } from '$lib/supabase';

export interface SyncedDeck {
	id: string;
	user_id: string;
	name: string;
	cards: {
		commander: any[];
		companion: any[];
		mainboard: any[];
		sideboard: any[];
		maybeboard: any[];
		garbage: any[];
		activeBoard: string;
		grouping: string;
		sorting: string;
		sortAscending: boolean;
		splitView: boolean;
		coverArt: string | null;
		format: string;
		lastNaturalGrouping: string;
		metadata: Record<string, any>;
	};
	created_at: string;
	updated_at: string;
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(str: string): boolean {
	return UUID_REGEX.test(str);
}

export const syncService = {
	/**
	 * Fetches all decks stored in Supabase for the current authenticated user.
	 */
	async fetchDecks(): Promise<{ data: SyncedDeck[] | null; error: any }> {
		const { data, error } = await supabase
			.from('decks')
			.select('*')
			.order('updated_at', { ascending: false });
		return { data: data as SyncedDeck[] | null, error };
	},

	/**
	 * Saves or updates a deck in Supabase.
	 * If the deck id is not a valid UUID, a new one is generated.
	 */
	async saveDeck(
		deckId: string,
		deckData: Omit<SyncedDeck['cards'], 'id'> & { name: string }
	): Promise<{ data: SyncedDeck | null; error: any; updatedId?: string }> {
		let finalId = deckId;
		let updatedId: string | undefined;

		if (!isValidUUID(deckId)) {
			// Generate a new UUID if the existing local ID is invalid
			finalId = crypto.randomUUID();
			updatedId = finalId;
		}

		const payload = {
			id: finalId,
			name: deckData.name || 'Untitled Deck',
			cards: {
				commander: deckData.commander || [],
				companion: deckData.companion || [],
				mainboard: deckData.mainboard || [],
				sideboard: deckData.sideboard || [],
				maybeboard: deckData.maybeboard || [],
				garbage: deckData.garbage || [],
				activeBoard: deckData.activeBoard || 'mainboard',
				grouping: deckData.grouping || 'cmc',
				sorting: deckData.sorting || 'color',
				sortAscending: deckData.sortAscending !== false,
				splitView: !!deckData.splitView,
				coverArt: deckData.coverArt || null,
				format: deckData.format || 'Commander',
				lastNaturalGrouping: deckData.lastNaturalGrouping || 'cmc',
				metadata: deckData.metadata || {}
			},
			updated_at: new Date().toISOString()
		};

		const { data, error } = await supabase
			.from('decks')
			.upsert(payload)
			.select()
			.single();

		return { data: data as SyncedDeck | null, error, updatedId };
	},

	/**
	 * Deletes a deck from Supabase.
	 */
	async deleteDeck(deckId: string): Promise<{ error: any }> {
		if (!isValidUUID(deckId)) {
			return { error: null }; // Not in cloud anyway
		}
		const { error } = await supabase
			.from('decks')
			.delete()
			.eq('id', deckId);
		return { error };
	}
};
