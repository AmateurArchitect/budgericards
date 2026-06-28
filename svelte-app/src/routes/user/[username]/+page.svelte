<script>
	import { page } from "$app/stores";
	import { onMount } from "svelte";
	import { syncService } from "$lib/syncService";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { goto } from "$app/navigation";
	import { Folder, Loader, User } from "lucide-svelte";
	import ManaSymbol from "$lib/components/ui/ManaSymbol.svelte";

	const username = $derived($page.params.username);

	/** @type {any[]} */
	let userDecks = $state([]);
	let isLoading = $state(true);

	async function loadProfileDecks() {
		isLoading = true;
		try {
			const { data, error } = await syncService.fetchPublicDecksByUser(username || "");
			if (!error) {
				userDecks = data || [];
			}
		} catch (e) {
			console.error("Failed to load user profile decks:", e);
		} finally {
			isLoading = false;
		}
	}

	onMount(() => {
		loadProfileDecks();
	});

	// React to username param changes (e.g. going from profile A to profile B)
	$effect(() => {
		if (username) {
			loadProfileDecks();
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

	/** @param {string} dateString */
	function formatUpdatedDate(dateString) {
		try {
			const ms = new Date(dateString).getTime();
			const seconds = Math.floor((Date.now() - ms) / 1000);
			if (seconds < 60) return "just now";
			let interval = seconds / 86400;
			if (interval > 1) return Math.floor(interval) + "d ago";
			interval = seconds / 3600;
			if (interval > 1) return Math.floor(interval) + "h ago";
			interval = seconds / 60;
			if (interval > 1) return Math.floor(interval) + "m ago";
			return "recently";
		} catch (e) {
			return "recently";
		}
	}
</script>

<div class="profile-page-wrapper">
	<div class="profile-page-container">
		<header class="profile-header">
			<div class="avatar-container">
				<User size={36} class="avatar-icon" />
			</div>
			<div class="profile-info">
				<h1>@{username}</h1>
				<p class="stats-summary">
					<Folder size={14} />
					<span>{userDecks.length} Public Decks</span>
				</p>
			</div>
		</header>

		<main class="profile-body">
			<h2>Public Decks</h2>

			{#if isLoading}
				<div class="loading-state">
					<Loader class="spinner" size={36} />
					<p>Loading decks...</p>
				</div>
			{:else if userDecks.length === 0}
				<div class="empty-state">
					<h3>No public decks found</h3>
					<p>This user hasn't made any decks public yet.</p>
				</div>
			{:else}
				<div class="decks-grid">
					{#each userDecks as deck (deck.id)}
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
									{#if getDeckManaSymbols(deck).length > 0}
										<div class="deck-mana-symbols">
											{#each getDeckManaSymbols(deck) as sym}
												<ManaSymbol symbol={sym} size="0.75rem" className="ms-cost" />
											{/each}
										</div>
										<span class="meta-dot">•</span>
									{/if}
									<span class="card-count">{getCardCount(deck)} Cards</span>
									<span class="meta-dot">•</span>
									<span class="updated-time">Updated {formatUpdatedDate(deck.updated_at)}</span>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</main>
	</div>
</div>

<style>
	.profile-page-wrapper {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		background: hsl(var(--background));
	}

	.profile-page-container {
		width: 100%;
		max-width: 960px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		gap: 2rem;
	}

	.profile-header {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 2rem;
	}

	.avatar-container {
		width: 72px;
		height: 72px;
		border-radius: 50%;
		background: hsl(var(--muted) / 0.35);
		border: 1px solid hsl(var(--border) / 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
	}

	.profile-info h1 {
		font-family: var(--font-sans), sans-serif;
		font-size: 1.75rem;
		font-weight: 700;
		margin: 0;
		color: hsl(var(--foreground));
		letter-spacing: -0.02em;
	}

	.stats-summary {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.9rem;
		color: hsl(var(--muted-foreground));
		margin: 0.25rem 0 0 0;
	}

	.profile-body h2 {
		font-family: var(--font-sans), sans-serif;
		font-size: 1.1rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin: 0 0 1.5rem 0;
	}

	/* Loader and Empty states */
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

	/* Decks Grid styling (matching decks list) */
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

	.deck-mana-symbols {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}
</style>
