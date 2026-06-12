<script>
	import { fade, fly, scale } from 'svelte/transition';
	import { interactionStore } from '$lib/stores/interaction.svelte.js';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { scryfallFetch } from '$lib/api/scryfall.js';
	import { db } from '$lib/db';
	import { priceStore } from '$lib/stores/prices.svelte.js';
	import { onMount, tick } from 'svelte';

	let { isOpen, card, zone, price } = $derived(interactionStore.printingPickerModal);

	/** @type {any[]} */
	let printings = $state([]);
	let isLoading = $state(false);
	let error = $state('');

	/** @type {string | null} */
	let defaultPrintingId = $state(null);

	// Derived flags
	const cheapestId = $derived.by(() => {
		if (printings.length === 0) return null;
		let cheapest = null;
		let cheapestPrice = Infinity;
		for (const p of printings) {
			const usd = parseFloat(p.prices?.usd);
			const foil = parseFloat(p.prices?.usd_foil);
			const best = Math.min(
				isNaN(usd) ? Infinity : usd,
				isNaN(foil) ? Infinity : foil
			);
			if (best < cheapestPrice) { cheapestPrice = best; cheapest = p.id; }
		}
		return cheapest;
	});

	const newestId = $derived.by(() => {
		if (printings.length === 0) return null;
		return [...printings].sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime())[0]?.id ?? null;
	});

	const oldestId = $derived.by(() => {
		if (printings.length === 0) return null;
		return [...printings].sort((a, b) => new Date(a.released_at).getTime() - new Date(b.released_at).getTime())[0]?.id ?? null;
	});

	// Currently selected: match by set + collector_number from card metadata
	const currentMeta = $derived(card ? (card.type_line ? card : deckStore.metadata[card.name?.toLowerCase()]) : null);
	const selectedId = $derived.by(() => {
		if (!currentMeta || printings.length === 0) return null;
		const metaSet = (currentMeta.set || '').toLowerCase();
		const metaNum = (currentMeta.collector_number || '').toLowerCase();
		if (!metaSet) return null;
		return printings.find(p =>
			p.set.toLowerCase() === metaSet &&
			(p.collector_number || '').toLowerCase() === metaNum
		)?.id ?? null;
	});

	/**
	 * @param {any} p
	 * @returns {string}
	 */
	function getDisplayPrice(p) {
		const usd = parseFloat(p.prices?.usd);
		const foil = parseFloat(p.prices?.usd_foil);
		if (!isNaN(usd) && usd > 0) return `$${usd.toFixed(2)}`;
		if (!isNaN(foil) && foil > 0) return `$${foil.toFixed(2)} foil`;
		return '—';
	}

	/**
	 * @param {any} p
	 * @returns {{ label: string, cls: string }[]}
	 */
	function getBadges(p) {
		const badges = [];
		if (p.id === selectedId) badges.push({ label: 'Selected', cls: 'badge-selected' });
		if (p.id === defaultPrintingId) badges.push({ label: 'Default', cls: 'badge-default' });
		if (p.id === cheapestId) badges.push({ label: 'Cheapest', cls: 'badge-cheapest' });
		if (p.id === newestId) badges.push({ label: 'Newest', cls: 'badge-newest' });
		if (p.id === oldestId) badges.push({ label: 'Oldest', cls: 'badge-oldest' });
		return badges;
	}

	async function loadPrintings() {
		if (!card?.name) return;
		isLoading = true;
		error = '';
		printings = [];
		defaultPrintingId = null;

		try {
			// Fetch default from local DB for "Default" badge
			const localCard = await db.cards.where('name').equals(card.name).first();
			if (localCard) defaultPrintingId = localCard.id;

			const q = `!"${card.name}" unique:prints`;
			const res = await scryfallFetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=released&dir=desc`);
			if (!res.ok) throw new Error('Failed to load printings');
			const data = await res.json();
			printings = data.data || [];
		} catch (e) {
			error = 'Could not load printings. Check your connection.';
			console.error(e);
		} finally {
			isLoading = false;
		}
	}

	$effect(() => {
		if (isOpen && card?.name) {
			loadPrintings();
		} else if (!isOpen) {
			printings = [];
			error = '';
		}
	});

	/** @param {any} printing */
	async function applyPrinting(printing) {
		if (!card?.name) return;
		deckStore.setCardPrinting(card.name, printing);
		interactionStore.closePrintingPickerModal();
	}

	async function resetToDefault() {
		if (!card?.name) return;
		try {
			const defaultCard = await db.cards.where('name').equals(card.name).first();
			if (defaultCard) {
				const localPrice = priceStore.getPrice(card.name);
				const metadata = {
					id: defaultCard.id,
					name: defaultCard.name,
					type_line: defaultCard.type,
					oracle_text: defaultCard.text,
					mana_cost: defaultCard.mana,
					cmc: defaultCard.cmc,
					colors: defaultCard.colors || [],
					color_identity: defaultCard.identity || [],
					image_uris: {
						normal: defaultCard.image,
						art_crop: defaultCard.image ? defaultCard.image.replace('/normal/', '/art_crop/') : null
					},
					prices: {
						usd: localPrice !== null ? String(localPrice) : null,
						usd_foil: null
					}
				};
				deckStore.setCardPrinting(card.name, metadata);
			}
		} catch (e) {
			console.error('Failed to reset printing:', e);
		}
		interactionStore.closePrintingPickerModal();
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Escape') interactionStore.closePrintingPickerModal();
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="presentation"
		class="modal-backdrop"
		onclick={() => interactionStore.closePrintingPickerModal()}
		transition:fade={{ duration: 200 }}
	>
		<!-- Modal -->
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Change Printing"
			tabindex="-1"
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			transition:fly={{ y: 20, duration: 280 }}
		>
			<!-- Header -->
			<div class="modal-header">
				<div class="header-left">
					<h2 class="modal-title">Change Printing</h2>
					{#if card?.name}
						<span class="card-name-pill">{card.name}</span>
					{/if}
				</div>
				<div class="header-actions">
					{#if !isLoading && printings.length > 0}
						<span class="print-count">{printings.length} printing{printings.length !== 1 ? 's' : ''}</span>
					{/if}
					<button class="icon-btn" onclick={() => interactionStore.closePrintingPickerModal()} aria-label="Close">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
							<path d="M18 6 6 18M6 6l12 12"/>
						</svg>
					</button>
				</div>
			</div>

			<!-- Legend -->
			{#if !isLoading && printings.length > 0}
				<div class="legend">
					<span class="legend-badge badge-selected">Selected</span>
					<span class="legend-badge badge-cheapest">Cheapest</span>
					<span class="legend-badge badge-newest">Newest</span>
					<span class="legend-badge badge-oldest">Oldest</span>
					<span class="legend-badge badge-default">Default</span>
				</div>
			{/if}

			<!-- Body -->
			<div class="modal-body">
				{#if isLoading}
					<div class="skeleton-grid">
						{#each Array(8) as _, i}
							<div class="skeleton-card" style="animation-delay: {i * 40}ms"></div>
						{/each}
					</div>
				{:else if error}
					<div class="error-state">
						<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
							<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
						</svg>
						<p>{error}</p>
						<button class="retry-btn" onclick={loadPrintings}>Try again</button>
					</div>
				{:else if printings.length === 0}
					<div class="empty-state">No printings found.</div>
				{:else}
					<div class="printings-grid">
						{#each printings as printing (printing.id)}
							{@const badges = getBadges(printing)}
							{@const isSelected = printing.id === selectedId}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								class="printing-card"
								class:is-selected={isSelected}
								role="button"
								tabindex="0"
								onclick={() => applyPrinting(printing)}
								onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && applyPrinting(printing)}
								title="{printing.set_name} #{printing.collector_number}"
								in:scale={{ start: 0.92, duration: 200, delay: 0 }}
							>
								<!-- Card Image -->
								<div class="card-image-wrap">
									{#if printing.image_uris?.normal || printing.card_faces?.[0]?.image_uris?.normal}
										<img
											class="card-img"
											src={printing.image_uris?.normal || printing.card_faces?.[0]?.image_uris?.normal}
											alt="{printing.name} — {printing.set_name}"
											loading="lazy"
										/>
									{:else}
										<div class="card-img-placeholder">
											<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
												<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>
											</svg>
										</div>
									{/if}

									<!-- Selected checkmark overlay -->
									{#if isSelected}
										<div class="selected-overlay">
											<div class="check-ring">
												<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
													<polyline points="20 6 9 17 4 12"/>
												</svg>
											</div>
										</div>
									{/if}
								</div>

								<!-- Meta row -->
								<div class="card-meta">
									<div class="set-info">
										<span class="set-code">{printing.set.toUpperCase()}</span>
										<span class="collector-num">#{printing.collector_number}</span>
									</div>
									<span class="card-price">{getDisplayPrice(printing)}</span>
								</div>

								<!-- Release year -->
								<div class="release-row">
									<span class="set-name" title={printing.set_name}>{printing.set_name}</span>
									<span class="release-year">{printing.released_at?.slice(0,4) ?? ''}</span>
								</div>

								<!-- Badges -->
								{#if badges.length > 0}
									<div class="badges-row">
										{#each badges as badge}
											<span class="badge {badge.cls}">{badge.label}</span>
										{/each}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<button class="reset-btn" onclick={resetToDefault} disabled={isLoading}>
					Reset to Default
				</button>
				<button class="cancel-btn" onclick={() => interactionStore.closePrintingPickerModal()}>
					Cancel
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(10px);
		-webkit-backdrop-filter: blur(10px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30000;
		padding: 24px;
	}

	.modal-content {
		background: hsl(var(--background) / 0.92);
		backdrop-filter: blur(30px) saturate(200%);
		-webkit-backdrop-filter: blur(30px) saturate(200%);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: calc(var(--radius) + 4px);
		box-shadow:
			0 30px 60px -20px rgba(0, 0, 0, 0.8),
			0 0 0 1px hsl(255 100% 100% / 0.04),
			inset 0 1px 0 hsl(255 100% 100% / 0.06);
		width: 100%;
		max-width: 920px;
		max-height: 88vh;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	/* ── Header ── */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 20px 24px 16px;
		border-bottom: 1px solid hsl(var(--border) / 0.25);
		flex-shrink: 0;
		gap: 12px;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 12px;
		min-width: 0;
	}

	.modal-title {
		font-size: 1.2rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0;
		letter-spacing: -0.02em;
		white-space: nowrap;
	}

	.card-name-pill {
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.4);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: 999px;
		padding: 3px 10px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 280px;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
		flex-shrink: 0;
	}

	.print-count {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground) / 0.7);
		font-weight: 500;
	}

	.icon-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border-radius: var(--radius-sm);
		border: 1px solid hsl(var(--border) / 0.3);
		background: hsl(var(--muted) / 0.15);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s;
	}

	.icon-btn:hover {
		background: hsl(var(--muted) / 0.35);
		color: hsl(var(--foreground));
		border-color: hsl(var(--border) / 0.6);
	}

	/* ── Legend ── */
	.legend {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 10px 24px;
		border-bottom: 1px solid hsl(var(--border) / 0.15);
		flex-shrink: 0;
	}

	.legend-badge {
		font-size: 0.65rem;
		font-weight: 700;
		padding: 2px 8px;
		border-radius: 999px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	/* ── Body / Grid ── */
	.modal-body {
		flex: 1;
		overflow-y: auto;
		padding: 20px 24px;
		scrollbar-gutter: stable;
	}

	.printings-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 14px;
	}

	/* ── Individual Printing Card ── */
	.printing-card {
		display: flex;
		flex-direction: column;
		gap: 6px;
		border-radius: var(--radius);
		border: 1.5px solid hsl(var(--border) / 0.3);
		background: hsl(var(--card) / 0.5);
		padding: 8px;
		cursor: pointer;
		transition:
			transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1),
			border-color 0.15s,
			box-shadow 0.2s,
			background 0.15s;
		outline: none;
	}

	.printing-card:hover {
		transform: translateY(-4px) scale(1.02);
		border-color: hsl(var(--primary) / 0.6);
		box-shadow:
			0 8px 24px -8px hsl(var(--primary) / 0.3),
			0 0 0 1px hsl(var(--primary) / 0.2);
		background: hsl(var(--card) / 0.8);
	}

	.printing-card:focus-visible {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.3);
	}

	.printing-card.is-selected {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.08);
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.4),
			0 6px 20px -8px hsl(var(--primary) / 0.4);
	}

	.printing-card.is-selected:hover {
		transform: translateY(-4px) scale(1.02);
		box-shadow:
			0 0 0 1px hsl(var(--primary) / 0.6),
			0 10px 28px -8px hsl(var(--primary) / 0.5);
	}

	/* Card Image */
	.card-image-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 2.5 / 3.5;
		border-radius: calc(var(--radius-sm) + 2px);
		overflow: hidden;
		background: hsl(var(--muted) / 0.2);
	}

	.card-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		transition: opacity 0.2s;
	}

	.card-img-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground) / 0.4);
	}

	.selected-overlay {
		position: absolute;
		inset: 0;
		background: hsl(var(--primary) / 0.18);
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		padding: 6px;
	}

	.check-ring {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		background: hsl(var(--primary));
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px hsl(var(--primary) / 0.5);
		color: white;
		flex-shrink: 0;
	}

	/* Meta row */
	.card-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 4px;
		margin-top: 2px;
	}

	.set-info {
		display: flex;
		align-items: baseline;
		gap: 3px;
	}

	.set-code {
		font-size: 0.72rem;
		font-weight: 800;
		color: hsl(var(--foreground));
		letter-spacing: 0.03em;
	}

	.collector-num {
		font-size: 0.65rem;
		color: hsl(var(--muted-foreground) / 0.7);
		font-weight: 500;
	}

	.card-price {
		font-size: 0.72rem;
		font-weight: 700;
		color: hsl(142 60% 50%);
		white-space: nowrap;
	}

	.release-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 4px;
	}

	.set-name {
		font-size: 0.62rem;
		color: hsl(var(--muted-foreground) / 0.65);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.release-year {
		font-size: 0.62rem;
		color: hsl(var(--muted-foreground) / 0.45);
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	/* Badges */
	.badges-row {
		display: flex;
		flex-wrap: wrap;
		gap: 3px;
		margin-top: 2px;
	}

	.badge {
		font-size: 0.58rem;
		font-weight: 700;
		padding: 2px 6px;
		border-radius: 999px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.badge-selected,
	.legend-badge.badge-selected {
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
		border: 1px solid hsl(var(--primary) / 0.4);
	}

	.badge-cheapest,
	.legend-badge.badge-cheapest {
		background: hsl(142 60% 40% / 0.2);
		color: hsl(142 70% 55%);
		border: 1px solid hsl(142 60% 40% / 0.35);
	}

	.badge-newest,
	.legend-badge.badge-newest {
		background: hsl(45 90% 50% / 0.2);
		color: hsl(45 90% 65%);
		border: 1px solid hsl(45 90% 50% / 0.35);
	}

	.badge-oldest,
	.legend-badge.badge-oldest {
		background: hsl(280 50% 55% / 0.2);
		color: hsl(280 60% 72%);
		border: 1px solid hsl(280 50% 55% / 0.35);
	}

	.badge-default,
	.legend-badge.badge-default {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--muted-foreground));
		border: 1px solid hsl(var(--border) / 0.5);
	}

	/* Skeleton */
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
		gap: 14px;
	}

	.skeleton-card {
		aspect-ratio: 2.5 / 5;
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.25);
		animation: shimmer 1.6s ease-in-out infinite;
	}

	@keyframes shimmer {
		0%, 100% { opacity: 0.5; }
		50% { opacity: 1; }
	}

	/* Error / Empty */
	.error-state,
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 12px;
		padding: 48px 24px;
		color: hsl(var(--muted-foreground));
		font-size: 0.875rem;
		text-align: center;
	}

	.retry-btn {
		padding: 8px 20px;
		background: hsl(var(--primary) / 0.15);
		border: 1px solid hsl(var(--primary) / 0.4);
		color: hsl(var(--primary));
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.15s;
	}

	.retry-btn:hover {
		background: hsl(var(--primary) / 0.25);
	}

	/* Footer */
	.modal-footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 14px 24px 18px;
		border-top: 1px solid hsl(var(--border) / 0.25);
		flex-shrink: 0;
		gap: 10px;
	}

	.reset-btn {
		padding: 8px 16px;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.4);
		color: hsl(var(--muted-foreground));
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.8rem;
		font-weight: 600;
		transition: all 0.15s;
	}

	.reset-btn:hover:not(:disabled) {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
	}

	.reset-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.cancel-btn {
		padding: 8px 20px;
		background: transparent;
		border: 1px solid hsl(var(--border) / 0.4);
		color: hsl(var(--foreground));
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.15s;
	}

	.cancel-btn:hover {
		background: hsl(var(--muted) / 0.25);
	}
</style>
