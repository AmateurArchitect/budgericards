import { settingsStore } from './settings.svelte.js';
import { deckStore } from './deck.svelte.js';

/**
 * Layout Store
 * 
 * Centralizes all geometry and sizing calculations for the application.
 * Specifically handles the "Card Sizing Engine" which determines the dynamic width of cards
 * based on viewport constraints and spacing requirements.
 */
class LayoutStore {
	// --- Spacing Configuration ---
	// baseMargin matches the standard app padding (1.25rem = 20px)
	baseMargin = $state(20); 
	
	standardCols = $state(7);
	condensedCols = $state(8);

	// --- App Width Tracking ---
	appWidth = $state(typeof window !== 'undefined' ? document.documentElement.clientWidth : 1920);

	constructor() {
		if (typeof window !== 'undefined') {
			const resizeObserver = new ResizeObserver(() => {
				this.appWidth = document.documentElement.clientWidth;
			});
			resizeObserver.observe(document.documentElement);
		}
	}

	// --- Reactive Derivations ---

	isCondensed = $derived.by(() => {
		if (settingsStore.curveSpacing === "compact") return true;
		if (settingsStore.curveSpacing === "spacious") return false;
		
		const nonBasicCount = deckStore.currentBoardCards.filter((card) => {
			const details = deckStore.metadata[card.name.toLowerCase()];
			if (!details) return true;
			return !details.type_line?.includes("Basic Land");
		}).length;
		
		return nonBasicCount > 40;
	});

	numCols = $derived(this.isCondensed ? this.condensedCols : this.standardCols);
	columnGap = $derived(this.isCondensed ? 12 : 24);

	/** 
	 * Total spacing for card width calculation:
	 * [Left Margin] + [Right Margin] + [Internal Gaps]
	 * Total Horizontal Spacing = (baseMargin * 2) + ((numCols - 1) * columnGap)
	 */
	totalSpacing = $derived.by(() => {
		const edgeMargins = this.baseMargin * 2;
		const internalGaps = (this.numCols - 1) * this.columnGap;
		
		// Add extra spacing for Type Grouping view boundaries
		// Each boundary adds 2 extra gap-equivalents (Gap + Track + Gap = 3x Gap)
		const groupSpacers = (deckStore.grouping === 'type' && deckStore.splitView) ? (6 * this.columnGap) : 0;
		
		return edgeMargins + internalGaps + groupSpacers;
	});

	/** Ideal card width based on actual measured app width */
	cardWidthCalc = $derived(`(${this.appWidth}px - ${this.totalSpacing}px) / ${this.numCols}`);

	/** Final clamped card width */
	cardWidth = $derived(`clamp(120px, min(${this.cardWidthCalc}, 23.5vh), 240px)`);

	/** Layout utility for CSS variables */
	cssVariables = $derived({
		"--card-width": this.cardWidth,
		"--card-height": `calc(${this.cardWidth} * 3.5 / 2.5)`,
		"--column-gap": `${this.columnGap}px`,
		"--num-cols": this.numCols,
		"--base-margin": `${this.baseMargin}px`,
		"--is-condensed": this.isCondensed ? "1" : "0"
	});
}

export const layoutStore = new LayoutStore();
