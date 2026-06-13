<script>
	import { fade, fly, scale } from "svelte/transition";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { scryfallFetch } from "$lib/api/scryfall.js";
	import { db } from "$lib/db";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { onMount, tick } from "svelte";

	let { isOpen, card, zone, price } = $derived(
		interactionStore.printingPickerModal,
	);

	/** @type {any[]} */
	let printings = $state([]);
	let isLoading = $state(false);
	let error = $state("");

	/** @type {string | null} */
	let defaultPrintingId = $state(null);

	// Sorting and Filtering State
	let searchQuery = $state("");
	let sortBy = $state("released-desc");

	// Draft selection state (selected via pills or in pending mode)
	/** @type {any | null} */
	let draftSelectedCard = $state(null);
	let showConfirm = $state(false);

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
				isNaN(foil) ? Infinity : foil,
			);
			if (best < cheapestPrice) {
				cheapestPrice = best;
				cheapest = p.id;
			}
		}
		return cheapest;
	});

	const newestId = $derived.by(() => {
		if (printings.length === 0) return null;
		return (
			[...printings].sort(
				(a, b) =>
					new Date(b.released_at).getTime() -
					new Date(a.released_at).getTime(),
			)[0]?.id ?? null
		);
	});

	const oldestId = $derived.by(() => {
		if (printings.length === 0) return null;
		return (
			[...printings].sort(
				(a, b) =>
					new Date(a.released_at).getTime() -
					new Date(b.released_at).getTime(),
			)[0]?.id ?? null
		);
	});

	// Currently in deck: match by set + collector_number from card metadata
	const currentMeta = $derived(
		card
			? card.type_line
				? card
				: deckStore.metadata[card.name?.toLowerCase()]
			: null,
	);
	const currentPrintingId = $derived.by(() => {
		if (!currentMeta || printings.length === 0) return null;
		const metaSet = (currentMeta.set || "").toLowerCase();
		const metaNum = (currentMeta.collector_number || "").toLowerCase();
		if (!metaSet) return null;
		return (
			printings.find(
				(p) =>
					p.set.toLowerCase() === metaSet &&
					(p.collector_number || "").toLowerCase() === metaNum,
			)?.id ?? null
		);
	});

	// Helper to extract Scryfall ID from our local db card's image URL
	/**
	 * @param {string} url
	 * @returns {string | null}
	 */
	function getPrintingIdFromImageUrl(url) {
		if (!url) return null;
		const parts = url.split("/");
		const filename = parts[parts.length - 1];
		const id = filename.split(".")[0].split("?")[0];
		return id;
	}

	// Filter and Sort Printings
	const filteredPrintings = $derived.by(() => {
		let list = [...printings];

		if (searchQuery.trim()) {
			const q = searchQuery.toLowerCase().trim();
			list = list.filter((p) => {
				const setCode = (p.set || "").toLowerCase();
				const setName = (p.set_name || "").toLowerCase();
				const collectorNum = (p.collector_number || "").toLowerCase();
				const priceStr = getDisplayPrice(p).toLowerCase();
				return (
					setCode.includes(q) ||
					setName.includes(q) ||
					collectorNum.includes(q) ||
					priceStr.includes(q)
				);
			});
		}

		list.sort((a, b) => {
			if (sortBy === "released-desc") {
				return (
					new Date(b.released_at).getTime() -
					new Date(a.released_at).getTime()
				);
			}
			if (sortBy === "released-asc") {
				return (
					new Date(a.released_at).getTime() -
					new Date(b.released_at).getTime()
				);
			}
			if (sortBy === "price-asc") {
				const priceA = getPriceNumeric(a);
				const priceB = getPriceNumeric(b);
				return priceA - priceB;
			}
			if (sortBy === "price-desc") {
				const priceA = getPriceNumeric(a);
				const priceB = getPriceNumeric(b);
				return priceB - priceA;
			}
			if (sortBy === "set-asc") {
				return (a.set || "").localeCompare(b.set || "");
			}
			return 0;
		});

		return list;
	});

	/**
	 * @param {any} p
	 * @returns {number}
	 */
	function getPriceNumeric(p) {
		const usd = parseFloat(p.prices?.usd);
		const foil = parseFloat(p.prices?.usd_foil);
		const val = Math.min(
			isNaN(usd) ? Infinity : usd,
			isNaN(foil) ? Infinity : foil,
		);
		return val;
	}

	/**
	 * @param {any} p
	 * @returns {string}
	 */
	function getDisplayPrice(p) {
		const usd = parseFloat(p.prices?.usd);
		const foil = parseFloat(p.prices?.usd_foil);

		/**
		 * @param {number} val
		 * @param {string} [suffix]
		 */
		const formatPrice = (val, suffix = "") => {
			if (isNaN(val) || val <= 0) return "";
			if (val > 9.99) {
				return `$${Math.round(val)}${suffix}`;
			}
			return `$${val.toFixed(2)}${suffix}`;
		};

		if (!isNaN(usd) && usd > 0) return formatPrice(usd);
		if (!isNaN(foil) && foil > 0) return formatPrice(foil, " foil");
		return "";
	}

	/**
	 * @param {any} p
	 * @returns {{ label: string, cls: string }[]}
	 */
	function getBadges(p) {
		const badges = [];
		if (p.id === currentPrintingId)
			badges.push({ label: "Current", cls: "badge-current" });
		if (p.id === defaultPrintingId)
			badges.push({ label: "Default", cls: "badge-default" });
		if (p.id === cheapestId)
			badges.push({ label: "Cheapest", cls: "badge-cheapest" });
		if (p.id === newestId)
			badges.push({ label: "Newest", cls: "badge-newest" });
		if (p.id === oldestId)
			badges.push({ label: "Oldest", cls: "badge-oldest" });
		return badges;
	}

	async function loadPrintings() {
		if (!card?.name) return;
		isLoading = true;
		error = "";
		printings = [];
		defaultPrintingId = null;
		searchQuery = "";
		sortBy = "released-desc";
		draftSelectedCard = null;
		showConfirm = false;

		try {
			// Fetch default from local DB for "Default" badge
			const localCard = await db.cards
				.where("name")
				.equals(card.name)
				.first();
			if (localCard) {
				defaultPrintingId = getPrintingIdFromImageUrl(localCard.image);
			}

			const q = `!"${card.name}" unique:prints`;
			const res = await scryfallFetch(
				`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}&order=released&dir=desc`,
			);
			if (!res.ok) throw new Error("Failed to load printings");
			const data = await res.json();
			const fetchedData = data.data || [];
			printings = fetchedData.filter((/** @type {any} */ p) => p.name.toLowerCase() === card.name.toLowerCase());
		} catch (e) {
			error = "Could not load printings. Check your connection.";
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
			error = "";
		}
	});

	/** @param {any} printing */
	async function applyPrinting(printing) {
		if (!card?.name) return;
		deckStore.setCardPrinting(card.name, printing);
		interactionStore.closePrintingPickerModal();
	}

	/**
	 * @param {string} type
	 */
	function handlePillClick(type) {
		let targetId = null;
		if (type === "current") targetId = currentPrintingId;
		else if (type === "cheapest") targetId = cheapestId;
		else if (type === "newest") targetId = newestId;
		else if (type === "oldest") targetId = oldestId;
		else if (type === "default") targetId = defaultPrintingId;

		if (!targetId) return;

		const targetCard = printings.find((p) => p.id === targetId);
		if (targetCard) {
			draftSelectedCard = targetCard;
			showConfirm = true;
			tick().then(() => {
				const el = document.getElementById("print-" + targetId);
				if (el) {
					el.scrollIntoView({ behavior: "smooth", block: "center" });
				}
			});
		}
	}

	async function resetToDefault() {
		if (!card?.name) return;
		try {
			if (defaultPrintingId) {
				const defaultCard = printings.find(
					(p) => p.id === defaultPrintingId,
				);
				if (defaultCard) {
					applyPrinting(defaultCard);
					return;
				}
			}
			// Fallback to local DB card properties if printings not loaded/matching
			const defaultCard = await db.cards
				.where("name")
				.equals(card.name)
				.first();
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
						art_crop: defaultCard.image
							? defaultCard.image.replace(
									"/normal/",
									"/art_crop/",
								)
							: null,
					},
					prices: {
						usd: localPrice !== null ? String(localPrice) : null,
						usd_foil: null,
					},
				};
				deckStore.setCardPrinting(card.name, metadata);
			}
		} catch (e) {
			console.error("Failed to reset printing:", e);
		}
		interactionStore.closePrintingPickerModal();
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "Escape") interactionStore.closePrintingPickerModal();
	}

	let badgeCycleIndex = $state(0);
	onMount(() => {
		const interval = setInterval(() => {
			badgeCycleIndex++;
		}, 2500);
		return () => clearInterval(interval);
	});
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
						<span class="print-count"
							>{printings.length} printing{printings.length !== 1
								? "s"
								: ""}</span
						>
					{/if}
					<button
						class="icon-btn"
						onclick={() =>
							interactionStore.closePrintingPickerModal()}
						aria-label="Close"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="2.5"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			<!-- Control Panel (Pills, Filter, Sort) -->
			{#if !isLoading && printings.length > 0}
				<div class="control-panel">
					<div class="pills-group">
						<button
							class="pill-btn badge-cheapest"
							onclick={() => handlePillClick("cheapest")}
							>Cheapest</button
						>
						<button
							class="pill-btn badge-newest"
							onclick={() => handlePillClick("newest")}
							>Newest</button
						>
						<button
							class="pill-btn badge-oldest"
							onclick={() => handlePillClick("oldest")}
							>Oldest</button
						>
						<button
							class="pill-btn badge-default"
							onclick={() => handlePillClick("default")}
							>Default</button
						>
					</div>

					<div class="filters-group">
						<div class="search-wrapper">
							<svg
								class="search-icon"
								width="14"
								height="14"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							>
								<circle cx="11" cy="11" r="8" /><line
									x1="21"
									y1="21"
									x2="16.65"
									y2="16.65"
								/>
							</svg>
							<input
								type="text"
								placeholder="Filter printings..."
								bind:value={searchQuery}
								class="filter-input"
							/>
						</div>

						<select bind:value={sortBy} class="sort-select">
							<option value="released-desc">Newest First</option>
							<option value="released-asc">Oldest First</option>
							<option value="price-asc">Price: Low to High</option
							>
							<option value="price-desc"
								>Price: High to Low</option
							>
							<option value="set-asc">Set Code (A-Z)</option>
						</select>
					</div>
				</div>
			{/if}

			<!-- Body -->
			<div class="modal-body">
				{#if isLoading}
					<div class="skeleton-grid">
						{#each Array(8) as _, i}
							<div
								class="skeleton-card"
								style="animation-delay: {i * 40}ms"
							></div>
						{/each}
					</div>
				{:else if error}
					<div class="error-state">
						<svg
							width="32"
							height="32"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							stroke-width="1.5"
						>
							<circle cx="12" cy="12" r="10" /><line
								x1="12"
								y1="8"
								x2="12"
								y2="12"
							/><line x1="12" y1="16" x2="12.01" y2="16" />
						</svg>
						<p>{error}</p>
						<button class="retry-btn" onclick={loadPrintings}
							>Try again</button
						>
					</div>
				{:else if filteredPrintings.length === 0}
					<div class="empty-state">
						No printings matching filters.
					</div>
				{:else}
					<div class="printings-grid">
						{#each filteredPrintings as printing (printing.id)}
							{@const badges = getBadges(printing)}
							{@const isCurrentInDeck =
								printing.id === currentPrintingId}
							{@const isSelected = draftSelectedCard
								? printing.id === draftSelectedCard.id
								: isCurrentInDeck}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div
								id="print-{printing.id}"
								class="printing-card"
								class:is-current={isCurrentInDeck}
								class:is-selected={isSelected}
								role="button"
								tabindex="0"
								onclick={() => applyPrinting(printing)}
								onkeydown={(e) =>
									(e.key === "Enter" || e.key === " ") &&
									applyPrinting(printing)}
								title="{printing.set_name} #{printing.collector_number}"
								in:scale={{
									start: 0.92,
									duration: 200,
									delay: 0,
								}}
							>
								<!-- Diagonal sash for top priority badge -->
								{#if badges.length > 0}
									{@const topBadge = badges[badgeCycleIndex % badges.length]}
									<div class="sash-container">
										{#key topBadge.label}
											<div class="sash {topBadge.cls}" in:fade={{ duration: 200 }}>
												{topBadge.label}
											</div>
										{/key}
									</div>
								{/if}

								<!-- Card Image -->
								<div class="card-image-wrap">
									{#if printing.image_uris?.normal || printing.card_faces?.[0]?.image_uris?.normal}
										<img
											class="card-img"
											src={printing.image_uris?.normal ||
												printing.card_faces?.[0]
													?.image_uris?.normal}
											alt="{printing.name} — {printing.set_name}"
											loading="lazy"
										/>
									{:else}
										<div class="card-img-placeholder">
											<svg
												width="24"
												height="24"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												stroke-width="1.5"
											>
												<rect
													x="3"
													y="3"
													width="18"
													height="18"
													rx="2"
												/><circle
													cx="8.5"
													cy="8.5"
													r="1.5"
												/><path d="m21 15-5-5L5 21" />
											</svg>
										</div>
									{/if}

									<!-- Selected checkmark overlay (blue) -->
									{#if isSelected}
										<div class="selected-overlay">
											<div class="check-ring">
												<svg
													width="18"
													height="18"
													viewBox="0 0 24 24"
													fill="none"
													stroke="currentColor"
													stroke-width="3"
												>
													<polyline
														points="20 6 9 17 4 12"
													/>
												</svg>
											</div>
										</div>
									{/if}
								</div>

								<!-- Card details inside a flexbox container with padding -->
								<div class="card-details">
									<!-- Meta row (14px font, Foreground color, same font weights, no # symbol) -->
									<div class="card-meta">
										<span class="set-info">
											<span class="set-code"
												>{printing.set.toUpperCase()}</span
											>
											<span class="collector-num"
												>{printing.collector_number}</span
											>
										</span>
										<span class="card-price"
											>{getDisplayPrice(printing)}</span
										>
									</div>

									<!-- Set name (Muted Foreground, 14px font) -->
									<div class="set-name-row">
										<span
											class="set-name"
											title={printing.set_name}
											>{printing.set_name}</span
										>
									</div>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<div class="footer-left">
					<button
						class="reset-btn"
						onclick={resetToDefault}
						disabled={isLoading}
					>
						Reset to Default
					</button>
				</div>
				<div class="footer-right">
					{#if showConfirm}
						<button
							class="confirm-btn"
							onclick={() =>
								draftSelectedCard &&
								applyPrinting(draftSelectedCard)}
							transition:fade={{ duration: 150 }}
						>
							Save & Confirm
						</button>
					{/if}
					<button
						class="cancel-btn"
						onclick={() =>
							interactionStore.closePrintingPickerModal()}
					>
						Cancel
					</button>
				</div>
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
		padding: 40px;
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
		height: 100%;
		max-width: none;
		max-height: none;
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

	/* ── Control Panel (Pills + Filters) ── */
	.control-panel {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: 12px 24px;
		border-bottom: 1px solid hsl(var(--border) / 0.15);
		background: hsl(var(--muted) / 0.1);
		flex-shrink: 0;
	}

	.pills-group {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
	}

	.pill-btn {
		font-size: 0.68rem;
		font-weight: 700;
		padding: 4px 12px;
		border-radius: 999px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		background: hsl(var(--muted) / 0.25);
		border: 1px solid hsl(var(--border) / 0.4);
		color: hsl(var(--muted-foreground));
	}

	.pill-btn:hover {
		transform: scale(1.05);
	}


	.pill-btn.badge-cheapest {
		background: hsl(142 60% 40% / 0.12);
		color: hsl(142 70% 60%);
		border-color: hsl(142 60% 40% / 0.4);
	}
	.pill-btn.badge-cheapest:hover {
		background: hsl(142 60% 40% / 0.25);
	}

	.pill-btn.badge-newest {
		background: hsl(45 90% 50% / 0.12);
		color: hsl(45 90% 65%);
		border-color: hsl(45 90% 50% / 0.4);
	}
	.pill-btn.badge-newest:hover {
		background: hsl(45 90% 50% / 0.25);
	}

	.pill-btn.badge-oldest {
		background: hsl(280 50% 55% / 0.12);
		color: hsl(280 60% 75%);
		border-color: hsl(280 50% 55% / 0.4);
	}
	.pill-btn.badge-oldest:hover {
		background: hsl(280 50% 55% / 0.25);
	}

	.pill-btn.badge-default {
		background: hsl(var(--muted) / 0.3);
		color: hsl(var(--muted-foreground));
		border-color: hsl(var(--border) / 0.5);
	}
	.pill-btn.badge-default:hover {
		background: hsl(var(--muted) / 0.5);
	}

	.filters-group {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-grow: 1;
		justify-content: flex-end;
		max-width: 500px;
	}

	.search-wrapper {
		position: relative;
		flex: 1;
		min-width: 140px;
	}

	.search-icon {
		position: absolute;
		left: 10px;
		top: 50%;
		transform: translateY(-50%);
		color: hsl(var(--muted-foreground) / 0.7);
		pointer-events: none;
	}

	.filter-input {
		width: 100%;
		padding: 6px 10px 6px 30px;
		background: hsl(var(--background) / 0.6);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: 0.82rem;
		outline: none;
		transition: all 0.15s;
	}

	.filter-input:focus {
		border-color: hsl(var(--primary) / 0.8);
		background: hsl(var(--background));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.sort-select {
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		padding: 6px 32px 6px 12px;
		background: hsl(var(--background) / 0.6);
		background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23a1a1aa' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 10px center;
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: 0.82rem;
		outline: none;
		cursor: pointer;
		transition: all 0.15s;
	}

	.sort-select:focus {
		border-color: hsl(var(--primary) / 0.8);
		background-color: hsl(var(--background));
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
		grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
		gap: 14px;
	}

	/* ── Individual Printing Card ── */
	.printing-card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-radius: 5% / 3.5%;
		border: 1.5px solid hsl(var(--border) / 0.3);
		background: hsl(var(--card) / 0.5);
		padding: 0.5rem;
		cursor: pointer;
		position: relative;
		overflow: hidden;
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

	/* Current printing in deck gets a violet/purple accent instead of blue */
	.printing-card.is-current {
		border-color: hsl(262 80% 50% / 0.6);
		background: hsl(262 80% 50% / 0.04);
		box-shadow: 0 0 0 1px hsl(262 80% 50% / 0.2);
	}

	.printing-card.is-current:hover {
		border-color: hsl(262 80% 50% / 0.8);
		background: hsl(262 80% 50% / 0.08);
	}

	/* Selected Card gets the main primary border + blue checkmark */
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

	/* Diagonal Sash Badges */
	.sash-container {
		position: absolute;
		top: 0;
		left: 0;
		width: 72px;
		height: 72px;
		overflow: hidden;
		pointer-events: none;
		z-index: 10;
	}

	.sash {
		position: absolute;
		top: 12px;
		left: -22px;
		width: 88px;
		transform: rotate(-45deg);
		text-align: center;
		font-size: 0.55rem;
		font-weight: 800;
		letter-spacing: 0.05em;
		text-transform: uppercase;
		padding: 2px 0;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
		color: white;
	}

	.sash.badge-current {
		background: hsl(262 80% 50%);
		color: hsl(262 80% 95%);
	}

	.sash.badge-cheapest {
		background: hsl(142 60% 40%);
		color: hsl(142 70% 95%);
	}

	.sash.badge-newest {
		background: hsl(45 90% 45%);
		color: hsl(45 90% 95%);
	}

	.sash.badge-oldest {
		background: hsl(280 50% 50%);
		color: hsl(280 60% 95%);
	}

	.sash.badge-default {
		background: hsl(var(--muted-foreground));
		color: hsl(var(--background));
	}

	/* Card Image (border-radius clipped to card top) */
	.card-image-wrap {
		position: relative;
		width: 100%;
		aspect-ratio: 2.5 / 3.5;
		border-radius: 4.75% / 3.5%;
		overflow: hidden;
		background: #000000;
	}

	/* Card Details Container with padding & flex box */
	.card-details {
		display: flex;
		flex-direction: column;
		gap: 4px;
		padding: 10px 12px 12px;
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
		background: rgba(0, 0, 0, 0.2);
		display: flex;
		align-items: flex-start;
		justify-content: flex-end;
		padding: 6px;
	}

	.check-ring {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: hsl(var(--primary));
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 2px 8px hsl(var(--primary) / 0.5);
		color: white;
		flex-shrink: 0;
	}

	/* Card metadata: uniform 14px size and foreground colors */
	.card-meta {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-size: 0.875rem;
		margin-top: 2px;
	}

	.set-info {
		display: flex;
		align-items: center;
		gap: 6px;
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	.set-code {
		font-weight: 500;
	}

	.collector-num {
		font-weight: 500;
	}

	.card-price {
		font-weight: 700;
		color: hsl(142 60% 50%);
	}

	.set-name-row {
		display: flex;
		font-size: 0.875rem;
		margin-top: 1px;
	}

	.set-name {
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	/* Skeleton */
	.skeleton-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(188px, 1fr));
		gap: 14px;
	}

	.skeleton-card {
		aspect-ratio: 2.5 / 5;
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.25);
		animation: shimmer 1.6s ease-in-out infinite;
	}

	@keyframes shimmer {
		0%,
		100% {
			opacity: 0.5;
		}
		50% {
			opacity: 1;
		}
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

	.footer-right {
		display: flex;
		align-items: center;
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

	.confirm-btn {
		padding: 8px 20px;
		background: hsl(var(--primary));
		border: 1px solid transparent;
		color: hsl(var(--primary-foreground));
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 600;
		transition: all 0.15s;
	}

	.confirm-btn:hover {
		background: hsl(var(--primary) / 0.9);
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
