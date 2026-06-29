<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { onMount } from "svelte";
	import { Loader, RotateCcw, AlertTriangle } from "lucide-svelte";

	// Gather all active cards (mainboard + commander + companion)
	const activeCards = $derived([
		...deckStore.commander,
		...deckStore.companion,
		...deckStore.mainboard
	]);

	/**
	 * @param {string} name
	 */
	function getMeta(name) {
		return deckStore.metadata[name.toLowerCase()] || {};
	}

	// 1. Dashboard calculations
	// CMC Curve (excluding lands)
	const cmcCounts = $derived.by(() => {
		const counts = Array(8).fill(0); // 0, 1, 2, 3, 4, 5, 6, 7+
		activeCards.forEach(c => {
			const meta = getMeta(c.name);
			const type = meta.type_line || "";
			if (type.toLowerCase().includes("land")) return;
			const cmc = Math.floor(meta.cmc ?? 0);
			if (cmc < 0) return;
			const index = Math.min(cmc, 7);
			counts[index] += (c.quantity || 1);
		});
		return counts;
	});

	const maxCmcCount = $derived(Math.max(...cmcCounts, 1));

	// Card Types breakdown
	const typeCounts = $derived.by(() => {
		const counts = {
			Creatures: 0,
			Instants: 0,
			Sorceries: 0,
			Artifacts: 0,
			Enchantments: 0,
			Planeswalkers: 0,
			Lands: 0,
			Other: 0
		};
		activeCards.forEach(c => {
			const meta = getMeta(c.name);
			const typeLine = (meta.type_line || "").toLowerCase();
			const qty = c.quantity || 1;
			if (typeLine.includes("creature")) counts.Creatures += qty;
			else if (typeLine.includes("instant")) counts.Instants += qty;
			else if (typeLine.includes("sorcery")) counts.Sorceries += qty;
			else if (typeLine.includes("planeswalker")) counts.Planeswalkers += qty;
			else if (typeLine.includes("artifact")) counts.Artifacts += qty;
			else if (typeLine.includes("enchantment")) counts.Enchantments += qty;
			else if (typeLine.includes("land")) counts.Lands += qty;
			else counts.Other += qty;
		});
		return Object.entries(counts).filter(([_, val]) => val > 0);
	});

	// Colors breakdown
	const colorCounts = $derived.by(() => {
		const counts = {
			White: { code: 'W', count: 0, color: '#f9fafb' },
			Blue: { code: 'U', count: 0, color: '#3b82f6' },
			Black: { code: 'B', count: 0, color: '#111827' },
			Red: { code: 'R', count: 0, color: '#ef4444' },
			Green: { code: 'G', count: 0, color: '#22c55e' },
			Colorless: { code: 'C', count: 0, color: '#6b7280' }
		};
		activeCards.forEach(c => {
			const meta = getMeta(c.name);
			const colors = meta.colors || [];
			const qty = c.quantity || 1;
			if (colors.length === 0) {
				const type = (meta.type_line || "").toLowerCase();
				if (!type.includes("land")) {
					counts.Colorless.count += qty;
				}
			} else {
				if (colors.includes("W")) counts.White.count += qty;
				if (colors.includes("U")) counts.Blue.count += qty;
				if (colors.includes("B")) counts.Black.count += qty;
				if (colors.includes("R")) counts.Red.count += qty;
				if (colors.includes("G")) counts.Green.count += qty;
			}
		});
		return Object.entries(counts).filter(([_, info]) => info.count > 0);
	});

	/**
	 * @param {number} sum
	 * @param {any} c
	 * @returns {number}
	 */
	const sumPrices = (sum, c) => sum + ((c.price || 0) * (c.quantity || 1));

	// Total pricing summaries
	const boardPrices = $derived.by(() => {
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		/** @type {Record<string, number>} */
		const prices = {};
		let total = 0;
		boards.forEach(b => {
			const store = /** @type {any} */ (deckStore);
			/** @type {any[]} */
			const list = store[b] || [];
			const priceVal = list.reduce(sumPrices, 0);
			prices[b] = priceVal;
			total += priceVal;
		});
		prices.total = total;
		return prices;
	});

	// 2. Sample Hand Simulator
	/** @type {string[]} */
	let hand = $state([]);
	/** @type {string[]} */
	let library = $state([]);
	let mulliganCount = $state(0);

	/**
	 * @param {any[]} array
	 */
	function shuffle(array) {
		const arr = [...array];
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	function resetSampleHand() {
		/** @type {string[]} */
		const decklist = [];
		/**
		 * @param {any} c
		 */
		const addCardNames = c => {
			for (let i = 0; i < (c.quantity || 1); i++) {
				decklist.push(c.name);
			}
		};
		deckStore.mainboard.forEach(addCardNames);
		library = shuffle(decklist);
		hand = [];
		mulliganCount = 0;
		drawHand();
	}

	function drawHand() {
		const toDraw = Math.max(7 - mulliganCount, 0);
		hand = library.slice(0, toDraw);
		library = library.slice(toDraw);
	}

	function mulligan() {
		mulliganCount++;
		/** @type {string[]} */
		const decklist = [];
		/**
		 * @param {any} c
		 */
		const addCardNames = c => {
			for (let i = 0; i < (c.quantity || 1); i++) {
				decklist.push(c.name);
			}
		};
		deckStore.mainboard.forEach(addCardNames);
		library = shuffle(decklist);
		drawHand();
	}

	function drawCard() {
		if (library.length > 0) {
			hand = [...hand, library[0]];
			library = library.slice(1);
		}
	}

	/**
	 * @param {string} name
	 */
	function getCardImg(name) {
		const meta = getMeta(name);
		return meta.image_uris?.normal || meta.card_faces?.[0]?.image_uris?.normal || null;
	}

	// 3. Required Tokens Finder (Scryfall metadata all_parts)
	const requiredTokens = $derived.by(() => {
		/** @type {any[]} */
		const tokens = [];
		const seen = new Set();
		activeCards.forEach(c => {
			const meta = getMeta(c.name);
			if (meta.all_parts) {
				/**
				 * @param {any} part
				 */
				const processPart = part => {
					if (part.component === "token" && !seen.has(part.name)) {
						seen.add(part.name);
						tokens.push({
							name: part.name,
							image_uri: part.image_uris?.normal || part.image_uris?.large || null
						});
					}
				};
				meta.all_parts.forEach(processPart);
			}
		});
		return tokens;
	});

	// 4. Combos Finder (Commander Spellbook API)
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
			const cardNames = Array.from(new Set(activeCards.map(c => c.name)));
			const res = await fetch("https://backend.commanderspellbook.com/find-my-combos", {
				method: "POST",
				headers: {
					"Content-Type": "application/json"
				},
				body: JSON.stringify({ cards: cardNames })
			});
			if (!res.ok) throw new Error("API returned status " + res.status);
			const data = await res.json();
			combos = data.results || data || [];
		} catch (e) {
			console.error("Failed to load combos:", e);
			combosError = "Failed to load combinations from Commander Spellbook.";
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
		return combo.results?.map(/** @param {any} r */ r => r.name).join(", ") || "Alternative Synergy";
	}

	onMount(() => {
		resetSampleHand();
	});

	$effect(() => {
		if (settingsStore.statsSubTab === "combos") {
			loadCombos();
		}
	});
