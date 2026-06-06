import { supabase } from '$lib/supabase';

/**
 * @typedef {import('@supabase/supabase-js').Session} Session
 * @typedef {import('@supabase/supabase-js').User} User
 */

function createAuth() {
	/** @type {Session | null} */
	let session = $state(null);
	/** @type {User | null} */
	let user = $state(null);
	let isLoading = $state(true);

	if (typeof window !== 'undefined') {
		// Initial fetch of session
		supabase.auth.getSession().then(({ data }) => {
			session = data.session;
			user = data.session?.user ?? null;
			isLoading = false;
		});

		// Subscribe to authentication changes (login, logout, token refresh)
		supabase.auth.onAuthStateChange((_event, newSession) => {
			session = newSession;
			user = newSession?.user ?? null;
			isLoading = false;
		});
	}

	return {
		get session() { return session; },
		get user() { return user; },
		get isLoading() { return isLoading; },
		get isAuthenticated() { return !!user; },
		
		/**
		 * Signs out the current user and clears active session details
		 */
		async signOut() {
			isLoading = true;
			const { error } = await supabase.auth.signOut();
			isLoading = false;
			return { error };
		},

		/**
		 * @param {string} displayName
		 */
		async updateDisplayName(displayName) {
			isLoading = true;
			const currentMetadata = user?.user_metadata || {};
			const { data, error } = await supabase.auth.updateUser({
				data: { ...currentMetadata, display_name: displayName }
			});
			if (!error && data?.user) {
				user = data.user;
			}
			isLoading = false;
			return { data, error };
		},

		/**
		 * @param {Object} settings
		 * @param {string} [settings.displayName]
		 * @param {string[]} [settings.favoriteFormats]
		 * @param {string} [settings.defaultLand]
		 * @param {string} [settings.defaultView]
		 */
		async updateUserSettings(settings) {
			isLoading = true;
			const currentMetadata = user?.user_metadata || {};
			const { data, error } = await supabase.auth.updateUser({
				data: {
					...currentMetadata,
					display_name: settings.displayName,
					favorite_formats: settings.favoriteFormats,
					default_land: settings.defaultLand,
					default_view: settings.defaultView
				}
			});
			if (!error && data?.user) {
				user = data.user;
			}
			isLoading = false;
			return { data, error };
		}
	};
}

export const authStore = createAuth();
