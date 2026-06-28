<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";

	// Gather all active cards (mainboard + commander + companion)
	const activeCards = $derived([
		...deckStore.deck.commander,
		...deckStore.deck.companion,
		...deckStore.deck.mainboard
	]);

	function getMeta(name) {
		return deckStore.metadata[name.toLowerCase()] || {};
	}

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

	// Total pricing summaries
	const boardPrices = $derived.by(() => {
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		const prices = {};
		let total = 0;
		boards.forEach(b => {
			const list = deckStore.deck[b] || [];
			const priceVal = list.reduce((sum, c) => sum + ((c.price || 0) * (c.quantity || 1)), 0);
			prices[b] = priceVal;
			total += priceVal;
		});
		prices.total = total;
		return prices;
	});
</script>

<div class="stats-container">
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
		background: linear-gradient(to top, hsl(var(--primary)), hsl(var(--primary-dark) || var(--primary)));
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
</style>
