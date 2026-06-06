<script>
	import { fade, fly } from "svelte/transition";
	import { X, FolderOpen, Trash2, Calendar, FileText, Loader } from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { syncService } from "$lib/syncService";
	import { onMount } from "svelte";
	import Button from "./ui/Button.svelte";

	/** @type {{ isOpen: boolean }} */
	let { isOpen = $bindable(false) } = $props();

	/** @type {any[]} */
	let decks = $state([]);
	let isLoading = $state(false);
	let error = $state("");

	async function loadDecks() {
		if (!authStore.isAuthenticated) {
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

	$effect(() => {
		if (isOpen) {
			loadDecks();
		}
	});

	function close() {
		isOpen = false;
	}

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
		
		// If deck.id is set, trigger cloud sync to stay updated
		close();
	}

	/** 
	 * @param {string} deckId 
	 * @param {MouseEvent} e
	 */
	async function handleDeleteDeck(deckId, e) {
		e.stopPropagation(); // Prevent selecting the deck
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

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	}

	onMount(() => {
		window.addEventListener("keydown", handleKeydown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeydown, { capture: true });
		};
	});
</script>

{#if isOpen}
	<div use:portal class="modal-portal-wrapper">
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={close}
			in:fade={{ duration: 200 }}
			out:fade={{ duration: 150 }}
		></div>

		<div
			class="modal-content"
			role="dialog"
			aria-modal="true"
			aria-labelledby="modal-title"
			tabindex="-1"
			in:fly={{ y: 20, duration: 250 }}
			out:fly={{ y: 15, duration: 200 }}
		>
			<header class="modal-header">
				<div class="title-area">
					<FolderOpen class="header-icon" size={20} />
					<h2 id="modal-title">My Decks</h2>
				</div>
				<button class="close-btn" onclick={close} aria-label="Close dialog">
					<X size={18} />
				</button>
			</header>

			<div class="modal-body">
				{#if !authStore.isAuthenticated}
					<div class="auth-required-state">
						<FolderOpen class="empty-icon" size={48} />
						<h3>Cloud Sync Required</h3>
						<p>Log in to save multiple decks to the cloud and sync them across all your devices.</p>
						<a href="/login" class="login-redirect-btn" onclick={close}>Log In / Sign Up</a>
					</div>
				{:else if isLoading}
					<div class="loading-state">
						<Loader class="spinner" size={32} />
						<p>Loading your decks...</p>
					</div>
				{:else if error}
					<div class="error-state">
						<p>{error}</p>
						<Button onclick={loadDecks} variant="outline">Try Again</Button>
					</div>
				{:else if decks.length === 0}
					<div class="empty-state">
						<FileText class="empty-icon" size={48} />
						<h3>No decks found</h3>
						<p>You haven't synced any decks to the cloud yet. Start deckbuilding and they will sync automatically!</p>
					</div>
				{:else}
					<div class="decks-grid">
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
								
								<div class="deck-info">
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
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-portal-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(8px);
	}

	.modal-content {
		position: relative;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(20px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 680px;
		max-height: 80vh;
		display: flex;
		flex-direction: column;
		box-shadow: 
			0 30px 60px rgba(0, 0, 0, 0.6),
			0 0 0 1px hsl(var(--border) / 0.3);
		outline: none;
		overflow: hidden;
	}

	.modal-header {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: hsl(var(--muted) / 0.15);
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.header-icon) {
		color: hsl(var(--primary));
	}

	.modal-header h2 {
		font-size: 1.125rem;
		font-weight: 700;
		margin: 0;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	.close-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border-radius: var(--radius-sm);
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
		min-height: 250px;
	}

	/* Auth Required & Empty States */
	.auth-required-state,
	.empty-state,
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		height: 300px;
		gap: 0.875rem;
		color: hsl(var(--muted-foreground));
	}

	:global(.empty-icon) {
		color: hsl(var(--muted-foreground) / 0.35);
		margin-bottom: 0.25rem;
	}

	.auth-required-state h3,
	.empty-state h3 {
		font-size: 1.25rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.auth-required-state p,
	.empty-state p {
		font-size: 0.875rem;
		max-width: 380px;
		margin: 0;
		line-height: 1.5;
	}

	.login-redirect-btn {
		margin-top: 0.5rem;
		padding: 0.625rem 1.5rem;
		background: hsl(var(--primary));
		color: white;
		border-radius: var(--radius);
		font-size: 0.875rem;
		font-weight: 600;
		text-decoration: none;
		transition: opacity 0.2s;
	}

	.login-redirect-btn:hover {
		opacity: 0.9;
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
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.deck-card {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 1.25rem;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius);
		padding: 0.75rem;
		cursor: pointer;
		text-align: left;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		position: relative;
	}

	.deck-card:hover {
		background: hsl(var(--muted) / 0.3);
		border-color: hsl(var(--primary) / 0.4);
		transform: translateY(-1px);
	}

	.deck-card.active {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.05);
	}

	.deck-art-preview {
		width: 90px;
		height: 60px;
		border-radius: var(--radius-sm);
		overflow: hidden;
		position: relative;
		flex-shrink: 0;
		border: 1px solid hsl(var(--border) / 0.4);
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
		bottom: 4px;
		left: 4px;
		font-size: 0.625rem;
		font-weight: 700;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(4px);
		color: white;
		padding: 2px 5px;
		border-radius: 3px;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.deck-info {
		flex: 1;
		min-width: 0;
	}

	.deck-name {
		font-size: 0.9375rem;
		font-weight: 600;
		margin: 0 0 0.25rem 0;
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
		opacity: 0;
		transition: opacity 0.15s;
		display: flex;
		align-items: center;
		padding-right: 0.5rem;
	}

	.deck-card:hover .deck-actions {
		opacity: 1;
	}

	.action-icon-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: var(--radius-sm);
		transition: all 0.15s;
	}

	.action-icon-btn:hover {
		background: hsl(var(--muted) / 0.4);
	}

	.delete-btn:hover {
		color: #f87171;
		background: rgba(239, 68, 68, 0.1);
	}
</style>
