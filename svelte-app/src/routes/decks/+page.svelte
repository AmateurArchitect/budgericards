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
	} from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { syncService } from "$lib/syncService";
	import { onMount } from "svelte";
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

	$effect(() => {
		layoutStore.rightSidebarWidth = selectedDeck ? 380 : 0;
		return () => {
			layoutStore.rightSidebarWidth = 0;
		};
	});

	let clickTimer = /** @type {any} */ (null);

	async function loadDecks() {
		if (!authStore.isAuthenticated && !authStore.isLoading) {
			decks = [];
			return;
		}

		isLoading = true;
		error = "";
		try {
			const { data, error: fetchError } = await syncService.fetchDecks();
			if (fetchError) throw fetchError;
			decks = data || [];
			hasLoaded = true;
		} catch (err) {
			console.error("Failed to load decks:", err);
			error = "Could not load synced decks. Please try again.";
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		if (authStore.isAuthenticated) {
			loadDecks();
		}
		if (typeof window !== "undefined") {
			localDrafts = JSON.parse(
				localStorage.getItem("budgericards_local_drafts") || "[]",
			);
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
		selectedDeck = null;
	}

	/** @param {MouseEvent} e */
	function handleContainerClick(e) {
		const target = /** @type {HTMLElement | null} */ (e.target);
		if (!target) return;
		if (
			target.closest(".deck-card") ||
			target.closest(".deck-info-panel") ||
			target.closest(".control-btn") ||
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
		if (e.key === "Escape" && selectedDeck) {
			closeSidePanel();
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
				decks = decks.filter((d) => d.id !== deckId);
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
					decks = [data, ...decks];
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

	const sortedDecks = $derived.by(() => {
		let list = [...allDecks];
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
		if (allDecks.length < 12 || groupBy === "none") {
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
					{#if allDecks.length >= 6}
						<div class="library-controls">
							<div class="control-group">
								<span class="control-label">Sort by:</span>
								<div class="control-buttons">
									<button
										class="control-btn"
										class:active={sortBy === "updated"}
										onclick={() => (sortBy = "updated")}
										>Recent</button
									>
									<button
										class="control-btn"
										class:active={sortBy === "name"}
										onclick={() => (sortBy = "name")}
										>Name</button
									>
									<button
										class="control-btn"
										class:active={sortBy === "cards"}
										onclick={() => (sortBy = "cards")}
										>Cards</button
									>
								</div>
							</div>

							{#if allDecks.length >= 12}
								<div class="control-group">
									<span class="control-label">Group by:</span>
									<div class="control-buttons">
										<button
											class="control-btn"
											class:active={groupBy === "none"}
											onclick={() => (groupBy = "none")}
											>None</button
										>
										<button
											class="control-btn"
											class:active={groupBy === "format"}
											onclick={() => (groupBy = "format")}
											>Format</button
										>
										<button
											class="control-btn"
											class:active={groupBy === "colors"}
											onclick={() => (groupBy = "colors")}
											>Colors</button
										>
									</div>
								</div>
							{/if}
						</div>
					{/if}

					<section class="library-section">
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
										</div>
									{/if}

									{#each group.items as deck (deck.id)}
										<div
											class="deck-card"
											class:selected={selectedDeck?.id ===
												deck.id}
											class:is-draft={deck.isDraft}
											role="button"
											tabindex="0"
											onclick={() =>
												handleDeckClick(deck)}
											ondblclick={() =>
												handleDeckDblClick(deck)}
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

					<h2 class="panel-deck-name">
						{getDeckDisplayName(selectedDeck)}
					</h2>

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
		padding: 3rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		box-sizing: border-box;
	}

	.decks-content-inner {
		width: 100%;
		max-width: 960px;
		display: flex;
		flex-direction: column;
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 2rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 1.25rem;
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

	.page-body {
		flex: 1;
	}

	/* States */
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 6rem 1.5rem;
		gap: 1rem;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.05);
		border: 1px dashed hsl(var(--border) / 0.6);
		border-radius: 6px;
	}

	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 4rem 1.5rem;
		gap: 0.5rem;
		color: hsl(var(--muted-foreground));
		background: transparent;
		border: none;
	}

	.empty-icon-container {
		color: hsl(var(--muted-foreground) / 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.25rem;
		position: relative;
	}

	.empty-icon-container svg {
		position: relative;
		z-index: 1;
	}

	.empty-state h3 {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-style: italic;
		font-size: 1.5rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
		text-wrap: balance;
	}

	.empty-state p {
		font-size: 0.95rem;
		max-width: 440px;
		margin: 0;
		line-height: 1.6;
		color: hsl(var(--muted-foreground));
		text-wrap: balance;
	}

	.start-building-btn {
		margin-top: 1.25rem;
		padding: 0.75rem 2rem;
		background: hsl(var(--primary));
		color: white;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.2);
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
	}

	.start-building-btn:hover {
		opacity: 0.95;
		transform: translateY(-1px);
		box-shadow: 0 6px 16px hsl(var(--primary) / 0.3);
		color: white !important;
	}

	.arrow-icon {
		transition: transform 0.2s ease;
	}

	.start-building-btn:hover .arrow-icon {
		transform: translateX(3px);
	}

	:global(.loading-state .spinner) {
		animation: spin 1s linear infinite;
		color: hsl(var(--primary));
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}

	/* Library Controls */
	.library-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.08);
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: var(--radius-md);
		margin-bottom: 2rem;
		align-items: center;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.control-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.control-buttons {
		display: flex;
		background: hsl(var(--muted) / 0.2);
		padding: 2px;
		border-radius: var(--radius-sm);
		border: 1px solid hsl(var(--border) / 0.2);
	}

	.control-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		font-size: 0.75rem;
		font-weight: 500;
		padding: 4px 12px;
		border-radius: calc(var(--radius-sm) - 1px);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.control-btn:hover {
		color: hsl(var(--foreground));
	}

	.control-btn.active {
		background: hsl(var(--background));
		color: hsl(var(--primary));
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		font-weight: 600;
	}

	/* Decks list/grid */
	.decks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(205px, 1fr));
		gap: 1.75rem 1.5rem;
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

	/* The 4:3 Image Frame */
	.deck-cover-frame {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: 6px;
		overflow: hidden;
		background: #141416;
		border: 1px solid rgba(255, 255, 255, 0.08);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
		transition:
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			border-color 0.2s ease;
	}

	/* 3D Tile Inner Shadows for the Deck Cover */
	.deck-card:not(.create-card) .deck-cover-frame::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: inherit;
		pointer-events: none;
		box-shadow:
			inset 0.5px 1px 3px rgba(255, 255, 255, 0.18),
			inset -0.5px -1px 3px rgba(0, 0, 0, 0.75);
		z-index: 4;
	}

	.deck-card:hover .deck-cover-frame {
		transform: translateY(-3px);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.6);
	}

	.deck-card.selected .deck-cover-frame {
		border-color: hsl(var(--primary));
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
			#141417 0%,
			rgba(20, 20, 23, 0.65) 40%,
			rgba(0, 0, 0, 0.2) 100%
		);
		pointer-events: none;
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
		gap: 6px;
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
	}

	.panel-meta-line {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.5rem;
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
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.6rem;
		padding: 0.75rem 1.25rem;
		border-radius: 10px;
		font-size: 0.88rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
		box-sizing: border-box;
	}

	.primary-btn {
		background: #2563eb;
		background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
		color: #ffffff;
		font-weight: 600;
		border: none;
		box-shadow: 0 4px 16px rgba(37, 99, 235, 0.35);
	}

	.primary-btn:hover {
		background: linear-gradient(135deg, #60a5fa 0%, #3b82f6 100%);
		transform: translateY(-1px);
		box-shadow: 0 6px 20px rgba(37, 99, 235, 0.5);
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
