<script>
	import { fade, fly } from "svelte/transition";
	import {
		FolderOpen,
		Trash2,
		Loader,
		PlusCircle,
		X,
		ArrowRight,
	} from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
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
		selectedDeck = deck;
	}

	/** @param {any} deck */
	function handleDeckDblClick(deck) {
		handleSelectDeck(deck);
	}

	function closeSidePanel() {
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
	<div class="decks-page-container">
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
											<circle cx="0" cy="-6" r="1.2" />
											<circle cx="5" cy="-2" r="1.2" />
											<circle cx="3" cy="4" r="1.2" />
											<circle cx="-3" cy="4" r="1.2" />
											<circle cx="-5" cy="-2" r="1.2" />
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
										<div class="create-content">
											<PlusCircle
												class="create-icon"
												size={32}
											/>
											<span class="create-title"
												>Create New Deck</span
											>
											<span class="create-subtitle"
												>Start building a fresh draft</span
											>
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
										onclick={() => handleDeckClick(deck)}
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
										{#if deck.isDraft}
											{#if getDeckCoverArt(deck)}
												<img
													src={getDeckCoverArt(deck)}
													alt=""
													class="deck-cover-img draft-layer-bottom"
												/>
												<div
													class="draft-white-tint"
												></div>
												<img
													src={getDeckCoverArt(deck)}
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
												src={getDeckCoverArt(deck)}
												alt=""
												class="deck-cover-img"
											/>
										{:else}
											<div
												class="deck-cover-fallback"
											></div>
										{/if}

										<div class="deck-bottom-container">
											<div class="deck-name-box">
												<span
													class="deck-title"
													title={getDeckDisplayName(
														deck,
													)}
												>
													{getDeckDisplayName(deck)}
												</span>
												{#if getDeckManaSymbols(deck).length > 0}
													<div class="deck-mana-pips">
														{#each getDeckManaSymbols(deck) as sym}
															<ManaSymbol
																symbol={sym}
																size="16px"
															/>
														{/each}
													</div>
												{/if}
											</div>
										</div>
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

<!-- Side Info Panel & Backdrop -->
{#if selectedDeck}
	{@const cmdInfo = getDeckCommanderInfo(selectedDeck)}
	{@const breakdown = getBoardBreakdown(selectedDeck)}

	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		class="panel-backdrop"
		transition:fade={{ duration: 180 }}
		onclick={closeSidePanel}
		role="presentation"
	></div>

	<aside
		class="deck-info-panel"
		transition:fly={{ x: 380, duration: 240 }}
		aria-label="Deck details"
	>
		<!-- Panel Header -->
		<div class="panel-header">
			<div class="panel-header-title">
				<FolderOpen size={16} class="panel-icon" />
				<span>Deck Details</span>
			</div>
			<button
				type="button"
				class="panel-close-btn"
				onclick={closeSidePanel}
				aria-label="Close panel"
			>
				<X size={18} />
			</button>
		</div>

		<!-- Panel Scrollable Body -->
		<div class="panel-scroll-content">
			<!-- Hero Art Banner -->
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
				<div class="panel-hero-badges">
					<span
						class="format-pill"
						class:draft-pill={selectedDeck.isDraft}
					>
						{selectedDeck.isDraft
							? "Local Draft"
							: selectedDeck.cards?.format || "Commander"}
					</span>
					{#if getDeckManaSymbols(selectedDeck).length > 0}
						<div class="hero-mana-pips">
							{#each getDeckManaSymbols(selectedDeck) as sym}
								<ManaSymbol symbol={sym} size="16px" />
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Main Deck Name & Subtitle -->
			<div class="panel-main-info">
				<h2 class="panel-deck-name">
					{getDeckDisplayName(selectedDeck)}
				</h2>
				<p class="panel-deck-subtitle">
					{getColorIdentityName(getDeckManaSymbols(selectedDeck))} • {getCardCount(
						selectedDeck,
					)} Cards
				</p>
			</div>

			<!-- Primary Open Deck CTA -->
			<div class="panel-cta-container">
				<button
					type="button"
					class="open-deck-cta-btn"
					onclick={() => handleSelectDeck(selectedDeck)}
				>
					<span>Open Deck</span>
					<ArrowRight size={18} class="btn-arrow" />
				</button>
			</div>

			<!-- Metadata Overview -->
			<div class="panel-section">
				<h4 class="section-title">Overview</h4>
				<div class="meta-grid">
					<div class="meta-item">
						<span class="meta-label">Format</span>
						<span class="meta-value">
							{selectedDeck.isDraft
								? "Local Draft"
								: selectedDeck.cards?.format || "Commander"}
						</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Color Identity</span>
						<span class="meta-value">
							{getColorIdentityName(
								getDeckManaSymbols(selectedDeck),
							)}
						</span>
					</div>
					<div class="meta-item">
						<span class="meta-label">Total Cards</span>
						<span class="meta-value"
							>{getCardCount(selectedDeck)} cards</span
						>
					</div>
					<div class="meta-item">
						<span class="meta-label">Last Updated</span>
						<span class="meta-value">
							{formatUpdatedDate(
								selectedDeck.isDraft
									? selectedDeck.metadata?.updatedAt
									: selectedDeck.updated_at,
							)}
						</span>
					</div>
				</div>
			</div>

			<!-- Commander Section (if deck has a commander) -->
			{#if cmdInfo}
				<div class="panel-section">
					<h4 class="section-title">Commander</h4>
					<div class="commander-card-preview">
						{#if cmdInfo.artCrop}
							<img
								src={cmdInfo.artCrop}
								alt={cmdInfo.name}
								class="commander-thumb"
							/>
						{/if}
						<div class="commander-text">
							<span class="commander-name">{cmdInfo.name}</span>
							<span class="commander-type"
								>{cmdInfo.type_line}</span
							>
						</div>
					</div>
				</div>
			{/if}

			<!-- Breakdown Chips Section -->
			<div class="panel-section">
				<h4 class="section-title">Card Breakdown</h4>
				<div class="breakdown-chips">
					{#if breakdown.commander > 0}
						<div class="chip">
							<span class="chip-label">Commander</span>
							<span class="chip-count">{breakdown.commander}</span
							>
						</div>
					{/if}
					{#if breakdown.companion > 0}
						<div class="chip">
							<span class="chip-label">Companion</span>
							<span class="chip-count">{breakdown.companion}</span
							>
						</div>
					{/if}
					<div class="chip">
						<span class="chip-label">Mainboard</span>
						<span class="chip-count">{breakdown.mainboard}</span>
					</div>
					{#if breakdown.sideboard > 0}
						<div class="chip">
							<span class="chip-label">Sideboard</span>
							<span class="chip-count">{breakdown.sideboard}</span
							>
						</div>
					{/if}
					{#if breakdown.maybeboard > 0}
						<div class="chip">
							<span class="chip-label">Maybeboard</span>
							<span class="chip-count"
								>{breakdown.maybeboard}</span
							>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer Delete Action -->
			<div class="panel-footer-actions">
				<button
					type="button"
					class="delete-deck-btn"
					onclick={(e) => {
						const d = selectedDeck;
						handleDeleteDeck(d.id, e, d.isDraft);
					}}
				>
					<Trash2 size={15} />
					<span
						>{selectedDeck.isDraft
							? "Delete Draft"
							: "Delete Deck"}</span
					>
				</button>
			</div>
		</div>
	</aside>
{/if}

<style>
	.decks-page-wrapper {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		background: hsl(var(--background));
	}

	.decks-page-container {
		width: 100%;
		max-width: 1040px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
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
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
	}

	/* 3D Tile Deck Box Card */
	.deck-card {
		position: relative;
		width: 100%;
		aspect-ratio: 4 / 3;
		border-radius: 6px;
		overflow: hidden;
		cursor: pointer;
		background: #141416;
		border: 1px solid rgba(0, 0, 0, 0.75);
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
		transition:
			transform 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1),
			border-color 0.2s ease;
		user-select: none;
		box-sizing: border-box;
		display: flex;
	}

	/* 3D Tile Inner Shadows for the Deck Cover */
	.deck-card:not(.create-card)::after {
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

	.deck-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
	}

	.deck-card.selected {
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
		opacity: 0.6;
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
		opacity: 0.5;
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

	/* Parent gradient container extending 16px above the name box */
	.deck-bottom-container {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		height: 60px;
		background: linear-gradient(
			180deg,
			rgba(0, 0, 0, 0) 0%,
			rgba(0, 0, 0, 0.4) 33%,
			rgba(0, 0, 0, 0.5) 100%
		);
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		z-index: 3;
		pointer-events: none;
	}

	/* 44px tall Name Box with 25% black bg, 3D divider & 3 inner shadows */
	.deck-name-box {
		width: 100%;
		height: 44px;
		background: rgba(0, 0, 0, 0.25);
		border-top: 1px solid rgba(0, 0, 0, 0.85);
		box-shadow:
			inset 0 0 12px 8px rgba(32, 32, 32, 0.5),
			inset 0.5px 1px 3px rgba(255, 255, 255, 0.18),
			inset -0.5px -1px 3px rgba(0, 0, 0, 0.75);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 0 12px;
		box-sizing: border-box;
	}

	.deck-title {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 16px;
		font-weight: 600;
		color: #ffffff;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
		letter-spacing: -0.01em;
		line-height: 1;
	}

	/* Unsaved draft styling: italics and 75% opacity */
	.deck-card.is-draft .deck-title {
		font-style: italic;
		opacity: 0.75;
	}

	.deck-card.is-draft .deck-mana-pips {
		opacity: 0.75;
	}

	.deck-mana-pips {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		flex-shrink: 0;
	}

	/* Create New Deck Card */
	.deck-card.create-card {
		border: 1.5px dashed hsl(var(--border) / 0.8);
		background: hsl(var(--muted) / 0.05);
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 4 / 3;
		border-radius: 6px;
		box-shadow: none;
	}

	.deck-card.create-card:hover {
		border-color: hsl(var(--primary) / 0.8);
		background: hsl(var(--primary) / 0.04);
		box-shadow: none;
	}

	.create-content {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		text-align: center;
		padding: 1rem;
		color: hsl(var(--muted-foreground));
		transition: color 0.2s ease;
	}

	:global(.create-card:hover .create-icon) {
		color: hsl(var(--primary));
		transform: scale(1.06);
		transition:
			transform 0.2s ease,
			color 0.2s ease;
	}

	.create-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.create-subtitle {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
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

	/* Side Info Panel & Backdrop */
	.panel-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(2px);
		z-index: 90;
	}

	.deck-info-panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 380px;
		max-width: 92vw;
		background: #111114;
		border-left: 1px solid hsl(var(--border) / 0.6);
		z-index: 100;
		display: flex;
		flex-direction: column;
		box-shadow: -10px 0 35px rgba(0, 0, 0, 0.5);
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		background: hsl(var(--card));
	}

	.panel-header-title {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	:global(.panel-icon) {
		color: hsl(var(--primary));
	}

	.panel-close-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.35rem;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
	}

	.panel-close-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.3);
	}

	.panel-scroll-content {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		padding-bottom: 2rem;
	}

	.panel-hero-banner {
		position: relative;
		width: 100%;
		aspect-ratio: 16 / 9;
		overflow: hidden;
		background: hsl(var(--muted) / 0.2);
	}

	.panel-hero-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
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
			#111114 0%,
			rgba(17, 17, 20, 0.4) 50%,
			rgba(0, 0, 0, 0.1) 100%
		);
	}

	.panel-hero-badges {
		position: absolute;
		bottom: 0.75rem;
		left: 1.25rem;
		right: 1.25rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.format-pill {
		font-size: 0.65rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		color: #fff;
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.format-pill.draft-pill {
		background: hsl(var(--warning) / 0.9);
		color: #000;
		border-color: transparent;
	}

	.hero-mana-pips {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		background: rgba(0, 0, 0, 0.65);
		padding: 2px 6px;
		border-radius: 12px;
		backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.1);
	}

	.panel-main-info {
		padding: 1.25rem 1.25rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.panel-deck-name {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 1.45rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
		line-height: 1.25;
		letter-spacing: -0.01em;
	}

	.panel-deck-subtitle {
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.panel-cta-container {
		padding: 0 1.25rem 1.25rem;
	}

	.open-deck-cta-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.85rem 1.5rem;
		background: hsl(var(--primary));
		color: white;
		font-size: 0.95rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		box-shadow: 0 4px 14px hsl(var(--primary) / 0.3);
	}

	.open-deck-cta-btn:hover {
		background: hsl(var(--primary-light));
		transform: translateY(-1px);
		box-shadow: 0 6px 20px hsl(var(--primary) / 0.4);
	}

	:global(.open-deck-cta-btn .btn-arrow) {
		transition: transform 0.2s ease;
	}

	:global(.open-deck-cta-btn:hover .btn-arrow) {
		transform: translateX(4px);
	}

	.panel-section {
		padding: 1rem 1.25rem;
		border-top: 1px solid hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.section-title {
		font-size: 0.725rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.meta-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
	}

	.meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		background: hsl(var(--muted) / 0.1);
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid hsl(var(--border) / 0.2);
	}

	.meta-label {
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
	}

	.meta-value {
		font-size: 0.85rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.commander-card-preview {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		background: hsl(var(--muted) / 0.15);
		padding: 0.6rem 0.75rem;
		border-radius: var(--radius-md);
		border: 1px solid hsl(var(--border) / 0.3);
	}

	.commander-thumb {
		width: 44px;
		height: 44px;
		border-radius: var(--radius-sm);
		object-fit: cover;
		border: 1px solid hsl(var(--border) / 0.4);
	}

	.commander-text {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		overflow: hidden;
	}

	.commander-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.commander-type {
		font-size: 0.725rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.breakdown-chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.3);
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
	}

	.chip-label {
		color: hsl(var(--muted-foreground));
	}

	.chip-count {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.panel-footer-actions {
		margin-top: auto;
		padding: 1.25rem;
		border-top: 1px solid hsl(var(--border) / 0.3);
	}

	.delete-deck-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.65rem 1rem;
		background: transparent;
		color: hsl(var(--destructive, #ef4444));
		border: 1px solid hsl(var(--destructive, #ef4444) / 0.3);
		border-radius: var(--radius-md);
		font-size: 0.8rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.delete-deck-btn:hover {
		background: hsl(var(--destructive, #ef4444) / 0.12);
		border-color: hsl(var(--destructive, #ef4444) / 0.6);
	}
</style>
