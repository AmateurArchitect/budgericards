import { RESOLVED_ART } from "$lib/constants/resolved-art.js";
import { BACKGROUNDS } from "$lib/constants/backgrounds.js";
import selectedArtList from "$lib/constants/selected-art.json";

class LoginBgStore {
	selectedUrls = $state(selectedArtList || []);
	selectedCards = $derived(RESOLVED_ART.filter(card => this.selectedUrls.includes(card.url)));
	availableBackgrounds = $derived(this.selectedCards.length > 0 ? this.selectedCards : BACKGROUNDS);
	
	// Pick initial random index
	initialIndex = Math.floor(
		Math.random() * ((selectedArtList && selectedArtList.length > 0) ? selectedArtList.length : BACKGROUNDS.length)
	);
	currentBgIndex = $state(this.initialIndex);
	currentBg = $derived(this.availableBackgrounds[this.currentBgIndex]);

	preloadedUrl = $state("");

	constructor() {
		if (typeof window !== 'undefined') {
			// Load selection dynamically to sync it
			fetch("/api/save-selection")
				.then(res => {
					if (res.ok) return res.json();
					throw new Error("Failed to fetch selections");
				})
				.then(data => {
					this.selectedUrls = data;
				})
				.catch(err => {
					console.warn("Could not fetch selections dynamically in loginBgStore:", err);
				});

			// Preload the first background immediately
			const list = (selectedArtList && selectedArtList.length > 0)
				? RESOLVED_ART.filter(card => (selectedArtList || []).includes(card.url)) 
				: BACKGROUNDS;
			const bg = list[this.initialIndex];
			if (bg) {
				const img = new Image();
				img.referrerPolicy = "no-referrer";
				img.src = bg.url;
				this.preloadedUrl = bg.url;
				// console.log("Preloaded login background image:", bg.url);
			}
		}
	}
}

export const loginBgStore = new LoginBgStore();