</script>

<div class="stats-container">
	{#if settingsStore.statsSubTab === "dashboard"}
		<!-- Main Analytics Dashboard -->
		<div class="stats-grid">
			<!-- Mana Curve Chart -->
			<div class="stats-card cmc-card">
				<h3>Mana Curve</h3>
				<div class="cmc-chart">
					{#each cmcCounts as count, i}
						<div class="chart-bar-wrapper">
							<div class="bar-label">{count}</div>
							<div 
								class="chart-bar" 
								style="height: {(count / maxCmcCount) * 80}%;"
								title="{count} cards with CMC {i}"
							></div>
							<div class="bar-value">{i === 7 ? '7+' : i}</div>
						</div>
					{/each}
				</div>
			</div>

			<!-- Card Types -->
			<div class="stats-card">
				<h3>Card Types</h3>
				<ul class="stats-list">
					{#each typeCounts as [type, count]}
						<li>
							<span class="list-label">{type}</span>
							<div class="progress-bar-bg">
								<div class="progress-bar" style="width: {(count / activeCards.length) * 100}%;"></div>
							</div>
							<span class="list-value">{count}</span>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Colors Distribution -->
			<div class="stats-card">
				<h3>Color Breakdown</h3>
				<ul class="stats-list">
					{#each colorCounts as [name, info]}
						<li>
							<span class="list-label color-badge" style="border-color: {info.color}">{name}</span>
							<div class="progress-bar-bg">
								<div class="progress-bar" style="width: {(info.count / activeCards.length) * 100}%; background-color: {info.color};"></div>
							</div>
							<span class="list-value">{info.count}</span>
						</li>
					{/each}
				</ul>
			</div>

			<!-- Price Breakdown -->
			<div class="stats-card">
				<h3>Financial Value</h3>
				<ul class="stats-list price-list">
					<li>
						<span class="list-label">Total Value</span>
						<span class="list-value highlight-price">${boardPrices.total.toFixed(2)}</span>
					</li>
					<li>
						<span class="list-label">Mainboard</span>
						<span class="list-value">${boardPrices.mainboard.toFixed(2)}</span>
					</li>
					<li>
						<span class="list-label">Commander</span>
						<span class="list-value">${boardPrices.commander.toFixed(2)}</span>
					</li>
					<li>
						<span class="list-label">Sideboard</span>
						<span class="list-value">${boardPrices.sideboard.toFixed(2)}</span>
					</li>
					<li>
						<span class="list-label">Maybeboard</span>
						<span class="list-value">${boardPrices.maybeboard.toFixed(2)}</span>
					</li>
				</ul>
			</div>
		</div>

	{:else if settingsStore.statsSubTab === "sample-hand"}
		<!-- Sample Hand Simulator -->
		<div class="panel-card">
			<div class="panel-header">
				<h3>Sample Hand Simulator</h3>
				<div class="panel-actions">
					<button onclick={resetSampleHand} class="btn-action">
						<RotateCcw size={14} />
						Reset Hand
					</button>
					<button onclick={mulligan} class="btn-action" disabled={mulliganCount >= 7}>
						Mulligan ({mulliganCount})
					</button>
					<button onclick={drawCard} class="btn-action" disabled={library.length === 0}>
						Draw Card ({library.length} left)
					</button>
				</div>
			</div>

			{#if hand.length === 0}
				<div class="empty-panel-state">
					<p>Click Reset Hand to draw an opening hand.</p>
				</div>
			{:else}
				<div class="hand-grid">
					{#each hand as cardName, i}
						<div class="hand-card-wrapper" style="--card-idx: {i}">
							{#if getCardImg(cardName)}
								<img 
									src={getCardImg(cardName)} 
									alt={cardName} 
									class="hand-card-img"
								/>
							{:else}
								<div class="hand-card-fallback">
									<span class="fallback-card-title">{cardName}</span>
								</div>
							{/if}
						</div>
					{/each}
				</div>
			{/if}
		</div>

	{:else if settingsStore.statsSubTab === "tokens"}
		<!-- Tokens Panel -->
		<div class="panel-card">
			<div class="panel-header">
				<h3>Required Tokens ({requiredTokens.length})</h3>
			</div>

			{#if requiredTokens.length === 0}
				<div class="empty-panel-state">
					<p>No tokens are required for the cards in this deck.</p>
				</div>
			{:else}
				<div class="tokens-grid">
					{#each requiredTokens as token}
						<div class="token-card-wrapper">
							{#if token.image_uri}
								<img src={token.image_uri} alt={token.name} class="token-img" />
							{:else}
								<div class="token-fallback">
									<span>{token.name}</span>
								</div>
							{/if}
							<p class="token-title">{token.name}</p>
						</div>
					{/each}
				</div>
			{/if}
		</div>

	{:else if settingsStore.statsSubTab === "combos"}
		<!-- Combos Panel -->
		<div class="panel-card">
			<div class="panel-header">
				<h3>Matched Combos ({combos.length})</h3>
			</div>

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
					<p>No combinations from Commander Spellbook detected in this decklist.</p>
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
											<span class="card-tag">{card.card.name}</span>
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
	{/if}
</div>

<style>
	.stats-container {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		background: hsl(var(--background));
		font-family: var(--font-sans), sans-serif;
	}

	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
		gap: 2rem;
		max-width: 1200px;
		margin: 0 auto;
	}

	.stats-card {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	h3 {
		margin: 0;
		font-size: 1.1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	.stats-list {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.stats-list li {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.9rem;
	}

	.list-label {
		width: 90px;
		color: hsl(var(--muted-foreground));
		font-weight: 500;
	}

	.progress-bar-bg {
		flex: 1;
		height: 8px;
		background: hsl(var(--muted) / 0.35);
		border-radius: 4px;
		overflow: hidden;
	}

	.progress-bar {
		height: 100%;
		background: hsl(var(--primary));
		border-radius: 4px;
		transition: width 0.3s ease;
	}

	.list-value {
		width: 30px;
		text-align: right;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.color-badge {
		border-left: 3px solid;
		padding-left: 6px;
	}

	/* CMC curve styling */
	.cmc-chart {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		height: 180px;
		padding-top: 1rem;
	}

	.chart-bar-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		flex: 1;
		gap: 0.4rem;
	}

	.chart-bar {
		width: 22px;
		background: linear-gradient(to top, hsl(var(--primary)), hsl(var(--primary-dark, var(--primary))));
		border-radius: 4px 4px 0 0;
		transition: height 0.3s ease;
		cursor: pointer;
	}

	.chart-bar:hover {
		opacity: 0.85;
	}

	.bar-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--primary));
	}

	.bar-value {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	/* Price Breakdown styles */
	.price-list .list-label {
		width: auto;
		flex: 1;
	}

	.price-list .list-value {
		width: auto;
		font-size: 0.95rem;
	}

	.highlight-price {
		font-size: 1.1rem !important;
		color: hsl(var(--primary)) !important;
	}

	/* Panel layouts */
	.panel-card {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		padding: 2rem;
		max-width: 1200px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.panel-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 1rem;
		flex-wrap: wrap;
		gap: 1rem;
	}

	.panel-actions {
		display: flex;
		gap: 0.75rem;
	}

	.btn-action {
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.6);
		color: hsl(var(--foreground));
		padding: 0.5rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.825rem;
		font-weight: 500;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.btn-action:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--primary));
	}

	.btn-action:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.empty-panel-state,
	.loading-state,
	.error-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 4rem 1.5rem;
		color: hsl(var(--muted-foreground));
		gap: 1rem;
	}

	:global(.spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Sample Hand Grid */
	.hand-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
		gap: 1.25rem;
		justify-content: center;
	}

	.hand-card-wrapper {
		aspect-ratio: 2.5/3.5;
		position: relative;
		border-radius: var(--radius-md);
		overflow: hidden;
		box-shadow: 0 4px 15px rgba(0, 0, 0, 0.25);
		transition: transform 0.2s ease;
	}

	.hand-card-wrapper:hover {
		transform: translateY(-8px) scale(1.05);
		z-index: 10;
	}

	.hand-card-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.hand-card-fallback {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, hsl(var(--muted) / 0.3) 0%, hsl(var(--border) / 0.6) 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		text-align: center;
	}

	.fallback-card-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	/* Tokens Grid */
	.tokens-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
		gap: 1.5rem;
	}

	.token-card-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		align-items: center;
	}

	.token-img {
		width: 100%;
		aspect-ratio: 2.5/3.5;
		object-fit: cover;
		border-radius: var(--radius-md);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
	}

	.token-fallback {
		width: 100%;
		aspect-ratio: 2.5/3.5;
		background: linear-gradient(135deg, hsl(var(--muted) / 0.2) 0%, hsl(var(--border) / 0.4) 100%);
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		text-align: center;
	}

	.token-title {
		font-size: 0.85rem;
		font-weight: 500;
		text-align: center;
		margin: 0;
		color: hsl(var(--foreground));
	}

	/* Combos List */
	.combos-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.combo-item {
		background: hsl(var(--muted) / 0.1);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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
		line-height: 1.5;
	}

	.combo-cards {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.combo-cards-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.card-tag {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		border: 1px solid hsl(var(--primary) / 0.25);
		padding: 0.2rem 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.775rem;
		font-weight: 500;
	}

	.combo-instructions p {
		margin: 0.25rem 0 0 0;
		color: hsl(var(--muted-foreground));
	}
</style>
