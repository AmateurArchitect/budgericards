<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import { RotateCcw, SlidersHorizontal } from "lucide-svelte";

	/**
	 * @param {string} name
	 */
	function getMeta(name) {
		return deckStore.metadata[name.toLowerCase()] || {};
	}

	// Sample Hand Simulator state
	/** @type {{ id: string, name: string }[]} */
	let hand = $state([]);
	/** @type {string[]} */
	let library = $state([]);
	let mulliganCount = $state(0);

	let dealKey = $state(0);
	let isOpeningDeal = $state(true);
	let showHandOptions = $state(false);

	let cardInstanceId = 0;
	/**
	 * @param {string} name
	 * @returns {{ id: string, name: string }}
	 */
	function createHandCard(name) {
		cardInstanceId++;
		return {
			id: `card-${cardInstanceId}-${Math.random().toString(36).slice(2, 7)}`,
			name,
		};
	}

	// Drag and drop state for sample hand
	let draggingCardId = $state(/** @type {string | null} */ (null));
	let dragPointerStartX = $state(0);
	let dragPointerStartY = $state(0);
	let dragCurrentX = $state(0);
	let dragCurrentY = $state(0);
	let isCardDragging = $state(false);
	let dragHoverTargetIndex = $state(/** @type {number | null} */ (null));

	/**
	 * @param {PointerEvent} e
	 * @param {string} cardId
	 * @param {number} cardIndex
	 */
	function handleCardPointerDown(e, cardId, cardIndex) {
		if (e.button !== 0) return;
		draggingCardId = cardId;
		dragPointerStartX = e.clientX;
		dragPointerStartY = e.clientY;
		dragCurrentX = 0;
		dragCurrentY = 0;
		isCardDragging = false;
		dragHoverTargetIndex = cardIndex;

		window.addEventListener("pointermove", handleWindowPointerMove);
		window.addEventListener("pointerup", handleWindowPointerUp);
		window.addEventListener("pointercancel", handleWindowPointerUp);
	}

	/** @param {PointerEvent} e */
	function handleWindowPointerMove(e) {
		if (!draggingCardId) return;

		const dx = e.clientX - dragPointerStartX;
		const dy = e.clientY - dragPointerStartY;

		if (!isCardDragging) {
			if (Math.hypot(dx, dy) > 5) {
				isCardDragging = true;
				isOpeningDeal = false;
			} else {
				return;
			}
		}

		dragCurrentX = dx;
		dragCurrentY = dy;

		const n = hand.length;
		if (n <= 1) return;

		const mid = (n - 1) / 2;
		const stepX = Math.min(115, Math.max(34, 760 / (n - 1)));

		const sourceIndex = hand.findIndex((c) => c.id === draggingCardId);
		if (sourceIndex === -1) return;

		const sourceNominalX = (sourceIndex - mid) * stepX;
		const currentCardX = sourceNominalX + dx;

		const targetIdx = Math.max(
			0,
			Math.min(n - 1, Math.round(currentCardX / stepX + mid)),
		);
		dragHoverTargetIndex = targetIdx;
	}

	/** @param {PointerEvent} e */
	function handleWindowPointerUp(e) {
		window.removeEventListener("pointermove", handleWindowPointerMove);
		window.removeEventListener("pointerup", handleWindowPointerUp);
		window.removeEventListener("pointercancel", handleWindowPointerUp);

		if (isCardDragging && draggingCardId) {
			const sourceIndex = hand.findIndex((c) => c.id === draggingCardId);
			if (
				sourceIndex !== -1 &&
				dragHoverTargetIndex !== null &&
				dragHoverTargetIndex !== sourceIndex
			) {
				const newHand = [...hand];
				const [moved] = newHand.splice(sourceIndex, 1);
				newHand.splice(dragHoverTargetIndex, 0, moved);
				hand = newHand;
			}
		}

		draggingCardId = null;
		isCardDragging = false;
		dragCurrentX = 0;
		dragCurrentY = 0;
		dragHoverTargetIndex = null;
	}

	/** @param {MouseEvent} e */
	function handleDocumentClick(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (showHandOptions && !target.closest(".arena-options-container")) {
			showHandOptions = false;
		}
	}

	/**
	 * Seeded random float [0, 1) using mulberry32.
	 * @param {number} a
	 */
	function seededRandom(a) {
		let t = (a += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/**
	 * Checks if a card is a land based on metadata.
	 * @param {string} name
	 * @param {boolean} strict
	 */
	function isLandCard(name, strict = false) {
		const meta = getMeta(name);
		const typeLine = (meta.type_line || "").toLowerCase();
		const faces = meta.card_faces || [];
		const frontType = (faces[0]?.type_line || "").toLowerCase();
		const backType = (faces[1]?.type_line || "").toLowerCase();

		if (strict) {
			return (
				typeLine.includes("land") ||
				frontType.includes("land") ||
				backType.includes("land")
			);
		}

		if (
			typeLine.includes("land") ||
			frontType.includes("land") ||
			backType.includes("land")
		) {
			return true;
		}

		const oracle = (meta.oracle_text || "").toLowerCase();
		if (
			oracle.includes("search your library for a basic land") &&
			(meta.cmc === 1 || meta.cmc === 2)
		) {
			return true;
		}

		return false;
	}

	/**
	 * @param {string[]} cardNames
	 * @param {boolean} strict
	 */
	function countLands(cardNames, strict = false) {
		return cardNames.filter((c) => isLandCard(c, strict)).length;
	}

	/**
	 * Generates a randomized decklist and opening hand candidate.
	 * @param {string[]} fullDeck
	 * @param {number} seed
	 */
	/**
	 * Generates a randomized decklist and opening hand candidate.
	 * @param {string[]} fullDeck
	 * @param {number} seed
	 * @param {number} [handSize=7]
	 */
	function generateDecklistVariations(fullDeck, seed, handSize = 7) {
		const copy = [...fullDeck];
		for (let i = copy.length - 1; i > 0; i--) {
			const j = Math.floor(seededRandom(seed + i * 31) * (i + 1));
			[copy[i], copy[j]] = [copy[j], copy[i]];
		}
		return {
			hand: copy.slice(0, handSize),
			deck: copy.slice(handSize),
		};
	}

	/**
	 * Evaluates how close hand land ratio is to deck land ratio.
	 * @param {number} handLands
	 * @param {number} deckLands
	 * @param {number} totalCards
	 * @param {number} [handSize=7]
	 */
	function evaluateHandFit(handLands, deckLands, totalCards, handSize = 7) {
		if (totalCards === 0) return 0;
		const targetRatio = deckLands / totalCards;
		const targetLandsInHand = targetRatio * handSize;
		return Math.abs(handLands - targetLandsInHand);
	}

	/**
	 * Standard Fisher-Yates shuffle.
	 * @param {string[]} array
	 */
	function shuffleArray(array) {
		const arr = [...array];
		for (let i = arr.length - 1; i > 0; i--) {
			const j = Math.floor(Math.random() * (i + 1));
			[arr[i], arr[j]] = [arr[j], arr[i]];
		}
		return arr;
	}

	/**
	 * Draws an opening hand using optional smoother algorithm.
	 * @param {string[]} fullDeck
	 * @param {number} [handSize=7]
	 */
	function drawHand(fullDeck, handSize = 7) {
		if (handSize === 0) {
			hand = [];
			library = [...fullDeck];
			return;
		}

		if (fullDeck.length < handSize) {
			hand = fullDeck.map((n) => createHandCard(n));
			library = [];
			return;
		}

		const useSmoother = settingsStore.sampleHandSmoother;
		const strictArenaParity = settingsStore.sampleHandArenaParity;

		if (!useSmoother) {
			const shuffled = shuffleArray(fullDeck);
			hand = shuffled.slice(0, handSize).map((n) => createHandCard(n));
			library = shuffled.slice(handSize);
			return;
		}

		const totalLands = countLands(fullDeck, strictArenaParity);
		const seedA = Math.floor(Math.random() * 1000000);
		const seedB = Math.floor(Math.random() * 1000000) + 1000000;
		const seedC = Math.floor(Math.random() * 1000000) + 2000000;

		const optA = generateDecklistVariations(fullDeck, seedA, handSize);
		const optB = generateDecklistVariations(fullDeck, seedB, handSize);

		const landsA = countLands(optA.hand, strictArenaParity);
		const landsB = countLands(optB.hand, strictArenaParity);

		const fitA = evaluateHandFit(landsA, totalLands, fullDeck.length, handSize);
		const fitB = evaluateHandFit(landsB, totalLands, fullDeck.length, handSize);

		let chosen = optA;
		if (fitB < fitA) {
			chosen = optB;
		} else if (fitA === fitB && !strictArenaParity) {
			const optC = generateDecklistVariations(fullDeck, seedC, handSize);
			const landsC = countLands(optC.hand, strictArenaParity);
			const fitC = evaluateHandFit(landsC, totalLands, fullDeck.length, handSize);
			if (fitC < fitA) chosen = optC;
		}

		hand = chosen.hand.map((n) => createHandCard(n));
		library = chosen.deck;
	}

	function resetSampleHand() {
		dealKey++;
		isOpeningDeal = true;
		/** @type {string[]} */
		const decklist = [];
		/**
		 * @param {any} c
		 */
		const addCardNames = (c) => {
			for (let i = 0; i < (c.quantity || 1); i++) {
				decklist.push(c.name);
			}
		};
		deckStore.mainboard.forEach(addCardNames);
		hand = [];
		mulliganCount = 0;
		drawHand(decklist, 7);
	}

	function mulligan() {
		if (mulliganCount >= 7) return;
		dealKey++;
		isOpeningDeal = true;
		mulliganCount++;
		const targetHandSize = Math.max(0, 7 - mulliganCount);
		/** @type {string[]} */
		const decklist = [];
		/**
		 * @param {any} c
		 */
		const addCardNames = (c) => {
			for (let i = 0; i < (c.quantity || 1); i++) {
				decklist.push(c.name);
			}
		};
		deckStore.mainboard.forEach(addCardNames);
		hand = [];
		drawHand(decklist, targetHandSize);
	}

	function drawCard() {
		if (library.length > 0) {
			isOpeningDeal = false;
			hand = [...hand, createHandCard(library[0])];
			library = library.slice(1);
		}
	}

	/**
	 * @param {string} name
	 */
	function getCardImg(name) {
		const meta = getMeta(name);
		return (
			meta.image_uris?.normal ||
			meta.card_faces?.[0]?.image_uris?.normal ||
			null
		);
	}

	function manualSortHand() {
		dealKey++;
		isOpeningDeal = false;
		hand = [...hand].sort((a, b) => {
			const metaA = getMeta(a.name);
			const metaB = getMeta(b.name);
			const isLandA = (metaA.type_line || "")
				.toLowerCase()
				.includes("land");
			const isLandB = (metaB.type_line || "")
				.toLowerCase()
				.includes("land");

			if (isLandA && !isLandB) return 1;
			if (!isLandA && isLandB) return -1;

			const cmcA = metaA.cmc || 0;
			const cmcB = metaB.cmc || 0;
			if (cmcA !== cmcB) return cmcA - cmcB;

			return a.name.localeCompare(b.name);
		});
		showHandOptions = false;
	}

	// Dynamic Arena Hand Fan positioning (restored to original authentic formula)
	const handCards = $derived.by(() => {
		const n = hand.length;
		if (n === 0) return [];
		const mid = (n - 1) / 2;

		const stepX = n > 1 ? Math.min(115, Math.max(34, 760 / (n - 1))) : 0;
		const maxAngle = n > 1 ? Math.min(17, Math.max(3.5, (n - 1) * 2.8)) : 0;
		const arcDepth = n > 1 ? Math.min(42, Math.max(8, (n - 1) * 6.5)) : 0;

		const sourceIndex =
			isCardDragging && draggingCardId
				? hand.findIndex((c) => c.id === draggingCardId)
				: -1;
		const targetIndex =
			isCardDragging && dragHoverTargetIndex !== null
				? dragHoverTargetIndex
				: -1;

		return hand.map((cardItem, i) => {
			const isThisCardDragging =
				isCardDragging && cardItem.id === draggingCardId;

			let visualSlot = i;
			if (
				isCardDragging &&
				sourceIndex !== -1 &&
				targetIndex !== -1 &&
				!isThisCardDragging
			) {
				if (targetIndex > sourceIndex) {
					if (i > sourceIndex && i <= targetIndex) {
						visualSlot = i - 1;
					}
				} else if (targetIndex < sourceIndex) {
					if (i >= targetIndex && i < sourceIndex) {
						visualSlot = i + 1;
					}
				}
			}

			const norm = mid > 0 ? (visualSlot - mid) / mid : 0;
			let x = (visualSlot - mid) * stepX;
			let y = Math.pow(Math.abs(norm), 1.65) * arcDepth;
			let rot = norm * maxAngle;
			let z = visualSlot + 1;
			let scale = 1;

			if (isThisCardDragging) {
				const nominalNorm = mid > 0 ? (sourceIndex - mid) / mid : 0;
				const nominalX = (sourceIndex - mid) * stepX;
				const nominalY =
					Math.pow(Math.abs(nominalNorm), 1.65) * arcDepth;
				x = nominalX + dragCurrentX;
				y = nominalY + dragCurrentY - 14;
				rot = nominalNorm * maxAngle * 0.35;
				z = 350;
				scale = 1.08;
			}

			const delay = isOpeningDeal ? i * 33 : 0;

			return {
				id: cardItem.id,
				name: cardItem.name,
				img: getCardImg(cardItem.name),
				x: Math.round(x * 10) / 10,
				y: Math.round(y * 10) / 10,
				rot: Math.round(rot * 10) / 10,
				z,
				scale,
				delay,
				isDragging: isThisCardDragging,
				i,
			};
		});
	});

	onMount(() => {
		resetSampleHand();
		return () => {
			window.removeEventListener("pointermove", handleWindowPointerMove);
			window.removeEventListener("pointerup", handleWindowPointerUp);
			window.removeEventListener("pointercancel", handleWindowPointerUp);
		};
	});
</script>

<svelte:window onclick={handleDocumentClick} />

<!-- Sample Hand Simulator (Arena-style Fan) -->
<section id="section-sample-hand" class="stats-page-section">
	<div class="arena-hand-view">
		<!-- 1. Hand of Cards on Top -->
		{#if hand.length === 0}
			<div class="empty-arena-state">
				<p>Your opening hand is currently empty.</p>
				<button
					onclick={resetSampleHand}
					class="arena-action-btn primary"
				>
					<RotateCcw size={15} />
					<span>Draw 7-Card Hand</span>
				</button>
			</div>
		{:else}
			<div class="arena-stage">
				{#key dealKey}
					<div
						class="arena-fan"
						class:is-dragging-active={isCardDragging}
						role="list"
						aria-label="Sample Hand Cards"
					>
						{#each handCards as card (card.id)}
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="arena-card-wrapper"
								class:is-dragging={card.isDragging}
								style="--x: {card.x}px; --y: {card.y}px; --rot: {card.rot}deg; --z: {card.z}; --scale: {card.scale}; --deal-delay: {card.delay}ms;"
								title={card.name}
								role="listitem"
								onpointerdown={(e) =>
									handleCardPointerDown(e, card.id, card.i)}
							>
								{#if card.img}
									<img
										src={card.img}
										alt={card.name}
										class="arena-card-img"
										loading="eager"
										draggable="false"
									/>
								{:else}
									<div class="arena-card-fallback">
										<div class="fallback-frame">
											<span class="fallback-card-title"
												>{card.name}</span
											>
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{/key}
			</div>
		{/if}

		<!-- 2. Controls below hand with card count directly above control bar -->
		<div class="arena-controls-bar">
			<div class="arena-hand-meta">
				<span class="hand-count-text"
					>{hand.length}
					{hand.length === 1 ? "Card" : "Cards"} in Hand</span
				>
			</div>

			<div class="arena-actions">
				<button
					onclick={resetSampleHand}
					class="arena-action-btn primary"
					title="Reshuffle deck and draw an opening hand"
				>
					<RotateCcw size={14} />
					<span>New Hand</span>
				</button>

				<button
					onclick={mulligan}
					class="arena-action-btn"
					disabled={mulliganCount >= 7}
					title="Mulligan hand"
				>
					<span
						>Mulligan to {Math.max(
							0,
							7 - (mulliganCount + 1),
						)}</span
					>
				</button>

				<button
					onclick={drawCard}
					class="arena-action-btn"
					disabled={library.length === 0}
					title="Draw 1 card"
				>
					<span>Draw Card ({library.length} left)</span>
				</button>

				<div class="arena-actions-separator"></div>

				<!-- Additional Options Trigger & Menu -->
				<div class="arena-options-container">
					<button
						onclick={(e) => {
							e.stopPropagation();
							showHandOptions = !showHandOptions;
						}}
						class="arena-action-btn icon-only"
						class:active={showHandOptions}
						class:smoother-active={settingsStore.sampleHandSmoother}
						title={settingsStore.sampleHandSmoother
							? "Sample Hand Options (Hand Smoother On)"
							: "Sample Hand Options"}
						aria-label="Sample Hand Options"
						aria-expanded={showHandOptions}
					>
						<SlidersHorizontal size={14} />
					</button>

					{#if showHandOptions}
						<div
							class="arena-options-menu"
							transition:fly={{ y: 4, duration: 150 }}
							onclick={(e) => e.stopPropagation()}
							onkeydown={(e) => e.stopPropagation()}
							role="dialog"
							tabindex="-1"
						>
							<div class="options-menu-header">Hand Options</div>

							<div class="options-menu-item">
								<div class="options-item-info">
									<span class="options-item-title"
										>Hand Smoother</span
									>
									<span class="options-item-desc"
										>MTG Arena opening hand algorithm</span
									>
								</div>
								<label class="switch">
									<input
										type="checkbox"
										bind:checked={
											settingsStore.sampleHandSmoother
										}
										onchange={() => resetSampleHand()}
									/>
									<span class="slider"></span>
								</label>
							</div>

							<div class="options-menu-divider"></div>

							<div
								class="options-menu-item"
								class:disabled={!settingsStore.sampleHandSmoother}
							>
								<div class="options-item-info">
									<span class="options-item-title"
										>Arena Parity</span
									>
									<span class="options-item-desc"
										>Strictly count only actual lands</span
									>
								</div>
								<label class="switch">
									<input
										type="checkbox"
										bind:checked={
											settingsStore.sampleHandArenaParity
										}
										disabled={!settingsStore.sampleHandSmoother}
										onchange={() => resetSampleHand()}
									/>
									<span class="slider"></span>
								</label>
							</div>

							<div class="options-menu-divider"></div>

							<button
								type="button"
								class="options-menu-btn"
								onclick={manualSortHand}
							>
								<span>Sort by Mana Value</span>
							</button>
						</div>
					{/if}
				</div>
			</div>
		</div>
	</div>
</section>

<style>
	.stats-page-section {
		scroll-margin-top: 2rem;
		width: 100%;
	}

	/* Arena-style Sample Hand */
	.arena-hand-view {
		width: 100%;
		max-width: 1400px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1rem;
		padding: 1rem 2rem 2rem 2rem;
		position: relative;
	}

	.arena-controls-bar {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
		margin-top: 1rem;
		z-index: 10;
		font-variant-numeric: tabular-nums;
	}

	.arena-hand-meta {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.hand-count-text {
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		font-variant-numeric: tabular-nums;
		user-select: none;
		letter-spacing: 0.01em;
	}

	.arena-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: hsl(var(--card) / 0.6);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		padding: 4px;
		border-radius: 9999px;
		box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
	}

	.arena-action-btn {
		height: 32px;
		background: transparent;
		border: 1px solid transparent;
		color: hsl(var(--muted-foreground));
		padding: 0 0.85rem;
		border-radius: 9999px;
		font-size: 0.8125rem;
		font-weight: 500;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		white-space: nowrap;
		box-sizing: border-box;
		font-variant-numeric: tabular-nums;
	}

	.arena-action-btn:hover:not(:disabled) {
		background: hsl(var(--foreground) / 0.08);
		color: hsl(var(--foreground));
	}

	.arena-action-btn:active:not(:disabled) {
		transform: scale(0.97);
	}

	.arena-action-btn.primary {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.35);
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.arena-action-btn.primary:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.25);
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--primary));
	}

	.arena-action-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.arena-action-btn.icon-only {
		width: 32px;
		height: 32px;
		padding: 0;
		border-radius: 9999px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
	}

	.arena-action-btn.icon-only:hover:not(:disabled) {
		background: hsl(var(--foreground) / 0.1);
		color: hsl(var(--foreground));
	}

	.arena-action-btn.icon-only.active {
		background: hsl(var(--foreground) / 0.14);
		color: hsl(var(--foreground));
		border-color: hsl(var(--foreground) / 0.2);
	}

	.arena-action-btn.icon-only.smoother-active {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.35);
		color: hsl(var(--primary));
	}

	.arena-action-btn.icon-only.smoother-active:hover:not(:disabled),
	.arena-action-btn.icon-only.smoother-active.active {
		background: hsl(var(--primary) / 0.25);
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--primary));
	}

	.arena-actions-separator {
		width: 1px;
		height: 18px;
		background: hsl(var(--border) / 0.7);
		margin: 0 2px;
		flex-shrink: 0;
	}

	.arena-options-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.arena-options-menu {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		z-index: 50;
		width: 290px;
		background: #0f131a;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		padding: 12px 14px;
		box-shadow:
			0 12px 30px -4px rgba(0, 0, 0, 0.6),
			0 4px 12px rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.options-menu-header {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground) / 0.8);
		padding: 0 0 2px 0;
	}

	.options-menu-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		margin: 2px 0;
	}

	.options-menu-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 4px 0;
		transition: opacity 0.15s ease;
	}

	.options-menu-item.disabled {
		opacity: 0.35;
		pointer-events: none;
	}

	.options-item-info {
		display: flex;
		flex-direction: column;
		gap: 2px;
		flex: 1;
		min-width: 0;
	}

	.options-item-title {
		font-size: 0.8125rem;
		font-weight: 500;
		color: #f1f5f9;
		line-height: 1.25;
	}

	.options-item-desc {
		font-size: 0.7rem;
		color: #94a3b8;
		line-height: 1.35;
	}

	.options-menu-btn {
		width: 100%;
		background: hsl(var(--foreground) / 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #f1f5f9;
		padding: 6px 10px;
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		box-sizing: border-box;
	}

	.options-menu-btn:hover {
		background: hsl(var(--foreground) / 0.12);
		border-color: rgba(255, 255, 255, 0.18);
	}

	.switch {
		position: relative;
		display: inline-block;
		width: 34px;
		height: 20px;
		flex-shrink: 0;
		cursor: pointer;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
		position: absolute;
	}

	.slider {
		position: absolute;
		cursor: pointer;
		inset: 0;
		background-color: hsl(var(--muted) / 0.8);
		transition: 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		border-radius: 9999px;
		border: 1px solid hsl(var(--border));
	}

	.slider:before {
		position: absolute;
		content: "";
		height: 14px;
		width: 14px;
		left: 2px;
		bottom: 2px;
		background-color: hsl(var(--muted-foreground));
		transition: 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
	}

	input:checked + .slider {
		background-color: hsl(var(--primary) / 0.25);
		border-color: hsl(var(--primary) / 0.6);
	}

	input:checked + .slider:before {
		transform: translateX(14px);
		background-color: hsl(var(--primary));
	}

	.empty-arena-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 1.25rem;
		padding: 6rem 2rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.95rem;
	}

	/* Arena Stage & Curved Fan */
	.arena-stage {
		position: relative;
		width: 100%;
		max-width: 1200px;
		height: 380px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: visible;
		margin-top: 0;
	}

	.arena-fan {
		position: relative;
		width: 100%;
		height: 340px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: visible;
	}

	.arena-fan.is-dragging-active .arena-card-wrapper:not(.is-dragging) {
		pointer-events: none;
	}

	@keyframes dealCard {
		0% {
			opacity: 0;
			transform: translate3d(
					calc(var(--x) * 0.57),
					calc(var(--y) + 79px),
					0
				)
				rotate(calc(var(--rot) * 0.48)) scale(0.82);
		}
		50% {
			opacity: 1;
		}
		100% {
			opacity: 1;
			transform: translate3d(var(--x), var(--y), 0) rotate(var(--rot))
				scale(1);
		}
	}

	.arena-card-wrapper {
		position: absolute;
		left: 50%;
		top: 35px;
		width: 215px;
		height: 300px;
		margin-left: -107.5px;
		margin-top: 0;
		transform-origin: 50% 120%;
		transform: translate3d(var(--x), var(--y), 0) rotate(var(--rot))
			scale(var(--scale, 1));
		z-index: var(--z);
		animation: dealCard 0.33s cubic-bezier(0.18, 0.89, 0.32, 1.15) backwards;
		animation-delay: var(--deal-delay, 0ms);
		transition:
			transform 0.22s cubic-bezier(0.2, 0, 0, 1),
			box-shadow 0.22s ease,
			z-index 0.05s step-end;
		cursor: grab;
		touch-action: none;
		border-radius: 11px;
		user-select: none;
		-webkit-user-select: none;
		box-shadow:
			0 12px 28px -6px rgba(0, 0, 0, 0.8),
			0 4px 10px -2px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.08);
	}

	.arena-card-wrapper:hover:not(.is-dragging) {
		transform: translate3d(var(--x), calc(var(--y) - 8px), 0)
			rotate(var(--rot)) scale(1.04);
		z-index: 100 !important;
		transition:
			transform 0.22s cubic-bezier(0.2, 0, 0, 1),
			box-shadow 0.22s ease,
			z-index 0s;
		box-shadow:
			0 18px 36px -8px rgba(0, 0, 0, 0.85),
			0 8px 16px -4px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.18);
	}

	.arena-card-wrapper.is-dragging {
		cursor: grabbing !important;
		transition: none !important;
		box-shadow:
			0 26px 54px -8px rgba(0, 0, 0, 0.95),
			0 12px 28px -4px rgba(0, 0, 0, 0.7),
			0 0 0 1px rgba(255, 255, 255, 0.25) !important;
	}

	.arena-card-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
		border-radius: 11px;
		pointer-events: none;
	}

	.arena-card-fallback {
		width: 100%;
		height: 100%;
		border-radius: 11px;
		background: #11141a;
		border: 4px solid #1a202c;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		box-sizing: border-box;
	}

	.fallback-frame {
		width: 100%;
		height: 100%;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.02);
		text-align: center;
	}

	.fallback-card-title {
		font-size: 0.85rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		line-height: 1.3;
	}

	@media (max-width: 900px) {
		.arena-card-wrapper {
			width: 170px;
			height: 238px;
			margin-left: -85px;
			margin-top: -95px;
		}
		.arena-stage {
			height: 400px;
		}
	}
</style>
