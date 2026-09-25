<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
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
		const isCreature =
			card?.overrides?.creature !== undefined
				? card.overrides.creature
				: (typeLine || "").toLowerCase().includes("creature");

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
	let selectedCmc = $state(/** @type {number | null} */ (null));

	const cmcData = $derived.by(() => {
		// Buckets: 0, 1, 2, 3, 4, 5, 6, 7+
		const buckets = Array.from({ length: 8 }, (_, i) => ({
			cmc: i,
			label: i === 7 ? "7+" : String(i),
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
			pips: {
				W: 0,
				U: 0,
				B: 0,
				R: 0,
				G: 0,
				C: 0,
			},
			totalPips: 0,
			total: 0,
			cards: /** @type {{ name: string, qty: number, mana_cost: string, type_line: string, price: number, cmc: number, overrides?: any }[]} */ ([]),
		}));

		activeCards.forEach((/** @type {any} */ c) => {
			const stats = getCardStats(c);
			const typeLine = stats.typeLine.toLowerCase();
			if (typeLine.includes("land")) return; // exclude lands from curve

			const cmc = Math.floor(stats.cmc);
			if (cmc < 0) return;
			const idx = Math.min(cmc, 7);
			const qty = c.quantity || 1;

			buckets[idx].total += qty;
			buckets[idx].cards.push({
				name: c.name,
				qty,
				mana_cost: stats.manaCost,
				type_line: stats.typeLine,
				price: c.price || 0,
				cmc: stats.cmc,
				overrides: c.overrides,
			});

			const isCreature =
				c.overrides?.creature !== undefined
					? c.overrides.creature
					: typeLine.includes("creature");

			if (isCreature) {
				buckets[idx].creatures += qty;
				buckets[idx].types.creatures += qty;
			} else {
				buckets[idx].nonCreatures += qty;
				if (typeLine.includes("instant")) buckets[idx].types.instants += qty;
				else if (typeLine.includes("sorcery")) buckets[idx].types.sorceries += qty;
				else if (typeLine.includes("planeswalker")) buckets[idx].types.planeswalkers += qty;
				else if (typeLine.includes("artifact")) buckets[idx].types.artifacts += qty;
				else if (typeLine.includes("enchantment")) buckets[idx].types.enchantments += qty;
				else buckets[idx].types.other += qty;
			}

			// Parse mana pips for this card at this CMC
			const cost = stats.manaCost;
			const matches = cost.match(/\{([^}]+)\}/g) || [];
			matches.forEach((sym) => {
				const clean = sym.replace(/[{}]/g, "").toUpperCase();
				if (clean === "W") { buckets[idx].pips.W += qty; buckets[idx].totalPips += qty; }
				else if (clean === "U") { buckets[idx].pips.U += qty; buckets[idx].totalPips += qty; }
				else if (clean === "B") { buckets[idx].pips.B += qty; buckets[idx].totalPips += qty; }
				else if (clean === "R") { buckets[idx].pips.R += qty; buckets[idx].totalPips += qty; }
				else if (clean === "G") { buckets[idx].pips.G += qty; buckets[idx].totalPips += qty; }
				else if (clean === "C") { buckets[idx].pips.C += qty; buckets[idx].totalPips += qty; }
				else if (clean.includes("/")) {
					const [a, b] = clean.split("/");
					if (b === "P") {
						if (buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (a)] !== undefined) {
							buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (a)] += qty;
							buckets[idx].totalPips += qty;
						}
					} else if (a === "2") {
						if (buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (b)] !== undefined) {
							buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (b)] += qty;
							buckets[idx].totalPips += qty;
						}
					} else {
						if (buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (a)] !== undefined) {
							buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (a)] += qty * 0.5;
							buckets[idx].totalPips += qty * 0.5;
						}
						if (buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (b)] !== undefined) {
							buckets[idx].pips[/** @type {keyof typeof buckets[0]['pips']} */ (b)] += qty * 0.5;
							buckets[idx].totalPips += qty * 0.5;
						}
					}
				}
			});
		});

		// Sort cards in each bucket alphabetically by name
		buckets.forEach((b) => {
			b.cards.sort((a, b) => a.name.localeCompare(b.name));
		});

		const maxCount = Math.max(...buckets.map((b) => b.total), 1);
		const maxPips = Math.max(...buckets.map((b) => b.totalPips), 1);

		/** @type {Record<string, number>} */
		const totalDeckPips = { W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
		buckets.forEach((b) => {
			totalDeckPips.W += b.pips.W;
			totalDeckPips.U += b.pips.U;
			totalDeckPips.B += b.pips.B;
			totalDeckPips.R += b.pips.R;
			totalDeckPips.G += b.pips.G;
			totalDeckPips.C += b.pips.C;
		});

		/** @type {Record<string, { name: string, color: string, code: string }>} */
		const pipColorsMap = {
			W: { name: "White", color: "#f8fafc", code: "W" },
			U: { name: "Blue", color: "#38bdf8", code: "U" },
			B: { name: "Black", color: "#475569", code: "B" },
			R: { name: "Red", color: "#ef4444", code: "R" },
			G: { name: "Green", color: "#22c55e", code: "G" },
			C: { name: "Colorless", color: "#94a3b8", code: "C" },
		};

		const activePipColors = ["W", "U", "B", "R", "G", "C"]
			.filter((col) => totalDeckPips[col] > 0)
			.map((col) => ({
				code: col,
				name: pipColorsMap[col].name,
				color: pipColorsMap[col].color,
				total: Math.round(totalDeckPips[col]),
			}));

		return { buckets, maxCount, maxPips, activePipColors };
	});

	// Cards displayed in the Mana Curve inspector drawer
	const drawerCards = $derived.by(() => {
		if (selectedCmc !== null) {
			return cmcData.buckets[selectedCmc]?.cards || [];
		}
		// When no CMC bar is selected, show all active non-land spells sorted by CMC then name
		return activeCards
			.filter((c) => {
				const stats = getCardStats(c);
				return !stats.typeLine.toLowerCase().includes("land");
			})
			.map((c) => {
				const stats = getCardStats(c);
				return {
					name: c.name,
					qty: c.quantity || 1,
					mana_cost: stats.manaCost,
					type_line: stats.typeLine,
					price: c.price || 0,
					cmc: stats.cmc,
					overrides: c.overrides,
				};
			})
			.sort((a, b) => a.cmc - b.cmc || a.name.localeCompare(b.name));
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
		let peakCmc = 0;
		let peakCount = 0;
		cmcData.buckets.forEach((b) => {
			if (b.total > peakCount) {
				peakCount = b.total;
				peakCmc = b.cmc;
			}
		});

		// Early (0-2), Mid (3-4), Late (5+)
		const earlyCount = cmcData.buckets
			.slice(0, 3)
			.reduce((acc, b) => acc + b.total, 0);
		const midCount = cmcData.buckets
			.slice(3, 5)
			.reduce((acc, b) => acc + b.total, 0);
		const lateCount = cmcData.buckets
			.slice(5)
			.reduce((acc, b) => acc + b.total, 0);

		const totalPipsSum = Math.round(
			cmcData.buckets.reduce((acc, b) => acc + b.totalPips, 0),
		);

		return {
			avgNonLand: avgNonLand.toFixed(2),
			avgDeck: avgDeck.toFixed(2),
			median: median.toFixed(1),
			peakCmc: peakCmc === 7 ? "7+" : peakCmc,
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
				pct: Math.round((info.count / Math.max(activeCards.length, 1)) * 100),
			}));

		return {
			activeTypesList,
			permanentsCount,
			nonPermanentsCount,
			permanentsPct: Math.round((permanentsCount / Math.max(activeCards.length, 1)) * 100),
			nonPermanentsPct: Math.round((nonPermanentsCount / Math.max(activeCards.length, 1)) * 100),
			sortedCreatureSubtypes,
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
		const topCards = [...allCardsWithPrices]
			.sort((a, b) => b.price - a.price)
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

	// Smooth Scroll & Section Spy
	const sectionsList = [
		{ id: "overview", label: "Overview", icon: Compass },
		{ id: "mana-curve", label: "Mana Curve", icon: BarChart3 },
		{ id: "card-types", label: "Card Types", icon: Layers },
		{ id: "colors", label: "Colors & Base", icon: PieChart },
		{ id: "budget", label: "Budget", icon: Coins },
	];

	/** @param {string} id */
	function scrollToSection(id) {
		settingsStore.statsSection = id;
		const el = document.getElementById(`stats-${id}`);
		if (el) {
			el.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}

	onMount(() => {
		const observerOptions = {
			root: null,
			rootMargin: "-20% 0px -60% 0px",
			threshold: 0,
		};

		const observer = new IntersectionObserver((entries) => {
			entries.forEach((entry) => {
				if (entry.isIntersecting) {
					const id = entry.target.id.replace("stats-", "");
					settingsStore.statsSection = id;
				}
			});
		}, observerOptions);

		sectionsList.forEach((sec) => {
			const el = document.getElementById(`stats-${sec.id}`);
			if (el) observer.observe(el);
		});

		return () => {
			observer.disconnect();
		};
	});
</script>

<div class="stats-view-viewport">
	<!-- 1. OVERVIEW SECTION -->
	<section id="stats-overview" class="stats-section-screen">
		<div class="section-content-wrapper">
			<div class="overview-hero-card">
				<!-- Hero Art & Commander Banner -->
				<div class="hero-commander-showcase">
					<div class="commander-art-frame">
						{#if featuredArt()}
							<img
								src={featuredArt()}
								alt="Featured Commander"
								class="commander-art"
							/>
						{:else}
							<div class="commander-art-fallback">
								<Sparkles size={40} />
							</div>
						{/if}
						<div class="art-gradient-overlay"></div>
						<div class="art-caption-block">
							<span class="deck-format-chip">
								{deckStore.format || "Custom Deck"}
							</span>
							<h1 class="commander-hero-name">
								{deckStore.name || "Untitled Deck"}
							</h1>
							<div class="hero-color-identity">
								{#each deckColorIdentity() as col}
									<ManaSymbol symbol={col} size="18px" />
								{/each}
								<span class="hero-card-count">
									{activeCards.length} Cards Total
								</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Quick Key Metrics Cards (Arena Dashboard style) -->
				<div class="hero-metrics-grid">
					<div class="metric-glass-card">
						<span class="metric-label">Average Mana Value</span>
						<div class="metric-value-row">
							<span class="metric-primary-value">{curveStats.avgNonLand}</span>
							<span class="metric-sub-value">({curveStats.avgDeck} all)</span>
						</div>
						<div class="metric-progress-track">
							<div
								class="metric-progress-fill"
								style="width: {Math.min(100, (parseFloat(curveStats.avgNonLand) / 6) * 100)}%; background: hsl(var(--primary));"
							></div>
						</div>
						<span class="metric-hint">Calculated excluding lands</span>
					</div>

					<div class="metric-glass-card">
						<span class="metric-label">Permanents vs Spells</span>
						<div class="metric-value-row">
							<span class="metric-primary-value">{cardTypesData.permanentsPct}%</span>
							<span class="metric-sub-value">{cardTypesData.permanentsCount} Perms / {cardTypesData.nonPermanentsCount} Spells</span>
						</div>
						<div class="metric-progress-track multi-segment">
							<div
								class="segment perms"
								style="width: {cardTypesData.permanentsPct}%;"
							></div>
							<div
								class="segment spells"
								style="width: {cardTypesData.nonPermanentsPct}%;"
							></div>
						</div>
						<span class="metric-hint">{cardTypesData.permanentsCount} Permanents, {cardTypesData.nonPermanentsCount} Non-Permanents</span>
					</div>

					<div class="metric-glass-card">
						<span class="metric-label">Estimated Deck Budget</span>
						<div class="metric-value-row">
							<span class="metric-primary-value price-text">${budgetData.boardTotals.total.toFixed(2)}</span>
							<span class="metric-sub-value">${budgetData.avgCardPrice.toFixed(2)} avg/card</span>
						</div>
						<div class="metric-progress-track">
							<div
								class="metric-progress-fill price-fill"
								style="width: {Math.min(100, (budgetData.boardTotals.total / 250) * 100)}%;"
							></div>
						</div>
						<span class="metric-hint">Mainboard: ${budgetData.boardTotals.mainboard.toFixed(2)}</span>
					</div>

					<div class="metric-glass-card">
						<span class="metric-label">Mana Base Balance</span>
						<div class="metric-value-row">
							<span class="metric-primary-value">{colorBreakdownData.landsCount} Lands</span>
							<span class="metric-sub-value">{colorBreakdownData.totalSources} Mana Sources</span>
						</div>
						<div class="metric-pips-summary">
							{#each colorBreakdownData.colorList as col}
								<div class="summary-pip-badge">
									<ManaSymbol symbol={col.symbol} size="14px" />
									<span>{col.pipPct}%</span>
								</div>
							{/each}
						</div>
						<span class="metric-hint">{colorBreakdownData.totalPips} total color pips required</span>
					</div>
				</div>
			</div>

			<!-- Quick Jump Cards to Deep Dive Sections -->
			<div class="overview-deepdive-grid">
				<button class="deepdive-card" onclick={() => scrollToSection("mana-curve")}>
					<div class="card-icon-header">
						<BarChart3 size={20} class="text-primary" />
						<ChevronRight size={18} class="chevron" />
					</div>
					<h3>Mana Curve Analysis</h3>
					<p>Inspect curve distribution, CMC breakdown, and card counts at every mana cost tier.</p>
					<span class="jump-link">Explore Mana Curve &rarr;</span>
				</button>

				<button class="deepdive-card" onclick={() => scrollToSection("card-types")}>
					<div class="card-icon-header">
						<Layers size={20} class="text-primary" />
						<ChevronRight size={18} class="chevron" />
					</div>
					<h3>Card Types & Subtypes</h3>
					<p>Explore high-level spell categories, tribal creature hierarchies, and permanent balances.</p>
					<span class="jump-link">Explore Card Types &rarr;</span>
				</button>

				<button class="deepdive-card" onclick={() => scrollToSection("colors")}>
					<div class="card-icon-header">
						<PieChart size={20} class="text-primary" />
						<ChevronRight size={18} class="chevron" />
					</div>
					<h3>Colors & Mana Demands</h3>
					<p>Compare colored spell pip demands with your land and mana rock production balance.</p>
					<span class="jump-link">Explore Colors & Base &rarr;</span>
				</button>

				<button class="deepdive-card" onclick={() => scrollToSection("budget")}>
					<div class="card-icon-header">
						<Coins size={20} class="text-primary" />
						<ChevronRight size={18} class="chevron" />
					</div>
					<h3>Budget & Valuation</h3>
					<p>Discover top valued cards, price distribution brackets, and board value breakdowns.</p>
					<span class="jump-link">Explore Budget &rarr;</span>
				</button>
			</div>
		</div>
	</section>

	<!-- 2. MANA CURVE SECTION -->
	<section id="stats-mana-curve" class="stats-section-screen">
		<div class="section-content-wrapper">
			<div class="section-header-row">
				<div class="title-group">
					<span class="section-eyebrow">DISTRIBUTION</span>
					<h2 class="section-heading">Mana Curve</h2>
				</div>

				<div class="controls-pill-toggle">
					<button
						class="toggle-btn"
						class:active={curveGroupingMode === "creatures"}
						onclick={() => (curveGroupingMode = "creatures")}
					>
						Creature/Noncreature
					</button>
					<button
						class="toggle-btn"
						class:active={curveGroupingMode === "types"}
						onclick={() => (curveGroupingMode = "types")}
					>
						Card Type
					</button>
					<button
						class="toggle-btn"
						class:active={curveGroupingMode === "pips"}
						onclick={() => (curveGroupingMode = "pips")}
					>
						Mana Pips
					</button>
				</div>
			</div>

			<!-- Main Dual Layout: Mana Curve Chart + Cards Drawer side by side -->
			<div class="curve-main-layout">
				<!-- Mana Curve Chart Card -->
				<div class="curve-chart-card">
					<div class="chart-legend-row">
						{#if curveGroupingMode === "creatures"}
							<div class="legend-item">
								<span class="legend-swatch creature-swatch"></span>
								<span>Creatures</span>
							</div>
							<div class="legend-item">
								<span class="legend-swatch noncreature-swatch"></span>
								<span>Non-Creature Spells</span>
							</div>
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
									<ManaSymbol symbol={col.code.toLowerCase()} size="14px" />
									<span>{col.name} ({col.total})</span>
								</div>
							{/each}
						{/if}
					</div>

					<div class="arena-bar-chart-container">
						{#each cmcData.buckets as bucket}
							{@const currentVal = curveGroupingMode === "pips" ? bucket.totalPips : bucket.total}
							{@const maxVal = curveGroupingMode === "pips" ? cmcData.maxPips : cmcData.maxCount}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="arena-curve-column"
								class:selected={selectedCmc === bucket.cmc}
								onclick={() =>
									(selectedCmc = selectedCmc === bucket.cmc ? null : bucket.cmc)}
							>
								<span class="bar-total-label">
									{curveGroupingMode === "pips" ? (Number.isInteger(bucket.totalPips) ? bucket.totalPips : bucket.totalPips.toFixed(1)) : bucket.total}
								</span>
								<div
									class="bar-track"
									style="height: {(currentVal / maxVal) * 170}px;"
								>
									{#if curveGroupingMode === "creatures"}
										<!-- Creature Stacked Segment (Orange) -->
										{#if bucket.creatures > 0}
											<div
												class="bar-segment creature-segment"
												style="height: {(bucket.creatures / bucket.total) * 100}%;"
												title="{bucket.creatures} Creatures"
											></div>
										{/if}
										<!-- Non-Creature Stacked Segment (Blue) -->
										{#if bucket.nonCreatures > 0}
											<div
												class="bar-segment noncreature-segment"
												style="height: {(bucket.nonCreatures / bucket.total) * 100}%;"
												title="{bucket.nonCreatures} Non-Creatures"
											></div>
										{/if}
									{:else if curveGroupingMode === "types"}
										<!-- By Card Type -->
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
										<!-- By Mana Pips (WUBRGC) -->
										{#each cmcData.activePipColors as col}
											{#if (bucket.pips[col.code] || 0) > 0}
												<div
													class="bar-segment pip-segment-{col.code.toLowerCase()}"
													style="height: {((bucket.pips[col.code] || 0) / bucket.totalPips) * 100}%; background-color: {col.color};"
													title="{bucket.pips[col.code]} {col.name} Pips"
												></div>
											{/if}
										{/each}
									{/if}
								</div>
								<div class="cmc-circle-badge">
									<span>{bucket.label}</span>
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Interactive CMC Inspector Drawer / Preview Stack -->
				<div class="curve-cards-drawer">
					<div class="drawer-header">
						<h4>
							{#if selectedCmc !== null}
								Cards with CMC {selectedCmc === 7 ? "7+" : selectedCmc} ({drawerCards.length}{curveGroupingMode === "pips" ? ` · ${Math.round(cmcData.buckets[selectedCmc]?.totalPips || 0)} pips` : ""})
							{:else}
								All Non-Land Spells ({drawerCards.length})
							{/if}
						</h4>
						{#if selectedCmc !== null}
							<button class="clear-btn" onclick={() => (selectedCmc = null)}>View All</button>
						{/if}
					</div>

					<div class="drawer-cards-list">
						{#each drawerCards as card}
							{@const manaCostStr = card.mana_cost || getMeta(card.name).mana_cost || card.mana || ""}
							{@const typeLine = card.type_line || getCardStats(card).typeLine}
							{@const typeIcon = getCardTypeIcon(typeLine, card)}
							{@const tooltipImg = getCardTooltipImg(card.name)}
							{@const tooltipImgs = getCardTooltipImgs(card.name)}
							<div
								class="drawer-card-item"
								data-tooltip-img={tooltipImgs ? undefined : (tooltipImg || undefined)}
								data-tooltip-imgs={tooltipImgs || undefined}
							>
								<div class="card-name-qty">
									<span class="card-qty">{card.qty || card.quantity || 1}x</span>
									<span class="card-name">{card.name}</span>
								</div>
								<div class="card-cost-and-type">
									{#if manaCostStr}
										<div class="card-mana-pips">
											{#each parseManaCost(manaCostStr) as sym}
												{#if sym === "//"}
													<span class="mana-slash">//</span>
												{:else}
													<ManaSymbol symbol={sym} size="14px" />
												{/if}
											{/each}
										</div>
									{/if}
									{#if typeIcon}
										<i
											class="ms {typeIcon} card-type-icon"
											style="color: {getCardTypeColor(typeLine, card)};"
											title={typeLine}
										></i>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<!-- Curve Stats Bar (Below Both) -->
			<div class="curve-stats-bar">
				<div class="stats-bar-item">
					<span class="stats-bar-label">Average Non-Land CMC</span>
					<span class="stats-bar-value">{curveStats.avgNonLand}</span>
				</div>
				<div class="stats-bar-item">
					<span class="stats-bar-label">Median CMC</span>
					<span class="stats-bar-value">{curveStats.median}</span>
				</div>
				<div class="stats-bar-item">
					<span class="stats-bar-label">Peak Turn / Mode</span>
					<span class="stats-bar-value">CMC {curveStats.peakCmc} ({curveStats.peakCount} cards)</span>
				</div>
				<div class="stats-bar-item">
					<span class="stats-bar-label">{curveGroupingMode === 'pips' ? 'Total Colored Pips' : 'Total Spell Mana Value'}</span>
					<span class="stats-bar-value">{curveGroupingMode === 'pips' ? curveStats.totalPipsSum : curveStats.totalCmcSum}</span>
				</div>
			</div>
		</div>
	</section>

	<!-- 3. CARD TYPES SECTION -->
	<section id="stats-card-types" class="stats-section-screen">
		<div class="section-content-wrapper">
			<div class="section-header-row">
				<div class="title-group">
					<span class="section-eyebrow">COMPOSITION</span>
					<h2 class="section-heading">Card Types & Subtypes</h2>
				</div>
			</div>

			<div class="types-dual-layout">
				<!-- High Level Types List -->
				<div class="types-main-panel">
					<h3>Card Types Overview</h3>
					<div class="types-bars-stack">
						{#each cardTypesData.activeTypesList as item}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="type-progress-row"
								class:active={selectedTypeFilter === item.type}
								onclick={() => (selectedTypeFilter = selectedTypeFilter === item.type ? null : item.type)}
							>
								<div class="type-name-and-count">
									<span class="type-label-badge" style="border-left-color: {item.color};">
										{item.type}
									</span>
									<span class="type-count-text">
										{item.count} <span class="pct">({item.pct}%)</span>
									</span>
								</div>
								<div class="type-bar-bg">
									<div
										class="type-bar-fill"
										style="width: {item.pct}%; background-color: {item.color};"
									></div>
								</div>
							</div>
						{/each}
					</div>

					<div class="permanents-summary-box">
						<div class="perm-item">
							<span class="perm-icon"><Shield size={18} /></span>
							<div>
								<span class="perm-num">{cardTypesData.permanentsCount}</span>
								<span class="perm-title">Permanents ({cardTypesData.permanentsPct}%)</span>
							</div>
						</div>
						<div class="perm-divider"></div>
						<div class="perm-item">
							<span class="perm-icon spells"><Flame size={18} /></span>
							<div>
								<span class="perm-num">{cardTypesData.nonPermanentsCount}</span>
								<span class="perm-title">Spells ({cardTypesData.nonPermanentsPct}%)</span>
							</div>
						</div>
					</div>
				</div>

				<!-- Arena-Style Creature & Permanent Subtypes Breakdown -->
				<div class="types-subtypes-panel">
					<h3>Arena Subtype Breakdown</h3>
					<p class="panel-subtitle">Subtypes and creature kindred classifications</p>

					{#if cardTypesData.sortedCreatureSubtypes.length > 0}
						<div class="subtypes-list">
							{#each cardTypesData.sortedCreatureSubtypes as [subtype, count]}
								<div class="subtype-row">
									<span class="subtype-name">{subtype}</span>
									<span class="subtype-pill">{count}</span>
								</div>
							{/each}
						</div>
					{:else}
						<div class="empty-subtypes-notice">
							No subtype classifications found in active creatures.
						</div>
					{/if}
				</div>
			</div>
		</div>
	</section>

	<!-- 4. COLORS & MANA BASE SECTION -->
	<section id="stats-colors" class="stats-section-screen">
		<div class="section-content-wrapper">
			<div class="section-header-row">
				<div class="title-group">
					<span class="section-eyebrow">MANA BASE & RATIOS</span>
					<h2 class="section-heading">Colors & Mana Demands</h2>
				</div>
			</div>

			<div class="colors-dashboard-grid">
				<!-- Color Requirements vs Production Table -->
				<div class="color-comparison-card">
					<h3>Color Demands vs Production Sources</h3>
					<p class="card-desc">Compare the colored mana symbols required to cast your spells against lands and mana producers.</p>

					<div class="color-comparison-table">
						<div class="table-header-row">
							<span>Color</span>
							<span>Pips (Spells)</span>
							<span>Demand %</span>
							<span>Sources (Lands/Rocks)</span>
							<span>Production %</span>
							<span>Balance</span>
						</div>

						{#each colorBreakdownData.colorList as col}
							<div class="table-data-row">
								<div class="color-symbol-cell">
									<ManaSymbol symbol={col.symbol} size="20px" />
									<span class="color-name">{col.name}</span>
								</div>
								<span class="data-val bold">{col.pipCount}</span>
								<span class="data-val">{col.pipPct}%</span>
								<span class="data-val bold">{col.sourceCount}</span>
								<span class="data-val">{col.sourcePct}%</span>
								<div class="balance-cell">
									{#if col.sourcePct >= col.pipPct}
										<span class="status-badge good">
											<CheckCircle2 size={12} />
											Balanced
										</span>
									{:else if col.pipPct - col.sourcePct <= 8}
										<span class="status-badge fair">
											Moderate
										</span>
									{:else}
										<span class="status-badge warn">
											<AlertCircle size={12} />
											Under-producing
										</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Color Complexity & Land Ratio -->
				<div class="color-breakdown-side-cards">
					<div class="stats-mini-panel">
						<h4>Spell Complexity</h4>
						<div class="complexity-list">
							<div class="complexity-item">
								<span>Mono-Color Spells</span>
								<span class="num">{colorBreakdownData.monoColorCount}</span>
							</div>
							<div class="complexity-item">
								<span>Multi-Color / Gold</span>
								<span class="num">{colorBreakdownData.multiColorCount}</span>
							</div>
							<div class="complexity-item">
								<span>Colorless Spells</span>
								<span class="num">{colorBreakdownData.colorlessSpellsCount}</span>
							</div>
							<div class="complexity-item">
								<span>Lands</span>
								<span class="num">{colorBreakdownData.landsCount}</span>
							</div>
						</div>
					</div>

					<div class="stats-mini-panel">
						<h4>Mana Summary</h4>
						<div class="mana-summary-list">
							<div class="summary-stat-box">
								<span class="title">Total Pips</span>
								<span class="big-val">{colorBreakdownData.totalPips}</span>
							</div>
							<div class="summary-stat-box">
								<span class="title">Total Sources</span>
								<span class="big-val">{colorBreakdownData.totalSources}</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- 5. BUDGET & FINANCIAL VALUE SECTION -->
	<section id="stats-budget" class="stats-section-screen">
		<div class="section-content-wrapper">
			<div class="section-header-row">
				<div class="title-group">
					<span class="section-eyebrow">FINANCES</span>
					<h2 class="section-heading">Budget & Valuation</h2>
				</div>
			</div>

			<!-- Financial Hero Banner -->
			<div class="budget-hero-row">
				<div class="budget-kpi-card total-kpi">
					<span class="kpi-label">Total Deck Value</span>
					<h2 class="kpi-amount">${budgetData.boardTotals.total.toFixed(2)}</h2>
					<span class="kpi-subtext">Estimated TCGplayer Market Value</span>
				</div>

				<div class="budget-kpi-card">
					<span class="kpi-label">Average Card Value</span>
					<h3 class="kpi-secondary-amount">${budgetData.avgCardPrice.toFixed(2)}</h3>
					<span class="kpi-subtext">Across {activeCards.length} cards</span>
				</div>

				<div class="budget-kpi-card">
					<span class="kpi-label">Median Card Value</span>
					<h3 class="kpi-secondary-amount">${budgetData.medianPrice.toFixed(2)}</h3>
					<span class="kpi-subtext">Typical card cost in deck</span>
				</div>
			</div>

			<!-- Boards & Price Tiers Breakdown -->
			<div class="budget-details-grid">
				<!-- Top 10 Most Valuable Cards -->
				<div class="expensive-cards-card">
					<h3>Top 10 Most Valuable Cards</h3>
					<div class="top-cards-list">
						{#each budgetData.topCards as card, i}
							<div class="expensive-card-row">
								<span class="card-rank">#{i + 1}</span>
								{#if card.image_uri}
									<img src={card.image_uri} alt={card.name} class="card-thumb" />
								{:else}
									<div class="card-thumb-fallback"></div>
								{/if}
								<div class="card-info">
									<span class="name">{card.name}</span>
									<span class="type-board">{card.type_line} • {card.board}</span>
								</div>
								<div class="price-pill-wrapper">
									<span class="price-pill">${card.price.toFixed(2)}</span>
									{#if budgetData.boardTotals.total > 0}
										<span class="pct-pill">{((card.cardVal / budgetData.boardTotals.total) * 100).toFixed(1)}%</span>
									{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>

				<!-- Value by Board and Price Brackets -->
				<div class="budget-breakdown-sidebar">
					<div class="budget-panel-box">
						<h4>Value by Board</h4>
						<div class="board-values-list">
							<div class="board-row">
								<span>Mainboard</span>
								<span class="val">${budgetData.boardTotals.mainboard.toFixed(2)}</span>
							</div>
							<div class="board-row">
								<span>Commander</span>
								<span class="val">${budgetData.boardTotals.commander.toFixed(2)}</span>
							</div>
							<div class="board-row">
								<span>Sideboard</span>
								<span class="val">${budgetData.boardTotals.sideboard.toFixed(2)}</span>
							</div>
							<div class="board-row">
								<span>Maybeboard</span>
								<span class="val">${budgetData.boardTotals.maybeboard.toFixed(2)}</span>
							</div>
						</div>
					</div>

					<div class="budget-panel-box">
						<h4>Price Brackets</h4>
						<div class="tiers-list">
							{#each Object.entries(budgetData.priceTiers) as [key, tier]}
								<div class="tier-item">
									<div class="tier-header">
										<span class="tier-label">{tier.label}</span>
										<span class="tier-count">{tier.count} cards (${tier.total.toFixed(2)})</span>
									</div>
									<div class="tier-bar-bg">
										<div
											class="tier-bar-fill"
											style="width: {(tier.total / Math.max(budgetData.boardTotals.total, 1)) * 100}%; background-color: {tier.color};"
										></div>
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>
</div>

<style>
	.stats-view-viewport {
		flex: 1;
		width: 100%;
		height: calc(100vh - 56px);
		overflow-y: auto;
		scroll-behavior: smooth;
		background: radial-gradient(circle at 50% 0%, hsl(var(--card) / 0.3) 0%, transparent 60%);
		position: relative;
	}

	/* Common Section Screen */
	.stats-section-screen {
		min-height: calc(100vh - 56px);
		padding: 3rem 2rem;
		display: flex;
		justify-content: center;
		box-sizing: border-box;
		border-bottom: 1px solid hsl(var(--border) / 0.25);
		scroll-margin-top: 56px;
	}

	.section-content-wrapper {
		width: 100%;
		max-width: 1300px;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.section-header-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 1rem;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		padding-bottom: 1rem;
	}

	.section-eyebrow {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: hsl(var(--primary));
		display: block;
		margin-bottom: 0.25rem;
	}

	.section-heading {
		margin: 0;
		font-size: 1.85rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		letter-spacing: -0.02em;
	}

	/* 1. OVERVIEW HERO STYLES */
	.overview-hero-card {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 2rem;
		background: hsl(var(--card) / 0.4);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-xl, 16px);
		padding: 2rem;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
	}

	@media (max-width: 950px) {
		.overview-hero-card {
			grid-template-columns: 1fr;
		}
	}

	.hero-commander-showcase {
		display: flex;
		flex-direction: column;
	}

	.commander-art-frame {
		position: relative;
		width: 100%;
		height: 340px;
		border-radius: var(--radius-lg);
		overflow: hidden;
		border: 1px solid hsl(var(--border) / 0.6);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
	}

	.commander-art {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.4s ease;
	}

	.commander-art-fallback {
		width: 100%;
		height: 100%;
		background: hsl(var(--secondary) / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--primary));
	}

	.art-gradient-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			rgba(10, 12, 16, 0.95) 0%,
			rgba(10, 12, 16, 0.6) 40%,
			transparent 100%
		);
	}

	.art-caption-block {
		position: absolute;
		bottom: 1.5rem;
		left: 1.5rem;
		right: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.deck-format-chip {
		align-self: flex-start;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		padding: 0.2rem 0.6rem;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-radius: var(--radius-sm);
	}

	.commander-hero-name {
		margin: 0;
		font-size: 1.6rem;
		font-weight: 800;
		color: #ffffff;
		text-shadow: 0 2px 10px rgba(0, 0, 0, 0.8);
	}

	.hero-color-identity {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.hero-card-count {
		font-size: 0.85rem;
		color: rgba(255, 255, 255, 0.75);
		margin-left: 0.25rem;
	}

	/* Hero Metrics Grid */
	.hero-metrics-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	@media (max-width: 600px) {
		.hero-metrics-grid {
			grid-template-columns: 1fr;
		}
	}

	.metric-glass-card {
		background: hsl(var(--card) / 0.5);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		justify-content: space-between;
	}

	.metric-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.metric-value-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
	}

	.metric-primary-value {
		font-size: 1.8rem;
		font-weight: 800;
		color: hsl(var(--foreground));
		font-variant-numeric: tabular-nums;
	}

	.price-text {
		color: #38bdf8;
	}

	.metric-sub-value {
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
	}

	.metric-progress-track {
		width: 100%;
		height: 6px;
		background: hsl(var(--secondary) / 0.6);
		border-radius: 3px;
		overflow: hidden;
	}

	.metric-progress-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.4s ease;
	}

	.price-fill {
		background: #38bdf8;
	}

	.multi-segment {
		display: flex;
	}

	.multi-segment .segment.perms {
		background: #f97316;
	}

	.multi-segment .segment.spells {
		background: #38bdf8;
	}

	.metric-hint {
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground) / 0.8);
	}

	.metric-pips-summary {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.summary-pip-badge {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		background: hsl(var(--secondary) / 0.5);
		padding: 0.15rem 0.4rem;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
	}

	/* Deepdive Jump Cards */
	.overview-deepdive-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 1.25rem;
	}

	.deepdive-card {
		background: hsl(var(--card) / 0.35);
		border: 1px solid hsl(var(--border) / 0.45);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s ease;
	}

	.deepdive-card:hover {
		background: hsl(var(--card) / 0.65);
		border-color: hsl(var(--primary) / 0.7);
		transform: translateY(-3px);
		box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3);
	}

	.card-icon-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.deepdive-card h3 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.deepdive-card p {
		margin: 0;
		font-size: 0.82rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.45;
		flex: 1;
	}

	.jump-link {
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--primary));
		margin-top: 0.5rem;
	}

	/* 2. MANA CURVE SECTION STYLES */
	.controls-pill-toggle {
		display: inline-flex;
		background: hsl(var(--secondary) / 0.6);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-full, 9999px);
		padding: 0.2rem;
	}

	.toggle-btn {
		background: transparent;
		border: none;
		padding: 0.35rem 0.85rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		border-radius: var(--radius-full, 9999px);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.toggle-btn.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-weight: 600;
	}

	/* 2. MANA CURVE SECTION STYLES */
	#stats-mana-curve {
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 2.25rem 2rem;
	}

	#stats-mana-curve .section-content-wrapper {
		gap: 1.25rem;
		margin: 0 auto;
	}

	.curve-main-layout {
		display: grid;
		grid-template-columns: 1fr 380px;
		gap: 1.25rem;
		align-items: stretch;
	}

	@media (max-width: 950px) {
		.curve-main-layout {
			grid-template-columns: 1fr;
		}
	}

	.curve-chart-card {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-xl, 16px);
		padding: 1.25rem 1.5rem 1rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.75rem;
		box-sizing: border-box;
		min-height: 320px;
	}

	.chart-legend-row {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 1.25rem;
		font-size: 0.78rem;
		color: hsl(var(--muted-foreground));
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}

	.legend-swatch {
		width: 11px;
		height: 11px;
		border-radius: 2px;
	}

	.creature-swatch, .creature-segment, .type-creature { background: #f97316 !important; }
	.noncreature-swatch, .noncreature-segment { background: #0284c7 !important; }
	.type-instant { background: #38bdf8 !important; }
	.type-sorcery { background: #818cf8 !important; }
	.type-artifact { background: #94a3b8 !important; }
	.type-enchantment { background: #ec4899 !important; }
	.type-planeswalker { background: #a855f7 !important; }
	.pip-segment-w { background: #f8fafc !important; }
	.pip-segment-u { background: #38bdf8 !important; }
	.pip-segment-b { background: #475569 !important; border-top: 1px solid rgba(255, 255, 255, 0.15); }
	.pip-segment-r { background: #ef4444 !important; }
	.pip-segment-g { background: #22c55e !important; }
	.pip-segment-c { background: #94a3b8 !important; }

	.arena-bar-chart-container {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		height: 220px;
		padding: 0 0.5rem;
		gap: 0.75rem;
		border-bottom: none;
	}

	.arena-curve-column {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: flex-end;
		gap: 0.5rem;
		height: 100%;
		cursor: pointer;
		position: relative;
	}

	.arena-curve-column.selected .cmc-circle-badge {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		box-shadow: 0 0 12px hsl(var(--primary) / 0.6);
	}

	.bar-total-label {
		font-size: 0.9rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		font-variant-numeric: tabular-nums;
	}

	.bar-track {
		width: 42px;
		max-width: 100%;
		border-radius: 6px 6px 0 0;
		overflow: hidden;
		display: flex;
		flex-direction: column-reverse;
		background: hsl(var(--secondary) / 0.35);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
		transition: all 0.25s ease;
	}

	.arena-curve-column:hover .bar-track {
		filter: brightness(1.2);
		transform: scaleY(1.02);
		transform-origin: bottom;
	}

	.bar-segment {
		width: 100%;
		transition: height 0.3s ease;
	}

	.cmc-circle-badge {
		width: 30px;
		height: 30px;
		border-radius: 50%;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.82rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		transition: all 0.2s ease;
	}

	/* Card Preview Stack Drawer */
	.curve-cards-drawer {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-xl, 16px);
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		height: 100%;
		max-height: 330px;
		box-sizing: border-box;
	}

	.drawer-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.drawer-header h4 {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.clear-btn {
		background: transparent;
		border: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		font-size: 0.72rem;
		padding: 0.2rem 0.5rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
	}

	.drawer-cards-list {
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding-right: 0.25rem;
		flex: 1;
	}

	.drawer-card-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.45rem 0.75rem;
		background: hsl(var(--secondary) / 0.35);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		gap: 0.75rem;
		cursor: pointer;
		transition: background 0.15s ease, transform 0.1s ease;
		user-select: none;
	}

	.drawer-card-item:hover {
		background: hsl(var(--secondary) / 0.75);
	}

	.card-name-qty {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		min-width: 0;
		flex: 1;
	}

	.card-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-qty {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.card-cost-and-type {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.card-mana-pips {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.card-type-icon {
		font-size: 0.95rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		line-height: 1;
		opacity: 0.88;
		transition: transform 0.15s ease, opacity 0.15s ease, filter 0.15s ease;
	}

	.drawer-card-item:hover .card-type-icon {
		opacity: 1;
		transform: scale(1.2);
		filter: drop-shadow(0 0 5px currentColor);
	}

	.mana-slash {
		color: hsl(var(--muted-foreground));
		font-size: 0.7rem;
		margin: 0 1px;
	}

	/* Stats Bar Below Both */
	.curve-stats-bar {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-xl, 16px);
		padding: 1.1rem 2rem;
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		align-items: center;
		gap: 1.5rem;
		box-sizing: border-box;
	}

	@media (max-width: 768px) {
		.curve-stats-bar {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.stats-bar-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.stats-bar-label {
		font-size: 0.72rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
		white-space: nowrap;
	}

	.stats-bar-value {
		font-size: 1.05rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	/* 3. CARD TYPES SECTION STYLES */
	.types-dual-layout {
		display: grid;
		grid-template-columns: 1fr 380px;
		gap: 2rem;
	}

	@media (max-width: 900px) {
		.types-dual-layout {
			grid-template-columns: 1fr;
		}
	}

	.types-main-panel, .types-subtypes-panel {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-xl, 16px);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.types-bars-stack {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.type-progress-row {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		cursor: pointer;
		padding: 0.4rem 0.5rem;
		border-radius: var(--radius-md);
		transition: background 0.15s ease;
	}

	.type-progress-row:hover {
		background: hsl(var(--secondary) / 0.5);
	}

	.type-name-and-count {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.9rem;
	}

	.type-label-badge {
		border-left: 3px solid;
		padding-left: 0.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.type-count-text {
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.type-count-text .pct {
		font-weight: 400;
		color: hsl(var(--muted-foreground));
		font-size: 0.8rem;
	}

	.type-bar-bg {
		width: 100%;
		height: 8px;
		background: hsl(var(--secondary) / 0.6);
		border-radius: 4px;
		overflow: hidden;
	}

	.type-bar-fill {
		height: 100%;
		border-radius: 4px;
		transition: width 0.4s ease;
	}

	.permanents-summary-box {
		display: flex;
		align-items: center;
		justify-content: space-around;
		background: hsl(var(--secondary) / 0.4);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		margin-top: 0.5rem;
	}

	.perm-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.perm-icon {
		color: #f97316;
	}

	.perm-icon.spells {
		color: #38bdf8;
	}

	.perm-num {
		font-size: 1.35rem;
		font-weight: 800;
		display: block;
		line-height: 1.1;
		color: hsl(var(--foreground));
	}

	.perm-title {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.perm-divider {
		width: 1px;
		height: 40px;
		background: hsl(var(--border) / 0.5);
	}

	/* Subtypes breakdown (Arena look) */
	.panel-subtitle {
		margin: -1rem 0 0 0;
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
	}

	.subtypes-list {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		max-height: 480px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.subtype-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.85rem;
		background: hsl(var(--secondary) / 0.3);
		border-radius: var(--radius-md);
		font-size: 0.85rem;
	}

	.subtype-name {
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.subtype-pill {
		font-weight: 700;
		color: hsl(var(--primary));
		font-variant-numeric: tabular-nums;
	}

	.empty-subtypes-notice {
		color: hsl(var(--muted-foreground));
		font-size: 0.85rem;
		padding: 2rem 0;
		text-align: center;
	}

	/* 4. COLORS & MANA BASE STYLES */
	.colors-dashboard-grid {
		display: grid;
		grid-template-columns: 1fr 340px;
		gap: 2rem;
	}

	@media (max-width: 900px) {
		.colors-dashboard-grid {
			grid-template-columns: 1fr;
		}
	}

	.color-comparison-card {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-xl, 16px);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.card-desc {
		margin: 0;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.color-comparison-table {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-top: 1rem;
	}

	.table-header-row {
		display: grid;
		grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1.2fr;
		padding: 0.6rem 0.8rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsl(var(--border) / 0.4);
	}

	.table-data-row {
		display: grid;
		grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1.2fr;
		align-items: center;
		padding: 0.75rem 0.8rem;
		background: hsl(var(--secondary) / 0.25);
		border-radius: var(--radius-md);
		font-size: 0.85rem;
	}

	.color-symbol-cell {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.color-name {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.data-val {
		color: hsl(var(--foreground));
	}

	.data-val.bold {
		font-weight: 700;
	}

	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		padding: 0.2rem 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.72rem;
		font-weight: 600;
	}

	.status-badge.good {
		background: rgba(34, 197, 94, 0.15);
		color: #22c55e;
	}

	.status-badge.fair {
		background: rgba(56, 189, 248, 0.15);
		color: #38bdf8;
	}

	.status-badge.warn {
		background: rgba(239, 68, 68, 0.15);
		color: #ef4444;
	}

	.color-breakdown-side-cards {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.stats-mini-panel {
		background: hsl(var(--card) / 0.4);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.stats-mini-panel h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.complexity-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.complexity-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.complexity-item .num {
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.mana-summary-list {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
	}

	.summary-stat-box {
		background: hsl(var(--secondary) / 0.4);
		border-radius: var(--radius-md);
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: center;
	}

	.summary-stat-box .title {
		font-size: 0.72rem;
		font-weight: 600;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
	}

	.summary-stat-box .big-val {
		font-size: 1.8rem;
		font-weight: 800;
		color: hsl(var(--primary));
	}

	/* 5. BUDGET SECTION STYLES */
	.budget-hero-row {
		display: grid;
		grid-template-columns: 1.5fr 1fr 1fr;
		gap: 1.5rem;
	}

	@media (max-width: 800px) {
		.budget-hero-row {
			grid-template-columns: 1fr;
		}
	}

	.budget-kpi-card {
		background: hsl(var(--card) / 0.45);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.budget-kpi-card.total-kpi {
		background: linear-gradient(135deg, hsl(var(--card) / 0.7) 0%, hsl(var(--primary) / 0.15) 100%);
		border-color: hsl(var(--primary) / 0.4);
	}

	.kpi-label {
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.kpi-amount {
		margin: 0;
		font-size: 2.2rem;
		font-weight: 800;
		color: #38bdf8;
		font-variant-numeric: tabular-nums;
	}

	.kpi-secondary-amount {
		margin: 0;
		font-size: 1.6rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.kpi-subtext {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.budget-details-grid {
		display: grid;
		grid-template-columns: 1fr 360px;
		gap: 2rem;
	}

	@media (max-width: 900px) {
		.budget-details-grid {
			grid-template-columns: 1fr;
		}
	}

	.expensive-cards-card {
		background: hsl(var(--card) / 0.45);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-xl, 16px);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.top-cards-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.expensive-card-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.6rem 0.85rem;
		background: hsl(var(--secondary) / 0.35);
		border-radius: var(--radius-md);
		font-size: 0.85rem;
	}

	.card-rank {
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		width: 24px;
	}

	.card-thumb {
		width: 44px;
		height: 32px;
		object-fit: cover;
		border-radius: 4px;
	}

	.card-thumb-fallback {
		width: 44px;
		height: 32px;
		background: hsl(var(--secondary));
		border-radius: 4px;
	}

	.card-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		overflow: hidden;
	}

	.card-info .name {
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-info .type-board {
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground));
		text-transform: capitalize;
	}

	.price-pill-wrapper {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.15rem;
	}

	.price-pill {
		font-weight: 700;
		color: #38bdf8;
		font-variant-numeric: tabular-nums;
	}

	.pct-pill {
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground));
	}

	.budget-breakdown-sidebar {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.budget-panel-box {
		background: hsl(var(--card) / 0.4);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.budget-panel-box h4 {
		margin: 0;
		font-size: 0.95rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.board-values-list {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}

	.board-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.board-row .val {
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.tiers-list {
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.tier-item {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.tier-header {
		display: flex;
		justify-content: space-between;
		font-size: 0.8rem;
	}

	.tier-label {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.tier-count {
		color: hsl(var(--muted-foreground));
	}

	.tier-bar-bg {
		width: 100%;
		height: 6px;
		background: hsl(var(--secondary) / 0.6);
		border-radius: 3px;
		overflow: hidden;
	}

	.tier-bar-fill {
		height: 100%;
		border-radius: 3px;
		transition: width 0.3s ease;
	}
</style>
