const browser = typeof window !== 'undefined';

function createSettings() {
	let dpi = $state(96);
	let showImages = $state(true);
	let showPrices = $state(true);
	let showColumnHeaders = $state(true);
	let combine01Drops = $state(true);
	let combine6PlusDrops = $state(true);
	let curveSpacing = $state("auto");
	let useColorIdentity = $state(true);
	let groupTypes = $state(false);
	let combineDuplicates = $state("auto");
	let searchViewMode = $state("grid");
	let searchCardSize = $state("normal");
	let useCommanderColors = $state(false);
	let matchCompanion = $state(false);
	let deckViewMode = $state("stacks");
	let visibleColumns = $state(['mana', 'cmc', 'type', 'printing', 'color-cat', 'color-id', 'tags', 'price']);
	let showTotalPrice = $state(false);
	let spoilerCardSize = $state(0.75);

	if (browser) {
		const isMac = navigator.userAgent.includes('Mac');
		const defaultDpi = isMac ? 128 : 96;

		const savedDpi = localStorage.getItem('budgericards_dpi');
		dpi = savedDpi ? parseInt(savedDpi, 10) : defaultDpi;
		
		showImages = localStorage.getItem('budgericards_show_images') !== 'false';
		showPrices = localStorage.getItem('budgericards_show_prices') !== 'false';
		showColumnHeaders = localStorage.getItem('budgericards_show_column_headers') !== 'false';
		combine01Drops = localStorage.getItem('budgericards_combine_01_drops') !== 'false';
		combine6PlusDrops = localStorage.getItem('budgericards_combine_6plus_drops') !== 'false';
		curveSpacing = localStorage.getItem('budgericards_curve_spacing') || 'auto';
		useColorIdentity = localStorage.getItem('budgericards_use_color_identity') !== 'false';
		groupTypes = localStorage.getItem('budgericards_group_types') === 'true';
		combineDuplicates = localStorage.getItem('budgericards_combine_duplicates') || 'auto';
		searchViewMode = localStorage.getItem('budgericards_search_view_mode') || 'grid';
		searchCardSize = localStorage.getItem('budgericards_search_card_size') || 'normal';
		useCommanderColors = localStorage.getItem('budgericards_use_commander_colors') === 'true';
		matchCompanion = localStorage.getItem('budgericards_match_companion') === 'true';
		deckViewMode = localStorage.getItem('budgericards_deck_view_mode') || 'stacks';
		
		const savedCols = localStorage.getItem('budgericards_visible_columns');
		if (savedCols) {
			try {
				visibleColumns = JSON.parse(savedCols);
			} catch (e) {
				visibleColumns = ['mana', 'cmc', 'type', 'printing', 'color-cat', 'color-id', 'tags', 'price'];
			}
		}
		showTotalPrice = localStorage.getItem('budgericards_show_total_price') === 'true';
		const savedSize = localStorage.getItem('budgericards_spoiler_card_size');
		spoilerCardSize = savedSize ? parseFloat(savedSize) : 0.75;
	}

	return {
		get dpi() { return dpi; },
		set dpi(val) {
			dpi = val;
			if (browser) localStorage.setItem('budgericards_dpi', String(val));
		},
		get physicalCardWidth() {
			return 2.5 * dpi;
		},
		get showImages() { return showImages; },
		set showImages(val) {
			showImages = val;
			if (browser) localStorage.setItem('budgericards_show_images', String(val));
		},
		get showPrices() { return showPrices; },
		set showPrices(val) {
			showPrices = val;
			if (browser) localStorage.setItem('budgericards_show_prices', String(val));
		},
		get showColumnHeaders() { return showColumnHeaders; },
		set showColumnHeaders(val) {
			showColumnHeaders = val;
			if (browser) localStorage.setItem('budgericards_show_column_headers', String(val));
		},
		get combine01Drops() { return combine01Drops; },
		set combine01Drops(val) {
			combine01Drops = val;
			if (browser) localStorage.setItem('budgericards_combine_01_drops', String(val));
		},
		get combine6PlusDrops() { return combine6PlusDrops; },
		set combine6PlusDrops(val) {
			combine6PlusDrops = val;
			if (browser) localStorage.setItem('budgericards_combine_6plus_drops', String(val));
		},
		get curveSpacing() { return curveSpacing; },
		set curveSpacing(val) {
			curveSpacing = val;
			if (browser) localStorage.setItem('budgericards_curve_spacing', val);
		},
		get useColorIdentity() { return useColorIdentity; },
		set useColorIdentity(val) {
			useColorIdentity = val;
			if (browser) localStorage.setItem('budgericards_use_color_identity', String(val));
		},
		get groupTypes() { return groupTypes; },
		set groupTypes(val) {
			groupTypes = val;
			if (browser) localStorage.setItem('budgericards_group_types', String(val));
		},
		get combineDuplicates() { return combineDuplicates; },
		set combineDuplicates(val) {
			combineDuplicates = val;
			if (browser) localStorage.setItem('budgericards_combine_duplicates', val);
		},
		get searchViewMode() { return searchViewMode; },
		set searchViewMode(val) {
			searchViewMode = val;
			if (browser) localStorage.setItem('budgericards_search_view_mode', val);
		},
		get searchCardSize() { return searchCardSize; },
		set searchCardSize(val) {
			searchCardSize = val;
			if (browser) localStorage.setItem('budgericards_search_card_size', val);
		},
		get useCommanderColors() { return useCommanderColors; },
		set useCommanderColors(val) {
			useCommanderColors = val;
			if (browser) localStorage.setItem('budgericards_use_commander_colors', String(val));
		},
		get matchCompanion() { return matchCompanion; },
		set matchCompanion(val) {
			matchCompanion = val;
			if (browser) localStorage.setItem('budgericards_match_companion', String(val));
		},
		get deckViewMode() { return deckViewMode; },
		set deckViewMode(val) {
			deckViewMode = val;
			if (browser) localStorage.setItem('budgericards_deck_view_mode', val);
		},
		get visibleColumns() { return visibleColumns; },
		set visibleColumns(val) {
			visibleColumns = val;
			if (browser) localStorage.setItem('budgericards_visible_columns', JSON.stringify(val));
		},
		get showTotalPrice() { return showTotalPrice; },
		set showTotalPrice(val) {
			showTotalPrice = val;
			if (browser) localStorage.setItem('budgericards_show_total_price', String(val));
		},
		get spoilerCardSize() { return spoilerCardSize; },
		set spoilerCardSize(val) {
			const numVal = parseFloat(val);
			// Round cleanly to the nearest 5% increment (0.05 step)
			const snappedVal = Math.round(numVal * 20) / 20;
			spoilerCardSize = snappedVal;
			if (browser) localStorage.setItem('budgericards_spoiler_card_size', String(snappedVal));
		}
	};
}

export const settingsStore = createSettings();
