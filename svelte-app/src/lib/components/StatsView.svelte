<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import MoreView from "./MoreView.svelte";
	import { parseManaCost } from "$lib/layouts/grouping.svelte.js";
	import { onMount } from "svelte";
	import { fade, fly, slide } from "svelte/transition";
	import {
		BarChart3,
		PieChart,
		Coins,
		Layers,
		Compass,
		ArrowRight,
		ChevronRight,
		Sparkles,
		Flame,
		Shield,
		CheckCircle2,
		AlertCircle,
		TrendingUp,
		DollarSign,
	} from "lucide-svelte";

	// Gather active cards
	const activeCards = $derived([
		...deckStore.commander,
		...deckStore.companion,
		...deckStore.mainboard,
	]);

	/**
	 * @param {string} name
	 */
	function getMeta(name) {
		return deckStore.metadata[name.toLowerCase()] || {};
	}

	/**
	 * Extracts computed stats for a card respecting user overrides from deckbuilder
	 * @param {any} card
	 */
	function getCardStats(card) {
		const name = card.name || "";
		const meta = getMeta(name);
		const overrides = card.overrides || {};

		const cmc =
			overrides.manaValue !== undefined
				? Number(overrides.manaValue)
				: (card.cmc !== undefined ? Number(card.cmc) : Number(meta.cmc ?? 0));

		const typeLine =
			overrides.primaryType !== undefined
				? overrides.primaryType
				: (card.type_line || meta.type_line || "");

		const colors =
			overrides.colors !== undefined
				? overrides.colors
				: (card.colors || meta.colors || []);

		const colorIdentity =
			overrides.colorIdentity !== undefined
				? overrides.colorIdentity
				: (card.color_identity || meta.color_identity || []);

		const colorCategory = overrides.colorCategory || null;

		const manaCost = meta.mana_cost || card.mana_cost || "";

		return {
			cmc,
			typeLine,
			colors,
			colorIdentity,
			colorCategory,
			manaCost,
			meta,
		};
	}

	/**
	 * Maps a card type line or overrides to Andrew Gioia's Mana Font icon class
	 * @param {string} [typeLine]
	 * @param {any} [card]
	 */
	function getCardTypeIcon(typeLine = "", card = null) {
		if (card?.overrides?.creature === true) return "ms-creature";
		const lower = (typeLine || "").toLowerCase();
		if (lower.includes("creature")) return "ms-creature";
		if (lower.includes("planeswalker")) return "ms-planeswalker";
		if (lower.includes("instant")) return "ms-instant";
		if (lower.includes("sorcery")) return "ms-sorcery";
		if (lower.includes("battle")) return lower.includes("siege") ? "ms-battle-siege" : "ms-battle";
		if (lower.includes("artifact")) return "ms-artifact";
		if (lower.includes("enchantment")) return "ms-enchantment";
		if (lower.includes("land")) return "ms-land";
		if (lower.includes("tribal")) return "ms-tribal";
		if (lower.includes("conspiracy")) return "ms-conspiracy";
		if (lower.includes("phenomenon")) return "ms-phenomenon";
		if (lower.includes("plane")) return "ms-plane";
		if (lower.includes("scheme")) return "ms-scheme";
		if (lower.includes("vanguard")) return "ms-vanguard";
		return "";
	}

	/**
	 * Returns the color for a card type matching the mana curve palette
	 * @param {string} [typeLine]
	 * @param {any} [card]
	 */
	function getCardTypeColor(typeLine = "", card = null) {
		if (curveGroupingMode === "pips") {
			return "hsl(var(--muted-foreground))";
		}

		const isCreature =
			card?.overrides?.creature !== undefined
				? card.overrides.creature
				: (typeLine || "").toLowerCase().includes("creature");

		if (curveGroupingMode === "creatures") {
			return isCreature ? "#f97316" : "#0284c7";
		}

		if (isCreature) return "#f97316";

		const lower = (typeLine || "").toLowerCase();
		if (lower.includes("instant")) return "#38bdf8";
		if (lower.includes("sorcery")) return "#818cf8";
		if (lower.includes("planeswalker")) return "#a855f7";
		if (lower.includes("artifact")) return "#94a3b8";
		if (lower.includes("enchantment")) return "#ec4899";
		if (lower.includes("battle")) return "#f59e0b";
		if (lower.includes("land")) return "#84cc16";
		return "#94a3b8";
	}

	/**
	 * Retrieves normal card image URL for popover tooltips
	 * @param {string} name
	 */
	function getCardTooltipImg(name) {
		const meta = getMeta(name);
		return (
			meta.image_uris?.normal ||
			meta.card_faces?.[0]?.image_uris?.normal ||
			meta.image_uris?.small ||
			""
		);
	}

	/**
	 * Retrieves multi-face card image URLs comma-separated for double-sided tooltips
	 * @param {string} name
	 */
	function getCardTooltipImgs(name) {
		const meta = getMeta(name);
		if (meta.card_faces && meta.card_faces.length > 1 && meta.card_faces[0]?.image_uris?.normal) {
			return meta.card_faces
				.map((/** @type {any} */ f) => f.image_uris?.normal)
				.filter(Boolean)
				.join(",");
		}
		return "";
	}

	// Active Commander & Featured Artwork
	const commanderCard = $derived(
		deckStore.commander[0] ||
			deckStore.companion[0] ||
			deckStore.mainboard[0] ||
			null,
	);

	const featuredArt = $derived(() => {
		if (deckStore.coverArt) return deckStore.coverArt;
		if (!commanderCard) return null;
		const meta = getMeta(commanderCard.name);
		return (
			meta.image_uris?.art_crop ||
			meta.card_faces?.[0]?.image_uris?.art_crop ||
			meta.image_uris?.normal ||
			null
		);
	});

	// Deck Color Identity
	const deckColorIdentity = $derived(() => {
		const identitySet = new Set();
		const list = deckStore.commander.length > 0 ? deckStore.commander : activeCards;
		list.forEach((/** @type {any} */ c) => {
			const stats = getCardStats(c);
			(stats.colorIdentity || []).forEach((/** @type {string} */ col) =>
				identitySet.add(col),
			);
		});
		const order = ["W", "U", "B", "R", "G", "C"];
		return order.filter((c) => identitySet.has(c));
	});

	// 1. MANA CURVE CALCULATIONS
	let curveGroupingMode = $state("creatures"); // 'creatures' | 'types' | 'pips'
	let selectedCmc = $state(/** @type {string | null} */ (null));

	const cmcData = $derived.by(() => {
		// 1. Helper functions matching stacks.svelte.js rules
		/** @param {string} key */
		function getCmcValue(key) {
			if (key === "0-1") {
				return settingsStore.combine01Drops ? 1 : null;
			}
			if (key === "6+") {
				return settingsStore.combine6PlusDrops ? 6 : null;
			}
			if (typeof key === "string" && key.match(/^\d+$/)) {
				const num = parseInt(key, 10);
				if (settingsStore.combine01Drops && (num === 0 || num === 1)) return null;
				if (settingsStore.combine6PlusDrops && num >= 6) return null;
				return num;
			}
			return null;
		}

		/** @param {number} val */
		function getCmcKeyForValue(val) {
			if (settingsStore.combine01Drops && (val === 0 || val === 1)) {
				return "0-1";
			}
			if (settingsStore.combine6PlusDrops && val >= 6) {
				return "6+";
			}
			return val.toString();
		}

		// 2. Collect all non-land cards and map them to CMC keys
		/** @type {{ card: any, stats: any, cmc: number, qty: number, typeLine: string }[]} */
		const nonLandItems = [];
		/** @type {Record<string, typeof nonLandItems>} */
		const cardBucketsMap = {};

		activeCards.forEach((/** @type {any} */ c) => {
			const stats = getCardStats(c);
			const typeLine = stats.typeLine.toLowerCase();
			if (typeLine.includes("land")) return; // exclude lands from curve

			const cmc = Math.max(0, Math.floor(stats.cmc));
			const qty = c.quantity || 1;
			const item = { card: c, stats, cmc, qty, typeLine };
			nonLandItems.push(item);

			const key = getCmcKeyForValue(cmc);
			if (!cardBucketsMap[key]) {
				cardBucketsMap[key] = [];
			}
			cardBucketsMap[key].push(item);
		});

		// 3. Determine visible bucket keys following stacks.svelte.js gap-filling rules
		const cmcKeysWithCards = Object.keys(cardBucketsMap).filter((key) => {
			const val = getCmcValue(key);
			return val !== null && cardBucketsMap[key].length > 0;
		});

		/** @type {string[]} */
		const orderedKeys = [];

		if (cmcKeysWithCards.length === 0) {
			// Fallback placeholder when no spells exist
			const defaultUpper = settingsStore.combine6PlusDrops ? 6 : 6;
			for (let i = 1; i <= defaultUpper; i++) {
				const k = getCmcKeyForValue(i);
				if (!orderedKeys.includes(k)) orderedKeys.push(k);
			}
		} else {
			const values = cmcKeysWithCards.map((k) => /** @type {number} */ (getCmcValue(k)));
			const min = Math.min(...values);
			const max = Math.max(...values);

			for (let i = min; i <= max; i++) {
				const key = getCmcKeyForValue(i);
				if (!orderedKeys.includes(key)) {
					orderedKeys.push(key);
				}
			}
		}

		/**
		 * @param {string} key
		 * @param {any[]} bItems
		 */
		function getBucketLabels(key, bItems) {
			if (key === "0-1") {
				let bHas0 = false;
				let bHas1 = false;
				for (const item of bItems) {
					if (item.cmc === 0) bHas0 = true;
					if (item.cmc === 1) bHas1 = true;
					if (bHas0 && bHas1) break;
				}
				if (bHas0 && bHas1) return { label: "0 & 1-drop", shortLabel: "0 & 1" };
				if (bHas0) return { label: "0-drop", shortLabel: "0" };
				if (bHas1) return { label: "1-drop", shortLabel: "1" };
				return { label: "0 & 1-drop", shortLabel: "0 & 1" };
			}
			if (key === "6+") {
				return { label: "6+-drop", shortLabel: "6+" };
			}
			return { label: `${key}-drop`, shortLabel: key };
		}

		const buckets = orderedKeys.map((key) => {
			const bItems = cardBucketsMap[key] || [];
			const { label, shortLabel } = getBucketLabels(key, bItems);
			return {
				key,
				label,
				shortLabel,
				creatures: 0,
				nonCreatures: 0,
				types: {
					creatures: 0,
					instants: 0,
					sorceries: 0,
					artifacts: 0,
					enchantments: 0,
					planeswalkers: 0,
					other: 0,
				},
				pips: /** @type {Record<string, number>} */ ({
					GEN: 0,
					C: 0,
					W: 0,
					U: 0,
					B: 0,
					R: 0,
					G: 0,
				}),
				pipsShare: /** @type {Record<string, number>} */ ({
					GEN: 0,
					C: 0,
					W: 0,
					U: 0,
					B: 0,
					R: 0,
					G: 0,
				}),
				totalPips: 0,
				total: 0,
				cards: /** @type {{ name: string, qty: number, mana_cost: string, type_line: string, price: number, cmc: number, overrides?: any, colors?: string[], colorIdentity?: string[] }[]} */ ([]),
			};
		});

		// 4. Populate each bucket from nonLandItems
		nonLandItems.forEach(({ card: c, stats, cmc, qty, typeLine }) => {
			const key = getCmcKeyForValue(cmc);
			const bucket = buckets.find((b) => b.key === key);
			if (!bucket) return;

			bucket.total += qty;
			bucket.cards.push({
				name: c.name,
				qty,
				mana_cost: stats.manaCost,
				type_line: stats.typeLine,
				price: c.price || 0,
				cmc: stats.cmc,
				overrides: c.overrides,
				colors: stats.colors || [],
				colorIdentity: stats.colorIdentity || [],
			});

			const isCreature =
				c.overrides?.creature !== undefined
					? c.overrides.creature
					: typeLine.includes("creature");

			if (isCreature) {
				bucket.creatures += qty;
				bucket.types.creatures += qty;
			} else {
				bucket.nonCreatures += qty;
				if (typeLine.includes("instant")) bucket.types.instants += qty;
				else if (typeLine.includes("sorcery")) bucket.types.sorceries += qty;
				else if (typeLine.includes("planeswalker")) bucket.types.planeswalkers += qty;
				else if (typeLine.includes("artifact")) bucket.types.artifacts += qty;
				else if (typeLine.includes("enchantment")) bucket.types.enchantments += qty;
				else bucket.types.other += qty;
			}

			// Parse mana symbols for this card (Generic numbers, Colorless C, and Colored WUBRG)
			/** @type {Record<string, number>} */
			const cardPips = { GEN: 0, C: 0, W: 0, U: 0, B: 0, R: 0, G: 0 };
			let cardPipsTotal = 0;
			const cost = stats.manaCost;
			const matches = cost.match(/\{([^}]+)\}/g) || [];
			matches.forEach((/** @type {string} */ sym) => {
				const clean = sym.replace(/[{}]/g, "").toUpperCase();
				if (clean === "W") {
					cardPips.W += 1;
					cardPipsTotal += 1;
				} else if (clean === "U") {
					cardPips.U += 1;
					cardPipsTotal += 1;
				} else if (clean === "B") {
					cardPips.B += 1;
					cardPipsTotal += 1;
				} else if (clean === "R") {
					cardPips.R += 1;
					cardPipsTotal += 1;
				} else if (clean === "G") {
					cardPips.G += 1;
					cardPipsTotal += 1;
				} else if (clean === "C") {
					cardPips.C += 1;
					cardPipsTotal += 1;
				} else if (!isNaN(Number(clean)) && Number(clean) > 0) {
					const genVal = Number(clean);
					cardPips.GEN += genVal;
					cardPipsTotal += genVal;
				} else if (clean.includes("/")) {
					const [a, b] = clean.split("/");
					if (b === "P") {
						if (cardPips[a] !== undefined) {
							cardPips[a] += 1;
							cardPipsTotal += 1;
						}
					} else if (a === "2") {
						if (cardPips[b] !== undefined) {
							cardPips[b] += 1;
						}
						cardPips.GEN += 1;
						cardPipsTotal += 2;
					} else {
						if (cardPips[a] !== undefined) cardPips[a] += 0.5;
						if (cardPips[b] !== undefined) cardPips[b] += 0.5;
						cardPipsTotal += 1;
					}
				}
			});

			const expectedCardCost = stats.cmc > 0 ? stats.cmc : cardPipsTotal;
			if (expectedCardCost > cardPipsTotal) {
				const diff = expectedCardCost - cardPipsTotal;
				cardPips.GEN += diff;
				cardPipsTotal += diff;
			}

			// Add raw pips to bucket (multiplied by qty)
			for (const [col, val] of Object.entries(cardPips)) {
				bucket.pips[col] += val * qty;
				bucket.totalPips += val * qty;
			}

			// Proportional mana share
			if (cardPipsTotal > 0) {
				for (const [col, val] of Object.entries(cardPips)) {
					const share = (val / cardPipsTotal) * qty;
					bucket.pipsShare[col] += share;
				}
			} else {
				bucket.pipsShare.GEN += qty;
			}
		});

		// Sort cards in each bucket alphabetically by name
		buckets.forEach((b) => {
			b.cards.sort((a, b) => a.name.localeCompare(b.name));
		});

		const maxCount = Math.max(...buckets.map((b) => b.total), 1);
		const maxPips = Math.max(...buckets.map((b) => b.totalPips), 1);

		/** @type {Record<string, number>} */
		const totalDeckPips = { GEN: 0, C: 0, W: 0, U: 0, B: 0, R: 0, G: 0 };
		buckets.forEach((b) => {
			totalDeckPips.GEN += b.pips.GEN;
			totalDeckPips.C += b.pips.C;
			totalDeckPips.W += b.pips.W;
			totalDeckPips.U += b.pips.U;
			totalDeckPips.B += b.pips.B;
			totalDeckPips.R += b.pips.R;
			totalDeckPips.G += b.pips.G;
		});

		/** @type {Record<string, { name: string, color: string, code: string, symbol: string }>} */
		const pipColorsMap = {
			GEN: { name: "Generic", color: "#8A8480", code: "GEN", symbol: "1" },
			C: { name: "Colorless", color: "#9E9792", code: "C", symbol: "c" },
			W: { name: "White", color: "#D6D3B3", code: "W", symbol: "w" },
			U: { name: "Blue", color: "#538CA7", code: "U", symbol: "u" },
			B: { name: "Black", color: "#5F5457", code: "B", symbol: "b" },
			R: { name: "Red", color: "#B36450", code: "R", symbol: "r" },
			G: { name: "Green", color: "#60906A", code: "G", symbol: "g" },
		};

		const activePipColors = ["GEN", "C", "W", "U", "B", "R", "G"]
			.filter((col) => totalDeckPips[col] > 0)
			.map((col) => ({
				code: col,
				name: pipColorsMap[col].name,
				color: pipColorsMap[col].color,
				symbol: pipColorsMap[col].symbol,
				total: Math.round(totalDeckPips[col]),
			}));

		return { buckets, maxCount, maxPips, activePipColors };
	});

	// Cards displayed in the Mana Curve inspector drawer
	const drawerCards = $derived.by(() => {
		if (selectedCmc === null) {
			return [];
		}
		const selectedBucket = cmcData.buckets.find((b) => b.key === selectedCmc);
		const cards = [...(selectedBucket?.cards || [])];

		if (curveGroupingMode === "creatures") {
			cards.sort((a, b) => {
				const aCreature =
					a.overrides?.creature !== undefined
						? a.overrides.creature
						: (a.type_line || "").toLowerCase().includes("creature");
				const bCreature =
					b.overrides?.creature !== undefined
						? b.overrides.creature
						: (b.type_line || "").toLowerCase().includes("creature");
				if (aCreature !== bCreature) return aCreature ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
		} else if (curveGroupingMode === "types") {
			const getTypeRank = (/** @type {any} */ c) => {
				const isCreature =
					c.overrides?.creature !== undefined
						? c.overrides.creature
						: (c.type_line || "").toLowerCase().includes("creature");
				if (isCreature) return 1;
				const lower = (c.type_line || "").toLowerCase();
				if (lower.includes("instant")) return 2;
				if (lower.includes("sorcery")) return 3;
				if (lower.includes("artifact")) return 4;
				if (lower.includes("enchantment")) return 5;
				if (lower.includes("planeswalker")) return 6;
				if (lower.includes("battle")) return 7;
				return 8;
			};
			cards.sort((a, b) => {
				const diff = getTypeRank(a) - getTypeRank(b);
				if (diff !== 0) return diff;
				return a.name.localeCompare(b.name);
			});
		} else if (curveGroupingMode === "pips") {
			const getPipRank = (/** @type {any} */ c) => {
				const colors = c.colors || [];
				if (colors.length === 0) {
					const cost = c.mana_cost || "";
					return cost.includes("{C}") ? 2 : 1; // 1: Generic, 2: Colorless
				}
				if (colors.length === 1) {
					const col = colors[0];
					if (col === "W") return 3;
					if (col === "U") return 4;
					if (col === "B") return 5;
					if (col === "R") return 6;
					if (col === "G") return 7;
				}
				return 8; // Multicolor
			};
			cards.sort((a, b) => {
				const diff = getPipRank(a) - getPipRank(b);
				if (diff !== 0) return diff;
				return a.name.localeCompare(b.name);
			});
		}
		return cards;
	});

	// Curve summary stats
	const curveStats = $derived.by(() => {
		let totalNonLandCount = 0;
		let totalCmcSum = 0;
		let totalDeckCmcSum = 0;
		/** @type {number[]} */
		const cmcValues = [];

		activeCards.forEach((/** @type {any} */ c) => {
			const stats = getCardStats(c);
			const typeLine = stats.typeLine.toLowerCase();
			const cmc = stats.cmc;
			const qty = c.quantity || 1;
			totalDeckCmcSum += cmc * qty;

			if (!typeLine.includes("land")) {
				totalNonLandCount += qty;
				totalCmcSum += cmc * qty;
				for (let i = 0; i < qty; i++) {
					cmcValues.push(cmc);
				}
			}
		});

		const avgNonLand =
			totalNonLandCount > 0 ? totalCmcSum / totalNonLandCount : 0;
		const avgDeck =
			activeCards.length > 0 ? totalDeckCmcSum / activeCards.length : 0;

		cmcValues.sort((a, b) => a - b);
		const median =
			cmcValues.length > 0
				? cmcValues[Math.floor(cmcValues.length / 2)]
				: 0;

		// Find peak / mode
		let peakLabel = "";
		let peakCount = 0;
		cmcData.buckets.forEach((b) => {
			if (b.total > peakCount) {
				peakCount = b.total;
				peakLabel = b.shortLabel;
			}
		});

		// Early (0-2), Mid (3-4), Late (5+)
		let earlyCount = 0;
		let midCount = 0;
		let lateCount = 0;
		cmcValues.forEach((val) => {
			if (val <= 2) earlyCount += 1;
			else if (val <= 4) midCount += 1;
			else lateCount += 1;
		});

		const totalPipsSum = Math.round(
			cmcData.buckets.reduce((acc, b) => acc + b.totalPips, 0),
		);

		return {
			avgNonLand: avgNonLand.toFixed(2),
			avgDeck: avgDeck.toFixed(2),
			median: median.toFixed(1),
			peakCmc: peakLabel || "—",
			peakCount,
			totalCmcSum,
			totalPipsSum,
			totalNonLandCount,
			early: {
				count: earlyCount,
				pct: totalNonLandCount > 0 ? Math.round((earlyCount / totalNonLandCount) * 100) : 0,
			},
			mid: {
				count: midCount,
				pct: totalNonLandCount > 0 ? Math.round((midCount / totalNonLandCount) * 100) : 0,
			},
			late: {
				count: lateCount,
				pct: totalNonLandCount > 0 ? Math.round((lateCount / totalNonLandCount) * 100) : 0,
			},
		};
	});

	// 2. CARD TYPES & SUBTYPES CALCULATIONS
	let selectedTypeFilter = $state(/** @type {string | null} */ (null));

	const cardTypesData = $derived.by(() => {
		/** @type {Record<string, { count: number, color: string, cards: any[] }>} */
		const types = {
			Creatures: { count: 0, color: "#f97316", cards: [] },
			Instants: { count: 0, color: "#38bdf8", cards: [] },
			Sorceries: { count: 0, color: "#818cf8", cards: [] },
			Artifacts: { count: 0, color: "#94a3b8", cards: [] },
			Enchantments: { count: 0, color: "#ec4899", cards: [] },
			Planeswalkers: { count: 0, color: "#a855f7", cards: [] },
			Lands: { count: 0, color: "#84cc16", cards: [] },
			Battles: { count: 0, color: "#f59e0b", cards: [] },
			Other: { count: 0, color: "#64748b", cards: [] },
		};

		const creatureSubtypes = /** @type {Record<string, number>} */ ({});
		const artifactSubtypes = /** @type {Record<string, number>} */ ({});
		const landSubtypes = /** @type {Record<string, number>} */ ({});

		let permanentsCount = 0;
		let nonPermanentsCount = 0;

		activeCards.forEach((/** @type {any} */ c) => {
			const stats = getCardStats(c);
			const typeLine = stats.typeLine;
			const lowerType = typeLine.toLowerCase();
			const qty = c.quantity || 1;

			const cardEntry = {
				name: c.name,
				qty,
				type_line: typeLine,
				mana_cost: stats.manaCost,
				price: c.price || 0,
				cmc: stats.cmc,
				overrides: c.overrides,
			};

			const isCreature =
				c.overrides?.creature !== undefined
					? c.overrides.creature
					: lowerType.includes("creature");

			const isPermanent =
				isCreature ||
				lowerType.includes("artifact") ||
				lowerType.includes("enchantment") ||
				lowerType.includes("planeswalker") ||
				lowerType.includes("land") ||
				lowerType.includes("battle");

			if (isPermanent) permanentsCount += qty;
			else nonPermanentsCount += qty;

			if (isCreature) {
				types.Creatures.count += qty;
				types.Creatures.cards.push(cardEntry);
			} else if (lowerType.includes("instant")) {
				types.Instants.count += qty;
				types.Instants.cards.push(cardEntry);
			} else if (lowerType.includes("sorcery")) {
				types.Sorceries.count += qty;
				types.Sorceries.cards.push(cardEntry);
			} else if (lowerType.includes("planeswalker")) {
				types.Planeswalkers.count += qty;
				types.Planeswalkers.cards.push(cardEntry);
			} else if (lowerType.includes("artifact")) {
				types.Artifacts.count += qty;
				types.Artifacts.cards.push(cardEntry);
			} else if (lowerType.includes("enchantment")) {
				types.Enchantments.count += qty;
				types.Enchantments.cards.push(cardEntry);
			} else if (lowerType.includes("land")) {
				types.Lands.count += qty;
				types.Lands.cards.push(cardEntry);
			} else if (lowerType.includes("battle")) {
				types.Battles.count += qty;
				types.Battles.cards.push(cardEntry);
			} else {
				types.Other.count += qty;
				types.Other.cards.push(cardEntry);
			}

			// Subtypes parsing
			if (typeLine.includes("—")) {
				const parts = typeLine.split("—");
				const main = parts[0].toLowerCase();
				const subStr = parts[1] || "";
				const subs = subStr
					.trim()
					.split(/\s+/)
					.filter(Boolean);

				subs.forEach((/** @type {string} */ sub) => {
					const clean = sub.trim();
					if (main.includes("creature") || isCreature) {
						creatureSubtypes[clean] =
							(creatureSubtypes[clean] || 0) + qty;
					} else if (main.includes("artifact")) {
						artifactSubtypes[clean] =
							(artifactSubtypes[clean] || 0) + qty;
					} else if (main.includes("land")) {
						landSubtypes[clean] = (landSubtypes[clean] || 0) + qty;
					}
				});
			}
		});

		const creaturesCount = types.Creatures.count;
		const nonCreaturesCount =
			activeCards.reduce((acc, c) => acc + (c.quantity || 1), 0) -
			creaturesCount;
		const landsCount = types.Lands.count;
		const landsPct = Math.round(
			(landsCount / Math.max(activeCards.length, 1)) * 100,
		);

		const sortedCreatureSubtypes = Object.entries(creatureSubtypes)
			.sort((a, b) => b[1] - a[1])
			.slice(0, 16);

		const activeTypesList = Object.entries(types)
			.filter(([_, info]) => info.count > 0)
			.map(([type, info]) => ({
				type,
				count: info.count,
				color: info.color,
				cards: info.cards,
				icon: getCardTypeIcon(type),
				pct: Math.round(
					(info.count / Math.max(activeCards.length, 1)) * 100,
				),
			}));

		return {
			activeTypesList,
			permanentsCount,
			nonPermanentsCount,
			permanentsPct: Math.round((permanentsCount / Math.max(activeCards.length, 1)) * 100),
			nonPermanentsPct: Math.round((nonPermanentsCount / Math.max(activeCards.length, 1)) * 100),
			sortedCreatureSubtypes,
			creaturesCount,
			nonCreaturesCount,
			landsCount,
			landsPct,
		};
	});

	// 3. COLORS & MANA BASE CALCULATIONS
	const colorBreakdownData = $derived.by(() => {
		/** @type {Record<string, { name: string, count: number, color: string }>} */
		const pips = {
			W: { name: "White", count: 0, color: "#f9fafb" },
			U: { name: "Blue", count: 0, color: "#38bdf8" },
			B: { name: "Black", count: 0, color: "#334155" },
			R: { name: "Red", count: 0, color: "#ef4444" },
			G: { name: "Green", count: 0, color: "#22c55e" },
			C: { name: "Colorless", count: 0, color: "#94a3b8" },
		};

		/** @type {Record<string, { count: number, name: string }>} */
		const sources = {
			W: { count: 0, name: "White" },
			U: { count: 0, name: "Blue" },
			B: { count: 0, name: "Black" },
			R: { count: 0, name: "Red" },
			G: { count: 0, name: "Green" },
			C: { count: 0, name: "Colorless" },
		};

		let totalPips = 0;
		let monoColorCount = 0;
		let multiColorCount = 0;
		let colorlessSpellsCount = 0;
		let landsCount = 0;

		activeCards.forEach((/** @type {any} */ c) => {
			const stats = getCardStats(c);
			const meta = stats.meta;
			const typeLine = stats.typeLine.toLowerCase();
			const qty = c.quantity || 1;
			const isLand = typeLine.includes("land");

			if (isLand) {
				landsCount += qty;
			} else {
				const colors = stats.colors || [];
				if (stats.colorCategory) {
					if (stats.colorCategory === "Colorless") colorlessSpellsCount += qty;
					else if (stats.colorCategory === "Multicolor") multiColorCount += qty;
					else monoColorCount += qty;
				} else {
					if (colors.length === 0) colorlessSpellsCount += qty;
					else if (colors.length === 1) monoColorCount += qty;
					else multiColorCount += qty;
				}

				// Parse mana pips from mana_cost
				const cost = stats.manaCost;
				const matches = cost.match(/\{([^}]+)\}/g) || [];
				matches.forEach((/** @type {string} */ sym) => {
					const clean = sym.replace(/[{}]/g, "").toUpperCase();
					if (clean === "W") { pips.W.count += qty; totalPips += qty; }
					else if (clean === "U") { pips.U.count += qty; totalPips += qty; }
					else if (clean === "B") { pips.B.count += qty; totalPips += qty; }
					else if (clean === "R") { pips.R.count += qty; totalPips += qty; }
					else if (clean === "G") { pips.G.count += qty; totalPips += qty; }
					else if (clean === "C") { pips.C.count += qty; totalPips += qty; }
					else if (clean.includes("/")) {
						// Hybrid mana: assign to both
						const [a, b] = clean.split("/");
						if (pips[a]) { pips[a].count += qty * 0.5; totalPips += qty * 0.5; }
						if (pips[b]) { pips[b].count += qty * 0.5; totalPips += qty * 0.5; }
					}
				});
			}

			// Parse mana sources (lands and mana-producing non-lands)
			const produced = meta.produced_mana || [];
			if (produced.length > 0) {
				produced.forEach((/** @type {string} */ p) => {
					const upper = p.toUpperCase();
					if (sources[upper]) sources[upper].count += qty;
				});
			} else if (isLand) {
				// Basic land or text fallback
				const nameLower = c.name.toLowerCase();
				if (nameLower.includes("plains")) sources.W.count += qty;
				if (nameLower.includes("island")) sources.U.count += qty;
				if (nameLower.includes("swamp")) sources.B.count += qty;
				if (nameLower.includes("mountain")) sources.R.count += qty;
				if (nameLower.includes("forest")) sources.G.count += qty;
				if (nameLower.includes("wastes")) sources.C.count += qty;
			}
		});

		const activeColors = ["W", "U", "B", "R", "G", "C"].filter(
			(col) => pips[col].count > 0 || sources[col].count > 0,
		);

		const totalSources = Object.values(sources).reduce((acc, s) => acc + s.count, 0);

		const colorList = activeColors.map((col) => {
			const pipCount = Math.round(pips[col].count);
			const pipPct = totalPips > 0 ? Math.round((pips[col].count / totalPips) * 100) : 0;
			const sourceCount = sources[col].count;
			const sourcePct = totalSources > 0 ? Math.round((sourceCount / totalSources) * 100) : 0;

			return {
				symbol: col.toLowerCase(),
				code: col,
				name: pips[col].name,
				color: pips[col].color,
				pipCount,
				pipPct,
				sourceCount,
				sourcePct,
			};
		});

		return {
			colorList,
			totalPips: Math.round(totalPips),
			totalSources,
			monoColorCount,
			multiColorCount,
			colorlessSpellsCount,
			landsCount,
		};
	});

	// 4. BUDGET & FINANCIAL VALUE CALCULATIONS
	const budgetData = $derived.by(() => {
		const boards = ["commander", "companion", "mainboard", "sideboard", "maybeboard"];
		/** @type {Record<string, number>} */
		const boardTotals = {
			commander: 0,
			companion: 0,
			mainboard: 0,
			sideboard: 0,
			maybeboard: 0,
			total: 0,
		};

		/** @type {any[]} */
		const allCardsWithPrices = [];
		const priceTiers = {
			budget: { label: "< $1.00", count: 0, total: 0, color: "#22c55e" },
			low: { label: "$1 - $5", count: 0, total: 0, color: "#38bdf8" },
			mid: { label: "$5 - $20", count: 0, total: 0, color: "#f59e0b" },
			high: { label: "$20 - $50", count: 0, total: 0, color: "#ec4899" },
			premium: { label: "$50+", count: 0, total: 0, color: "#a855f7" },
		};

		const typeValues = /** @type {Record<string, number>} */ ({
			Creatures: 0,
			Instants: 0,
			Sorceries: 0,
			Artifacts: 0,
			Enchantments: 0,
			Planeswalkers: 0,
			Lands: 0,
			Other: 0,
		});

		const store = /** @type {any} */ (deckStore);
		boards.forEach((b) => {
			const list = /** @type {any[]} */ (store[b] || []);
			list.forEach((/** @type {any} */ c) => {
				const price = c.price || 0;
				const qty = c.quantity || 1;
				const cardVal = price * qty;
				boardTotals[b] += cardVal;
				boardTotals.total += cardVal;

				const stats = getCardStats(c);
				const cardObj = {
					name: c.name,
					board: b,
					price,
					cardVal,
					qty,
					type_line: stats.typeLine,
					image_uri:
						stats.meta.image_uris?.art_crop ||
						stats.meta.card_faces?.[0]?.image_uris?.art_crop ||
						stats.meta.image_uris?.normal ||
						null,
				};
				allCardsWithPrices.push(cardObj);

				// Tiers
				if (price < 1.0) {
					priceTiers.budget.count += qty;
					priceTiers.budget.total += cardVal;
				} else if (price < 5.0) {
					priceTiers.low.count += qty;
					priceTiers.low.total += cardVal;
				} else if (price < 20.0) {
					priceTiers.mid.count += qty;
					priceTiers.mid.total += cardVal;
				} else if (price < 50.0) {
					priceTiers.high.count += qty;
					priceTiers.high.total += cardVal;
				} else {
					priceTiers.premium.count += qty;
					priceTiers.premium.total += cardVal;
				}

				// Type value
				const typeLower = stats.typeLine.toLowerCase();
				const isCreature =
					c.overrides?.creature !== undefined
						? c.overrides.creature
						: typeLower.includes("creature");

				if (isCreature) typeValues.Creatures += cardVal;
				else if (typeLower.includes("instant")) typeValues.Instants += cardVal;
				else if (typeLower.includes("sorcery")) typeValues.Sorceries += cardVal;
				else if (typeLower.includes("planeswalker")) typeValues.Planeswalkers += cardVal;
				else if (typeLower.includes("artifact")) typeValues.Artifacts += cardVal;
				else if (typeLower.includes("enchantment")) typeValues.Enchantments += cardVal;
				else if (typeLower.includes("land")) typeValues.Lands += cardVal;
				else typeValues.Other += cardVal;
			});
		});

		// Top 10 most expensive cards
		const seenNames = new Set();
		const topCards = [...allCardsWithPrices]
			.filter((c) => c.price > 0)
			.sort((a, b) => b.price - a.price)
			.filter((c) => {
				if (seenNames.has(c.name)) return false;
				seenNames.add(c.name);
				return true;
			})
			.slice(0, 10);

		const activeCount = Math.max(activeCards.length, 1);
		const avgCardPrice = boardTotals.mainboard / activeCount;

		// Median card price
		const pricesArray = allCardsWithPrices
			.filter((c) => c.board === "mainboard" || c.board === "commander")
			.map((c) => c.price)
			.sort((a, b) => a - b);
		const medianPrice =
			pricesArray.length > 0
				? pricesArray[Math.floor(pricesArray.length / 2)]
				: 0;

		return {
			boardTotals,
			topCards,
			priceTiers,
			typeValues: Object.entries(typeValues).filter(([_, v]) => v > 0),
			avgCardPrice,
			medianPrice,
		};
	});

</script>

<div class="stats-root-container">
	{#if settingsStore.statsSubTab === "sample-hand" || settingsStore.statsSubTab === "tokens" || settingsStore.statsSubTab === "combos"}
		<MoreView />
	{:else}
		<div class="stats-bento-viewport">
			<div class="stats-grid">
				<!-- 1. MANA CURVE BENTO CARD -->
				<div class="bento-card cmc-card">
					<div class="bento-card-header">
						<div class="title-group">
							<h3>Mana Curve</h3>
							<span class="count-badge">
								{cmcData.buckets.reduce((acc, b) => acc + b.total, 0)} Spells
							</span>
						</div>
						<div class="curve-toggle-group" role="radiogroup" aria-label="Mana Curve Mode">
							<button
								type="button"
								role="radio"
								aria-checked={curveGroupingMode === "creatures"}
								class="curve-toggle-btn"
								class:active={curveGroupingMode === "creatures"}
								onclick={() => (curveGroupingMode = "creatures")}
							>
								Creatures
							</button>
							<button
								type="button"
								role="radio"
								aria-checked={curveGroupingMode === "types"}
								class="curve-toggle-btn"
								class:active={curveGroupingMode === "types"}
								onclick={() => (curveGroupingMode = "types")}
							>
								Types
							</button>
							<button
								type="button"
								role="radio"
								aria-checked={curveGroupingMode === "pips"}
								class="curve-toggle-btn"
								class:active={curveGroupingMode === "pips"}
								onclick={() => (curveGroupingMode = "pips")}
							>
								Pips
							</button>
						</div>
					</div>

					<div class="curve-legend-bar">
						{#if curveGroupingMode === "creatures"}
							<div class="legend-item"><span class="legend-swatch creature-swatch"></span>Creatures ({cardTypesData.creaturesCount})</div>
							<div class="legend-item"><span class="legend-swatch noncreature-swatch"></span>Non-Creatures ({cardTypesData.nonCreaturesCount})</div>
						{:else if curveGroupingMode === "types"}
							<div class="legend-item"><span class="legend-swatch type-creature"></span>Creatures</div>
							<div class="legend-item"><span class="legend-swatch type-instant"></span>Instants</div>
							<div class="legend-item"><span class="legend-swatch type-sorcery"></span>Sorceries</div>
							<div class="legend-item"><span class="legend-swatch type-artifact"></span>Artifacts</div>
							<div class="legend-item"><span class="legend-swatch type-enchantment"></span>Enchantments</div>
							<div class="legend-item"><span class="legend-swatch type-planeswalker"></span>Planeswalkers</div>
						{:else if curveGroupingMode === "pips"}
							{#each cmcData.activePipColors as col}
								<div class="legend-item">
									<ManaSymbol symbol={col.symbol || col.code.toLowerCase()} size="14px" />
									<span>{col.name} ({col.total})</span>
								</div>
							{/each}
						{/if}
					</div>

					<div class="arena-bar-chart-container">
						{#each cmcData.buckets as bucket (bucket.key)}
							<div class="arena-curve-column">
								<span class="bar-total-label">
									{bucket.total}
								</span>
								<div
									class="bar-track"
									style="height: {(bucket.total / cmcData.maxCount) * 95}px;"
								>
									{#if curveGroupingMode === "creatures"}
										{#if bucket.creatures > 0}
											<div
												class="bar-segment creature-segment"
												style="height: {(bucket.creatures / bucket.total) * 100}%;"
												title="{bucket.creatures} Creatures"
											></div>
										{/if}
										{#if bucket.nonCreatures > 0}
											<div
												class="bar-segment noncreature-segment"
												style="height: {(bucket.nonCreatures / bucket.total) * 100}%;"
												title="{bucket.nonCreatures} Non-Creatures"
											></div>
										{/if}
									{:else if curveGroupingMode === "types"}
										{#if bucket.types.creatures > 0}
											<div class="bar-segment type-creature" style="height: {(bucket.types.creatures / bucket.total) * 100}%;"></div>
										{/if}
										{#if bucket.types.instants > 0}
											<div class="bar-segment type-instant" style="height: {(bucket.types.instants / bucket.total) * 100}%;"></div>
										{/if}
										{#if bucket.types.sorceries > 0}
											<div class="bar-segment type-sorcery" style="height: {(bucket.types.sorceries / bucket.total) * 100}%;"></div>
										{/if}
										{#if bucket.types.artifacts > 0}
											<div class="bar-segment type-artifact" style="height: {(bucket.types.artifacts / bucket.total) * 100}%;"></div>
										{/if}
										{#if bucket.types.enchantments > 0}
											<div class="bar-segment type-enchantment" style="height: {(bucket.types.enchantments / bucket.total) * 100}%;"></div>
										{/if}
										{#if bucket.types.planeswalkers > 0}
											<div class="bar-segment type-planeswalker" style="height: {(bucket.types.planeswalkers / bucket.total) * 100}%;"></div>
										{/if}
									{:else if curveGroupingMode === "pips"}
										{#each cmcData.activePipColors as col}
											{@const count = (/** @type {Record<string, number>} */ (bucket.pips))[col.code] || 0}
											{@const share = (/** @type {Record<string, number>} */ (bucket.pipsShare))[col.code] || 0}
											{#if share > 0}
												<div
													class="bar-segment pip-segment-{col.code.toLowerCase()}"
													style="height: {(share / bucket.total) * 100}%; background-color: {col.color};"
													title="{count} {col.name} Mana"
												></div>
											{/if}
										{/each}
									{/if}
								</div>
								<span class="cmc-drop-label">
									{bucket.label}
								</span>
							</div>
						{/each}
					</div>

					<div class="card-footer-stats">
						<span class="footer-stat-item">Avg CMC: <strong>{curveStats.avgNonLand}</strong></span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Median: <strong>{curveStats.median}</strong></span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Peak: <strong>{curveStats.peakCmc} ({curveStats.peakCount})</strong></span>
					</div>
				</div>

				<!-- 2. CARD TYPES BENTO CARD -->
				<div class="bento-card types-card">
					<div class="bento-card-header">
						<div class="title-group">
							<h3>Card Types</h3>
							<span class="count-badge">{activeCards.length} Total Cards</span>
						</div>
					</div>

					<div class="types-list-scroll">
						{#each cardTypesData.activeTypesList as item}
							<div class="type-row-item">
								<div class="type-info">
									<i class="ms {item.icon} ms-cost type-icon" style="color: {item.color};"></i>
									<span class="type-name">{item.type}</span>
								</div>
								<div class="type-progress-track">
									<div
										class="type-progress-fill"
										style="width: {item.pct}%; background-color: {item.color};"
									></div>
								</div>
								<div class="type-count-badge">
									<span class="type-qty">{item.count}</span>
									<span class="type-percent">{item.pct}%</span>
								</div>
							</div>
						{/each}
					</div>

					<div class="card-footer-stats">
						<span class="footer-stat-item">Permanents: <strong>{cardTypesData.permanentsCount}</strong> ({cardTypesData.permanentsPct}%)</span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Spells: <strong>{cardTypesData.nonPermanentsCount}</strong> ({cardTypesData.nonPermanentsPct}%)</span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Lands: <strong>{cardTypesData.landsCount}</strong> ({cardTypesData.landsPct}%)</span>
					</div>
				</div>

				<!-- 3. COLORS BENTO CARD -->
				<div class="bento-card colors-card">
					<div class="bento-card-header">
						<div class="title-group">
							<h3>Colors</h3>
							<span class="count-badge">{colorBreakdownData.totalPips} Mana Pips</span>
						</div>
						{#if deckColorIdentity().length > 0}
							<div class="identity-symbols-row">
								{#each deckColorIdentity() as col}
									<ManaSymbol symbol={col.toLowerCase()} size="16px" />
								{/each}
							</div>
						{/if}
					</div>

					<div class="colors-list-scroll">
						{#each colorBreakdownData.colorList as col}
							<div class="color-row-item">
								<div class="color-info">
									<ManaSymbol symbol={col.symbol} size="16px" />
									<span class="color-name">{col.name}</span>
								</div>
								<div class="color-progress-track">
									<div
										class="color-progress-fill"
										style="width: {col.pipPct}%; background-color: {col.color};"
									></div>
								</div>
								<div class="color-count-badge">
									<span class="pips-val">{col.pipCount}</span>
									<span class="pips-pct">{col.pipPct}%</span>
								</div>
								<span class="sources-text" title="{col.sourceCount} mana producing sources">
									{col.sourceCount} {col.sourceCount === 1 ? 'src' : 'srcs'}
								</span>
							</div>
						{/each}
					</div>

					<div class="card-footer-stats">
						<span class="footer-stat-item">Sources: <strong>{colorBreakdownData.totalSources}</strong></span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Mono-Color: <strong>{colorBreakdownData.monoColorCount}</strong></span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Multicolor: <strong>{colorBreakdownData.multiColorCount}</strong></span>
					</div>
				</div>

				<!-- 4. BUDGET BENTO CARD -->
				<div class="bento-card budget-card">
					<div class="bento-card-header">
						<div class="title-group">
							<h3>Budget</h3>
							<span class="count-badge">Market Value</span>
						</div>
					</div>

					<div class="budget-body-content">
						<div class="budget-hero-callout">
							<div class="budget-amount-display">
								<span class="currency-sign">$</span>
								<span class="amount-digits">{budgetData.boardTotals.total.toFixed(2)}</span>
							</div>
							<span class="budget-caption">Total Estimated Deck Value</span>
						</div>

						<div class="boards-chips-row">
							<div class="board-chip">
								<span class="label">Mainboard</span>
								<span class="val">${budgetData.boardTotals.mainboard.toFixed(2)}</span>
							</div>
							{#if budgetData.boardTotals.commander > 0}
								<div class="board-chip">
									<span class="label">Commander</span>
									<span class="val">${budgetData.boardTotals.commander.toFixed(2)}</span>
								</div>
							{/if}
							{#if budgetData.boardTotals.sideboard > 0}
								<div class="board-chip">
									<span class="label">Sideboard</span>
									<span class="val">${budgetData.boardTotals.sideboard.toFixed(2)}</span>
								</div>
							{/if}
							{#if budgetData.boardTotals.maybeboard > 0}
								<div class="board-chip">
									<span class="label">Maybeboard</span>
									<span class="val">${budgetData.boardTotals.maybeboard.toFixed(2)}</span>
								</div>
							{/if}
						</div>

						{#if budgetData.topCards.length > 0}
							<div class="top-cards-section">
								<span class="top-cards-header">Top Valued Cards</span>
								<div class="top-cards-mini-list">
									{#each budgetData.topCards.slice(0, 3) as card, idx}
										<div class="top-card-row">
											<span class="rank">#{idx + 1}</span>
											<span class="name" title={card.name}>{card.name}</span>
											<span class="price">${card.price.toFixed(2)}</span>
										</div>
									{/each}
								</div>
							</div>
						{:else}
							<div class="empty-pricing-notice">
								No pricing data available for cards in this deck
							</div>
						{/if}
					</div>

					<div class="card-footer-stats">
						<span class="footer-stat-item">Avg / Card: <strong>${budgetData.avgCardPrice.toFixed(2)}</strong></span>
						<span class="footer-stat-divider">·</span>
						<span class="footer-stat-item">Median / Card: <strong>${budgetData.medianPrice.toFixed(2)}</strong></span>
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.stats-root-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		height: 100%;
		overflow: hidden;
		background: transparent;
	}

	.stats-bento-viewport {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1rem;
		max-width: 1350px;
		margin: 0 auto;
		width: 100%;
	}

	@media (max-width: 1024px) {
		.stats-grid {
			grid-template-columns: 1fr;
		}
	}

	.bento-card {
		background: #0f1219;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-lg, 12px);
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
	}

	.bento-card-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.06);
		gap: 0.75rem;
	}

	.title-group {
		display: flex;
		align-items: center;
		gap: 0.55rem;
	}

	.title-group h3 {
		margin: 0;
		font-size: 14px;
		font-weight: 700;
		color: #f8fafc;
		letter-spacing: -0.01em;
	}

	.count-badge {
		font-size: 11px;
		font-weight: 500;
		color: #94a3b8;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.07);
		padding: 1px 6px;
		border-radius: 4px;
	}

	.curve-toggle-group {
		display: flex;
		background: #080b11;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md, 6px);
		padding: 2px;
		gap: 2px;
		height: 28px;
		box-sizing: border-box;
	}

	.curve-toggle-btn {
		background: transparent;
		border: none;
		color: #94a3b8;
		font-size: 12px;
		font-weight: 500;
		padding: 0 8px;
		border-radius: var(--radius-sm, 3px);
		cursor: pointer;
		transition: all 0.15s ease;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.curve-toggle-btn.active {
		background: #252b3b;
		color: #ffffff;
		font-weight: 600;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.14) inset,
			0 1px 3px rgba(0, 0, 0, 0.4);
	}

	.curve-legend-bar {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem 0.85rem;
		font-size: 11px;
		color: #94a3b8;
		align-items: center;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend-swatch {
		width: 8px;
		height: 8px;
		border-radius: 2px;
	}

	.creature-swatch { background-color: #f97316; }
	.noncreature-swatch { background-color: #0284c7; }

	.type-creature { background-color: #f97316; }
	.type-instant { background-color: #38bdf8; }
	.type-sorcery { background-color: #818cf8; }
	.type-artifact { background-color: #94a3b8; }
	.type-enchantment { background-color: #ec4899; }
	.type-planeswalker { background-color: #a855f7; }

	.arena-bar-chart-container {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		height: 125px;
		gap: 6px;
		padding: 0.25rem 0;
		flex: 1;
	}

	.arena-curve-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		justify-content: flex-end;
		gap: 3px;
	}

	.bar-total-label {
		font-size: 11px;
		font-weight: 700;
		color: #f8fafc;
	}

	.bar-track {
		width: 100%;
		max-width: 44px;
		display: flex;
		flex-direction: column-reverse;
		border-radius: 4px;
		overflow: hidden;
		min-height: 4px;
		transition: height 0.25s ease;
	}

	.bar-segment {
		width: 100%;
		transition: opacity 0.15s ease;
	}

	.bar-segment:hover {
		filter: brightness(1.2);
	}

	.creature-segment { background-color: #f97316; }
	.noncreature-segment { background-color: #0284c7; }

	.cmc-drop-label {
		font-size: 11px;
		font-weight: 500;
		color: #94a3b8;
		text-align: center;
		white-space: nowrap;
		margin-top: 3px;
	}

	.types-list-scroll, .colors-list-scroll {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		flex: 1;
		justify-content: center;
	}

	.type-row-item, .color-row-item {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		font-size: 13px;
	}

	.type-info, .color-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 125px;
		flex-shrink: 0;
	}

	.type-name, .color-name {
		font-weight: 500;
		font-size: 13px;
		color: #f8fafc;
		white-space: nowrap;
	}

	.type-icon {
		font-size: 0.95rem;
		flex-shrink: 0;
	}

	.type-progress-track, .color-progress-track {
		flex: 1;
		height: 6px;
		background: rgba(255, 255, 255, 0.06);
		border-radius: 3px;
		overflow: hidden;
	}

	.type-progress-fill, .color-progress-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.type-count-badge, .color-count-badge {
		display: flex;
		align-items: baseline;
		gap: 0.35rem;
		font-size: 12px;
		width: 60px;
		justify-content: flex-end;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.type-qty, .pips-val {
		font-weight: 700;
		color: #f8fafc;
	}

	.type-percent, .pips-pct {
		color: #94a3b8;
		font-size: 11px;
	}

	.identity-symbols-row {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.sources-text {
		font-size: 11px;
		color: #94a3b8;
		width: 48px;
		text-align: right;
		flex-shrink: 0;
		white-space: nowrap;
	}

	/* Budget styles */
	.budget-body-content {
		display: flex;
		flex-direction: column;
		gap: 0.65rem;
		flex: 1;
	}

	.budget-hero-callout {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-md, 6px);
		padding: 0.6rem 0.85rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	.budget-amount-display {
		display: flex;
		align-items: baseline;
		color: #10b981;
		font-family: var(--font-sans);
	}

	.currency-sign {
		font-size: 1rem;
		font-weight: 700;
		margin-right: 2px;
	}

	.amount-digits {
		font-size: 1.6rem;
		font-weight: 800;
		letter-spacing: -0.02em;
	}

	.budget-caption {
		font-size: 11px;
		color: #94a3b8;
		margin-top: 2px;
	}

	.boards-chips-row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.board-chip {
		flex: 1;
		min-width: 80px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-md, 6px);
		padding: 0.35rem 0.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.1rem;
	}

	.board-chip .label {
		font-size: 10px;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.board-chip .val {
		font-size: 12px;
		font-weight: 700;
		color: #f8fafc;
	}

	.top-cards-section {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		margin-top: auto;
	}

	.top-cards-header {
		font-size: 10px;
		font-weight: 700;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}

	.top-cards-mini-list {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.top-card-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 12px;
		padding: 0.2rem 0.4rem;
		border-radius: var(--radius-sm, 3px);
		background: rgba(255, 255, 255, 0.03);
	}

	.top-card-row .rank {
		color: #64748b;
		font-weight: 600;
		width: 16px;
	}

	.top-card-row .name {
		flex: 1;
		font-weight: 500;
		color: #f8fafc;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.top-card-row .price {
		font-weight: 700;
		color: #10b981;
	}

	.empty-pricing-notice {
		font-size: 12px;
		color: #64748b;
		font-style: italic;
		padding: 0.75rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.02);
		border-radius: var(--radius-md, 6px);
		border: 1px dashed rgba(255, 255, 255, 0.06);
		margin: 0.25rem 0;
	}

	.card-footer-stats {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 11px;
		color: #94a3b8;
		padding-top: 0.5rem;
		border-top: 1px solid rgba(255, 255, 255, 0.06);
		margin-top: auto;
		white-space: nowrap;
	}

	.footer-stat-item strong {
		color: #f8fafc;
		font-weight: 600;
	}

	.footer-stat-divider {
		color: rgba(255, 255, 255, 0.25);
		font-weight: bold;
		padding: 0 0.15rem;
	}
</style>
