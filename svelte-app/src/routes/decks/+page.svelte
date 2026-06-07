<script>
	import { fade } from "svelte/transition";
	import { FolderOpen, Trash2, Loader, PlusCircle } from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { syncService } from "$lib/syncService";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";

	/** @type {any[]} */
	let decks = $state([]);
	/** @type {any[]} */
	let localDrafts = $state([]);
	let isLoading = $state(false);
	let error = $state("");

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
		} catch (err) {
			console.error("Failed to load decks:", err);
			error = "Could not load synced decks. Please try again.";
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadDecks();
		if (typeof window !== "undefined") {
			localDrafts = JSON.parse(localStorage.getItem("budgericards_local_drafts") || "[]");
		}
	});

	$effect(() => {
		if (!authStore.isLoading && !authStore.isAuthenticated) {
			goto("/login");
		}
	});

	/** @param {any} deck */
	function handleSelectDeck(deck) {
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
		goto("/");
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
				let drafts = JSON.parse(localStorage.getItem("budgericards_local_drafts") || "[]");
				drafts = drafts.filter((/** @param {any} d */ d) => d.id !== deckId);
				localStorage.setItem("budgericards_local_drafts", JSON.stringify(drafts));
				localDrafts = drafts;
			} else {
				const { error: deleteError } = await syncService.deleteDeck(deckId);
				if (deleteError) throw deleteError;
				decks = decks.filter((d) => d.id !== deckId);
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
					coverArt: null
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
		if (interval > 1) return Math.floor(interval) + " years ago";
		interval = seconds / 2592000;
		if (interval > 1) return Math.floor(interval) + " months ago";
		interval = seconds / 86400;
		if (interval > 1) return Math.floor(interval) + " days ago";
		interval = seconds / 3600;
		if (interval > 1) return Math.floor(interval) + " hours ago";
		interval = seconds / 60;
		if (interval > 1) return Math.floor(interval) + " minutes ago";
		return Math.floor(seconds) + " seconds ago";
	}

	/** @param {string} dateString */
	function formatUpdatedDate(dateString) {
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
		const cards = deck.cards || deck;
		if (cards.coverArt) return cards.coverArt;
		if (cards.coverArt === "") return null;

		const leadCard =
			cards.commander?.[0] ||
			cards.companion?.[0] ||
			cards.mainboard?.[0];
		if (!leadCard) return null;

		const metadata = cards.metadata || {};
		const meta = metadata[leadCard.name.toLowerCase()];
		if (!meta) return null;

		return (
			meta.image_uris?.art_crop ||
			meta.card_faces?.[0]?.image_uris?.art_crop ||
			null
		);
	}

	let sortBy = $state("updated"); // 'updated' | 'name' | 'cards'
	let groupBy = $state("none"); // 'none' | 'format' | 'colors'

	/** @param {any} deck */
	function getDeckColors(deck) {
		const cards = deck.cards || deck;
		const metadata = cards.metadata || {};
		const colorsSet = new Set();
		
		const allCardsList = [
			...(cards.commander || []),
			...(cards.companion || []),
			...(cards.mainboard || []),
			...(cards.sideboard || []),
			...(cards.maybeboard || [])
		];

		for (const card of allCardsList) {
			const meta = metadata[card.name.toLowerCase()];
			if (meta && meta.color_identity) {
				for (const c of meta.color_identity) {
					colorsSet.add(c);
				}
			}
		}

		if (colorsSet.size === 0) return "Colorless";
		
		// Sort WUBRG order
		const wubrg = ["W", "U", "B", "R", "G"];
		const sorted = wubrg.filter(c => colorsSet.has(c));
		if (sorted.length === 0) return "Colorless";
		if (sorted.length === 1) {
			const names = { "W": "White", "U": "Blue", "B": "Black", "R": "Red", "G": "Green" };
			return names[sorted[0]] || sorted[0];
		}
		if (sorted.length === 5) return "Five-Color";
		return "Guild/Shard (" + sorted.join("") + ")";
	}

	const sortedDecks = $derived.by(() => {
		let list = [...decks];
		if (sortBy === "updated") {
			list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
		} else if (sortBy === "name") {
			list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
		} else if (sortBy === "cards") {
			list.sort((a, b) => getCardCount(b.cards) - getCardCount(a.cards));
		}
		return list;
	});

	const groupedDecks = $derived.by(() => {
		const list = sortedDecks;
		if (decks.length < 12 || groupBy === "none") {
			return [{ key: "all", label: "", items: list }];
		}

		/** @type {Record<string, any[]>} */
		const groups = {};

		if (groupBy === "format") {
			for (const deck of list) {
				const format = deck.cards?.format || "Commander";
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

		return Object.entries(groups).map(([label, items]) => ({
			key: label,
			label,
			items
		})).sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
	});

	function handleNewDeckLink() {
		if (typeof window !== "undefined") {
			window.open("/?new_deck=true", "_blank");
		}
	}
</script>

<div class="decks-page-container">
	<header class="page-header">
		<div class="title-area">
			<FolderOpen class="header-icon" size={20} />
			<h1>Your Decks</h1>
		</div>
	</header>

	<main class="page-body">
		{#if authStore.isLoading || (isLoading && decks.length === 0)}
			<div class="loading-state">
				<Loader class="spinner" size={36} />
				<p>Loading your decks...</p>
			</div>
		{:else if error}
			<div class="error-state">
				<p>{error}</p>
				<Button onclick={loadDecks} variant="outline">Try Again</Button>
			</div>
		{:else if decks.length === 0 && localDrafts.length === 0}
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
									stroke-opacity={i === 12 ? "0.9" : "0.5"}
								/>
								{#if i === 12}
									<!-- Design Details on the Top Card (MTG Card Back) -->
									<!-- Inner border -->
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

									<!-- Ellipse in the center (MTG Card Back Oval) -->
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

									<!-- 5 mana circles in WUBRG pentagon layout -->
									<g
										stroke="currentColor"
										stroke-width="1"
										stroke-opacity="0.8"
									>
										<!-- Top (White) -->
										<circle cx="0" cy="-6" r="1.2" />
										<!-- Right (Blue) -->
										<circle cx="5" cy="-2" r="1.2" />
										<!-- Bottom Right (Black) -->
										<circle cx="3" cy="4" r="1.2" />
										<!-- Bottom Left (Red) -->
										<circle cx="-3" cy="4" r="1.2" />
										<!-- Left (Green) -->
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
			{#if decks.length >= 6}
				<div class="library-controls">
					<div class="control-group">
						<span class="control-label">Sort by:</span>
						<div class="control-buttons">
							<button class="control-btn" class:active={sortBy === 'updated'} onclick={() => sortBy = 'updated'}>Recent</button>
							<button class="control-btn" class:active={sortBy === 'name'} onclick={() => sortBy = 'name'}>Name</button>
							<button class="control-btn" class:active={sortBy === 'cards'} onclick={() => sortBy = 'cards'}>Cards</button>
						</div>
					</div>

					{#if decks.length >= 12}
						<div class="control-group">
							<span class="control-label">Group by:</span>
							<div class="control-buttons">
								<button class="control-btn" class:active={groupBy === 'none'} onclick={() => groupBy = 'none'}>None</button>
								<button class="control-btn" class:active={groupBy === 'format'} onclick={() => groupBy = 'format'}>Format</button>
								<button class="control-btn" class:active={groupBy === 'colors'} onclick={() => groupBy = 'colors'}>Colors</button>
							</div>
						</div>
					{/if}
				</div>
			{/if}

			{#if localDrafts.length > 0}
				<section class="drafts-section">
					<div class="section-title-area">
						<h2>Recent Unsaved Drafts</h2>
						<span class="drafts-limit-note">Up to 3 drafts kept locally</span>
					</div>
					<div class="decks-grid">
						<!-- Create New Deck card slot (first if drafts exist) -->
						<div
							class="deck-card create-card"
							role="button"
							tabindex="0"
							onclick={handleNewDeckLink}
							onkeydown={(e) => {
								if (e.key === "Enter" || e.key === " ") {
									e.preventDefault();
									handleNewDeckLink();
								}
							}}
						>
							<div class="deck-art-preview create-art-preview">
								<PlusCircle class="create-icon" size={32} />
							</div>
							<div class="deck-details create-details">
								<h3 class="deck-name">Create New Deck</h3>
								<p class="deck-desc">Start building a fresh draft</p>
							</div>
						</div>

						{#each localDrafts as draft (draft.id)}
							<div
								class="deck-card draft-card"
								class:active={deckStore.id === draft.id}
								role="button"
								tabindex="0"
								onclick={() => handleSelectDeck(draft)}
								onkeydown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										handleSelectDeck(draft);
									}
								}}
							>
								<div class="deck-art-preview">
									{#if getDeckCoverArt(draft)}
										<img
											src={getDeckCoverArt(draft)}
											alt=""
											class="deck-art-img"
										/>
									{:else}
										<div class="deck-art-fallback draft-art-fallback"></div>
									{/if}
									<div class="deck-badge draft-badge">
										Local Draft
									</div>
								</div>

								<div class="deck-details">
									<h3 class="deck-name">{draft.name || "Name & Save This Deck"}</h3>
									<div class="deck-meta">
										<span class="card-count"
											>{getCardCount(draft)} Cards</span
										>
										{#if draft.metadata?.updatedAt}
											<span class="meta-dot">•</span>
											<span class="updated-time"
												>Updated {timeAgo(draft.metadata.updatedAt)}</span
											>
										{/if}
									</div>
								</div>

								<div class="deck-actions">
									<button
										class="action-icon-btn delete-btn"
										title="Delete Draft"
										onclick={(e) => handleDeleteDeck(draft.id, e, true)}
									>
										<Trash2 size={16} />
									</button>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if decks.length > 0}
				<section class="library-section" class:has-drafts={localDrafts.length > 0}>
					<div class="section-title-area">
						<h2>Saved Deck Library</h2>
					</div>
					
					{#each groupedDecks as group, groupIdx (group.key)}
						<div class="group-container" class:has-title={!!group.label}>
							{#if group.label}
								<h3 class="group-title">{group.label} ({group.items.length})</h3>
							{/if}
							
							<div class="decks-grid">
								<!-- Create New Deck card slot (if no drafts, render in first slot of first group) -->
								{#if localDrafts.length === 0 && groupIdx === 0}
									<div
										class="deck-card create-card"
										role="button"
										tabindex="0"
										onclick={handleNewDeckLink}
										onkeydown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleNewDeckLink();
											}
										}}
									>
										<div class="deck-art-preview create-art-preview">
											<PlusCircle class="create-icon" size={32} />
										</div>
										<div class="deck-details create-details">
											<h3 class="deck-name">Create New Deck</h3>
											<p class="deck-desc">Start building a fresh draft</p>
										</div>
									</div>
								{/if}

								{#each group.items as deck (deck.id)}
									<div
										class="deck-card"
										class:active={deckStore.id === deck.id}
										role="button"
										tabindex="0"
										onclick={() => handleSelectDeck(deck)}
										onkeydown={(e) => {
											if (e.key === "Enter" || e.key === " ") {
												e.preventDefault();
												handleSelectDeck(deck);
											}
										}}
									>
										<div class="deck-art-preview">
											{#if getDeckCoverArt(deck)}
												<img
													src={getDeckCoverArt(deck)}
													alt=""
													class="deck-art-img"
												/>
											{:else}
												<div class="deck-art-fallback"></div>
											{/if}
											<div class="deck-badge">
												{deck.cards?.format || "Commander"}
											</div>
										</div>

										<div class="deck-details">
											<h3 class="deck-name">{deck.name}</h3>
											<div class="deck-meta">
												<span class="card-count"
													>{getCardCount(deck.cards)} Cards</span
												>
												<span class="meta-dot">•</span>
												<span class="updated-time"
													>Updated {formatUpdatedDate(
														deck.updated_at,
													)}</span
												>
											</div>
										</div>

										<div class="deck-actions">
											<button
												class="action-icon-btn delete-btn"
												title="Delete Deck"
												onclick={(e) => handleDeleteDeck(deck.id, e)}
											>
												<Trash2 size={16} />
											</button>
										</div>
									</div>
								{/each}
							</div>
						</div>
					{/each}
				</section>
			{/if}
		{/if}
	</main>
</div>

<style>
	.decks-page-container {
		width: 100%;
		max-width: 960px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 2.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 1.25rem;
	}

	.back-link {
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.15s ease;
	}

	.back-link:hover {
		color: hsl(var(--foreground));
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
		border-radius: var(--radius-lg);
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

	/* Decks list/grid */
	.decks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1.25rem;
	}

	.deck-card {
		display: flex;
		flex-direction: column;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		overflow: hidden;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	.deck-card:hover {
		background: hsl(var(--muted) / 0.3);
		border-color: hsl(var(--primary) / 0.4);
		transform: translateY(-2px);
		box-shadow: 0 12px 24px rgba(0, 0, 0, 0.2);
	}

	.deck-card.active {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.03);
		box-shadow: 0 0 0 1px hsl(var(--primary));
	}

	.deck-art-preview {
		width: 100%;
		height: 140px;
		overflow: hidden;
		position: relative;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		background: hsl(var(--muted) / 0.1);
	}

	.deck-art-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.deck-art-fallback {
		width: 100%;
		height: 100%;
		background: linear-gradient(
			135deg,
			hsl(var(--muted)) 0%,
			hsl(var(--accent) / 0.6) 100%
		);
	}

	.deck-badge {
		position: absolute;
		bottom: 8px;
		left: 8px;
		font-size: 0.625rem;
		font-weight: 700;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		color: white;
		padding: 3px 6px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.deck-details {
		padding: 1rem;
		flex: 1;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.deck-name {
		font-size: 1rem;
		font-weight: 700;
		margin: 0;
		color: hsl(var(--foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.deck-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.meta-dot {
		color: hsl(var(--muted-foreground) / 0.4);
	}

	.deck-actions {
		position: absolute;
		top: 8px;
		right: 8px;
		opacity: 0;
		transition: opacity 0.15s;
		z-index: 10;
	}

	.deck-card:hover .deck-actions {
		opacity: 1;
	}

	.action-icon-btn {
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: white;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 50%;
		transition: all 0.15s;
	}

	.action-icon-btn:hover {
		background: rgba(239, 68, 68, 0.8);
		border-color: rgba(239, 68, 68, 0.2);
	}

	/* Sectioning */
	.drafts-section,
	.library-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.library-section.has-drafts {
		margin-top: 3rem;
	}

	.section-title-area {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border) / 0.2);
		padding-bottom: 0.5rem;
		margin-bottom: 0.5rem;
	}

	.section-title-area h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.drafts-limit-note {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.draft-badge {
		background: hsl(var(--warning) / 0.95) !important;
		color: hsl(var(--warning-foreground)) !important;
	}

	.draft-art-fallback {
		background: linear-gradient(
			135deg,
			hsl(var(--muted) / 0.5) 0%,
			hsl(var(--warning) / 0.25) 100%
		) !important;
	}

	/* Library Controls (Segmented Control styling) */
	.library-controls {
		display: flex;
		flex-wrap: wrap;
		gap: 1.5rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--muted) / 0.08);
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: var(--radius-md);
		margin-bottom: 2.5rem;
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

	/* Create New Deck Card */
	.deck-card.create-card {
		border: 2px dashed hsl(var(--border) / 0.8);
		background: transparent;
		box-shadow: none;
		justify-content: center;
		align-items: center;
		padding: 2rem 1.5rem;
		text-align: center;
		min-height: 240px;
	}

	.deck-card.create-card:hover {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.02);
		transform: translateY(-2px);
		box-shadow: 0 8px 16px rgba(0, 0, 0, 0.1);
	}

	.create-art-preview {
		height: auto;
		border: none;
		background: transparent;
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.75rem;
		color: hsl(var(--muted-foreground));
		transition: color 0.2s ease;
	}

	:global(.create-card:hover .create-icon) {
		color: hsl(var(--primary));
	}

	.create-details {
		padding: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
	}

	.create-details .deck-name {
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.deck-desc {
		font-size: 0.775rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
		margin: 0;
		max-width: 180px;
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
</style>
