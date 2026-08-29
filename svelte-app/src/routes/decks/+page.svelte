<script>
	import { fade, fly } from "svelte/transition";
	import {
		FolderOpen,
		Trash2,
		Loader,
		Plus,
		X,
		ArrowRight,
		Copy,
		FileText,
		Share2,
		Check,
		Filter,
		LayoutGrid,
		ArrowDownWideNarrow,
		ChevronDown,
	} from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { syncService } from "$lib/syncService";
	import { onMount, tick } from "svelte";
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";
	import ManaSymbol from "$lib/components/ui/ManaSymbol.svelte";

	/** @type {any[]} */
	let decks = $state([]);
	/** @type {any[]} */
	let localDrafts = $state([]);
	let isLoading = $state(false);
	let error = $state("");
	let hasLoaded = false;

	/** @type {any | null} */
	let selectedDeck = $state(null);
	let isEditingName = $state(false);
	let editingName = $state("");
	/** @type {HTMLInputElement | null} */
	let nameInputEl = $state(null);

	$effect(() => {
		layoutStore.rightSidebarWidth = selectedDeck ? 380 : 0;
		return () => {
			layoutStore.rightSidebarWidth = 0;
		};
	});

	let clickTimer = /** @type {any} */ (null);

	/** @param {any[]} newDecks */
	function updateSyncedDecks(newDecks) {
		decks = newDecks;
		if (typeof window !== "undefined") {
			try {
				localStorage.setItem(
					"budgericards_cached_synced_decks",
					JSON.stringify(newDecks),
				);
			} catch (e) {}
		}
	}

	async function loadDecks() {
		if (!authStore.isAuthenticated && !authStore.isLoading) {
			updateSyncedDecks([]);
			return;
		}

		if (decks.length === 0) {
			isLoading = true;
		}
		error = "";
		try {
			const { data, error: fetchError } = await syncService.fetchDecks();
			if (fetchError) throw fetchError;
			updateSyncedDecks(data || []);
			hasLoaded = true;
		} catch (err) {
			console.error("Failed to load decks:", err);
			if (decks.length === 0) {
				error = "Could not load synced decks. Please try again.";
			}
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		if (typeof window !== "undefined") {
			localDrafts = JSON.parse(
				localStorage.getItem("budgericards_local_drafts") || "[]",
			);
			const cached = localStorage.getItem(
				"budgericards_cached_synced_decks",
			);
			if (cached) {
				try {
					const parsed = JSON.parse(cached);
					if (Array.isArray(parsed) && parsed.length > 0) {
						decks = parsed;
					}
				} catch (e) {}
			}
		}
		if (authStore.isAuthenticated) {
			loadDecks();
		}
	});

	$effect(() => {
		if (!authStore.isLoading && !authStore.isAuthenticated) {
			goto("/login?redirectTo=/decks");
		}
	});

	$effect(() => {
		if (authStore.isAuthenticated && !hasLoaded && !isLoading) {
			loadDecks();
		}
	});

	/** @param {string} name */
	function slugify(name) {
		if (!name) return "untitled-deck";
		return name
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, "")
			.replace(/[\s_-]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	/** @param {any} deck */
	function handleSelectDeck(deck) {
		if (!deck) return;
		searchStore.reset();
		const cards = deck.cards || deck;
		deckStore.setDeck({
			id: deck.id,
			name: deck.name || "",
			commander: cards.commander || [],
			companion: cards.companion || [],
			mainboard: cards.mainboard || [],
			sideboard: cards.sideboard || [],
			maybeboard: cards.maybeboard || [],
			garbage: cards.garbage || [],
			activeBoard: cards.activeBoard || "mainboard",
			coverArt: cards.coverArt || null,
			format: cards.format || "Commander",
			metadata: cards.metadata || {},
		});
		goto(`/decks/${deck.id}/${slugify(deck.name)}`);
	}

	/** @param {any} deck */
	function handleDeckClick(deck) {
		if (clickTimer) clearTimeout(clickTimer);
		isEditingName = false;

		if (!selectedDeck) {
			// If sidebar is closed, delay opening slightly (220ms) so double click can intercept and open the deck directly
			clickTimer = setTimeout(() => {
				selectedDeck = deck;
				clickTimer = null;
			}, 220);
		} else {
			// If sidebar is already open, immediately switch selection
			selectedDeck = deck;
		}
	}

	/** @param {any} deck */
	function handleDeckDblClick(deck) {
		if (clickTimer) {
			clearTimeout(clickTimer);
			clickTimer = null;
		}
		handleSelectDeck(deck);
	}

	function closeSidePanel() {
		if (clickTimer) {
			clearTimeout(clickTimer);
			clickTimer = null;
		}
		isEditingName = false;
		selectedDeck = null;
	}

	function startEditingName() {
		if (!selectedDeck) return;
		editingName = getDeckDisplayName(selectedDeck);
		isEditingName = true;
		tick().then(() => {
			if (nameInputEl) {
				nameInputEl.focus();
				const len = nameInputEl.value.length;
				nameInputEl.setSelectionRange(len, len);
			}
		});
	}

	async function saveRenamedDeck() {
		if (!isEditingName) return;
		const trimmed = editingName.trim();
		isEditingName = false;
		if (
			!selectedDeck ||
			!trimmed ||
			trimmed === getDeckDisplayName(selectedDeck)
		) {
			return;
		}

		const deck = selectedDeck;
		const oldName = deck.name;
		deck.name = trimmed;

		if (deck.isDraft) {
			if (authStore.isAuthenticated) {
				const cards = JSON.parse(JSON.stringify(deck.cards || deck));
				try {
					const { data, error: saveError } =
						await syncService.saveDeck(deck.id, {
							...cards,
							name: trimmed,
						});
					if (saveError) throw saveError;
					if (data) {
						let drafts = JSON.parse(
							localStorage.getItem("budgericards_local_drafts") ||
								"[]",
						);
						drafts = drafts.filter(
							(/** @type {any} */ d) => d.id !== deck.id,
						);
						localStorage.setItem(
							"budgericards_local_drafts",
							JSON.stringify(drafts),
						);
						localDrafts = drafts;

						updateSyncedDecks([data, ...decks]);
						selectedDeck = data;
					}
				} catch (err) {
					console.error("Failed to save draft to cloud:", err);
					deck.name = oldName;
				}
			} else {
				let drafts = JSON.parse(
					localStorage.getItem("budgericards_local_drafts") || "[]",
				);
				const idx = drafts.findIndex(
					(/** @type {any} */ d) => d.id === deck.id,
				);
				if (idx !== -1) {
					drafts[idx].name = trimmed;
					if (!drafts[idx].metadata) drafts[idx].metadata = {};
					drafts[idx].metadata.updatedAt = new Date().toISOString();
					localStorage.setItem(
						"budgericards_local_drafts",
						JSON.stringify(drafts),
					);
					localDrafts = drafts;
				}
				selectedDeck = { ...deck, name: trimmed };
			}
		} else {
			const cards = JSON.parse(JSON.stringify(deck.cards || deck));
			try {
				const { data, error: saveError } = await syncService.saveDeck(
					deck.id,
					{
						...cards,
						name: trimmed,
					},
				);
				if (saveError) throw saveError;
				if (data) {
					updateSyncedDecks(
						decks.map((/** @type {any} */ d) =>
							d.id === deck.id ? data : d,
						),
					);
					selectedDeck = data;
				}
			} catch (err) {
				console.error("Failed to rename deck:", err);
				deck.name = oldName;
			}
		}
	}

	/** @param {KeyboardEvent} e */
	function handleNameKeydown(e) {
		if (e.key === "Enter") {
			e.preventDefault();
			saveRenamedDeck();
		} else if (e.key === "Escape") {
			e.preventDefault();
			isEditingName = false;
		}
	}

	/** @param {MouseEvent} e */
	function handleContainerClick(e) {
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (!target) return;
		if (!target.closest(".control-dropdown-container")) {
			closeAllDropdowns();
		}
		if (
			target.closest(".deck-card") ||
			target.closest(".deck-info-panel") ||
			target.closest(".start-building-btn") ||
			target.closest("button") ||
			target.closest("a")
		) {
			return;
		}
		selectedDeck = null;
	}

	/** @param {KeyboardEvent} e */
	function handleWindowKeyDown(e) {
		if (e.key === "Escape") {
			if (showFilterDropdown || showGroupDropdown || showSortDropdown) {
				closeAllDropdowns();
				return;
			}
			if (selectedDeck) {
				closeSidePanel();
			}
		}
	}

	/**
	 * @param {string} deckId
	 * @param {MouseEvent} e
	 * @param {boolean} [isDraft]
	 */
	async function handleDeleteDeck(deckId, e, isDraft = false) {
		e.stopPropagation();
		if (
			!confirm(
				"Are you sure you want to delete this deck? This cannot be undone.",
			)
		) {
			return;
		}

		try {
			if (isDraft) {
				let drafts = JSON.parse(
					localStorage.getItem("budgericards_local_drafts") || "[]",
				);
				drafts = drafts.filter(
					/** @param {any} d */ (d) => d.id !== deckId,
				);
				localStorage.setItem(
					"budgericards_local_drafts",
					JSON.stringify(drafts),
				);
				localDrafts = drafts;
			} else {
				const { error: deleteError } =
					await syncService.deleteDeck(deckId);
				if (deleteError) throw deleteError;
				updateSyncedDecks(
					decks.filter((/** @type {any} */ d) => d.id !== deckId),
				);
			}

			if (selectedDeck?.id === deckId) {
				selectedDeck = null;
			}

			if (deckStore.id === deckId) {
				deckStore.setDeck({
					id: "",
					name: "",
					commander: [],
					companion: [],
					mainboard: [],
					sideboard: [],
					maybeboard: [],
					garbage: [],
					coverArt: null,
				});
			}
		} catch (err) {
			console.error("Failed to delete deck:", err);
			alert("Failed to delete deck. Please try again.");
		}
	}

	let copyListFeedback = $state(false);
	let shareFeedback = $state(false);
	let cloneFeedback = $state(false);

	/** @param {any} deck */
	function getDeckPrice(deck) {
		if (!deck) return null;
		const cards = deck.cards || deck;
		const metadata = cards.metadata || {};
		let total = 0;
		let hasPrice = false;
		const boards = ["commander", "companion", "mainboard", "sideboard"];
		for (const b of boards) {
			const list = cards[b];
			if (Array.isArray(list)) {
				for (const c of list) {
					const meta = metadata[c.name?.toLowerCase()];
					const p =
						c.price !== undefined
							? Number(c.price)
							: parseFloat(
									meta?.prices?.usd ||
										meta?.prices?.usd_foil ||
										"0",
								);
					if (p && !isNaN(p)) {
						total += p * (c.quantity || 1);
						hasPrice = true;
					}
				}
			}
		}
		return hasPrice && total > 0 ? `$${total.toFixed(2)}` : null;
	}

	/** @param {any} deck */
	function formatDeckAsText(deck) {
		if (!deck) return "";
		const cards = deck.cards || deck;
		/** @type {string[]} */
		const lines = [];
		const boards = [
			{ key: "commander", label: "Commander" },
			{ key: "companion", label: "Companion" },
			{ key: "mainboard", label: "Mainboard" },
			{ key: "sideboard", label: "Sideboard" },
			{ key: "maybeboard", label: "Maybeboard" },
		];
		for (const b of boards) {
			const list = cards[b.key];
			if (Array.isArray(list) && list.length > 0) {
				if (lines.length > 0) lines.push("");
				lines.push(`// ${b.label}`);
				/** @type {Record<string, number>} */
				const counts = {};
				for (const c of list) {
					const name = c.name;
					counts[name] = (counts[name] || 0) + (c.quantity || 1);
				}
				for (const [name, qty] of Object.entries(counts)) {
					lines.push(`${qty} ${name}`);
				}
			}
		}
		return lines.join("\n");
	}

	/** @param {any} deck */
	async function handleCloneDeck(deck) {
		if (!deck) return;
		const cards = JSON.parse(JSON.stringify(deck.cards || deck));
		const newName = `${getDeckDisplayName(deck)} (Copy)`;
		const newId =
			typeof crypto !== "undefined" && crypto.randomUUID
				? crypto.randomUUID()
				: String(Date.now());

		if (deck.isDraft) {
			let drafts = JSON.parse(
				localStorage.getItem("budgericards_local_drafts") || "[]",
			);
			const newDraft = {
				id: newId,
				name: newName,
				isDraft: true,
				cards,
				metadata: {
					...(deck.metadata || {}),
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
				},
			};
			drafts.unshift(newDraft);
			localStorage.setItem(
				"budgericards_local_drafts",
				JSON.stringify(drafts),
			);
			localDrafts = drafts;
			selectedDeck = newDraft;
		} else {
			try {
				const { data, error: saveError } = await syncService.saveDeck(
					newId,
					{
						...cards,
						name: newName,
					},
				);
				if (saveError) throw saveError;
				if (data) {
					updateSyncedDecks([data, ...decks]);
					selectedDeck = data;
				}
			} catch (err) {
				console.error("Failed to clone deck:", err);
				let drafts = JSON.parse(
					localStorage.getItem("budgericards_local_drafts") || "[]",
				);
				const newDraft = {
					id: newId,
					name: newName,
					isDraft: true,
					cards,
					metadata: {
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					},
				};
				drafts.unshift(newDraft);
				localStorage.setItem(
					"budgericards_local_drafts",
					JSON.stringify(drafts),
				);
				localDrafts = drafts;
				selectedDeck = newDraft;
			}
		}
		cloneFeedback = true;
		setTimeout(() => {
			cloneFeedback = false;
		}, 2000);
	}

	/** @param {any} deck */
	async function handleCopyDeckList(deck) {
		if (!deck) return;
		const text = formatDeckAsText(deck);
		if (navigator.clipboard && text) {
			await navigator.clipboard.writeText(text);
			copyListFeedback = true;
			setTimeout(() => {
				copyListFeedback = false;
			}, 2000);
		}
	}

	/** @param {any} deck */
	async function handleShareDeck(deck) {
		if (!deck) return;
		const url = deck.isDraft
			? window.location.href
			: `${window.location.origin}/decks/${deck.id}`;
		if (navigator.share) {
			try {
				await navigator.share({
					title: getDeckDisplayName(deck),
					url,
				});
				return;
			} catch (e) {
				// fallback to clipboard
			}
		}
		if (navigator.clipboard) {
			await navigator.clipboard.writeText(url);
			shareFeedback = true;
			setTimeout(() => {
				shareFeedback = false;
			}, 2000);
		}
	}

	/**
	 * @param {any} deck
	 * @param {string} newFormat
	 */
	async function handleSetDeckFormat(deck, newFormat) {
		if (!deck) return;
		const cards = JSON.parse(JSON.stringify(deck.cards || deck));
		cards.format = newFormat;

		if (deck.isDraft) {
			let drafts = JSON.parse(
				localStorage.getItem("budgericards_local_drafts") || "[]",
			);
			const idx = drafts.findIndex((d) => d.id === deck.id);
			if (idx !== -1) {
				drafts[idx].cards = cards;
				drafts[idx].metadata = {
					...(drafts[idx].metadata || {}),
					updatedAt: new Date().toISOString(),
				};
				localStorage.setItem(
					"budgericards_local_drafts",
					JSON.stringify(drafts),
				);
				localDrafts = drafts;
				if (selectedDeck?.id === deck.id) {
					selectedDeck = drafts[idx];
				}
			}
		} else {
			if (authStore.isAuthenticated) {
				try {
					const { data, error: saveError } = await syncService.saveDeck(
						deck.id,
						cards,
					);
					if (saveError) throw saveError;
					if (data) {
						updateSyncedDecks(
							decks.map((d) => (d.id === deck.id ? data : d)),
						);
						if (selectedDeck?.id === deck.id) {
							selectedDeck = data;
						}
					}
				} catch (err) {
					console.error("Failed to update deck format:", err);
				}
			}
		}
	}

	/**
	 * @param {MouseEvent} e
	 * @param {any} deck
	 */
	function handleDeckContextMenu(e, deck) {
		if (!deck) return;
		e.preventDefault();
		e.stopPropagation();

		const displayName = getDeckDisplayName(deck);
		const cards = deck.cards || deck;
		const currentFormat = deck.isDraft
			? "Local Draft"
			: cards.format || "Commander";
		const commanders = cards.commander || [];

		/** @type {any[]} */
		const items = [
			{
				label: "Open Deck",
				action: () => handleSelectDeck(deck),
			},
			{
				label: "Open in New Tab",
				action: () => {
					const slug = slugify(deck.name);
					window.open(`/decks/${deck.id}/${slug}`, "_blank");
				},
			},
			{ divider: true },
			{
				label: "Rename Deck",
				action: () => {
					selectedDeck = deck;
					startEditingName();
				},
			},
			{
				sectionHeader: "FORMAT",
				label: "Deck Format",
				valueBadge: currentFormat,
				submenu: [
					"Commander",
					"Brawl",
					"Oathbreaker",
					"Standard",
					"Pioneer",
					"Modern",
					"Legacy",
					"Vintage",
					"Pauper",
					"Cube",
					"Freeform",
				].map((fmt) => ({
					label: fmt === currentFormat ? `✓ ${fmt}` : fmt,
					action: () => handleSetDeckFormat(deck, fmt),
				})),
			},
		];

		// Commander hover preview & Scryfall link actions
		if (commanders.length > 0) {
			items.push({ divider: true });
			const isMultiple = commanders.length > 1;
			commanders.forEach((cmd, idx) => {
				const meta =
					(cards.metadata || {})[cmd.name?.toLowerCase()] || {};
				const artCrop =
					meta.image_uris?.art_crop ||
					meta.card_faces?.[0]?.image_uris?.art_crop ||
					(meta.image
						? meta.image.replace("/normal/", "/art_crop/")
						: null) ||
					`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmd.name)}&format=image&version=art_crop`;
				const normalImg =
					meta.image_uris?.normal ||
					meta.card_faces?.[0]?.image_uris?.normal ||
					meta.image ||
					`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cmd.name)}&format=image`;

				items.push({
					...(idx === 0
						? {
								sectionHeader: isMultiple
									? "COMMANDERS"
									: "COMMANDER",
							}
						: {}),
					label: cmd.name,
					subtitle: "Hover to preview • Click for Scryfall ↗",
					thumbnail: artCrop,
					tooltipImg: normalImg,
					action: () => {
						window.open(
							`https://scryfall.com/search?q=!%22${encodeURIComponent(cmd.name)}%22`,
							"_blank",
						);
					},
				});
			});
		}

		items.push(
			{ divider: true },
			{
				label: "Clone Deck",
				action: () => handleCloneDeck(deck),
			},
			{
				label: "Copy Decklist",
				action: () => handleCopyDeckList(deck),
			},
			{
				label: "Share Deck Link",
				action: () => handleShareDeck(deck),
			},
			{ divider: true },
			{
				label: deck.isDraft ? "Delete Draft" : "Delete Deck",
				danger: true,
				action: (event) =>
					handleDeleteDeck(deck.id, event, deck.isDraft),
			},
		);

		interactionStore.showCustomMenu(e, displayName, items);
	}

	/** @param {number} timestamp */
	function timeAgo(timestamp) {
		if (!timestamp) return "never";
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return "just now";
		let interval = seconds / 31536000;
		if (interval > 1) return Math.floor(interval) + "y ago";
		interval = seconds / 2592000;
		if (interval > 1) return Math.floor(interval) + "mo ago";
		interval = seconds / 86400;
		if (interval > 1) return Math.floor(interval) + "d ago";
		interval = seconds / 3600;
		if (interval > 1) return Math.floor(interval) + "h ago";
		interval = seconds / 60;
		if (interval > 1) return Math.floor(interval) + "m ago";
		return Math.floor(seconds) + "s ago";
	}

	/** @param {string} [dateString] */
	function formatUpdatedDate(dateString) {
		if (!dateString) return "recently";
		try {
			const ms = new Date(dateString).getTime();
			return timeAgo(ms);
		} catch (e) {
			return "recently";
		}
	}

	/** @param {any} cards */
	function getCardCount(cards) {
		if (!cards) return 0;
		const boardSource = cards.cards || cards;
		return (
			(boardSource.commander?.length || 0) +
			(boardSource.companion?.length || 0) +
			(boardSource.mainboard?.length || 0) +
			(boardSource.sideboard?.length || 0) +
			(boardSource.maybeboard?.length || 0)
		);
	}

	/** @param {any} deck */
	function getDeckCoverArt(deck) {
		if (!deck) return null;
		const cards = deck.cards || deck;
		if (cards.coverArt) return cards.coverArt;
		if (cards.coverArt === "") return null;

		const leadCard =
			cards.commander?.[0] ||
			cards.companion?.[0] ||
			cards.mainboard?.[0];
		if (!leadCard) return null;

		const metadata = cards.metadata || {};
		const meta = metadata[leadCard.name?.toLowerCase()];
		if (!meta) return null;

		return (
			meta.image_uris?.art_crop ||
			meta.card_faces?.[0]?.image_uris?.art_crop ||
			null
		);
	}

	/** @param {any} deck */
	function getDeckCommanderInfo(deck) {
		if (!deck) return null;
		const cards = deck.cards || deck;
		const cmd = cards.commander?.[0];
		if (!cmd) return null;
		const metadata = cards.metadata || {};
		const meta = metadata[cmd.name?.toLowerCase()] || {};
		const artCrop =
			meta.image_uris?.art_crop ||
			meta.card_faces?.[0]?.image_uris?.art_crop ||
			meta.image_uris?.normal ||
			null;
		return {
			name: cmd.name,
			type_line: meta.type_line || "Commander",
			mana_cost: meta.mana_cost || "",
			artCrop,
			meta,
		};
	}

	/** @param {any} deck */
	function getBoardBreakdown(deck) {
		if (!deck)
			return {
				commander: 0,
				mainboard: 0,
				sideboard: 0,
				maybeboard: 0,
				companion: 0,
				total: 0,
			};
		const cards = deck.cards || deck;
		const commander = cards.commander?.length || 0;
		const companion = cards.companion?.length || 0;
		const mainboard = cards.mainboard?.length || 0;
		const sideboard = cards.sideboard?.length || 0;
		const maybeboard = cards.maybeboard?.length || 0;
		return {
			commander,
			companion,
			mainboard,
			sideboard,
			maybeboard,
			total: commander + companion + mainboard + sideboard + maybeboard,
		};
	}

	/** @param {any} deck */
	function getDeckDisplayName(deck) {
		if (!deck) return "Untitled Deck";
		if (deck.isDraft) {
			if (
				deck.name &&
				deck.name.trim() !== "" &&
				deck.name !== "Name & Save This Deck" &&
				!deck.name.startsWith("Unsaved Deck")
			) {
				return deck.name;
			}
			const dateVal = deck.metadata?.updatedAt || deck.updated_at;
			const date = dateVal ? new Date(dateVal) : new Date();
			const mm = String(date.getMonth() + 1).padStart(2, "0");
			const dd = String(date.getDate()).padStart(2, "0");
			return `Unsaved Deck ${mm}/${dd}`;
		}
		return deck.name || "Untitled Deck";
	}

	let sortBy = $state("updated"); // 'updated' | 'name' | 'cards'
	let groupBy = $state("none"); // 'none' | 'format' | 'colors'
	let filterBy = $state("all"); // 'all' | 'drafts' | 'saved' | 'format:...' | 'color:...'

	let showFilterDropdown = $state(false);
	let showGroupDropdown = $state(false);
	let showSortDropdown = $state(false);

	/** @param {string} [except] */
	function closeAllDropdowns(except = "") {
		if (except !== "filter") showFilterDropdown = false;
		if (except !== "group") showGroupDropdown = false;
		if (except !== "sort") showSortDropdown = false;
	}

	/** @param {HTMLElement} node */
	function smartAlign(node) {
		function align() {
			node.style.left = "auto";
			node.style.right = "0";
			const rect = node.getBoundingClientRect();
			if (rect.left < 10) {
				node.style.left = "0";
				node.style.right = "auto";
			}
		}
		align();
		window.addEventListener("resize", align);
		return {
			destroy() {
				window.removeEventListener("resize", align);
			},
		};
	}

	/** @param {string[]} colors */
	function getColorIdentityName(colors) {
		if (!colors || colors.length === 0) return "Colorless";
		const sorted = ["W", "U", "B", "R", "G"].filter((c) =>
			colors.includes(c),
		);
		const key = sorted.join("");

		/** @type {Record<string, string>} */
		const colorMap = {
			W: "White",
			U: "Blue",
			B: "Black",
			R: "Red",
			G: "Green",
			WU: "Azorius",
			UB: "Dimir",
			BR: "Rakdos",
			RG: "Gruul",
			GW: "Selesnya",
			WB: "Orzhov",
			UR: "Izzet",
			BG: "Golgari",
			RW: "Boros",
			GU: "Simic",
			GWU: "Bant",
			WUB: "Esper",
			UBR: "Grixis",
			BRG: "Jund",
			RGW: "Naya",
			WBG: "Abzan",
			URW: "Jeskai",
			BGU: "Sultai",
			RWB: "Mardu",
			GUR: "Temur",
			UBRG: "Glint-Eye",
			BRGW: "Dune-Brood",
			RGWU: "Ink-Treader",
			GWUB: "Witch-Maw",
			WUBR: "Yore-Tiller",
			WUBRG: "Five-Color",
		};

		return colorMap[key] || `${sorted.join("")}`;
	}

	/** @param {any} deck */
	function getDeckColors(deck) {
		const manaSymbols = getDeckManaSymbols(deck);
		if (manaSymbols.length === 0) return "Colorless";
		return getColorIdentityName(manaSymbols);
	}

	const allDecks = $derived.by(() => {
		const mappedDrafts = localDrafts.map((d) => ({
			...d,
			isDraft: true,
			updated_at: d.metadata?.updatedAt
				? new Date(d.metadata.updatedAt).toISOString()
				: new Date().toISOString(),
		}));
		const mappedDecks = decks.map((d) => ({
			...d,
			isDraft: false,
		}));
		return [...mappedDrafts, ...mappedDecks];
	});

	const availableFormats = $derived.by(() => {
		const fmts = new Set();
		for (const d of allDecks) {
			const f = d.cards?.format;
			if (f) fmts.add(f);
		}
		if (fmts.size === 0) fmts.add("Commander");
		return Array.from(fmts).sort();
	});

	const filterLabel = $derived.by(() => {
		if (filterBy === "all") return "All Decks";
		if (filterBy === "drafts") return "Drafts";
		if (filterBy === "saved") return "Saved";
		if (filterBy.startsWith("format:")) {
			return filterBy.replace("format:", "");
		}
		if (filterBy.startsWith("color:")) {
			const col = filterBy.replace("color:", "");
			const colorNames = {
				W: "White",
				U: "Blue",
				B: "Black",
				R: "Red",
				G: "Green",
				COLORLESS: "Colorless",
				MULTI: "Multicolor",
			};
			/** @type {Record<string, string>} */
			const map = colorNames;
			return map[col] || col;
		}
		return "Filter";
	});

	const groupLabel = $derived.by(() => {
		if (groupBy === "format") return "Format";
		if (groupBy === "colors") return "Colors";
		return "No Grouping";
	});

	const sortLabel = $derived.by(() => {
		if (sortBy === "name") return "Name";
		if (sortBy === "cards") return "Cards";
		return "Recent";
	});

	const filteredDecks = $derived.by(() => {
		let list = [...allDecks];
		if (filterBy === "all") return list;
		if (filterBy === "drafts") return list.filter((d) => d.isDraft);
		if (filterBy === "saved") return list.filter((d) => !d.isDraft);
		if (filterBy.startsWith("format:")) {
			const fmt = filterBy.replace("format:", "").toLowerCase();
			return list.filter((d) => {
				const deckFmt = (
					d.cards?.format || (d.isDraft ? "draft" : "commander")
				).toLowerCase();
				return deckFmt === fmt;
			});
		}
		if (filterBy.startsWith("color:")) {
			const col = filterBy.replace("color:", "");
			return list.filter((d) => {
				const symbols = getDeckManaSymbols(d);
				if (col === "COLORLESS") return symbols.length === 0;
				if (col === "MULTI") return symbols.length > 1;
				return symbols.includes(col);
			});
		}
		return list;
	});

	const sortedDecks = $derived.by(() => {
		let list = [...filteredDecks];
		if (sortBy === "updated") {
			list.sort(
				(a, b) =>
					new Date(b.updated_at).getTime() -
					new Date(a.updated_at).getTime(),
			);
		} else if (sortBy === "name") {
			list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
		} else if (sortBy === "cards") {
			list.sort((a, b) => getCardCount(b) - getCardCount(a));
		}
		return list;
	});

	const groupedDecks = $derived.by(() => {
		const list = sortedDecks;
		if (groupBy === "none") {
			return [{ key: "all", label: "", items: list }];
		}

		/** @type {Record<string, any[]>} */
		const groups = {};

		if (groupBy === "format") {
			for (const deck of list) {
				const format = deck.isDraft
					? "Local Draft"
					: deck.cards?.format || "Commander";
				if (!groups[format]) groups[format] = [];
				groups[format].push(deck);
			}
		} else if (groupBy === "colors") {
			for (const deck of list) {
				const colors = getDeckColors(deck);
				if (!groups[colors]) groups[colors] = [];
				groups[colors].push(deck);
			}
		}

		return Object.entries(groups)
			.map(([label, items]) => ({
				key: label,
				label,
				items,
			}))
			.sort(
				(a, b) =>
					b.items.length - a.items.length ||
					a.label.localeCompare(b.label),
			);
	});

	/** @param {any} deck */
	function getDeckManaSymbols(deck) {
		if (!deck) return [];
		const cards = deck.cards || deck;
		const metadata = cards.metadata || {};
		const colorsSet = new Set();

		const allCardsList = [
			...(cards.commander || []),
			...(cards.companion || []),
			...(cards.mainboard || []),
			...(cards.sideboard || []),
			...(cards.maybeboard || []),
		];

		for (const card of allCardsList) {
			const meta = metadata[card.name?.toLowerCase()];
			if (meta && meta.color_identity) {
				for (const c of meta.color_identity) {
					colorsSet.add(c);
				}
			}
		}

		const wubrg = ["W", "U", "B", "R", "G"];
		return wubrg.filter((c) => colorsSet.has(c));
	}

	function handleNewDeckLink() {
		goto("/decks/new");
	}
</script>

<svelte:window onkeydown={handleWindowKeyDown} />

<div class="decks-page-wrapper">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="decks-page-container"
		onclick={handleContainerClick}
		role="presentation"
	>
		<div class="decks-content-inner">
			<header class="page-header">
				<div class="title-area">
					<FolderOpen class="header-icon" size={20} />
					<h1>Your Decks</h1>
				</div>

				{#if allDecks.length > 6}
					<div class="header-controls">
						<!-- Filter Dropdown -->
						<div class="control-dropdown-container">
							<button
								class="header-select-trigger"
								class:active={filterBy !== "all"}
								onclick={(e) => {
									e.stopPropagation();
									showFilterDropdown = !showFilterDropdown;
									if (showFilterDropdown) closeAllDropdowns("filter");
								}}
								aria-expanded={showFilterDropdown}
								aria-haspopup="listbox"
								title="Filter decks"
							>
								<Filter size={13} class="control-icon" />
								<span class="trigger-value">{filterLabel}</span>
								<ChevronDown size={13} class="chevron" />
							</button>

							{#if showFilterDropdown}
								<div class="header-select-menu" use:smartAlign transition:fly={{ y: 4, duration: 150 }}>
									<button
										class="select-item"
										class:active={filterBy === "all"}
										onclick={(e) => {
											e.stopPropagation();
											filterBy = "all";
											showFilterDropdown = false;
										}}
									>
										All Decks
									</button>
									<button
										class="select-item"
										class:active={filterBy === "drafts"}
										onclick={(e) => {
											e.stopPropagation();
											filterBy = "drafts";
											showFilterDropdown = false;
										}}
									>
										Drafts Only
									</button>
									<button
										class="select-item"
										class:active={filterBy === "saved"}
										onclick={(e) => {
											e.stopPropagation();
											filterBy = "saved";
											showFilterDropdown = false;
										}}
									>
										Saved Decks
									</button>

									{#if availableFormats.length > 0}
										<div class="menu-divider"></div>
										<div class="menu-section-header">Format</div>
										{#each availableFormats as fmt}
											<button
												class="select-item"
												class:active={filterBy === `format:${fmt}`}
												onclick={(e) => {
													e.stopPropagation();
													filterBy = `format:${fmt}`;
													showFilterDropdown = false;
												}}
											>
												{fmt}
											</button>
										{/each}
									{/if}

									<div class="menu-divider"></div>
									<div class="menu-section-header">Color Identity</div>
									<button
										class="select-item"
										class:active={filterBy === "color:W"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:W"; showFilterDropdown = false; }}
									>White</button>
									<button
										class="select-item"
										class:active={filterBy === "color:U"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:U"; showFilterDropdown = false; }}
									>Blue</button>
									<button
										class="select-item"
										class:active={filterBy === "color:B"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:B"; showFilterDropdown = false; }}
									>Black</button>
									<button
										class="select-item"
										class:active={filterBy === "color:R"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:R"; showFilterDropdown = false; }}
									>Red</button>
									<button
										class="select-item"
										class:active={filterBy === "color:G"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:G"; showFilterDropdown = false; }}
									>Green</button>
									<button
										class="select-item"
										class:active={filterBy === "color:MULTI"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:MULTI"; showFilterDropdown = false; }}
									>Multicolor</button>
									<button
										class="select-item"
										class:active={filterBy === "color:COLORLESS"}
										onclick={(e) => { e.stopPropagation(); filterBy = "color:COLORLESS"; showFilterDropdown = false; }}
									>Colorless</button>
								</div>
							{/if}
						</div>

						<!-- Group By Dropdown -->
						<div class="control-dropdown-container">
							<button
								class="header-select-trigger"
								class:active={groupBy !== "none"}
								onclick={(e) => {
									e.stopPropagation();
									showGroupDropdown = !showGroupDropdown;
									if (showGroupDropdown) closeAllDropdowns("group");
								}}
								aria-expanded={showGroupDropdown}
								aria-haspopup="listbox"
								title="Group decks by"
							>
								<LayoutGrid size={13} class="control-icon" />
								<span class="trigger-value">{groupLabel}</span>
								<ChevronDown size={13} class="chevron" />
							</button>

							{#if showGroupDropdown}
								<div class="header-select-menu" use:smartAlign transition:fly={{ y: 4, duration: 150 }}>
									<button
										class="select-item"
										class:active={groupBy === "none"}
										onclick={(e) => {
											e.stopPropagation();
											groupBy = "none";
											showGroupDropdown = false;
										}}
									>
										No Grouping
									</button>
									<button
										class="select-item"
										class:active={groupBy === "format"}
										onclick={(e) => {
											e.stopPropagation();
											groupBy = "format";
											showGroupDropdown = false;
										}}
									>
										Format
									</button>
									<button
										class="select-item"
										class:active={groupBy === "colors"}
										onclick={(e) => {
											e.stopPropagation();
											groupBy = "colors";
											showGroupDropdown = false;
										}}
									>
										Colors
									</button>
								</div>
							{/if}
						</div>

						<!-- Sort By Dropdown -->
						<div class="control-dropdown-container">
							<button
								class="header-select-trigger"
								onclick={(e) => {
									e.stopPropagation();
									showSortDropdown = !showSortDropdown;
									if (showSortDropdown) closeAllDropdowns("sort");
								}}
								aria-expanded={showSortDropdown}
								aria-haspopup="listbox"
								title="Sort decks by"
							>
								<ArrowDownWideNarrow size={13} class="control-icon" />
								<span class="trigger-value">{sortLabel}</span>
								<ChevronDown size={13} class="chevron" />
							</button>

							{#if showSortDropdown}
								<div class="header-select-menu" use:smartAlign transition:fly={{ y: 4, duration: 150 }}>
									<button
										class="select-item"
										class:active={sortBy === "updated"}
										onclick={(e) => {
											e.stopPropagation();
											sortBy = "updated";
											showSortDropdown = false;
										}}
									>
										Recent (Updated)
									</button>
									<button
										class="select-item"
										class:active={sortBy === "name"}
										onclick={(e) => {
											e.stopPropagation();
											sortBy = "name";
											showSortDropdown = false;
										}}
									>
										Name (A-Z)
									</button>
									<button
										class="select-item"
										class:active={sortBy === "cards"}
										onclick={(e) => {
											e.stopPropagation();
											sortBy = "cards";
											showSortDropdown = false;
										}}
									>
										Cards (Count)
									</button>
								</div>
							{/if}
						</div>
					</div>
				{/if}
			</header>

			<main class="page-body">
				{#if authStore.isLoading || (isLoading && allDecks.length === 0)}
					<div class="loading-state">
						<Loader class="spinner" size={36} />
						<p>Loading your decks...</p>
					</div>
				{:else if error}
					<div class="error-state">
						<p>{error}</p>
						<Button onclick={loadDecks} variant="outline"
							>Try Again</Button
						>
					</div>
				{:else if allDecks.length === 0}
					<div class="empty-state">
						<div class="empty-icon-container">
							<svg
								viewBox="0 0 160 160"
								width="140"
								height="140"
								fill="none"
								xmlns="http://www.w3.org/2000/svg"
							>
								<!-- Vertical Stack of Cards -->
								{#each Array(13) as _, i}
									{@const yOffset = (12 - i) * 2.8}
									<g
										transform="translate(0, {yOffset}) matrix(-0.86, 0.5, 0.871, 0.5, 79, 70)"
									>
										<rect
											x="-25"
											y="-35"
											width="50"
											height="70"
											rx="3"
											fill={i === 12
												? "hsl(var(--muted) / 0.55)"
												: "hsl(var(--background))"}
											stroke="currentColor"
											stroke-width="1"
											stroke-opacity={i === 12
												? "0.9"
												: "0.5"}
										/>
										{#if i === 12}
											<rect
												x="-21"
												y="-31"
												width="42"
												height="62"
												rx="1.5"
												stroke="currentColor"
												stroke-width="1"
												stroke-opacity="0.8"
											/>
											<ellipse
												cx="0"
												cy="0"
												rx="14"
												ry="24"
												fill="hsl(var(--muted) / 0.1)"
												stroke="currentColor"
												stroke-width="1"
												stroke-opacity="0.8"
											/>
											<g
												stroke="currentColor"
												stroke-width="1"
												stroke-opacity="0.8"
											>
												<circle
													cx="0"
													cy="-6"
													r="1.2"
												/>
												<circle
													cx="5"
													cy="-2"
													r="1.2"
												/>
												<circle cx="3" cy="4" r="1.2" />
												<circle
													cx="-3"
													cy="4"
													r="1.2"
												/>
												<circle
													cx="-5"
													cy="-2"
													r="1.2"
												/>
											</g>
										{/if}
									</g>
								{/each}
							</svg>
						</div>
						<h3>Create your first deck</h3>
						<p>
							Your saved decks will appear here. Continue to the
							deckbuilder to start brewing.
						</p>
						<a href="/" class="start-building-btn"
							>Start Building <span class="arrow-icon">→</span></a
						>
					</div>
				{:else}
					<section class="library-section">
						{#if filteredDecks.length === 0 && allDecks.length > 0}
							<div class="no-filter-matches">
								<p>No decks match the filter "{filterLabel}".</p>
								<button class="clear-filter-btn" onclick={() => (filterBy = "all")}>
									Clear filter
								</button>
							</div>
						{/if}
						{#each groupedDecks as group, groupIdx (group.key)}
							<div
								class="group-container"
								class:has-title={!!group.label}
							>
								{#if group.label}
									<h3 class="group-title">
										{group.label} ({group.items.length})
									</h3>
								{/if}

								<div class="decks-grid">
									{#if groupIdx === 0}
										<div
											class="deck-card create-card"
											role="button"
											tabindex="0"
											onclick={handleNewDeckLink}
											aria-label="Create New Deck"
											title="Create New Deck"
											onkeydown={(e) => {
												if (
													e.key === "Enter" ||
													e.key === " "
												) {
													e.preventDefault();
													handleNewDeckLink();
												}
											}}
										>
											<div
												class="deck-cover-frame create-frame"
											>
												<Plus
													class="create-icon"
													size={36}
												/>
											</div>
											<span
												class="deck-title create-card-spacer"
												aria-hidden="true">&nbsp;</span
											>
										</div>
									{/if}

									{#each group.items as deck, itemIdx (deck.id)}
										{@const staggerIdx = itemIdx}
										<div
											class="deck-card"
											style="--stagger-index: {Math.min(
												staggerIdx,
												24,
											)}"
											class:selected={selectedDeck?.id ===
												deck.id}
											class:is-draft={deck.isDraft}
											role="button"
											tabindex="0"
											onclick={() =>
												handleDeckClick(deck)}
											ondblclick={() =>
												handleDeckDblClick(deck)}
											oncontextmenu={(e) =>
												handleDeckContextMenu(e, deck)}
											onkeydown={(e) => {
												if (
													e.key === "Enter" ||
													e.key === " "
												) {
													e.preventDefault();
													handleDeckClick(deck);
												}
											}}
										>
											<div class="deck-cover-frame">
												{#if deck.isDraft}
													{#if getDeckCoverArt(deck)}
														<img
															src={getDeckCoverArt(
																deck,
															)}
															alt=""
															class="deck-cover-img draft-layer-bottom"
														/>
														<div
															class="draft-white-tint"
														></div>
														<img
															src={getDeckCoverArt(
																deck,
															)}
															alt=""
															class="deck-cover-img draft-layer-top"
														/>
													{:else}
														<div
															class="deck-cover-fallback"
														></div>
													{/if}
													<div
														class="draft-pattern-overlay"
													></div>
												{:else if getDeckCoverArt(deck)}
													<img
														src={getDeckCoverArt(
															deck,
														)}
														alt=""
														class="deck-cover-img"
													/>
												{:else}
													<div
														class="deck-cover-fallback"
													></div>
												{/if}

												{#if getDeckManaSymbols(deck).length > 0}
													<div class="deck-mana-pips">
														{#each getDeckManaSymbols(deck) as sym}
															<ManaSymbol
																symbol={sym}
																size="20px"
															/>
														{/each}
													</div>
												{/if}
											</div>

											<span
												class="deck-title"
												title={getDeckDisplayName(deck)}
											>
												{getDeckDisplayName(deck)}
											</span>
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</section>
				{/if}
			</main>
		</div>
	</div>

	<!-- Side Info Panel (in same plane, side-by-side) -->
	{#if selectedDeck}
		{@const cmdInfo = getDeckCommanderInfo(selectedDeck)}
		{@const breakdown = getBoardBreakdown(selectedDeck)}
		{@const deckPrice = getDeckPrice(selectedDeck)}
		{@const manaSymbols = getDeckManaSymbols(selectedDeck)}
		{@const isCommanderFormat =
			(selectedDeck.cards?.format || "").toLowerCase() === "commander" ||
			cmdInfo !== null}

		<aside
			class="deck-info-panel"
			class:is-draft-panel={selectedDeck.isDraft}
			transition:fly={{ x: 380, duration: 240 }}
			aria-label="Deck details"
		>
			<!-- Full Bleed Hero Art Cover at Top -->
			<div class="panel-hero-banner">
				{#if selectedDeck.isDraft}
					{#if getDeckCoverArt(selectedDeck)}
						<img
							src={getDeckCoverArt(selectedDeck)}
							alt=""
							class="panel-hero-img draft-layer-bottom"
						/>
						<div class="draft-white-tint"></div>
						<img
							src={getDeckCoverArt(selectedDeck)}
							alt=""
							class="panel-hero-img draft-layer-top"
						/>
					{:else}
						<div class="panel-hero-fallback"></div>
					{/if}
					<div class="draft-pattern-overlay"></div>
				{:else if getDeckCoverArt(selectedDeck)}
					<img
						src={getDeckCoverArt(selectedDeck)}
						alt=""
						class="panel-hero-img"
					/>
				{:else}
					<div class="panel-hero-fallback"></div>
				{/if}
				<div class="panel-hero-overlay"></div>

				<!-- Floating Top-Right Glass Close Button -->
				<button
					type="button"
					class="panel-close-btn"
					onclick={closeSidePanel}
					aria-label="Close panel"
				>
					<X size={16} />
				</button>
			</div>

			<!-- Panel Scrollable Body -->
			<div class="panel-scroll-content">
				<!-- Centered Mana Symbols, Title & Meta Line -->
				<div class="panel-header-block">
					{#if manaSymbols.length > 0}
						<div class="panel-mana-row">
							{#each manaSymbols as sym}
								<ManaSymbol symbol={sym} size="20px" />
							{/each}
						</div>
					{/if}

					{#if isEditingName}
						<input
							type="text"
							class="panel-deck-name-input"
							bind:value={editingName}
							bind:this={nameInputEl}
							onkeydown={handleNameKeydown}
							onblur={saveRenamedDeck}
						/>
					{:else}
						<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
						<h2
							class="panel-deck-name"
							class:is-draft={selectedDeck.isDraft}
							ondblclick={startEditingName}
							title="Double-click to rename"
						>
							{getDeckDisplayName(selectedDeck)}
						</h2>
					{/if}

					<div class="panel-meta-line">
						<span class="meta-item-tag">
							{selectedDeck.isDraft
								? "LOCAL DRAFT"
								: (
										selectedDeck.cards?.format ||
										"COMMANDER"
									).toUpperCase()}
						</span>
						<span class="meta-separator">•</span>
						<span class="meta-item-count">
							{#if isCommanderFormat && breakdown.total > 0}
								{breakdown.total}/100
							{:else}
								{getCardCount(selectedDeck)} CARDS
							{/if}
						</span>
						{#if deckPrice}
							<span class="meta-separator">•</span>
							<span class="meta-item-price">{deckPrice}</span>
						{/if}
					</div>
				</div>

				<!-- Action Buttons Stack (Figma Frame 1564) -->
				<div class="panel-actions-stack">
					<!-- Primary Open Deck CTA -->
					<button
						type="button"
						class="action-btn primary-btn"
						onclick={() => handleSelectDeck(selectedDeck)}
					>
						<span>Open Deck</span>
						<ArrowRight size={17} class="btn-arrow" />
					</button>

					<!-- Clone Button -->
					<button
						type="button"
						class="action-btn secondary-btn"
						onclick={() => handleCloneDeck(selectedDeck)}
					>
						{#if cloneFeedback}
							<Check size={16} class="btn-icon success-icon" />
							<span>Cloned!</span>
						{:else}
							<Copy size={16} class="btn-icon" />
							<span>Clone</span>
						{/if}
					</button>

					<!-- Copy List Button -->
					<button
						type="button"
						class="action-btn secondary-btn"
						onclick={() => handleCopyDeckList(selectedDeck)}
					>
						{#if copyListFeedback}
							<Check size={16} class="btn-icon success-icon" />
							<span>List Copied!</span>
						{:else}
							<FileText size={16} class="btn-icon" />
							<span>Copy List</span>
						{/if}
					</button>

					<!-- Share Button -->
					<button
						type="button"
						class="action-btn secondary-btn"
						onclick={() => handleShareDeck(selectedDeck)}
					>
						{#if shareFeedback}
							<Check size={16} class="btn-icon success-icon" />
							<span>Link Copied!</span>
						{:else}
							<Share2 size={16} class="btn-icon" />
							<span>Share</span>
						{/if}
					</button>

					<!-- Delete Button -->
					<button
						type="button"
						class="action-btn danger-btn"
						onclick={(e) => {
							const d = selectedDeck;
							handleDeleteDeck(d.id, e, d.isDraft);
						}}
					>
						<Trash2 size={16} class="btn-icon" />
						<span
							>{selectedDeck.isDraft
								? "Delete Draft"
								: "Delete"}</span
						>
					</button>
				</div>

				<!-- Footer Timestamp -->
				<div class="panel-footer-timestamp">
					Updated {formatUpdatedDate(
						selectedDeck.isDraft
							? selectedDeck.metadata?.updatedAt
							: selectedDeck.updated_at,
					)}.
				</div>
			</div>

			{#if selectedDeck.isDraft}
				<div
					class="panel-draft-bottom-stripes"
					aria-hidden="true"
				></div>
			{/if}
		</aside>
	{/if}
</div>

<style>
	.decks-page-wrapper {
		display: flex;
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: hsl(var(--background));
		position: relative;
	}

	.decks-page-container {
		flex: 1;
		min-width: 0;
		height: 100%;
		overflow-y: auto;
		padding: 3rem 1.5rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		box-sizing: border-box;
	}

	.decks-content-inner {
		width: 100%;
		max-width: min(1032px, calc(100vw - 380px - 3rem));
		display: flex;
		flex-direction: column;
	}

	.page-header {
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 2rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 1.25rem;
		flex-wrap: wrap;
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.header-icon) {
		color: hsl(var(--primary));
	}

	.page-header h1 {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 1.75rem;
		font-style: italic;
		font-weight: 500;
		margin: 0;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	/* Header Controls (Dropdowns) */
	.header-controls {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.control-dropdown-container {
		position: relative;
	}

	.header-select-trigger {
		height: 34px;
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		padding: 0 10px;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground) / 0.85);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.header-select-trigger:hover {
		background: hsl(var(--muted) / 0.8);
		color: hsl(var(--foreground));
	}

	.header-select-trigger.active {
		border-color: hsl(var(--primary) / 0.6);
		color: hsl(var(--foreground));
		background: hsl(var(--primary) / 0.1);
	}

	:global(.control-icon) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.header-select-trigger:hover :global(.control-icon),
	.header-select-trigger.active :global(.control-icon) {
		color: hsl(var(--foreground));
	}

	.header-select-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 155px;
		max-height: 380px;
		overflow-y: auto;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
		padding: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.select-item {
		padding: 6px 10px;
		border-radius: 4px;
		font-size: 12.5px;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: transparent;
		border: none;
		text-align: left;
		cursor: pointer;
		transition: all 0.12s ease;
		display: flex;
		align-items: center;
		justify-content: space-between;
		white-space: nowrap;
	}

	.select-item:hover {
		background: hsl(var(--muted) / 0.8);
		color: hsl(var(--foreground));
	}

	.select-item.active {
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.12);
		font-weight: 600;
	}

	.menu-divider {
		height: 1px;
		background: hsl(var(--border) / 0.5);
		margin: 3px 0;
	}

	.menu-section-header {
		font-size: 10px;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground) / 0.7);
		padding: 4px 8px 2px;
		user-select: none;
	}

	.no-filter-matches {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem 1.5rem;
		text-align: center;
		gap: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.no-filter-matches p {
		margin: 0;
		font-size: 0.95rem;
	}

	.clear-filter-btn {
		padding: 4px 12px;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: 4px;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		color: hsl(var(--foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.clear-filter-btn:hover {
		background: hsl(var(--muted) / 0.8);
	}

	/* Decks list/grid */
	.decks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
		gap: 1.5rem;
	}

	@keyframes deckCardPopIn {
		0% {
			opacity: 0;
			transform: translateY(12px) scale(0.96);
		}
		60% {
			opacity: 1;
			transform: translateY(-2px) scale(1.01);
		}
		100% {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	/* Deck Card Wrapper */
	.deck-card {
		display: flex;
		flex-direction: column;
		align-items: center;
		cursor: pointer;
		user-select: none;
		box-sizing: border-box;
		outline: none;
	}

	.deck-card:not(.create-card) {
		animation: deckCardPopIn 0.38s cubic-bezier(0.2, 0.8, 0.25, 1) backwards;
		animation-delay: calc(var(--stagger-index, 0) * 35ms);
	}

	/* The 4:3 Image Frame */
	.deck-cover-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: 6px;
		overflow: hidden;
		background: #141416;
		border: none;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		transition:
			transform 0.1s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.1s cubic-bezier(0.4, 0, 0.2, 1);
	}

	/* 3D Tile Layered Inner Shadows for the Deck Cover */
	.deck-card:not(.create-card) .deck-cover-frame::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		box-shadow:
			inset 0 1px 4px rgba(255, 255, 255, 0.2),
			inset 0 0 0 1px rgba(255, 255, 255, 0.08),
			inset -0.5px -1.5px 3px rgba(0, 0, 0, 0.75);
		z-index: 4;
		transition: box-shadow 0.1s ease;
	}

	.deck-card:hover .deck-cover-frame {
		transform: translateY(-3px);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55);
	}

	.deck-card:hover:not(.create-card) .deck-cover-frame::after {
		box-shadow:
			inset 0 1.5px 5px rgba(255, 255, 255, 0.32),
			inset 0 0 0 1px rgba(255, 255, 255, 0.12),
			inset -0.5px -2px 4px rgba(0, 0, 0, 0.85);
	}

	.deck-card.selected .deck-cover-frame {
		box-shadow:
			0 0 0 2px hsl(var(--primary) / 0.9),
			0 8px 24px rgba(0, 0, 0, 0.5);
	}

	.deck-cover-img {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.deck-card:hover .deck-cover-img {
		transform: scale(1.03);
	}

	/* Faded Look for Draft Cover Images */
	.draft-layer-bottom {
		opacity: 0.66;
	}

	.draft-white-tint {
		position: absolute;
		inset: 0;
		background-color: rgba(255, 255, 255, 0.3);
		pointer-events: none;
		z-index: 1;
	}

	.draft-layer-top {
		opacity: 0.5;
		mix-blend-mode: luminosity;
		z-index: 1;
	}

	.draft-pattern-overlay {
		position: absolute;
		inset: 0;
		opacity: 0.8;
		background-color: transparent;
		background-image: url("data:image/svg+xml,%3Csvg width='48' height='48' viewBox='0 0 48 48' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath fill-rule='evenodd' clip-rule='evenodd' d='M-0.646405 24.3536L24.3536 -0.646405L23.6465 -1.35352L-1.35352 23.6465L-0.646405 24.3536ZM-0.646405 36.3536L36.3536 -0.646405L35.6465 -1.35352L-1.35352 35.6464L-0.646405 36.3536ZM48.3536 -0.646405L-0.646405 48.3536L-1.35352 47.6465L47.6465 -1.35352L48.3536 -0.646405ZM10.3536 49.3536L49.3536 10.3536L48.6465 9.64648L9.64648 48.6464L10.3536 49.3536ZM49.3536 22.3535L22.3536 49.3535L21.6465 48.6464L48.6465 21.6464L49.3536 22.3535ZM34.3536 49.3536L49.3536 34.3536L48.6465 33.6465L33.6465 48.6464L34.3536 49.3536ZM49.3536 46.3536L46.3536 49.3536L45.6465 48.6465L48.6465 45.6465L49.3536 46.3536ZM-0.646405 12.3536L12.3536 -0.646405L11.6465 -1.35352L-1.35352 11.6465L-0.646405 12.3536ZM18.3536 -0.646405L-0.646405 18.3536L-1.35352 17.6465L17.6465 -1.35352L18.3536 -0.646405ZM-0.646405 6.35359L6.35359 -0.646405L5.64648 -1.35352L-1.35352 5.64648L-0.646405 6.35359ZM30.3536 -0.646405L-0.646405 30.3536L-1.35352 29.6465L29.6465 -1.35352L30.3536 -0.646405ZM-0.646405 42.3536L42.3536 -0.646405L41.6465 -1.35352L-1.35352 41.6465L-0.646405 42.3536ZM49.3536 4.35359L4.35359 49.3536L3.64648 48.6465L48.6465 3.64648L49.3536 4.35359ZM16.3536 49.3536L49.3536 16.3536L48.6465 15.6465L15.6465 48.6465L16.3536 49.3536ZM49.3536 28.3536L28.3536 49.3536L27.6465 48.6465L48.6465 27.6465L49.3536 28.3536ZM40.3536 49.3536L49.3536 40.3536L48.6465 39.6465L39.6465 48.6465L40.3536 49.3536Z' fill='white' fill-opacity='0.15'/%3E%3C/svg%3E");
		background-size: 48px 48px;
		background-repeat: repeat;
		pointer-events: none;
		z-index: 2;
	}

	.deck-cover-fallback {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		background: linear-gradient(
			135deg,
			hsl(var(--muted) / 0.4) 0%,
			hsl(var(--accent) / 0.3) 100%
		);
	}

	/* Mana symbols floating bottom-center of the cover image */
	.deck-mana-pips {
		position: absolute;
		bottom: 8px;
		left: 50%;
		transform: translateX(-50%);
		display: inline-flex;
		align-items: center;
		gap: 3px;
		z-index: 5;
		pointer-events: none;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.75));
	}

	/* Centered deck title below image frame */
	.deck-title {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 18px;
		font-weight: 600;
		color: #ffffff;
		text-align: center;
		margin-top: 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		width: 100%;
		letter-spacing: -0.01em;
		line-height: 1.3;
		padding-bottom: 2px;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
	}

	/* Unsaved draft styling: italics and 75% opacity */
	.deck-card.is-draft .deck-title {
		font-style: italic;
		opacity: 0.75;
	}

	.deck-card.is-draft .deck-mana-pips {
		opacity: 0.75;
	}

	/* Create New Deck Frame */
	.deck-cover-frame.create-frame {
		border: 1.5px dashed hsl(var(--border) / 0.7);
		background: hsl(var(--muted) / 0.05);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: none;
	}

	:global(.create-icon) {
		color: hsl(var(--muted-foreground) / 0.8);
		transition:
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			color 0.2s ease;
	}

	:global(.deck-card:hover .create-icon) {
		transform: scale(1.18);
		color: hsl(var(--primary));
	}

	.deck-card.create-card:hover .deck-cover-frame {
		border-color: hsl(var(--primary) / 0.6);
		background: hsl(var(--primary) / 0.04);
	}

	.create-card-spacer {
		visibility: hidden;
		pointer-events: none;
	}

	/* Grouping Container & Headers */
	.group-container {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.group-container.has-title {
		margin-top: 1.5rem;
	}

	.group-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		margin: 0;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px dashed hsl(var(--border) / 0.2);
		padding-bottom: 0.25rem;
	}

	.library-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* Full Height Docked Sidebar (Frame 1564 Layout) */
	.deck-info-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		max-width: 92vw;
		height: 100vh;
		background: #121215;
		border-left: 1px solid hsl(var(--border) / 0.5);
		display: flex;
		flex-direction: column;
		box-shadow: -8px 0 32px rgba(0, 0, 0, 0.5);
		z-index: 1001;
		overflow: hidden;
	}

	.panel-hero-banner {
		position: relative;
		width: 100%;
		height: 240px;
		flex-shrink: 0;
		overflow: hidden;
		background: #18181c;
	}

	.panel-hero-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center 20%;
		display: block;
	}

	.panel-hero-fallback {
		width: 100%;
		height: 100%;
		background: linear-gradient(
			135deg,
			hsl(var(--muted)) 0%,
			hsl(var(--accent)) 100%
		);
	}

	.panel-hero-overlay {
		position: absolute;
		inset: 0;
		background: linear-gradient(
			to top,
			#121215 0%,
			rgba(18, 18, 21, 0.75) 45%,
			rgba(0, 0, 0, 0.15) 100%
		);
		pointer-events: none;
		z-index: 3;
	}

	.is-draft-panel .panel-hero-banner {
		background: repeating-linear-gradient(
			-45deg,
			#141417,
			#141417 12px,
			#1e1e24 12px,
			#1e1e24 24px
		);
	}

	.panel-close-btn {
		position: absolute;
		top: 16px;
		right: 16px;
		z-index: 10;
		background: rgba(0, 0, 0, 0.55);
		border: 1px solid rgba(255, 255, 255, 0.15);
		backdrop-filter: blur(8px);
		color: rgba(255, 255, 255, 0.85);
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.panel-close-btn:hover {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.2);
		transform: scale(1.06);
		border-color: rgba(255, 255, 255, 0.3);
	}

	.panel-scroll-content {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding: 0 1.5rem 1.75rem;
		scrollbar-width: thin;
		scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
		position: relative;
		z-index: 1;
	}

	.panel-draft-bottom-stripes {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 240px;
		background: repeating-linear-gradient(
			-45deg,
			rgba(255, 255, 255, 0.015),
			rgba(255, 255, 255, 0.015) 10px,
			rgba(255, 255, 255, 0.055) 10px,
			rgba(255, 255, 255, 0.055) 20px
		);
		-webkit-mask-image: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.7) 0%,
			transparent 100%
		);
		mask-image: linear-gradient(
			to top,
			rgba(0, 0, 0, 0.7) 0%,
			transparent 100%
		);
		pointer-events: none;
		z-index: 0;
	}

	.panel-scroll-content::-webkit-scrollbar {
		width: 4px;
	}

	.panel-scroll-content::-webkit-scrollbar-thumb {
		background: rgba(255, 255, 255, 0.12);
		border-radius: 4px;
	}

	.panel-header-block {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding-top: 1rem;
		position: relative;
		z-index: 5;
	}

	.panel-mana-row {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		margin-bottom: 0.65rem;
		filter: drop-shadow(0 2px 6px rgba(0, 0, 0, 0.9));
	}

	.panel-deck-name {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 1.5rem;
		font-weight: 700;
		color: #ffffff;
		margin: 0 0 0.4rem;
		line-height: 1.25;
		letter-spacing: -0.015em;
		text-align: center;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
		cursor: text;
		border: none;
		background: transparent;
		padding: 0 4px;
	}

	.panel-deck-name.is-draft {
		font-style: italic;
		opacity: 0.9;
	}

	.panel-deck-name-input {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-style: italic;
		font-size: 1.5rem;
		font-weight: 700;
		color: #ffffff;
		background: transparent;
		border: none;
		border-bottom: 1.5px solid rgba(255, 255, 255, 0.45);
		border-radius: 0;
		margin: 0 0 0.75rem;
		line-height: 1.25;
		letter-spacing: -0.015em;
		text-align: center;
		padding: 0 4px 6px;
		width: 100%;
		box-sizing: border-box;
		outline: none;
		box-shadow: none;
		text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8);
		caret-color: #ffffff;
		transition: border-color 0.15s ease;
	}

	.panel-deck-name-input:focus {
		border-bottom-color: rgba(255, 255, 255, 0.85);
	}

	.panel-meta-line {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.25rem;
		font-size: 0.72rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: hsl(var(--muted-foreground));
	}

	.meta-separator {
		opacity: 0.4;
	}

	.panel-actions-stack {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-top: 1.6rem;
		width: 100%;
	}

	.action-btn {
		width: 100%;
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 0 1rem;
		border-radius: 6px;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
		box-sizing: border-box;
	}

	.action-btn.primary-btn {
		background: #2563eb;
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
		color: #ffffff;
		font-weight: 600;
		border: none;
	}

	.action-btn.primary-btn:hover {
		background: #3b82f6;
		background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
		transform: translateY(-1px);
	}

	.action-btn.primary-btn:active {
		transform: translateY(0);
		background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
	}

	:global(.primary-btn .btn-arrow) {
		transition: transform 0.18s ease;
	}

	:global(.primary-btn:hover .btn-arrow) {
		transform: translateX(4px);
	}

	.secondary-btn {
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: hsl(var(--foreground));
	}

	.secondary-btn:hover {
		background: rgba(255, 255, 255, 0.08);
		border-color: rgba(255, 255, 255, 0.16);
		transform: translateY(-1px);
	}

	:global(.secondary-btn .btn-icon) {
		color: hsl(var(--muted-foreground));
	}

	:global(.secondary-btn:hover .btn-icon) {
		color: hsl(var(--foreground));
	}

	.danger-btn {
		background: rgba(239, 68, 68, 0.06);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: #f87171;
	}

	.danger-btn:hover {
		background: rgba(239, 68, 68, 0.14);
		border-color: rgba(239, 68, 68, 0.4);
		color: #fca5a5;
		transform: translateY(-1px);
	}

	:global(.danger-btn .btn-icon) {
		color: #f87171;
	}

	:global(.success-icon) {
		color: #10b981 !important;
	}

	.panel-footer-timestamp {
		margin-top: auto;
		padding-top: 1.5rem;
		text-align: center;
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground) / 0.7);
	}
</style>
