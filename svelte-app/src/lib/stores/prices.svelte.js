const browser = typeof window !== 'undefined';

function createPriceStore() {
	/** @type {Map<string, any>} */
	let priceMap = $state(new Map());
	/** @type {Map<string, any>} */
	let staplesMap = $state(new Map());
	/** @type {boolean} */
	let isLoading = $state(false);

	async function load() {
		if (priceMap.size > 0 || isLoading) return;
		isLoading = true;
		try {
			const [pricesRes, staplesRes] = await Promise.all([
				fetch('/prices.json'),
				fetch('/staples.json')
			]);

			if (!pricesRes.ok) throw new Error('Failed to load prices');
			const pricesData = await pricesRes.json();
			const pMap = new Map();
			for (const name in pricesData) {
				pMap.set(name.toLowerCase(), pricesData[name]);
			}
			priceMap = pMap;

			if (staplesRes.ok) {
				const staplesData = await staplesRes.json();
				const sMap = new Map();
				for (const name in staplesData) {
					sMap.set(name.toLowerCase(), staplesData[name]);
				}
				staplesMap = sMap;
			}
		} catch (e) {
			console.error('Price load error:', e);
		} finally {
			isLoading = false;
		}
	}

	return {
		get map() { return priceMap; },
		get staples() { return staplesMap; },
		get loading() { return isLoading; },
		load,
		/** @param {string} name */
		getPrice(name) {
			if (!name) return null;
			const lowerName = name.toLowerCase();
			
			// 1. Check for Basic Lands (always legal, usually missing from price lists)
			const basics = ['island', 'forest', 'mountain', 'swamp', 'plains', 'snow-covered island', 'snow-covered forest', 'snow-covered mountain', 'snow-covered swamp', 'snow-covered plains'];
			if (basics.includes(lowerName)) return 0;

			// 2. Try full name match
			if (priceMap.has(lowerName)) return priceMap.get(lowerName).price;

			// 3. Try first part of split name (fallback)
			const splitName = name.split(' // ')[0].toLowerCase();
			if (priceMap.has(splitName)) return priceMap.get(splitName).price;

			return null;
		},
		/** @param {string} name */
		getStaplePrice(name) {
			if (!name) return null;
			const lowerName = name.toLowerCase();
			if (staplesMap.has(lowerName)) return staplesMap.get(lowerName).price;
			const splitName = name.split(' // ')[0].toLowerCase();
			if (staplesMap.has(splitName)) return staplesMap.get(splitName).price;
			return null;
		}
	};
}

export const priceStore = createPriceStore();
