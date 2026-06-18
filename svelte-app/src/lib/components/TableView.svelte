<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { checkLegality } from "$lib/utils/legality.js";
	import { getGroupedCategories } from "$lib/layouts/grouping.svelte.js";
	import { fade } from "svelte/transition";
	import { onMount } from "svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import { SvelteSet } from "svelte/reactivity";
	import { db } from "$lib/db";
	import {
		MoreVertical,
		Trash2,
		Info,
		ChevronDown,
		AlertTriangle,
		ArrowUp,
		ArrowDown,
		Plus,
		X,
		Star,
		Undo
	} from "lucide-svelte";

	let isDragOver = $state(false);
	let lastSorting = $state(deckStore.sorting);
	let collapsedCategories = $state(new SvelteSet());

	/** @param {string} categoryName */
	function toggleCategoryCollapse(categoryName) {
		if (collapsedCategories.has(categoryName)) {
			collapsedCategories.delete(categoryName);
		} else {
			collapsedCategories.add(categoryName);
		}
	}

	// Selection Visible IDs sync
	$effect(() => {
		/** @type {string[]} */
		const visibleIds = [];
		for (const cat of groupedCategories) {
			if (!collapsedCategories.has(cat.name)) {
				for (const cardRow of cat.cards) {
					const firstInst = cardRow.instances[0];
					if (firstInst && firstInst.id) {
						visibleIds.push(firstInst.id);
					}
				}
			}
		}
		interactionStore.currentVisibleCardIds = visibleIds;
	});

	// Tag states & dragging
	let activeTagsPopoverCardId = $state(null);
	let newTagValue = $state("");

	const deckTagsList = $derived.by(() => {
		const tags = new Set();
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			if (storeAny[board]) {
				const list = storeAny[board] || [];
				for (const c of list) {
					if (c.tags) {
						for (const t of c.tags) {
							tags.add(t);
						}
					}
				}
			}
		}
		return Array.from(tags).sort();
	});

	/** @param {string} tag */
	function getTagBgColor(tag) {
		let hash = 0;
		for (let i = 0; i < tag.length; i++) {
			hash = tag.charCodeAt(i) + ((hash << 5) - hash);
		}
		const h = Math.abs(hash) % 360;
		return `hsl(${h}, 25%, 35%)`;
	}

	/** @type {number | null} */
	let draggedTagIdx = null;
	/** @type {string | null} */
	let draggedTagCardId = null;

	/**
	 * @param {DragEvent} e
	 * @param {string} cardId
	 * @param {number} idx
	 */
	function handleTagDragStart(e, cardId, idx) {
		draggedTagIdx = idx;
		draggedTagCardId = cardId;
		if (e.dataTransfer) {
			e.dataTransfer.effectAllowed = "move";
		}
	}

	/**
	 * @param {DragEvent} e
	 * @param {string} cardId
	 * @param {number} targetIdx
	 */
	function handleTagDrop(e, cardId, targetIdx) {
		e.preventDefault();
		if (draggedTagCardId !== cardId || draggedTagIdx === null) return;
		
		const cardRes = deckStore.findCardById(cardId);
		if (cardRes && cardRes.card && cardRes.card.tags) {
			const tags = [...cardRes.card.tags];
			const [removed] = tags.splice(draggedTagIdx, 1);
			tags.splice(targetIdx, 0, removed);
			deckStore.reorderCardTags(cardId, tags);
		}
		draggedTagIdx = null;
		draggedTagCardId = null;
	}

	// Inline Overrides states
	let editingCmcCardId = $state(/** @type {string | null} */ (null));
	let editingTypeCardId = $state(/** @type {string | null} */ (null));
	let editingColorCardId = $state(/** @type {string | null} */ (null));

	let inlineCmcVal = $state("");
	let inlineTypeVal = $state("");
	let inlineColorVal = $state("");
	let activeColorOptionIdx = $state(0);
	let hasTyped = $state(false);

	let editingCardName = $state(/** @type {string | null} */ (null));
	let editingCardZone = $state(/** @type {string | null} */ (null));
	let localQtyText = $state("");

	const activeEditingQtyId = $derived.by(() => {
		if (!editingCardName) return null;
		for (const cat of groupedCategories) {
			for (const row of cat.cards) {
				if (row.name === editingCardName && row.zone === editingCardZone) {
					return row.instances[0]?.id || null;
				}
			}
		}
		return null;
	});

	// Name inline editing states
	let editingNameCardId = $state(/** @type {string | null} */ (null));
	let inlineNameVal = $state("");
	/** @type {string[]} */
	let nameSuggestions = $state([]);
	let activeNameOptionIdx = $state(0);
	let hasNameTyped = $state(false);
	let nameError = $state(false);

	// Tags inline editing states
	let editingTagsCardId = $state(/** @type {string | null} */ (null));
	let inlineTagsVal = $state("");
	let activeTagsOptionIdx = $state(0);
	let hasTagsTyped = $state(false);

	// Printing inline editing states
	let editingPrintingCardId = $state(/** @type {string | null} */ (null));
	let inlinePrintingVal = $state("");
	/** @type {any[]} */
	let availablePrintings = $state([]);
	let activePrintingOptionIdx = $state(0);
	let hasPrintingTyped = $state(false);
	let isLoadingPrintings = $state(false);

	// Visible columns order sync
	$effect(() => {
		const order = ['qty', 'name'];
		const cols = settingsStore.visibleColumns;
		if (cols.includes('mana')) order.push('mana');
		if (cols.includes('cmc')) order.push('cmc');
		if (cols.includes('type')) order.push('type');
		if (cols.includes('printing')) order.push('printing');
		if (cols.includes('color-cat')) order.push('color-cat');
		if (cols.includes('color-id')) order.push('color-id');
		if (cols.includes('tags')) order.push('tags');
		if (cols.includes('price')) order.push('price');
		interactionStore.visibleColumnsOrder = order;
	});

	let isTriggeredByTyping = false;

	// Handle typing-to-edit triggers
	$effect(() => {
		const trigger = interactionStore.inlineEditTrigger;
		if (trigger) {
			isTriggeredByTyping = true;
			const { cardId, columnKey, initialKey } = trigger;
			if (columnKey === 'cmc') {
				editingCmcCardId = cardId;
				inlineCmcVal = initialKey;
			} else if (columnKey === 'type') {
				editingTypeCardId = cardId;
				inlineTypeVal = initialKey;
			} else if (columnKey === 'color-cat') {
				editingColorCardId = cardId;
				inlineColorVal = initialKey;
				hasTyped = true;
			} else if (columnKey === 'name') {
				editingNameCardId = cardId;
				inlineNameVal = initialKey;
				hasNameTyped = true;
				nameSuggestions = [];
			} else if (columnKey === 'qty') {
				for (const cat of groupedCategories) {
					for (const row of cat.cards) {
						if (row.instances[0]?.id === cardId) {
							editingCardName = row.name;
							editingCardZone = row.zone;
							localQtyText = initialKey;
							break;
						}
					}
				}
			} else if (columnKey === 'tags') {
				editingTagsCardId = cardId;
				inlineTagsVal = initialKey;
				hasTagsTyped = true;
			} else if (columnKey === 'printing') {
				editingPrintingCardId = cardId;
				inlinePrintingVal = initialKey;
				hasPrintingTyped = true;
			}
			interactionStore.clearInlineEditTrigger();
		}
	});

	import { scryfallFetch } from "$lib/api/scryfall.js";

	/**
	 * @param {string} query
	 * @returns {string[]}
	 */
	function getFilteredTags(query) {
		if (!hasTagsTyped) return deckTagsList;
		const parts = (query || "").split(",");
		const lastPart = (parts[parts.length - 1] || "").trim().toLowerCase();
		if (!lastPart) return deckTagsList;
		return deckTagsList.filter(t => t.toLowerCase().includes(lastPart));
	}

	/**
	 * @param {any} cardRow
	 * @param {string} tag
	 */
	function selectTagSuggestion(cardRow, tag) {
		const parts = inlineTagsVal.split(",").map(p => p.trim());
		if (parts.length > 0) {
			parts[parts.length - 1] = tag;
		} else {
			parts.push(tag);
		}
		inlineTagsVal = parts.join(", ") + ", ";
		activeTagsOptionIdx = 0;
	}

	/**
	 * @param {any} cardRow
	 */
	function handleTagsSubmit(cardRow) {
		if (editingTagsCardId !== cardRow.instances[0]?.id) return;
		editingTagsCardId = null;

		const cleanTags = inlineTagsVal
			.split(",")
			.map(t => t.trim())
			.filter(Boolean);

		const uniqueTags = [...new Set(cleanTags)];
		const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:tags`)
			? [...interactionStore.selectedCells]
				.filter(k => k.endsWith(':tags'))
				.map(k => k.split(':')[0])
			: [cardRow.instances[0].id];

		for (const id of ids) {
			deckStore.reorderCardTags(id, uniqueTags);
		}
	}

	/**
	 * @param {string} cardName
	 */
	async function fetchCardPrintings(cardName) {
		isLoadingPrintings = true;
		availablePrintings = [];
		try {
			const q = `!"${cardName}" unique:prints`;
			const response = await scryfallFetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`);
			if (response.ok) {
				const data = await response.json();
				if (data && data.data) {
					availablePrintings = data.data;
				}
			}
		} catch (e) {
			console.error("Failed to fetch card printings:", e);
		} finally {
			isLoadingPrintings = false;
		}
	}

	/**
	 * @param {string} query
	 * @returns {any[]}
	 */
	function getFilteredPrintings(query) {
		if (!hasPrintingTyped) return availablePrintings;
		const q = (query || "").trim().toLowerCase();
		if (!q) return availablePrintings;
		return availablePrintings.filter(p => {
			const setCode = (p.set || "").toLowerCase();
			const setName = (p.set_name || "").toLowerCase();
			const collectorNumber = (p.collector_number || "").toLowerCase();
			return setCode.includes(q) || setName.includes(q) || collectorNumber.includes(q) || `${setCode} ${collectorNumber}`.includes(q);
		});
	}

	/**
	 * @param {any} cardRow
	 * @param {any} printingCard
	 */
	async function applyPrinting(cardRow, printingCard) {
		if (printingCard) {
			deckStore.setCardPrinting(cardRow.name, printingCard);
		} else {
			try {
				const defaultCard = await db.cards.where("name").equals(cardRow.name).first();
				if (defaultCard) {
					const localPrice = priceStore.getPrice(cardRow.name);
					const metadata = {
						id: defaultCard.id,
						name: defaultCard.name,
						type_line: defaultCard.type,
						oracle_text: defaultCard.text,
						mana_cost: defaultCard.mana,
						cmc: defaultCard.cmc,
						colors: defaultCard.colors || [],
						color_identity: defaultCard.identity || [],
						image_uris: {
							normal: defaultCard.image,
							art_crop: defaultCard.image ? defaultCard.image.replace('/normal/', '/art_crop/') : null
						},
						prices: {
							usd: localPrice !== null ? String(localPrice) : null,
							usd_foil: null
						}
					};
					deckStore.setCardPrinting(cardRow.name, metadata);
				}
			} catch (e) {
				console.error("Failed to reset printing:", e);
			}
		}
		editingPrintingCardId = null;
	}


	/**
	 * @param {string} query
	 */
	async function updateNameSuggestions(query) {
		const q = (query || "").trim();
		if (q.length < 2) {
			nameSuggestions = [];
			activeNameOptionIdx = 0;
			return;
		}
		try {
			const matches = await db.cards
				.where("name")
				.startsWithIgnoreCase(q)
				.limit(10)
				.toArray();
			const uniqueNames = [...new Set(matches.map(m => m.name))];
			nameSuggestions = uniqueNames;
			activeNameOptionIdx = 0;
		} catch (e) {
			nameSuggestions = [];
		}
	}

	/**
	 * @param {any} cardRow
	 * @param {string} newName
	 */
	async function handleNameSubmit(cardRow, newName) {
		if (editingNameCardId !== cardRow.instances[0]?.id) return;
		
		const cleanNewName = newName.trim();
		if (!cleanNewName) {
			editingNameCardId = null;
			return;
		}

		try {
			const foundCard = await db.cards.where("name").equals(cleanNewName).first();
			if (!foundCard) {
				const matches = await db.cards.where("name").startsWithIgnoreCase(cleanNewName).limit(1).toArray();
				if (matches.length > 0) {
					const correctName = matches[0].name;
					const priceRecord = await db.prices.get(matches[0].id);
					const price = priceRecord ? priceRecord.price : 0;
					
					editingNameCardId = null;
					deckStore.renameCard(cardRow.name, correctName, price, {
						name: matches[0].name,
						type_line: matches[0].type || "",
						mana_cost: matches[0].mana || "",
						cmc: matches[0].cmc ?? 0,
						colors: matches[0].colors || [],
						color_identity: matches[0].identity || [],
						image_uris: { normal: matches[0].image }
					});
					return;
				}
				nameError = true;
				return;
			}

			const priceRecord = await db.prices.get(foundCard.id);
			const price = priceRecord ? priceRecord.price : 0;

			editingNameCardId = null;
			deckStore.renameCard(cardRow.name, foundCard.name, price, {
				name: foundCard.name,
				type_line: foundCard.type || "",
				mana_cost: foundCard.mana || "",
				cmc: foundCard.cmc ?? 0,
				colors: foundCard.colors || [],
				color_identity: foundCard.identity || [],
				image_uris: { normal: foundCard.image }
			});
		} catch (e) {
			nameError = true;
		}
	}

	/**
	 * @param {KeyboardEvent} e
	 * @param {any} cardRow
	 */
	function handleNameKeyDown(e, cardRow) {
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (nameSuggestions.length > 0) {
				activeNameOptionIdx = (activeNameOptionIdx + 1) % nameSuggestions.length;
			}
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (nameSuggestions.length > 0) {
				activeNameOptionIdx = (activeNameOptionIdx - 1 + nameSuggestions.length) % nameSuggestions.length;
			}
		} else if (e.key === "Enter") {
			e.preventDefault();
			const selected = nameSuggestions[activeNameOptionIdx];
			if (selected) {
				handleNameSubmit(cardRow, selected);
			} else {
				handleNameSubmit(cardRow, inlineNameVal);
			}
		} else if (e.key === "Escape") {
			editingNameCardId = null;
		}
	}

	/** @param {any} cardRow */
	function handleQtySubmit(cardRow) {
		if (
			editingCardName !== cardRow.name ||
			editingCardZone !== cardRow.zone
		)
			return;

		const parsed = parseInt(localQtyText, 10);
		if (isNaN(parsed)) {
			editingCardName = null;
			editingCardZone = null;
			return;
		}

		const hasSelectedSelf = cardRow.instances[0] && interactionStore.selectedCells.has(`${cardRow.instances[0].id}:qty`);
		/** @type {any[]} */
		const targets = [];
		if (hasSelectedSelf) {
			for (const cat of groupedCategories) {
				for (const row of cat.cards) {
					const firstId = row.instances[0]?.id;
					if (firstId && interactionStore.selectedCells.has(`${firstId}:qty`)) {
						targets.push(row);
					}
				}
			}
		} else {
			targets.push(cardRow);
		}

		deckStore.batchUpdate(() => {
			for (const row of targets) {
				if (parsed <= 0) {
					deckStore.removeAllCopies(row.name, row.zone);
				} else {
					deckStore.setQuantity(
						row.name,
						row.zone,
						parsed,
						row.price,
						row.card,
					);
				}
			}
		});

		editingCardName = null;
		editingCardZone = null;
	}

	/**
	 * @param {KeyboardEvent} e
	 * @param {any} cardRow
	 */
	function handleQtyKeyDown(e, cardRow) {
		if (e.key === "Enter") {
			e.preventDefault();
			handleQtySubmit(cardRow);
		} else if (e.key === "Escape") {
			e.preventDefault();
			editingCardName = null;
			editingCardZone = null;
		}
	}

	const allColorOptions = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"];

	/**
	 * @param {string} query
	 * @param {boolean} typed
	 * @returns {{ option: string, matches: boolean, visible: boolean }[]}
	 */
	function getColorOptionsState(query, typed) {
		const q = (query || "").trim().toLowerCase();
		if (!typed) {
			return allColorOptions.map(opt => ({ option: opt, matches: true, visible: true }));
		}
		return allColorOptions.map(opt => {
			const matches = opt.toLowerCase().includes(q);
			return {
				option: opt,
				matches,
				visible: allColorOptions.length < 10 ? true : matches
			};
		});
	}

	/**
	 * @param {KeyboardEvent} e
	 * @param {any} cardRow
	 */
	function handleColorKeyDown(e, cardRow) {
		const optionsState = getColorOptionsState(inlineColorVal, hasTyped);
		const activeOptions = optionsState.filter(item => item.visible && item.matches);
		
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (activeOptions.length > 0) {
				activeColorOptionIdx = (activeColorOptionIdx + 1) % activeOptions.length;
			}
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (activeOptions.length > 0) {
				activeColorOptionIdx = (activeColorOptionIdx - 1 + activeOptions.length) % activeOptions.length;
			}
		} else if (e.key === "Enter") {
			e.preventDefault();
			const selectedItem = activeOptions[activeColorOptionIdx];
			if (selectedItem) {
				applyColorOverride(cardRow, selectedItem.option);
			} else {
				applyColorOverride(cardRow, inlineColorVal);
			}
		} else if (e.key === "Escape") {
			editingColorCardId = null;
		}
	}

	/**
	 * @param {any} cardRow
	 */
	function handleColorSubmit(cardRow) {
		if (editingColorCardId !== cardRow.instances[0]?.id) return;
		editingColorCardId = null;

		const optionsState = getColorOptionsState(inlineColorVal, hasTyped);
		const activeOptions = optionsState.filter(item => item.visible && item.matches);
		if (activeOptions.length > 0) {
			const match = activeOptions.find(opt => opt.option.toLowerCase() === inlineColorVal.trim().toLowerCase());
			if (match) {
				applyColorOverride(cardRow, match.option);
			} else {
				applyColorOverride(cardRow, activeOptions[0].option);
			}
		}
	}

	/**
	 * @param {any} cardRow
	 * @param {string} colorOpt
	 */
	function applyColorOverride(cardRow, colorOpt) {
		if (cardRow.instances[0] && colorOpt) {
			const formattedOpt = colorOpt.charAt(0).toUpperCase() + colorOpt.slice(1).toLowerCase();
			const validOptions = ["White", "Blue", "Black", "Red", "Green", "Multicolor", "Colorless", "Lands"];
			const matchedOpt = validOptions.find(o => o.toLowerCase() === formattedOpt.toLowerCase()) || formattedOpt;

			const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:color-cat`)
				? [...interactionStore.selectedCells]
					.filter(k => k.endsWith(':color-cat'))
					.map(k => k.split(':')[0])
				: [cardRow.instances[0].id];

			for (const id of ids) {
				deckStore.setCardOverride(id, 'colorCategory', matchedOpt);
				/** @type {Record<string, string[]>} */
				const mapColors = { "White": ["W"], "Blue": ["U"], "Black": ["B"], "Red": ["R"], "Green": ["G"] };
				if (mapColors[matchedOpt]) {
					deckStore.setCardOverride(id, 'colors', mapColors[matchedOpt]);
					deckStore.setCardOverride(id, 'colorIdentity', mapColors[matchedOpt]);
				} else if (matchedOpt === "Colorless") {
					deckStore.setCardOverride(id, 'colors', []);
					deckStore.setCardOverride(id, 'colorIdentity', []);
				}
			}
		}
		editingColorCardId = null;
	}

	/**
	 * @param {any} cardRow
	 */
	function resetColorOverride(cardRow) {
		if (cardRow.instances[0]) {
			const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:color-cat`)
				? [...interactionStore.selectedCells]
					.filter(k => k.endsWith(':color-cat'))
					.map(k => k.split(':')[0])
				: [cardRow.instances[0].id];

			for (const id of ids) {
				deckStore.resetCardOverride(id, 'colorCategory');
				deckStore.resetCardOverride(id, 'colors');
				deckStore.resetCardOverride(id, 'colorIdentity');
			}
		}
		editingColorCardId = null;
	}

	/** @param {HTMLInputElement} node */
	function selectOnMount(node) {
		node.focus();
		if (isTriggeredByTyping) {
			const val = node.value;
			node.value = "";
			node.value = val;
			isTriggeredByTyping = false;
		} else {
			node.select();
		}
	}

	/** @param {HTMLInputElement} node */
	function focusOnMount(node) {
		node.focus();
		const val = node.value;
		node.value = "";
		node.value = val;
	}

	$effect(() => {
		if (deckStore.sorting !== lastSorting) {
			lastSorting = deckStore.sorting;
			deckStore.sortAscending =
				lastSorting !== "price" && lastSorting !== "added";
		}
	});

	/** @param {string} columnId */
	function handleHeaderClick(columnId) {
		/** @type {Record<string, string>} */
		const colToSortId = {
			qty: "qty",
			name: "name",
			mana: "mana",
			cmc: "cmc",
			type: "type",
			printing: "printing",
			"color-cat": "color",
			"color-id": "color",
			price: "price",
		};

		const sortFactor = colToSortId[columnId];
		if (!sortFactor) return;

		const defaultAsc = sortFactor !== "price" && sortFactor !== "added";

		if (deckStore.sorting === sortFactor) {
			const isCurrentlyDefault = deckStore.sortAscending === defaultAsc;
			if (isCurrentlyDefault) {
				deckStore.sortAscending = !defaultAsc;
			} else {
				// Toggle off back to natural default sorting
				const fallback =
					deckStore.grouping === "color" ? "cmc" : "color";
				deckStore.sorting = fallback;
				deckStore.sortAscending = true;
			}
		} else {
			deckStore.sorting = sortFactor;
			deckStore.sortAscending = defaultAsc;
		}
	}

	// Parse mana symbols from Scryfall format (e.g. {3}{W}{U} -> ['3', 'w', 'u'])
	/**
	 * @param {string} manaCostStr
	 * @returns {string[]}
	 */
	function parseManaCost(manaCostStr) {
		if (!manaCostStr) return [];
		const matches = manaCostStr.match(/\{[^}]+\}/g);
		if (!matches) return [];
		/** @type {string[]} */
		const result = [];
		for (const m of matches) {
			result.push(m.slice(1, -1).toLowerCase().replace("/", ""));
		}
		return result;
	}

	// Calculate a human-readable color category word
	/**
	 * @param {any} cardRow
	 * @returns {string}
	 */
	function getColorCategory(cardRow) {
		const type = (cardRow.type || "").toLowerCase();
		if (type.includes("land")) return "Land";
		const colors = cardRow.colors || [];
		if (colors.length === 0) return "Colorless";
		if (colors.length > 1) return "Multicolor";
		/** @type {Record<string, string>} */
		const colorNames = {
			W: "White",
			U: "Blue",
			B: "Black",
			R: "Red",
			G: "Green",
		};
		return colorNames[colors[0]] || "Colorless";
	}

	// Group and sort card rows Reactively in Svelte 5
	const groupedCategories = $derived.by(getGroupedCategories);

	// Drag & Drop handlers
	/**
	 * @param {DragEvent} e
	 */
	function handleDragOver(e) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	/**
	 * @param {DragEvent} e
	 */
	async function handleDrop(e) {
		isDragOver = false;
		if (!e.dataTransfer) return;
		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (internalData) {
			e.preventDefault();
			e.stopPropagation();
			const data = JSON.parse(internalData);
			const cardsToProcess = data.selectedCards || [data];
			deckStore.batchUpdate(() => {
				for (const item of cardsToProcess) {
					if (!item.fromDeck || item.sourceBoard !== deckStore.activeBoard) {
						const isLocalSource = [
							"sideboard",
							"maybeboard",
							"garbage",
							"commander",
							"companion",
							"mainboard",
						].includes(item.sourceBoard);

						if (item.sourceBoard !== deckStore.activeBoard) {
							if (isLocalSource) {
								deckStore.moveCard(
									item.name,
									item.sourceBoard,
									deckStore.activeBoard,
									item.id,
									item.price,
								);
							} else {
								deckStore.addCard(
									item.name,
									deckStore.activeBoard,
									item.price,
									item.card,
								);
							}
						}
					}
				}
			});
		}
	}

	// Dynamic Category Scroll Tracking to Fade Out Covered Sticky Header Contents
	/** @type {HTMLDivElement | null} */
	let tableWrapperEl = $state(null);
	let stuckCategories = $state(new Set());
	let activeCategoryName = $state("");

	function handleScroll() {
		if (!tableWrapperEl) return;
		const headerElements = tableWrapperEl.querySelectorAll(
			".category-header-row",
		);

		// The top boundary of the sticky area is the thead height (38px)
		const stickyThreshold = tableWrapperEl.getBoundingClientRect().top + 38;

		const newStuck = new Set();
		let currentActive = "";

		for (const el of headerElements) {
			const rect = el.getBoundingClientRect();
			const name = el.getAttribute("data-category") || "";

			// Detect if the section header is currently at or above the sticky line
			if (rect.top <= stickyThreshold + 2) {
				newStuck.add(name);
				currentActive = name; // The lowest stuck category is the active stuck category
			}
		}

		stuckCategories = newStuck;
		activeCategoryName = currentActive;
	}
	let isDraggingSelection = $state(false);

	$effect(() => {
		const editId = interactionStore.editingCardId;
		if (editId) {
			for (const cat of groupedCategories) {
				const match = cat.cards.find((/** @type {any} */ row) => row.instances.some((/** @type {any} */ inst) => inst.id === editId));
				if (match) {
					editingCardName = match.name;
					editingCardZone = match.zone;
					localQtyText = String(match.quantity);
					interactionStore.stopEditing();
					break;
				}
			}
		}
	});

	onMount(() => {
		handleScroll();
		const handleGlobalMouseUp = () => {
			isDraggingSelection = false;
		};
		window.addEventListener("mouseup", handleGlobalMouseUp);
		return () => {
			window.removeEventListener("mouseup", handleGlobalMouseUp);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="table-view-container"
	class:drag-over={isDragOver}
	class:compact={layoutStore.isCondensed}
	class:spacious={!layoutStore.isCondensed}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<div class="table-border-shield">
		<div
			class="table-wrapper"
			bind:this={tableWrapperEl}
			onscroll={handleScroll}
		>
			<table class="deck-table">
				<thead>
					<tr>
						<th
							class="col-qty sortable"
							class:active-sort={deckStore.sorting === "qty"}
							onclick={() => handleHeaderClick("qty")}
						>
							<div class="header-cell-inner">
								<span>#</span>
								{#if deckStore.sorting === "qty"}
									{#if deckStore.sortAscending}
										<ArrowUp
											size={12}
											class="sort-indicator"
										/>
									{:else}
										<ArrowDown
											size={12}
											class="sort-indicator"
										/>
									{/if}
								{/if}
							</div>
						</th>
						<th
							class="col-name sortable"
							class:active-sort={deckStore.sorting === "name"}
							onclick={() => handleHeaderClick("name")}
						>
							<div class="header-cell-inner">
								<span>CARD NAME</span>
								{#if deckStore.sorting === "name"}
									{#if deckStore.sortAscending}
										<ArrowUp
											size={12}
											class="sort-indicator"
										/>
									{:else}
										<ArrowDown
											size={12}
											class="sort-indicator"
										/>
									{/if}
								{/if}
							</div>
						</th>
						{#if settingsStore.visibleColumns.includes("mana")}
							<th
								class="col-mana sortable"
								class:active-sort={deckStore.sorting === "mana"}
								onclick={() => handleHeaderClick("mana")}
							>
								<div class="header-cell-inner">
									<span>MANA COST</span>
									{#if deckStore.sorting === "mana"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("cmc")}
							<th
								class="col-cmc sortable"
								class:active-sort={deckStore.sorting === "cmc"}
								onclick={() => handleHeaderClick("cmc")}
							>
								<div class="header-cell-inner">
									<span>MV</span>
									{#if deckStore.sorting === "cmc"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("type")}
							<th
								class="col-type sortable"
								class:active-sort={deckStore.sorting === "type"}
								onclick={() => handleHeaderClick("type")}
							>
								<div class="header-cell-inner">
									<span>TYPE</span>
									{#if deckStore.sorting === "type"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("printing")}
							<th
								class="col-printing sortable"
								class:active-sort={deckStore.sorting ===
									"printing"}
								onclick={() => handleHeaderClick("printing")}
							>
								<div class="header-cell-inner">
									<span>PRINTING</span>
									{#if deckStore.sorting === "printing"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("color-cat")}
							<th
								class="col-color-cat sortable"
								class:active-sort={deckStore.sorting ===
									"color"}
								onclick={() => handleHeaderClick("color-cat")}
							>
								<div class="header-cell-inner">
									<span>COLOR CAT</span>
									{#if deckStore.sorting === "color"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("color-id")}
							<th class="col-color-id">COLOR ID</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("tags")}
							<th class="col-tags">TAGS</th>
						{/if}
						{#if settingsStore.visibleColumns.includes("price")}
							<th
								class="col-price sortable"
								class:active-sort={deckStore.sorting ===
									"price"}
								onclick={() => handleHeaderClick("price")}
							>
								<div class="header-cell-inner price-header">
									<span>PRICE</span>
									{#if deckStore.sorting === "price"}
										{#if deckStore.sortAscending}
											<ArrowUp
												size={12}
												class="sort-indicator"
											/>
										{:else}
											<ArrowDown
												size={12}
												class="sort-indicator"
											/>
										{/if}
									{/if}
								</div>
							</th>
							{#if settingsStore.showTotalPrice}
								<th class="col-total">TOTAL</th>
							{/if}
						{/if}
						<th class="col-actions"></th>
					</tr>
				</thead>
				{#each groupedCategories as category}
					{#if category.cards.length > 0}
						<tbody class="category-group">
							<!-- Section Header Row -->
							<tr
								class="category-header-row"
								data-category={category.name}
								onclick={() =>
									toggleCategoryCollapse(category.name)}
								style="cursor: pointer; user-select: none;"
							>
								{#if !settingsStore.visibleColumns.includes("price")}
									<td
										colspan={2 +
											settingsStore.visibleColumns.length}
										class="spanned-cat-cell"
									>
										<div class="category-header-content">
											<div class="category-pill-box">
												<ChevronDown
													size={14}
													class="category-chevron {collapsedCategories.has(
														category.name,
													)
														? 'collapsed'
														: ''}"
												/>
												<span class="category-title">{category.name}</span>
												<span class="category-count">({(/** @type {any} */ (category)).totalQtyText || category.totalQty})</span>
											</div>
										</div>
									</td>
									<td class="col-actions"></td>
								{:else}
									<td
										colspan={1 +
											settingsStore.visibleColumns.length}
										class="spanned-cat-cell"
									>
										<div class="category-header-content">
											<div class="category-pill-box">
												<ChevronDown
													size={14}
													class="category-chevron {collapsedCategories.has(
														category.name,
													)
														? 'collapsed'
														: ''}"
												/>
												<span class="category-title">{category.name}</span>
												<span class="category-count">({(/** @type {any} */ (category)).totalQtyText || category.totalQty})</span>
											</div>
										</div>
									</td>
									{#if settingsStore.showTotalPrice}
										<td class="col-price"></td>
										<td class="col-total">
											{#if category.totalPrice > 0}
												<div
													class="category-sum"
													transition:fade={{
														duration: 100,
													}}
												>
													${category.totalPrice.toFixed(
														2,
													)}
												</div>
											{/if}
										</td>
									{:else}
										<td class="col-price">
											{#if category.totalPrice > 0}
												<div
													class="category-sum"
													transition:fade={{
														duration: 100,
													}}
												>
													${category.totalPrice.toFixed(
														2,
													)}
												</div>
											{/if}
										</td>
									{/if}
									<td class="col-actions"></td>
								{/if}
							</tr>

							<!-- Individual Card Rows -->
							{#if !collapsedCategories.has(category.name)}
								{#each category.cards as cardRow (cardRow.name)}
									{@const isSelected = cardRow.instances[0] && [...interactionStore.selectedCells].some(cell => cell.startsWith(`${cardRow.instances[0].id}:`))}
									<tr
										class="card-row"
										class:is-illegal={cardRow.isIllegal}
										class:is-selected={isSelected}
										class:is-editing={editingCardName ===
											cardRow.name &&
											editingCardZone === cardRow.zone}
										onmousedown={(e) => {
											if (e.button !== 0) return;
											const targetEl = e.target instanceof HTMLElement ? e.target : null;
											if (targetEl && (
												targetEl.closest('button') || 
												targetEl.closest('input') || 
												targetEl.closest('.action-buttons-cell') ||
												targetEl.closest('.col-actions')
											)) return;

											if (cardRow.instances[0]) {
												const isCmdCtrl = e.metaKey || e.ctrlKey;
												const targetTd = targetEl ? targetEl.closest('td') : null;
												let colKey = null;
												if (targetTd) {
													if (targetTd.classList.contains('col-cmc')) colKey = 'cmc';
													else if (targetTd.classList.contains('col-type')) colKey = 'type';
													else if (targetTd.classList.contains('col-color-cat')) colKey = 'color-cat';
													else if (targetTd.classList.contains('col-qty')) colKey = 'qty';
													else if (targetTd.classList.contains('col-name')) colKey = 'name';
													else if (targetTd.classList.contains('col-tags')) colKey = 'tags';
													else if (targetTd.classList.contains('col-printing')) colKey = 'printing';
													else if (targetTd.classList.contains('col-price')) colKey = 'price';
													else if (targetTd.classList.contains('col-mana')) colKey = 'mana';
													else if (targetTd.classList.contains('col-color-id')) colKey = 'color-id';
												}

												if (e.shiftKey || isCmdCtrl) {
													e.preventDefault();
												}
												if (document.activeElement instanceof HTMLElement) {
													document.activeElement.blur();
												}

												isDraggingSelection = true;
												interactionStore.handleCardSelectClick(
													cardRow.instances[0].id,
													e.shiftKey,
													isCmdCtrl,
													colKey
												);
											}
										}}
										oncontextmenu={(e) => {
											e.preventDefault();
											interactionStore.showMenu(
												e,
												cardRow.instances[0],
												cardRow.zone,
												cardRow.price,
											);
										}}
										onmouseover={(e) => {
											const targetEl = e.target instanceof HTMLElement ? e.target : null;
											let colKey = null;
											if (targetEl) {
												const targetTd = targetEl.closest('td');
												if (targetTd) {
													if (targetTd.classList.contains('col-cmc')) colKey = 'cmc';
													else if (targetTd.classList.contains('col-type')) colKey = 'type';
													else if (targetTd.classList.contains('col-color-cat')) colKey = 'color-cat';
													else if (targetTd.classList.contains('col-qty')) colKey = 'qty';
													else if (targetTd.classList.contains('col-name')) colKey = 'name';
													else if (targetTd.classList.contains('col-tags')) colKey = 'tags';
													else if (targetTd.classList.contains('col-printing')) colKey = 'printing';
													else if (targetTd.classList.contains('col-price')) colKey = 'price';
													else if (targetTd.classList.contains('col-mana')) colKey = 'mana';
													else if (targetTd.classList.contains('col-color-id')) colKey = 'color-id';
												}
											}

											interactionStore.registerHover(
												cardRow.instances[0] || cardRow.card,
												cardRow.zone,
												cardRow.price,
											);
											
											if (isDraggingSelection && cardRow.instances[0] && colKey) {
												interactionStore.handleCardSelectClick(
													cardRow.instances[0].id,
													true,
													false,
													colKey
												);
											}
										}}
										onmouseleave={() =>
											interactionStore.unregisterHover()}
										onfocus={() => {
											interactionStore.registerHover(
												cardRow.instances[0] || cardRow.card,
												cardRow.zone,
												cardRow.price,
											);
										}}
										onblur={() =>
											interactionStore.unregisterHover()}
									>
										<!-- Quantity Display (Clickable/Typable inline input) -->
										<td 
											class="col-qty" 
											class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:qty`)}
											ondblclick={(e) => {
												if (e.shiftKey || e.metaKey || e.ctrlKey) return;
												e.stopPropagation();
												interactionStore.filterSelectionToColumn('qty');
												editingCardName = cardRow.name;
												editingCardZone = cardRow.zone;
												localQtyText = String(cardRow.quantity);
											}}
										>
											{#if editingCardName === cardRow.name && editingCardZone === cardRow.zone}
												<input
													type="number"
													class="qty-inline-input"
													bind:value={localQtyText}
													onblur={() =>
														handleQtySubmit(
															cardRow,
														)}
													onkeydown={(e) =>
														handleQtyKeyDown(
															e,
															cardRow,
														)}
													min="0"
													max="999"
													use:selectOnMount
													onclick={(e) =>
														e.stopPropagation()}
												/>
											{:else}
												<button
													type="button"
													class="qty-text-btn"
													ondblclick={(e) => {
														if (e.shiftKey || e.metaKey || e.ctrlKey) return;
														e.stopPropagation();
														interactionStore.filterSelectionToColumn('qty');
														editingCardName =
															cardRow.name;
														editingCardZone =
															cardRow.zone;
														localQtyText = String(
															cardRow.quantity,
														);
													}}
													title="Double click to change quantity inline"
												>
													{#if activeEditingQtyId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:qty`) && interactionStore.selectedCells.has(`${activeEditingQtyId}:qty`)}
														{localQtyText}
													{:else}
														{cardRow.quantity}
													{/if}
												</button>
											{/if}
										</td>

										<!-- Card Name & Legality Warning -->
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
										<td 
											class="col-name" 
											class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:name`)}
											data-tooltip-img={editingNameCardId === cardRow.instances[0]?.id ? null : cardRow.imgUrl}
											ondblclick={(e) => {
												if (e.shiftKey || e.metaKey || e.ctrlKey) return;
												e.stopPropagation();
												interactionStore.filterSelectionToColumn('name');
												if (cardRow.instances[0]) {
													editingNameCardId = cardRow.instances[0].id;
													inlineNameVal = cardRow.name;
													nameSuggestions = [];
													activeNameOptionIdx = 0;
													hasNameTyped = false;
													nameError = false;
												}
											}}
										>
											<div class="name-container-cell">
												{#if editingNameCardId && cardRow.instances[0] && editingNameCardId === cardRow.instances[0].id}
													<div class="name-edit-wrapper" onclick={(e) => e.stopPropagation()}>
														<input
															type="text"
															class="name-inline-input"
															class:has-error={nameError}
															bind:value={inlineNameVal}
															use:selectOnMount
															oninput={() => {
																hasNameTyped = true;
																nameError = false;
																updateNameSuggestions(inlineNameVal);
															}}
															onblur={() => {
																setTimeout(() => {
																	if (editingNameCardId === cardRow.instances[0]?.id) {
																		handleNameSubmit(cardRow, inlineNameVal);
																	}
																}, 150);
															}}
															onkeydown={(e) => handleNameKeyDown(e, cardRow)}
															title={nameError ? "Invalid card name. Please check spelling or select from suggestions." : ""}
														/>
														{#if nameSuggestions.length > 0}
															<div class="name-suggestions-dropdown">
																{#each nameSuggestions as name, idx}
																	<button
																		type="button"
																		class="name-opt-btn"
																		class:active={idx === activeNameOptionIdx}
																		onmousedown={(e) => {
																			e.preventDefault();
																			editingNameCardId = null;
																			handleNameSubmit(cardRow, name);
																		}}
																	>
																		{name}
																	</button>
																{/each}
															</div>
														{/if}
													</div>
												{:else}
													<span class="card-name-label">
														{#if editingNameCardId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:name`) && interactionStore.selectedCells.has(`${editingNameCardId}:name`)}
															{inlineNameVal}
														{:else}
															{cardRow.name}
														{/if}
													</span>
													{#if cardRow.isIllegal}
														<div
															class="legality-warning-icon"
															title={cardRow.legalityReasons.join(
																", ",
															)}
														>
															<AlertTriangle
																size={12}
															/>
														</div>
													{/if}
												{/if}
											</div>
										</td>

										<!-- Mana Icons (Mana Cost) -->
										{#if settingsStore.visibleColumns.includes("mana")}
											<td 
												class="col-mana"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:mana`)}
											>
												<div class="mana-icons-cell">
													{#each cardRow.manaSymbols as sym}
														{#if sym === "//"}
															<span class="mana-divider">//</span>
														{:else}
															<ManaSymbol
																symbol={sym}
																size="1.1em"
																className="ms-cost"
															/>
														{/if}
													{/each}
												</div>
											</td>
										{/if}

										<!-- Mana Value (Numerical CMC) -->
										{#if settingsStore.visibleColumns.includes("cmc")}
											{@const hasCmcOverride = cardRow.instances[0]?.overrides?.manaValue !== undefined}
											<td 
												class="col-cmc"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:cmc`)}
												ondblclick={(e) => {
													if (e.shiftKey || e.metaKey || e.ctrlKey) return;
													e.stopPropagation();
													interactionStore.filterSelectionToColumn('cmc');
													if (cardRow.instances[0]) {
														editingCmcCardId = cardRow.instances[0].id;
														inlineCmcVal = String(cardRow.cmc);
													}
												}}
											>
												{#if editingCmcCardId && cardRow.instances[0] && editingCmcCardId === cardRow.instances[0].id}
													<input
														type="number"
														class="qty-inline-input"
														bind:value={inlineCmcVal}
														onblur={() => {
															const parsed = parseInt(inlineCmcVal, 10);
															if (!isNaN(parsed) && cardRow.instances[0]) {
																const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:cmc`)
																	? [...interactionStore.selectedCells]
																		.filter(k => k.endsWith(':cmc'))
																		.map(k => k.split(':')[0])
																	: [cardRow.instances[0].id];
																for (const id of ids) {
																	deckStore.setCardOverride(id, 'manaValue', parsed);
																}
															}
															editingCmcCardId = null;
														}}
														onkeydown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																const parsed = parseInt(inlineCmcVal, 10);
																if (!isNaN(parsed) && cardRow.instances[0]) {
																	const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:cmc`)
																		? [...interactionStore.selectedCells]
																			.filter(k => k.endsWith(':cmc'))
																			.map(k => k.split(':')[0])
																		: [cardRow.instances[0].id];
																	for (const id of ids) {
																		deckStore.setCardOverride(id, 'manaValue', parsed);
																	}
																}
																editingCmcCardId = null;
															} else if (e.key === "Escape") {
																editingCmcCardId = null;
															}
														}}
														use:selectOnMount
														onclick={(e) => e.stopPropagation()}
													/>
												{:else}
													<div class="cell-display-wrapper">
														<span 
															class="cmc-badge"
															class:is-overridden={hasCmcOverride}
															title={hasCmcOverride ? "Double click to edit override (Customized)" : "Double click to override"}
														>
															{#if editingCmcCardId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:cmc`) && interactionStore.selectedCells.has(`${editingCmcCardId}:cmc`)}
																{inlineCmcVal}
															{:else}
																{cardRow.cmc}
															{/if}
														</span>
														{#if hasCmcOverride}
															<button
																type="button"
																class="reset-override-btn"
																onclick={(e) => {
																	e.stopPropagation();
																	if (cardRow.instances[0]) {
																		deckStore.resetCardOverride(cardRow.instances[0].id, 'manaValue');
																	}
																}}
																title="Reset to default CMC"
															>
																<Undo size={12} />
															</button>
														{/if}
													</div>
												{/if}
											</td>
										{/if}

										<!-- Type Line -->
										{#if settingsStore.visibleColumns.includes("type")}
											{@const hasTypeOverride = cardRow.instances[0]?.overrides?.primaryType !== undefined}
											<td 
												class="col-type"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:type`)}
												ondblclick={(e) => {
													if (e.shiftKey || e.metaKey || e.ctrlKey) return;
													e.stopPropagation();
													interactionStore.filterSelectionToColumn('type');
													if (cardRow.instances[0]) {
														editingTypeCardId = cardRow.instances[0].id;
														inlineTypeVal = String(cardRow.type);
													}
												}}
											>
												{#if editingTypeCardId && cardRow.instances[0] && editingTypeCardId === cardRow.instances[0].id}
													<input
														type="text"
														class="qty-inline-input text-left"
														style="text-align: left;"
														bind:value={inlineTypeVal}
														onblur={() => {
															if (cardRow.instances[0]) {
																const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:type`)
																	? [...interactionStore.selectedCells]
																		.filter(k => k.endsWith(':type'))
																		.map(k => k.split(':')[0])
																	: [cardRow.instances[0].id];
																for (const id of ids) {
																	deckStore.setCardOverride(id, 'primaryType', inlineTypeVal.trim());
																}
															}
															editingTypeCardId = null;
														}}
														onkeydown={(e) => {
															if (e.key === "Enter") {
																e.preventDefault();
																if (cardRow.instances[0]) {
																	const ids = interactionStore.selectedCells.has(`${cardRow.instances[0].id}:type`)
																		? [...interactionStore.selectedCells]
																			.filter(k => k.endsWith(':type'))
																			.map(k => k.split(':')[0])
																		: [cardRow.instances[0].id];
																	for (const id of ids) {
																		deckStore.setCardOverride(id, 'primaryType', inlineTypeVal.trim());
																	}
																}
																editingTypeCardId = null;
															} else if (e.key === "Escape") {
																editingTypeCardId = null;
															}
														}}
														use:selectOnMount
														onclick={(e) => e.stopPropagation()}
													/>
												{:else}
													<div class="cell-display-wrapper">
														<span
															class="type-text"
															class:is-overridden={hasTypeOverride}
															title={hasTypeOverride ? "Double click to edit override (Customized)" : "Double click to override"}
														>
															{#if editingTypeCardId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:type`) && interactionStore.selectedCells.has(`${editingTypeCardId}:type`)}
																{inlineTypeVal}
															{:else}
																{cardRow.type}
															{/if}
														</span>
														{#if hasTypeOverride}
															<button
																type="button"
																class="reset-override-btn"
																onclick={(e) => {
																	e.stopPropagation();
																	if (cardRow.instances[0]) {
																		deckStore.resetCardOverride(cardRow.instances[0].id, 'primaryType');
																	}
																}}
																title="Reset to default Type"
															>
																<Undo size={12} />
															</button>
														{/if}
													</div>
												{/if}
											</td>
										{/if}

										<!-- Printing (Set and Collector Number) -->
										{#if settingsStore.visibleColumns.includes("printing")}
											<td 
												class="col-printing"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:printing`)}
												class:is-editing={editingPrintingCardId && cardRow.instances[0] && editingPrintingCardId === cardRow.instances[0].id}
												ondblclick={(e) => {
													if (e.shiftKey || e.metaKey || e.ctrlKey) return;
													e.stopPropagation();
													interactionStore.filterSelectionToColumn('printing');
													if (cardRow.instances[0]) {
														editingPrintingCardId = editingPrintingCardId === cardRow.instances[0].id ? null : cardRow.instances[0].id;
														if (editingPrintingCardId) {
															inlinePrintingVal = cardRow.card?.set 
																? `${cardRow.card.set.toUpperCase()} ${cardRow.card.collector_number || ""}`.trim()
																: "";
															activePrintingOptionIdx = 0;
															hasPrintingTyped = false;
															fetchCardPrintings(cardRow.name);
														}
													}
												}}
											>
												<div style="position: relative; cursor: pointer;">
													{#if editingPrintingCardId && cardRow.instances[0] && editingPrintingCardId === cardRow.instances[0].id}
														{@const filteredPrintings = getFilteredPrintings(inlinePrintingVal)}
														<input
															type="text"
															class="printing-inline-input"
															bind:value={inlinePrintingVal}
															use:selectOnMount
															oninput={() => hasPrintingTyped = true}
															onblur={() => {
																const matches = filteredPrintings;
																const bestMatch = matches[activePrintingOptionIdx] || matches[0];
																if (inlinePrintingVal.trim() === "") {
																	applyPrinting(cardRow, null);
																} else {
																	applyPrinting(cardRow, bestMatch);
																}
															}}
															onkeydown={(e) => {
																const matches = filteredPrintings;
																if (e.key === "ArrowDown") {
																	e.preventDefault();
																	if (matches.length > 0) {
																		activePrintingOptionIdx = (activePrintingOptionIdx + 1) % matches.length;
																	}
																} else if (e.key === "ArrowUp") {
																	e.preventDefault();
																	if (matches.length > 0) {
																		activePrintingOptionIdx = (activePrintingOptionIdx - 1 + matches.length) % matches.length;
																	}
																} else if (e.key === "Enter") {
																	e.preventDefault();
																	const selected = matches[activePrintingOptionIdx] || matches[0];
																	if (inlinePrintingVal.trim() === "") {
																		applyPrinting(cardRow, null);
																	} else {
																		applyPrinting(cardRow, selected);
																	}
																} else if (e.key === "Escape") {
																	editingPrintingCardId = null;
																}
															}}
															onclick={(e) => e.stopPropagation()}
														/>

														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div 
															class="printing-picker-dropdown"
															onclick={(evt) => evt.stopPropagation()}
														>
															<div class="dropdown-backdrop" role="presentation" onclick={() => editingPrintingCardId = null}></div>
															<div class="printing-picker-menu">
																{#if isLoadingPrintings}
																	<div class="printing-loading-text">Loading prints...</div>
																{:else}
																	{#each filteredPrintings as item, idx}
																		{@const isActive = idx === activePrintingOptionIdx}
																		<button
																			type="button"
																			class="printing-opt-btn"
																			class:active={isActive}
																			data-tooltip-img={item.image_uris?.normal || item.card_faces?.[0]?.image_uris?.normal || ""}
																			onmousedown={(e) => {
																				e.preventDefault();
																				applyPrinting(cardRow, item);
																			}}
																		>
																			<span class="set-code">{item.set.toUpperCase()}</span>
																			<span class="collector-number">{item.collector_number}</span>
																			<span class="set-name">- {item.set_name}</span>
																			{#if item.prices?.usd}
																				<span class="price-span">${item.prices.usd}</span>
																			{/if}
																		</button>
																	{:else}
																		<div class="printing-no-results">No prints found</div>
																	{/each}
																{/if}
															</div>
														</div>
													{:else}
														<span class="printing-text" data-tooltip-img={cardRow.imgUrl}>
															{#if editingPrintingCardId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:printing`) && interactionStore.selectedCells.has(`${editingPrintingCardId}:printing`)}
																<span class="set-code">{inlinePrintingVal.toUpperCase()}</span>
															{:else if cardRow.card?.set}
																<span class="set-code"
																	>{cardRow.card.set.toUpperCase()}</span
																>
																<span
																	class="collector-number"
																	>{cardRow.card
																		.collector_number ||
																		""}</span
																>
															{/if}
														</span>
													{/if}
												</div>
											</td>
										{/if}


										<!-- Color Category -->
										{#if settingsStore.visibleColumns.includes("color-cat")}
											{@const hasColorOverride = cardRow.instances[0]?.overrides?.colorCategory !== undefined}
											<!-- svelte-ignore a11y_click_events_have_key_events -->
											<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
											<td 
												class="col-color-cat"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:color-cat`)}
												ondblclick={(e) => {
													if (e.shiftKey || e.metaKey || e.ctrlKey) return;
													e.stopPropagation();
													interactionStore.filterSelectionToColumn('color-cat');
													if (cardRow.instances[0]) {
														editingColorCardId = editingColorCardId === cardRow.instances[0].id ? null : cardRow.instances[0].id;
														if (editingColorCardId) {
															inlineColorVal = getColorCategory(cardRow);
															activeColorOptionIdx = 0;
															hasTyped = false;
														}
													}
												}}
											>
												<div style="position: relative; cursor: pointer;">
													{#if editingColorCardId && cardRow.instances[0] && editingColorCardId === cardRow.instances[0].id}
														{@const optionsState = getColorOptionsState(inlineColorVal, hasTyped)}
														{@const visibleOptions = optionsState.filter(o => o.visible)}
														{@const activeOptions = optionsState.filter(o => o.visible && o.matches)}
														<input
															type="text"
															class="color-inline-input"
															bind:value={inlineColorVal}
															use:selectOnMount
															oninput={() => hasTyped = true}
															onblur={() => handleColorSubmit(cardRow)}
															onkeydown={(e) => handleColorKeyDown(e, cardRow)}
															onclick={(e) => e.stopPropagation()}
														/>

														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div 
															class="color-picker-dropdown"
															onclick={(evt) => evt.stopPropagation()}
														>
															<div class="dropdown-backdrop" role="presentation" onclick={() => editingColorCardId = null}></div>
															<div class="color-picker-menu">
																{#each visibleOptions as item, idx}
																	{@const isActive = activeOptions[activeColorOptionIdx]?.option === item.option}
																	<button
																		type="button"
																		class="color-opt-btn"
																		class:active={isActive}
																		class:dimmed={!item.matches}
																		onmousedown={(e) => {
																			e.preventDefault();
																			editingColorCardId = null;
																			applyColorOverride(cardRow, item.option);
																		}}
																	>
																		{item.option}
																	</button>
																{/each}
																<div class="menu-divider"></div>
																<button
																	type="button"
																	class="color-opt-btn reset-btn"
																	onmousedown={(e) => {
																		e.preventDefault();
																		editingColorCardId = null;
																		resetColorOverride(cardRow);
																	}}
																>
																	Reset to Default
																</button>
															</div>
														</div>
													{:else}
														{@const currentCategory = editingColorCardId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:color-cat`) && interactionStore.selectedCells.has(`${editingColorCardId}:color-cat`) ? inlineColorVal : getColorCategory(cardRow)}
														<div class="cell-display-wrapper">
															<span
																class="color-cat-text class-{currentCategory.toLowerCase()}"
																class:is-overridden={hasColorOverride}
																title={hasColorOverride ? "Click to change color override (Customized)" : "Click to override"}
															>
																{currentCategory}
															</span>
															{#if hasColorOverride}
																<button
																	type="button"
																	class="reset-override-btn"
																	onclick={(e) => {
																		e.stopPropagation();
																		if (cardRow.instances[0]) {
																			deckStore.resetCardOverride(cardRow.instances[0].id, 'colorCategory');
																			deckStore.resetCardOverride(cardRow.instances[0].id, 'colors');
																			deckStore.resetCardOverride(cardRow.instances[0].id, 'colorIdentity');
																		}
																	}}
																	title="Reset to default Color Category"
																>
																	<Undo size={12} />
																</button>
															{/if}
														</div>
													{/if}
												</div>
											</td>
										{/if}

										<!-- Color Identity (Mana symbols) -->
										{#if settingsStore.visibleColumns.includes("color-id")}
											<td 
												class="col-color-id"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:color-id`)}
											>
												<div class="color-id-cell">
													{#each cardRow.color_identity as sym}
														<ManaSymbol
															symbol={sym}
															size="1.1em"
															className="ms-cost"
														/>
													{:else}
														<span
															class="placeholder-dash"
															>—</span
														>
													{/each}
												</div>
											</td>
										{/if}

										<!-- Tags (Inline Tag Input with Autocomplete) -->
										{#if settingsStore.visibleColumns.includes("tags")}
											{@const tags = cardRow.instances[0]?.tags || []}
											<td 
												class="col-tags"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:tags`)}
												class:is-editing={editingTagsCardId && cardRow.instances[0] && editingTagsCardId === cardRow.instances[0].id}
												ondblclick={(e) => {
													if (e.shiftKey || e.metaKey || e.ctrlKey) return;
													e.stopPropagation();
													interactionStore.filterSelectionToColumn('tags');
													if (cardRow.instances[0]) {
														editingTagsCardId = editingTagsCardId === cardRow.instances[0].id ? null : cardRow.instances[0].id;
														if (editingTagsCardId) {
															inlineTagsVal = tags.join(", ");
															activeTagsOptionIdx = 0;
															hasTagsTyped = false;
														}
													}
												}}
											>
												<div style="position: relative; cursor: pointer;">
													{#if editingTagsCardId && cardRow.instances[0] && editingTagsCardId === cardRow.instances[0].id}
														{@const filteredSuggestions = getFilteredTags(inlineTagsVal)}
														<input
															type="text"
															class="tags-inline-input"
															bind:value={inlineTagsVal}
															use:selectOnMount
															oninput={() => hasTagsTyped = true}
															onblur={() => handleTagsSubmit(cardRow)}
															onkeydown={(e) => {
																const matches = filteredSuggestions;
																if (e.key === "ArrowDown") {
																	e.preventDefault();
																	if (matches.length > 0) {
																		activeTagsOptionIdx = (activeTagsOptionIdx + 1) % matches.length;
																	}
																} else if (e.key === "ArrowUp") {
																	e.preventDefault();
																	if (matches.length > 0) {
																		activeTagsOptionIdx = (activeTagsOptionIdx - 1 + matches.length) % matches.length;
																	}
																} else if (e.key === "Enter") {
																	e.preventDefault();
																	const selected = matches[activeTagsOptionIdx];
																	if (selected) {
																		selectTagSuggestion(cardRow, selected);
																	} else {
																		handleTagsSubmit(cardRow);
																	}
																} else if (e.key === "Escape") {
																	editingTagsCardId = null;
																}
															}}
															onclick={(e) => e.stopPropagation()}
														/>

														<!-- svelte-ignore a11y_click_events_have_key_events -->
														<!-- svelte-ignore a11y_no_static_element_interactions -->
														<div 
															class="tags-picker-dropdown"
															onclick={(evt) => evt.stopPropagation()}
														>
															<div class="dropdown-backdrop" role="presentation" onclick={() => editingTagsCardId = null}></div>
															<div class="tags-picker-menu">
																{#each filteredSuggestions as item, idx}
																	{@const isActive = idx === activeTagsOptionIdx}
																	<button
																		type="button"
																		class="tag-opt-btn"
																		class:active={isActive}
																		onmousedown={(e) => {
																			e.preventDefault();
																			selectTagSuggestion(cardRow, item);
																		}}
																	>
																		{item}
																	</button>
																{/each}
															</div>
														</div>
													{:else}
														{#if editingTagsCardId && interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:tags`) && interactionStore.selectedCells.has(`${editingTagsCardId}:tags`)}
															{@const tempTags = inlineTagsVal.split(',').map(t => t.trim()).filter(Boolean)}
															<div class="tags-badges-list">
																{#each tempTags as tag, idx}
																	<span class="tag-badge" style="background-color: {getTagBgColor(tag)}">
																		{#if idx === 0}
																			<Star size={10} class="star-icon text-yellow-400 fill-yellow-400" />
																		{/if}
																		<span>{tag}</span>
																	</span>
																{/each}
															</div>
														{:else}
															<div class="tags-badges-list">
																{#each tags as tag, idx}
																	<span 
																		class="tag-badge"
																		style="background-color: {getTagBgColor(tag)}"
																		draggable="true"
																		ondragstart={(e) => handleTagDragStart(e, cardRow.instances[0].id, idx)}
																		ondragover={(e) => e.preventDefault()}
																		ondrop={(e) => handleTagDrop(e, cardRow.instances[0].id, idx)}
																	>
																		{#if idx === 0}
																			<Star size={10} class="star-icon text-yellow-400 fill-yellow-400" />
																		{/if}
																		<span>{tag}</span>
																	</span>
																{/each}
															</div>
														{/if}
													{/if}
												</div>
											</td>
										{/if}

										<!-- Price (Optional) -->
										{#if settingsStore.visibleColumns.includes("price")}
											<td 
												class="col-price"
												class:is-selected={interactionStore.selectedCells.has(`${cardRow.instances[0]?.id}:price`)}
											>
												<span class="price-span">
													{cardRow.price > 0
														? `$${cardRow.price.toFixed(2)}`
														: "—"}
												</span>
											</td>
											{#if settingsStore.showTotalPrice}
												<td class="col-total">
													<span
														class="price-span total"
													>
														{cardRow.price > 0
															? `$${(cardRow.price * cardRow.quantity).toFixed(2)}`
															: "—"}
													</span>
												</td>
											{/if}
										{/if}

										<!-- Options Menu Trigger -->
										<td class="col-actions">
											<div class="action-buttons-cell">
												<button
													type="button"
													class="row-action-btn"
													onclick={(e) => {
														e.stopPropagation();
														interactionStore.showMenu(
															e,
															cardRow.instances[0] || cardRow.card,
															cardRow.zone,
															cardRow.price,
														);
													}}
													title="More Options"
												>
													<MoreVertical size={14} />
												</button>
											</div>
										</td>
									</tr>
								{/each}
							{/if}
						</tbody>
					{/if}
				{/each}
			</table>
		</div>
	</div>
</div>

<style>
	.table-view-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2), transparent);
		padding: 1.25rem 2rem;
		position: relative;
		transition: background-color 0.2s ease;
	}

	.table-view-container.drag-over {
		background-color: hsla(var(--primary-hsl), 0.05);
	}

	.table-border-shield {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-md);
		background: hsla(0, 0%, 100%, 0.015);
	}

	.table-wrapper {
		flex: 1;
		overflow-x: auto;
		overflow-y: auto;
	}

	/* Elegant Custom Scrollbar for Table Wrapper */
	.table-wrapper::-webkit-scrollbar {
		width: 6px;
		height: 6px;
	}

	.table-wrapper::-webkit-scrollbar-track {
		background: transparent;
	}

	.table-wrapper::-webkit-scrollbar-thumb {
		background: hsl(var(--muted-foreground) / 0.25);
		border-radius: 3px;
	}

	.table-wrapper::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.45);
	}

	.deck-table {
		width: 100%;
		border-collapse: separate;
		border-spacing: 0;
		text-align: left;
		font-size: 0.875rem;
		table-layout: auto;
		--padding-y: 8px;
		--row-height: 1.5rem;
		user-select: none;
	}

	.compact .deck-table {
		--padding-y: 0px;
		--row-height: 22px;
	}

	.spacious .deck-table {
		--padding-y: 8px;
		--row-height: 1.5rem;
	}

	.deck-table th {
		position: sticky;
		top: 0;
		z-index: 10;
		height: 38px;
		background: linear-gradient(hsla(0, 0%, 100%, 0.06), hsla(0, 0%, 100%, 0.06)), hsl(var(--background));
		padding: 0 14px;
		font-size: 0.6875rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground));
		border-bottom: 1px solid hsla(var(--border) / 0.8);
		border-top: none;
		border-right: 1px solid hsl(var(--border) / 0.5);
		white-space: nowrap;
		box-sizing: border-box;
	}

	.deck-table th:last-child {
		border-right: none;
		padding-right: 20px !important;
	}

	/* Columns Sizes */
	.col-qty {
		width: 50px;
		min-width: 50px;
		max-width: 50px;
		text-align: right;
		padding-right: 0.25rem !important;
	}
	.col-name {
		width: 100%;
		min-width: 220px;
		padding-left: 0.25rem !important;
	}
	.col-mana {
		width: 105px;
	}
	.col-cmc {
		width: 55px;
		text-align: center;
	}
	.col-type {
		width: 240px;
	}
	.col-printing {
		width: 100px;
	}
	.col-printing.is-editing {
		width: 150px;
		min-width: 150px;
	}
	.col-color-cat {
		width: 110px;
	}
	.col-color-id {
		width: 95px;
	}
	.col-tags {
		width: 90px;
	}
	.col-tags.is-editing {
		width: 220px;
		min-width: 220px;
	}
	.col-price {
		width: 85px;
		text-align: right;
	}
	.col-total {
		width: 85px;
		text-align: right;
	}
	.col-actions {
		width: 50px;
		text-align: center;
	}

	.deck-table th:first-child,
	.deck-table td:first-child {
		padding-left: var(--base-margin, 20px) !important;
	}

	.deck-table th:last-child,
	.deck-table td:last-child {
		padding-right: var(--base-margin, 20px) !important;
	}

	.deck-table th.col-qty {
		text-align: right;
	}
	.deck-table th.col-cmc {
		text-align: center;
	}
	.deck-table th.col-price {
		text-align: right;
	}
	.deck-table th.col-total {
		text-align: right;
	}

	.deck-table th.sortable {
		cursor: pointer;
		user-select: none;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
	}

	.deck-table th.sortable:hover {
		color: hsl(var(--foreground));
		background: hsla(var(--foreground-hsl, 0, 0%, 100%), 0.05);
	}

	.header-cell-inner {
		display: flex;
		align-items: center;
		gap: 6px;
		height: 100%;
	}

	.deck-table th.col-qty .header-cell-inner {
		justify-content: flex-end;
	}

	.deck-table th.col-cmc .header-cell-inner {
		justify-content: center;
	}

	.deck-table th.col-price .header-cell-inner {
		justify-content: flex-end;
	}

	.sort-indicator {
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.deck-table th.active-sort {
		color: hsl(var(--primary)) !important;
	}

	/* Row Styling */
	.card-row {
		background: hsla(0, 0%, 100%, 0.03);
		transition: background-color 0.15s ease;
		cursor: pointer;
		position: relative;
	}

	.card-row:nth-child(even) {
		background: hsla(0, 0%, 100%, 0.015);
	}

	.card-row:hover {
		background: hsla(0, 0%, 100%, 0.06) !important;
	}

	.card-row.is-selected {
		background-color: rgba(37, 99, 235, 0.15) !important;
	}

	.card-row.is-editing {
		background: hsla(var(--primary-hsl), 0.08) !important;
	}

	.category-group:last-of-type .card-row:last-child td {
		border-bottom: none;
	}

	.card-row.is-illegal {
		background: hsla(var(--destructive) / 0.05);
	}

	.card-row.is-illegal:hover {
		background: hsla(var(--destructive) / 0.08);
	}

	/* Notion Table Overrides visual custom indicator (Italics and colors) */
	.is-overridden {
		font-style: italic !important;
		color: hsl(var(--primary)) !important;
		opacity: 0.95;
	}

	/* Tags Badge layouts */
	.tags-badges-list {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}

	.tag-badge {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 11px;
		font-weight: 500;
		color: #ffffff;
		line-height: 1;
		user-select: none;
	}

	.tag-badge :global(.star-icon) {
		color: #fbbf24;
		fill: #fbbf24;
	}

	/* Tags Popover Menu styling */
	.tags-popover-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 1000;
		width: 220px;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		padding: 10px;
	}

	.tags-popover-content {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.popover-title {
		font-size: 12px;
		font-weight: 700;
		color: hsl(var(--foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-bottom: 4px;
	}

	.popover-section-title {
		font-size: 10px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
		margin-top: 4px;
	}

	.active-tags-container {
		display: flex;
		flex-direction: column;
		gap: 4px;
		max-height: 120px;
		overflow-y: auto;
	}

	.active-tag-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: hsl(var(--muted) / 0.15);
		padding: 3px 6px;
		border-radius: 4px;
		font-size: 11px;
		color: hsl(var(--foreground));
	}

	.star-tag-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground) / 0.4);
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
	}

	.star-tag-btn.is-primary {
		color: #fbbf24;
	}

	.remove-tag-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 2px;
		display: flex;
		align-items: center;
	}

	.remove-tag-btn:hover {
		color: hsl(var(--destructive));
	}

	.all-tags-suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		max-height: 80px;
		overflow-y: auto;
	}

	.suggestion-tag-btn {
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.4);
		color: hsl(var(--foreground));
		font-size: 10px;
		padding: 2px 6px;
		border-radius: 4px;
		cursor: pointer;
	}

	.suggestion-tag-btn:hover {
		background: hsl(var(--primary) / 0.2);
		border-color: hsl(var(--primary));
	}



	.add-tag-submit-btn {
		background: hsl(var(--primary));
		color: white;
		border: none;
		border-radius: 4px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
	}

	/* Color Picker Dropdown Menu */
	.color-picker-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 1000;
		width: 140px;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		padding: 4px;
	}

	.color-picker-menu {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.color-opt-btn {
		width: 100%;
		text-align: left;
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
	}

	.color-opt-btn:hover {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.color-opt-btn.active {
		background: hsl(var(--primary) / 0.25);
		color: hsl(var(--primary-foreground));
	}

	.color-opt-btn.dimmed {
		opacity: 0.4;
		font-style: italic;
	}

	.color-opt-btn.reset-btn {
		color: hsl(var(--muted-foreground));
		font-weight: 600;
	}

	.color-opt-btn.reset-btn:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	.menu-divider {
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin: 2px 0;
	}

	.deck-table td {
		padding: var(--padding-y) 14px;
		vertical-align: middle;
		color: var(--text-secondary);
		height: var(--row-height);
		transition:
			padding 0.2s ease,
			height 0.2s ease,
			border-color 0.2s ease;
		white-space: nowrap;
		border-bottom: 1px solid hsl(var(--border) / 0.5); /* Clean border-bottom directly on cells */
		border-right: 1px solid hsl(var(--border) / 0.5);
	}

	.deck-table td:last-child {
		border-right: none;
		padding-right: 20px !important;
	}

	/* Clickable Quantity Badge Button */
	.qty-text-btn {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-weight: 600;
		font-size: 0.875rem;
		font-family: inherit;
		padding: 0;
		min-width: auto;
		text-align: center;
		cursor: pointer;
		font-variant-numeric: tabular-nums;
		transition: color 0.15s ease;
		display: inline-block;
		outline: none;
	}

	.qty-text-btn:hover {
		color: hsl(var(--primary));
	}

	.qty-inline-input {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-weight: 600;
		font-size: 0.875rem;
		font-family: inherit;
		padding: 0;
		width: 100%;
		text-align: center;
		font-variant-numeric: tabular-nums;
		outline: none;
		box-sizing: border-box;
		display: inline-block;
	}

	.color-inline-input {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-weight: 500;
		font-size: 0.8125rem;
		font-family: inherit;
		padding: 2px 4px;
		width: 100%;
		text-align: left;
		outline: none;
		box-sizing: border-box;
		border-bottom: 1px dashed hsl(var(--primary) / 0.5);
	}

	/* Remove spin buttons */
	.qty-inline-input::-webkit-outer-spin-button,
	.qty-inline-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		appearance: none;
		margin: 0;
	}
	.qty-inline-input[type="number"] {
		-moz-appearance: textfield;
		appearance: textfield;
	}

	/* Name Cell */
	.name-container-cell {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.card-name-label {
		font-weight: 500;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		max-width: 200px;
	}

	.card-row:hover .card-name-label {
		color: hsla(
			217,
			91%,
			60%,
			1
		); /* Sleek primary color transition on hover */
	}

	.legality-warning-icon {
		color: hsl(var(--destructive));
		display: inline-flex;
		align-items: center;
		justify-content: center;
		animation: pulse 2s infinite ease-in-out;
	}

	@keyframes pulse {
		0%,
		100% {
			opacity: 0.6;
		}
		50% {
			opacity: 1;
		}
	}

	/* Mana Value Badge */
	.cmc-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		font-weight: 600;
		color: hsl(var(--foreground));
		background: hsla(0, 0%, 100%, 0.04);
		border-radius: 50%;
		border: 1px solid hsla(var(--border) / 0.4);
		font-size: 0.75rem;
		font-variant-numeric: tabular-nums;
	}

	/* Printing Cell */
	.printing-text {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.set-code {
		color: hsl(var(--muted-foreground));
		font-weight: 700;
		font-size: 0.6875rem;
		letter-spacing: 0.05em;
	}

	.collector-number {
		color: var(--text-muted);
		font-variant-numeric: tabular-nums;
		font-size: 0.6875rem;
		letter-spacing: 0.05em;
	}

	/* Color Category Labels */
	.color-cat-text {
		font-size: 0.75rem;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		background: hsla(0, 0%, 100%, 0.04);
		border: 1px solid hsla(var(--border) / 0.4);
		color: hsl(var(--muted-foreground));
	}

	.color-cat-text.class-white {
		color: #fef08a;
		border-color: rgba(254, 240, 138, 0.2);
		background: rgba(254, 240, 138, 0.03);
	}
	.color-cat-text.class-blue {
		color: #60a5fa;
		border-color: rgba(96, 165, 250, 0.2);
		background: rgba(96, 165, 250, 0.03);
	}
	.color-cat-text.class-black {
		color: #c084fc;
		border-color: rgba(192, 132, 252, 0.2);
		background: rgba(192, 132, 252, 0.03);
	}
	.color-cat-text.class-red {
		color: #f87171;
		border-color: rgba(248, 113, 113, 0.2);
		background: rgba(248, 113, 113, 0.03);
	}
	.color-cat-text.class-green {
		color: #34d399;
		border-color: rgba(52, 211, 153, 0.2);
		background: rgba(52, 211, 153, 0.03);
	}
	.color-cat-text.class-multicolor {
		color: #fb923c;
		border-color: rgba(251, 146, 60, 0.2);
		background: rgba(251, 146, 60, 0.03);
	}
	.color-cat-text.class-land {
		color: #a7f3d0;
		border-color: rgba(167, 243, 208, 0.2);
		background: rgba(167, 243, 208, 0.03);
	}

	/* Color Identity Cell */
	.color-id-cell {
		display: flex;
		gap: 0.15em;
		align-items: center;
	}

	/* Mana Cell */
	.mana-icons-cell {
		display: flex;
		gap: 0.15em;
		align-items: center;
		white-space: nowrap;
	}

	.mana-divider {
		color: hsl(var(--muted-foreground));
		font-weight: 500;
		font-size: 0.85em;
		margin: 0 0.15em;
		user-select: none;
	}

	:global(.mana-icons-cell .ms-cost),
	:global(.color-id-cell .ms-cost) {
		margin: 0 !important;
	}

	/* Type Text */
	.type-text {
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
		max-width: 240px;
	}

	.placeholder-dash {
		color: var(--text-muted);
		font-weight: 500;
	}

	/* Prices */
	.price-span {
		font-family: inherit;
		font-variant-numeric: tabular-nums;
		color: hsl(var(--muted-foreground));
	}

	.price-span.total {
		color: var(--success);
		font-weight: 600;
	}

	/* Action Buttons */
	.action-buttons-cell {
		display: flex;
		gap: 6px;
		justify-content: center;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.card-row:hover .action-buttons-cell {
		opacity: 1;
	}

	.row-action-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		width: 24px;
		height: 24px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.row-action-btn:hover {
		background: hsla(0, 0%, 100%, 0.08);
		color: hsl(var(--foreground));
	}

	.row-action-btn.delete:hover {
		background: hsla(var(--destructive) / 0.15);
		color: #f87171;
	}

	/* Category Section Header Row Styling */
	.category-header-row td {
		position: sticky;
		top: 37px;
		z-index: 5;
		background: linear-gradient(hsla(0, 0%, 100%, 0.015), hsla(0, 0%, 100%, 0.015)), hsl(var(--background));
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		border-top: none;
		border-right: none !important;
		padding: var(--padding-y) 14px !important;
		height: calc(var(--row-height) * 1.5);
		box-shadow: none;
		transition: background-color 0.15s ease;
	}

	.category-header-row:hover td {
		background: linear-gradient(hsla(0, 0%, 100%, 0.045), hsla(0, 0%, 100%, 0.045)), hsl(var(--background)) !important;
	}

	.category-header-row td.col-actions {
		width: 50px;
		min-width: 50px;
		max-width: 50px;
		padding: 0 !important;
	}

	.category-header-row td.col-price,
	.category-header-row td.col-total {
		padding-right: 14px !important;
		text-align: right;
		vertical-align: middle;
	}

	.category-header-row td.spanned-cat-cell {
		padding: var(--padding-y) 14px !important;
	}

	.category-header-content {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		padding-left: 0;
		gap: 0;
		height: 100%;
		font-size: 0.75rem;
		font-weight: 600;
		transition:
			opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 1;
		transform: translateY(0);
	}

	.category-header-content.fade-out {
		opacity: 0;
		pointer-events: none;
		transform: translateY(-4px); /* Elegant slide out upwards */
	}

	.category-pill-box {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: none !important;
		border: none !important;
		padding: 0 !important;
		border-radius: 0 !important;
		transition: none !important;
		flex-shrink: 0;
	}

	:global(.category-chevron) {
		color: hsl(var(--muted-foreground) / 0.6);
		transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
		flex-shrink: 0;
	}

	:global(.category-chevron.collapsed) {
		transform: rotate(-90deg) !important;
	}

	.category-title {
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--muted-foreground) / 0.85);
		text-transform: uppercase;
		letter-spacing: 0.08em;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.category-count {
		display: inline-block;
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--muted-foreground) / 0.6);
		margin-left: 4px;
	}

	.category-line {
		display: none !important;
	}

	.category-header-row:hover .category-title {
		color: hsl(var(--foreground));
	}

	.category-header-row:hover :global(.category-chevron) {
		color: hsl(var(--foreground));
	}

	.category-header-row:hover .category-count {
		color: hsl(var(--foreground));
	}

	.category-sum {
		color: var(--success);
		font-size: 0.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		transition:
			opacity 0.25s cubic-bezier(0.4, 0, 0.2, 1),
			transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 1;
		transform: translateY(0);
	}

	.category-sum.fade-out {
		opacity: 0;
		pointer-events: none;
		transform: translateY(-4px);
	}

	/* --- Compact Overrides for Clean minimalist table elements --- */
	.compact .qty-text-btn {
		background: transparent;
		border-color: transparent;
		padding: 0;
		min-width: auto;
		display: inline-flex;
		align-items: center;
		justify-content: center;
	}

	.compact .qty-text-btn:hover {
		background: transparent;
		border-color: transparent;
		box-shadow: none;
		color: hsl(var(--primary));
		text-shadow: 0 0 8px hsla(var(--primary-hsl), 0.4);
	}

	.compact .cmc-badge {
		background: none;
		border: none;
		width: auto;
		height: auto;
		border-radius: 0;
		font-weight: 500;
		font-size: 0.875rem;
	}

	.compact .color-cat-text {
		padding: 0;
		background: none;
		border: none;
	}

	/* Highlight all card rows in the category ONLY when hovering the header row */
	.category-group:has(.category-header-row:hover) .card-row {
		background-color: hsla(0, 0%, 100%, 0.06) !important;
	}

	.category-group:has(.category-header-row:hover) .card-row:nth-child(even) {
		background-color: hsla(0, 0%, 100%, 0.045) !important;
	}

	/* Card Name inline editing styles */
	.name-edit-wrapper {
		position: relative;
		display: inline-block;
		width: 100%;
	}

	.name-inline-input {
		width: 100%;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--primary));
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
		outline: none;
		box-sizing: border-box;
	}

	.name-inline-input.has-error {
		border-color: hsl(var(--destructive));
		box-shadow: 0 0 0 1px hsl(var(--destructive) / 0.3);
		color: hsl(var(--destructive));
	}

	.name-suggestions-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 1000;
		width: 250px;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		padding: 4px;
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 200px;
		overflow-y: auto;
	}

	.name-opt-btn {
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		font-size: 12px;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.name-opt-btn:hover {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.name-opt-btn.active {
		background: hsl(var(--primary) / 0.25);
		color: hsl(var(--primary-foreground));
	}

	/* Cell-level selection styles */
	td.is-selected {
		background-color: rgba(37, 99, 235, 0.15) !important;
		box-shadow: inset 0 0 0 1px rgba(37, 99, 235, 0.8) !important;
	}

	.tags-inline-input,
	.printing-inline-input {
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-weight: 500;
		font-size: 0.8125rem;
		font-family: inherit;
		padding: 2px 4px;
		width: 100%;
		text-align: left;
		outline: none;
		box-sizing: border-box;
		border-bottom: 1px dashed hsl(var(--primary) / 0.5);
	}

	.tags-picker-dropdown,
	.printing-picker-dropdown {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 1000;
		width: 200px;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
		padding: 4px;
	}

	.printing-picker-dropdown {
		width: 250px;
	}

	.tags-picker-menu,
	.printing-picker-menu {
		display: flex;
		flex-direction: column;
		gap: 1px;
		max-height: 200px;
		overflow-y: auto;
	}

	.tag-opt-btn,
	.printing-opt-btn {
		width: 100%;
		text-align: left;
		padding: 6px 8px;
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--foreground));
		background: none;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.tag-opt-btn:hover,
	.printing-opt-btn:hover {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
	}

	.tag-opt-btn.active,
	.printing-opt-btn.active {
		background: hsl(var(--primary) / 0.25);
		color: hsl(var(--primary-foreground));
	}

	.printing-opt-btn .set-code {
		font-weight: 700;
		color: hsl(var(--muted-foreground));
	}

	.printing-opt-btn .collector-number {
		color: hsl(var(--muted-foreground));
	}

	.printing-opt-btn .set-name {
		flex: 1;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}

	.printing-opt-btn .price-span {
		font-variant-numeric: tabular-nums;
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.printing-loading-text,
	.printing-no-results {
		padding: 8px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}

	.cell-display-wrapper {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		position: relative;
	}

	.reset-override-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 2px;
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: background-color 0.2s, color 0.2s;
	}

	.reset-override-btn:hover {
		background: hsla(0, 0%, 100%, 0.1);
		color: hsl(var(--foreground));
	}

</style>
