<script>
	import { fade } from "svelte/transition";
	import { FolderOpen, Loader } from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { syncService } from "$lib/syncService";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import ManaSymbol from "$lib/components/ui/ManaSymbol.svelte";

	/** @type {any[]} */
	let publicDecks = $state([]);
	let isBrowsingLoading = $state(true);

	async function loadPublicDecks() {
		isBrowsingLoading = true;
		try {
			const { data, error: fetchError } = await syncService.fetchPublicDecks();
			if (fetchError) throw fetchError;
			publicDecks = data || [];
		} catch (err) {
			console.error("Failed to load public decks:", err);
		} finally {
			isBrowsingLoading = false;
		}
	}

	onMount(() => {
		loadPublicDecks();
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

	/** @param {any} deck */
	function getCardCount(deck) {
		const cards = deck.cards || deck;
		return (
			(cards.commander?.length || 0) +
			(cards.companion?.length || 0) +
			(cards.mainboard?.length || 0) +
			(cards.sideboard?.length || 0) +
			(cards.maybeboard?.length || 0)
		);
	}

	/** @param {any} deck */
	function getDeckManaSymbols(deck) {
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

		const wubrg = ["W", "U", "B", "R", "G"];
		return wubrg.filter(c => colorsSet.has(c));
	}

	/** @param {number} timestamp */
	function timeAgo(timestamp) {
		if (!timestamp) return "never";
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return "just now";
		let interval = seconds / 86400;
		if (interval > 1) return Math.floor(interval) + "d ago";
		interval = seconds / 3600;
		if (interval > 1) return Math.floor(interval) + "h ago";
		interval = seconds / 60;
		if (interval > 1) return Math.floor(interval) + "m ago";
		return Math.floor(seconds) + "s ago";
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
</script>

<div class="decks-page-wrapper">
	<div class="decks-page-container">
		<header class="page-header">
			<div class="title-area">
				<FolderOpen class="header-icon" size={20} />
				<h1>Browse Decks</h1>
			</div>
		</header>

		<main class="page-body">
			{#if isBrowsingLoading}
				<div class="loading-state">
					<Loader class="spinner" size={36} />
					<p>Fetching public decks...</p>
				</div>
			{:else if publicDecks.length === 0}
				<div class="empty-state">
					<h3>No public decks found</h3>
					<p>Decks made public by builders will appear here.</p>
				</div>
			{:else}
				<section class="library-section">
					<div class="decks-grid">
						{#each publicDecks as deck (deck.id)}
							<div
								class="deck-card"
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
										<a 
											href="/user/{deck.cards?.metadata?.createdBy || 'Anonymous'}" 
											class="creator-link"
											onclick={(e) => e.stopPropagation()}
										>
											@{deck.cards?.metadata?.createdBy || 'Anonymous'}
										</a>
										<span class="meta-dot">•</span>
										{#if getDeckManaSymbols(deck).length > 0}
											<div class="deck-mana-symbols">
												{#each getDeckManaSymbols(deck) as sym}
													<ManaSymbol symbol={sym} size="0.75rem" className="ms-cost" />
												{/each}
											</div>
											<span class="meta-dot">•</span>
										{/if}
										<span class="card-count"
											>{getCardCount(deck)} Cards</span
										>
										<span class="meta-dot">•</span>
										<span class="updated-time"
											>Updated {formatUpdatedDate(deck.updated_at)}</span
										>
									</div>
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</main>
	</div>
</div>

<style>
	.decks-page-wrapper {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		background: hsl(var(--background));
	}

	.decks-page-container {
		width: 100%;
		max-width: 960px;
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
		margin-bottom: 2.5rem;
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

	.loading-state,
	.empty-state {
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

	:global(.spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	.library-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.decks-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
		gap: 1.5rem;
	}

	.deck-card {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		height: 260px;
		cursor: pointer;
		position: relative;
		transition: all 0.2s ease;
	}

	.deck-card:hover {
		transform: translateY(-2px);
		border-color: hsl(var(--primary) / 0.5);
		box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
	}

	.deck-art-preview {
		height: 140px;
		background: hsl(var(--muted) / 0.2);
		position: relative;
		overflow: hidden;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.deck-art-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}

	.deck-card:hover .deck-art-img {
		transform: scale(1.03);
	}

	.deck-art-fallback {
		width: 100%;
		height: 100%;
		background: linear-gradient(
			135deg,
			hsl(var(--muted) / 0.3) 0%,
			hsl(var(--primary) / 0.05) 100%
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

	.creator-link {
		color: hsl(var(--primary));
		text-decoration: none;
		font-weight: 600;
		transition: opacity 0.15s ease;
	}

	.creator-link:hover {
		opacity: 0.8;
		text-decoration: underline;
	}

	.deck-mana-symbols {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
</style>
