<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import {
		Loader,
		RotateCcw,
		AlertTriangle,
		X,
	} from "lucide-svelte";
	import { getDeckTokens } from "$lib/api/tokens.js";

	// Gather all active cards (mainboard + commander + companion)
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

	// 1. Required Tokens Finder (Scryfall metadata & token service)
	/** @type {import('$lib/api/tokens.js').RequiredToken[]} */
	let requiredTokens = $state([]);
	let isTokensLoading = $state(false);
	let tokensError = $state("");
	let lastTokensDeckFingerprint = "";
	/** @type {import('$lib/api/tokens.js').RequiredToken | null} */
	let selectedToken = $state(null);

	async function loadTokens(force = false) {
		if (activeCards.length === 0) {
			requiredTokens = [];
			return;
		}

		const currentFingerprint = activeCards
			.map((c) => c.name)
			.sort()
			.join("|");

		if (!force && currentFingerprint === lastTokensDeckFingerprint && requiredTokens.length > 0) {
			return;
		}

		isTokensLoading = true;
		tokensError = "";

		try {
			const enrichedCards = activeCards.map((c) => {
				const meta = getMeta(c.name);
				return {
					name: c.name,
					oracle_text: meta.oracle_text || "",
					text: meta.oracle_text || "",
				};
			});

			const tokens = await getDeckTokens(enrichedCards);
			requiredTokens = tokens;
			lastTokensDeckFingerprint = currentFingerprint;
		} catch (e) {
			console.error("Failed to load tokens:", e);
			tokensError = "Failed to load tokens from Scryfall.";
		} finally {
			isTokensLoading = false;
		}
	}

	// 2. Combos Finder (Commander Spellbook API)
	/** @type {any[]} */
	let combos = $state([]);
	let isCombosLoading = $state(false);
	let combosError = $state("");

	async function loadCombos() {
		if (activeCards.length === 0) return;
		isCombosLoading = true;
		combosError = "";
		combos = [];
		try {
			const cardNames = Array.from(
				new Set(activeCards.map((c) => c.name)),
			);
			const res = await fetch(
				"https://backend.commanderspellbook.com/find-my-combos",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify({ cards: cardNames }),
				},
			);
			if (!res.ok) throw new Error("API returned status " + res.status);
			const data = await res.json();
			combos = data.results || data || [];
		} catch (e) {
			console.error("Failed to load combos:", e);
			combosError =
				"Failed to load combinations from Commander Spellbook.";
		} finally {
			combosError = "";
			isCombosLoading = false;
		}
	}

	/**
	 * @param {any} combo
	 * @returns {string}
	 */
	function getComboTitle(combo) {
		return (
			combo.results
				?.map(/** @param {any} r */ (r) => r.name)
				.join(", ") || "Alternative Synergy"
		);
	}

	$effect(() => {
		if (activeCards.length > 0) {
			loadTokens();
			loadCombos();
		}
	});

	/** @param {KeyboardEvent} e */
	function handleWindowKeydown(e) {
		if (e.key === "Escape" && selectedToken) {
			selectedToken = null;
		}
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<div class="more-container">
	<!-- Tokens View (Containerless & borderless) -->
	<section id="section-tokens" class="stats-page-section">
		<div class="section-header">
			<div class="section-title-group">
				<h3 class="section-title">Tokens</h3>
				{#if !isTokensLoading && requiredTokens.length > 0}
					<span class="section-count-badge">{requiredTokens.length}</span>
				{/if}
			</div>
		</div>

		<div class="tokens-view">
			{#if isTokensLoading}
				<div class="loading-state">
					<Loader class="spinner" size={32} />
					<p>Finding required tokens from Scryfall...</p>
				</div>
			{:else if tokensError}
				<div class="error-state">
					<AlertTriangle size={32} />
					<p>{tokensError}</p>
					<button class="retry-btn" onclick={() => loadTokens(true)}>
						<RotateCcw size={14} />
						<span>Try Again</span>
					</button>
				</div>
			{:else if requiredTokens.length === 0}
				<div class="empty-panel-state">
					<p>No tokens are required for the cards in this deck.</p>
				</div>
			{:else}
				<div class="tokens-grid">
					{#each requiredTokens as token}
						<button
							type="button"
							class="token-card-btn"
							onclick={() => (selectedToken = token)}
							title={`View details for ${token.name}`}
						>
							{#if token.image_uri}
								<img
									src={token.image_uri}
									alt={token.name}
									class="token-img"
									loading="lazy"
								/>
							{:else}
								<div class="token-fallback">
									<span>{token.name}</span>
								</div>
							{/if}
						</button>
					{/each}
				</div>
			{/if}
		</div>
	</section>

	<!-- Combos Section -->
	<section id="section-combos" class="stats-page-section">
		<div class="section-header">
			<div class="section-title-group">
				<h3 class="section-title">Combos</h3>
				{#if !isCombosLoading && combos.length > 0}
					<span class="section-count-badge">{combos.length}</span>
				{/if}
			</div>
		</div>

		<div class="combos-view">
			{#if isCombosLoading}
				<div class="loading-state">
					<Loader class="spinner" size={32} />
					<p>Finding combos on Commander Spellbook...</p>
				</div>
			{:else if combosError}
				<div class="error-state">
					<AlertTriangle size={32} />
					<p>{combosError}</p>
				</div>
			{:else if combos.length === 0}
				<div class="empty-panel-state">
					<p>
						No combinations from Commander Spellbook detected in
						this decklist.
					</p>
				</div>
			{:else}
				<div class="combos-list">
					{#each combos as combo}
						<div class="combo-item">
							<h4 class="combo-title">
								{getComboTitle(combo)}
							</h4>
							<div class="combo-details">
								<div class="combo-cards">
									<strong>Required Cards:</strong>
									<div class="combo-cards-tags">
										{#each combo.cards || [] as card}
											<span class="card-tag"
												>{card.card.name}</span
											>
										{/each}
									</div>
								</div>
								{#if combo.description}
									<div class="combo-instructions">
										<strong>Instructions:</strong>
										<p>{combo.description}</p>
									</div>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	</section>
</div>

<!-- Token Detail Inspector Modal -->
{#if selectedToken}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="token-modal-backdrop" 
		transition:fade={{ duration: 180 }}
		onclick={() => (selectedToken = null)}
		role="presentation"
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<div 
			class="token-modal-card"
			transition:scale={{ duration: 220, start: 0.95 }}
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			role="dialog"
			aria-modal="true"
			aria-label={selectedToken.name}
			tabindex="-1"
		>
			<button 
				type="button" 
				class="token-modal-close" 
				onclick={() => (selectedToken = null)}
				aria-label="Close"
			>
				<X size={18} />
			</button>

			<div class="token-modal-layout">
				<div class="token-modal-img-col">
					{#if selectedToken.image_uri}
						<img
							src={selectedToken.image_uri}
							alt={selectedToken.name}
							class="token-modal-img"
						/>
					{:else}
						<div class="token-modal-img-fallback">
							<span>{selectedToken.name}</span>
						</div>
					{/if}
				</div>

				<div class="token-modal-details">
					<div class="token-modal-header">
						<h2 class="token-modal-title">{selectedToken.name}</h2>
						{#if selectedToken.type_line}
							<div class="token-modal-badge">{selectedToken.type_line}</div>
						{/if}
					</div>

					{#if selectedToken.oracle_text}
						<div class="token-modal-text">
							<p>{selectedToken.oracle_text}</p>
						</div>
					{/if}

					{#if selectedToken.power !== undefined && selectedToken.toughness !== undefined}
						<div class="token-modal-stats">
							<span class="pt-box">{selectedToken.power} / {selectedToken.toughness}</span>
						</div>
					{/if}

					<div class="token-producers-section">
						<h4 class="producers-heading">
							Produced in this deck by ({selectedToken.sourceCards?.length || 0})
						</h4>
						<div class="producers-list">
							{#each selectedToken.sourceCards || [] as cardName}
								{@const meta = getMeta(cardName)}
								<div class="producer-item">
									{#if meta.image_uris?.art_crop}
										<img
											src={meta.image_uris.art_crop}
											alt={cardName}
											class="producer-art"
											loading="lazy"
										/>
									{:else}
										<div class="producer-art-placeholder"></div>
									{/if}
									<div class="producer-info">
										<span class="producer-name">{cardName}</span>
										{#if meta.type_line}
											<span class="producer-type">{meta.type_line}</span>
										{/if}
									</div>
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.stats-page-section {
		scroll-margin-top: 2rem;
		width: 100%;
	}

	.section-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1.5rem;
		max-width: 1400px;
		margin-left: auto;
		margin-right: auto;
		width: 100%;
	}

	.section-title-group {
		display: flex;
		align-items: baseline;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.section-title {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 1.625rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
		margin: 0;
	}

	.section-count-badge {
		font-size: 0.75rem;
		font-weight: 600;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border) / 0.6);
		color: hsl(var(--foreground));
		padding: 0.15rem 0.55rem;
		border-radius: 9999px;
	}

	.more-container {
		background: transparent;
		font-family: var(--font-sans), sans-serif;
		display: flex;
		flex-direction: column;
		gap: 5rem;
		width: 100%;
		box-sizing: border-box;
	}

	.combos-view {
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
	}

	h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	.empty-panel-state,
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 4rem 2rem;
		gap: 1rem;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}

	:global(.spinner) {
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

	/* Tokens Grid & Cards (Clean borderless presentation) */
	.tokens-view {
		max-width: 1400px;
		margin: 0 auto;
		width: 100%;
	}

	.tokens-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
		gap: 1.5rem;
	}

	.token-card-btn {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		border-radius: var(--radius-md);
		display: block;
		width: 100%;
		text-align: left;
		outline: none;
		transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.token-card-btn:hover {
		transform: translateY(-6px) scale(1.02);
	}

	.token-card-btn:focus-visible .token-img {
		box-shadow: 0 0 0 2px hsl(var(--primary)), 0 12px 28px rgba(0, 0, 0, 0.6);
	}

	.token-img {
		width: 100%;
		aspect-ratio: 5 / 7;
		border-radius: var(--radius-md);
		object-fit: cover;
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
		transition: box-shadow 0.2s ease;
		display: block;
	}

	.token-card-btn:hover .token-img {
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.55), 0 0 0 1px hsl(var(--primary) / 0.3);
	}

	.token-fallback {
		width: 100%;
		aspect-ratio: 5 / 7;
		background: hsl(var(--secondary) / 0.5);
		border: 1px dashed hsl(var(--border));
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.retry-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		background: hsl(var(--secondary) / 0.5);
		border: 1px solid hsl(var(--border) / 0.5);
		color: hsl(var(--foreground));
		font-size: 0.8rem;
		font-weight: 500;
		padding: 0.4rem 0.75rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.retry-btn:hover {
		background: hsl(var(--secondary));
		border-color: hsl(var(--border));
		transform: translateY(-1px);
	}

	/* Token Inspector Modal */
	.token-modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.78);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1.5rem;
	}

	.token-modal-card {
		position: relative;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow: 0 24px 60px rgba(0, 0, 0, 0.6), 0 0 0 1px hsl(var(--border) / 0.3);
		max-width: 760px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		padding: 2rem;
		box-sizing: border-box;
	}

	.token-modal-close {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--secondary) / 0.6);
		border: 1px solid hsl(var(--border) / 0.5);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		z-index: 2;
	}

	.token-modal-close:hover {
		background: hsl(var(--secondary));
		color: hsl(var(--foreground));
		transform: scale(1.05);
	}

	.token-modal-layout {
		display: flex;
		gap: 2rem;
		align-items: flex-start;
	}

	@media (max-width: 640px) {
		.token-modal-layout {
			flex-direction: column;
			align-items: center;
		}
	}

	.token-modal-img-col {
		flex-shrink: 0;
		width: 260px;
	}

	@media (max-width: 640px) {
		.token-modal-img-col {
			width: 200px;
		}
	}

	.token-modal-img {
		width: 100%;
		aspect-ratio: 5 / 7;
		border-radius: var(--radius-md);
		object-fit: cover;
		box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
		display: block;
	}

	.token-modal-img-fallback {
		width: 100%;
		aspect-ratio: 5 / 7;
		background: hsl(var(--secondary) / 0.5);
		border: 1px dashed hsl(var(--border));
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		text-align: center;
		color: hsl(var(--muted-foreground));
		font-size: 0.9rem;
	}

	.token-modal-details {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.token-modal-header {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.token-modal-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
		line-height: 1.2;
	}

	.token-modal-badge {
		display: inline-block;
		align-self: flex-start;
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--secondary));
		padding: 0.2rem 0.6rem;
		border-radius: var(--radius-sm);
		border: 1px solid hsl(var(--border) / 0.5);
	}

	.token-modal-text {
		background: hsl(var(--secondary) / 0.3);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-sm);
		padding: 1rem;
		font-size: 0.875rem;
		line-height: 1.5;
		color: hsl(var(--foreground) / 0.9);
	}

	.token-modal-text p {
		margin: 0;
		white-space: pre-line;
	}

	.token-modal-stats {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.pt-box {
		font-weight: 700;
		font-size: 1.1rem;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
	}

	.token-producers-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-top: 0.5rem;
		border-top: 1px solid hsl(var(--border) / 0.4);
		padding-top: 1rem;
	}

	.producers-heading {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.producers-list {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 0.75rem;
		max-height: 220px;
		overflow-y: auto;
		padding-right: 0.5rem;
	}

	.producer-item {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		background: hsl(var(--secondary) / 0.4);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-sm);
		padding: 0.4rem;
		overflow: hidden;
	}

	.producer-art {
		width: 36px;
		height: 36px;
		border-radius: 4px;
		object-fit: cover;
		flex-shrink: 0;
	}

	.producer-art-placeholder {
		width: 36px;
		height: 36px;
		border-radius: 4px;
		background: hsl(var(--muted));
		flex-shrink: 0;
	}

	.producer-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.producer-name {
		font-size: 0.85rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.producer-type {
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* Combos styles */
	.combos-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.combo-item {
		background: hsl(var(--secondary) / 0.25);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.combo-title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--primary));
	}

	.combo-details {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		font-size: 0.875rem;
	}

	.combo-cards {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.combo-cards-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}

	.card-tag {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		padding: 0.2rem 0.6rem;
		border-radius: var(--radius-sm);
		font-weight: 500;
	}

	.combo-instructions p {
		margin: 0.25rem 0 0 0;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
	}
</style>
