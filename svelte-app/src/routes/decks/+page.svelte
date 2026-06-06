<script>
	import { fade } from "svelte/transition";
	import { FolderOpen, Trash2, Loader } from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { syncService } from "$lib/syncService";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import Button from "$lib/components/ui/Button.svelte";

	/** @type {any[]} */
	let decks = $state([]);
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
	});

	$effect(() => {
		if (!authStore.isLoading && !authStore.isAuthenticated) {
			goto("/login");
		}
	});

	/** @param {any} deck */
	function handleSelectDeck(deck) {
		deckStore.setDeck({
			id: deck.id,
			name: deck.name,
			commander: deck.cards.commander || [],
			companion: deck.cards.companion || [],
			mainboard: deck.cards.mainboard || [],
			sideboard: deck.cards.sideboard || [],
			maybeboard: deck.cards.maybeboard || [],
			garbage: deck.cards.garbage || [],
			activeBoard: deck.cards.activeBoard || "mainboard",
			coverArt: deck.cards.coverArt || null,
			format: deck.cards.format || "Commander",
			metadata: deck.cards.metadata || {}
		});
		goto("/");
	}

	/** 
	 * @param {string} deckId 
	 * @param {MouseEvent} e
	 */
	async function handleDeleteDeck(deckId, e) {
		e.stopPropagation();
		if (!confirm("Are you sure you want to delete this deck? This cannot be undone.")) {
			return;
		}

		try {
			const { error: deleteError } = await syncService.deleteDeck(deckId);
			if (deleteError) throw deleteError;
			decks = decks.filter(d => d.id !== deckId);
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
		return (
			(cards.commander?.length || 0) +
			(cards.companion?.length || 0) +
			(cards.mainboard?.length || 0) +
			(cards.sideboard?.length || 0) +
			(cards.maybeboard?.length || 0)
		);
	}
</script>

<div class="decks-page-container">
	<header class="page-header">
		<a href="/" class="back-link">← Back to deckbuilder</a>
		<div class="title-area">
			<FolderOpen class="header-icon" size={24} />
			<h1>My Decks</h1>
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
		{:else if decks.length === 0}
			<div class="empty-state">
				<div class="empty-icon-container">
					<svg viewBox="0 0 160 160" width="140" height="140" fill="none" xmlns="http://www.w3.org/2000/svg">
						<!-- Vertical Stack of Cards -->
						{#each Array(25) as _, i}
							{@const yOffset = (24 - i) * 1.6}
							<g transform="translate(0, {yOffset})">
								<polygon 
									points="70,40 27,65 88,100 131,75" 
									fill="hsl(var(--background))" 
									stroke="currentColor" 
									stroke-width="1" 
									stroke-opacity={i === 24 ? "1" : "0.3"} 
								/>
								{#if i === 24}
									<!-- Design Details on the Top Card (MTG Card Back) -->
									<g transform="matrix(-0.86, 0.5, 0.871, 0.5, 79, 70)">
										<!-- Inner border -->
										<rect x="-21" y="-31" width="42" height="62" rx="1.5" stroke="currentColor" stroke-width="1" stroke-opacity="0.4" />
										
										<!-- Ellipse in the center (MTG Card Back Oval) -->
										<ellipse cx="0" cy="0" rx="14" ry="24" stroke="currentColor" stroke-width="1" stroke-opacity="0.4" />
										
										<!-- 5 mana circles in WUBRG pentagon layout -->
										<g stroke="currentColor" stroke-width="1" stroke-opacity="0.5">
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

										<!-- Title banner at the top -->
										<rect x="-13" y="-23" width="26" height="4" rx="0.5" stroke="currentColor" stroke-width="1" stroke-opacity="0.4" />
										
										<!-- Footer banner at the bottom ("DECKMASTER") -->
										<rect x="-15" y="17" width="30" height="4" rx="0.5" stroke="currentColor" stroke-width="1" stroke-opacity="0.4" />
									</g>
								{/if}
							</g>
						{/each}
					</svg>
				</div>
				<h3>Create your first deck</h3>
				<p>Your saved decks will appear here. Let's start building your next masterpiece!</p>
				<a href="/" class="action-btn">Start Building</a>
			</div>
		{:else}
			<div class="decks-grid" in:fade={{ duration: 200 }}>
				{#each decks as deck (deck.id)}
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
							{#if deck.cards.coverArt}
								<img src={deck.cards.coverArt} alt="" class="deck-art-img" />
							{:else}
								<div class="deck-art-fallback"></div>
							{/if}
							<div class="deck-badge">{deck.cards.format || "Commander"}</div>
						</div>
						
						<div class="deck-details">
							<h3 class="deck-name">{deck.name}</h3>
							<div class="deck-meta">
								<span class="card-count">{getCardCount(deck.cards)} Cards</span>
								<span class="meta-dot">•</span>
								<span class="updated-time">Updated {formatUpdatedDate(deck.updated_at)}</span>
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
		gap: 1rem;
		margin-bottom: 2.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		padding-bottom: 1.5rem;
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
		font-size: 2rem;
		font-weight: 800;
		margin: 0;
		color: hsl(var(--foreground));
		letter-spacing: -0.02e;
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
		padding: 5rem 2rem;
		gap: 1.5rem;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.02);
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: var(--radius-lg);
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
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
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

	.action-btn {
		padding: 0.75rem 2rem;
		background: hsl(var(--primary));
		color: white;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		transition: all 0.2s ease;
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.2);
	}

	.action-btn:hover {
		opacity: 0.95;
		transform: translateY(-1px);
		box-shadow: 0 6px 16px hsl(var(--primary) / 0.3);
	}

	:global(.loading-state .spinner) {
		animation: spin 1s linear infinite;
		color: hsl(var(--primary));
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
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
		background: linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--accent) / 0.6) 100%);
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
</style>
