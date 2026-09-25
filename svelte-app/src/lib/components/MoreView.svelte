<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { onMount } from "svelte";
	import { fly } from "svelte/transition";
	import {
		Loader,
		RotateCcw,
		AlertTriangle,
		SlidersHorizontal,
	} from "lucide-svelte";

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

	// 1. Sample Hand Simulator
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

	/**
	 * Returns the effective land value of a card name according to current settings.
	 * @param {string} cardName
	 * @param {boolean} strictParity
	 * @returns {number}
	 */
	function getCardLandValue(cardName, strictParity) {
		const meta = getMeta(cardName);
		const typeLine = (meta.type_line || "").toLowerCase();

		if (strictParity) {
			const isLand = (
				meta.card_faces?.[0]?.type_line ||
				typeLine.split("//")[0] ||
				typeLine
			).includes("land");
			return isLand ? 1.0 : 0.0;
		}

		const cleanName = cardName
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.trim();

		// Full land overrides (1.0)
		const fullLandOverrides = new Set([
			"mox pearl",
			"mox sapphire",
			"mox jet",
			"mox ruby",
			"mox emerald",
			"black lotus",
			"blacker lotus",
			"jeweled lotus",
			"sol ring",
			"mana crypt",
		]);

		if (fullLandOverrides.has(cleanName)) {
			return 1.0;
		}

		// Half land overrides (0.5)
		const lotr1ManaLandcyclers = new Set([
			"lorien revealed",
			"troll of khazad-dum",
			"oliphaunt",
			"generous ent",
			"eagles of the north",
		]);

		if (lotr1ManaLandcyclers.has(cleanName)) {
			return 0.5;
		}

		if (cleanName === "chrome mox" || cleanName === "mox diamond") {
			return 0.5;
		}

		// Modal Double Faced Lands (MDFCs)
		if (typeLine.includes("//")) {
			const faces = typeLine
				.split("//")
				.map((/** @type {string} */ s) => s.trim());
			const frontIsLand = faces[0].includes("land");
			const backIsLand = faces.length > 1 && faces[1].includes("land");

			if (frontIsLand && backIsLand) {
				return 1.0;
			} else if (!frontIsLand && backIsLand) {
				return 0.5;
			}
		}

		if (meta.card_faces && meta.card_faces.length > 1) {
			const frontLand = (meta.card_faces[0]?.type_line || "")
				.toLowerCase()
				.includes("land");
			const backLand = (meta.card_faces[1]?.type_line || "")
				.toLowerCase()
				.includes("land");
			if (frontLand && backLand) {
				return 1.0;
			} else if (!frontLand && backLand) {
				return 0.5;
			}
		}

		return typeLine.includes("land") ? 1.0 : 0.0;
	}

	const BASIC_LAND_NAMES = new Set([
		"plains",
		"island",
		"swamp",
		"mountain",
		"forest",
		"wastes",
		"snow-covered plains",
		"snow-covered island",
		"snow-covered swamp",
		"snow-covered mountain",
		"snow-covered forest",
	]);

	/**
	 * @param {string} name
	 * @param {any} meta
	 * @returns {boolean}
	 */
	function isBasicLand(name, meta) {
		const typeLine = (meta.type_line || "").toLowerCase();
		if (typeLine.includes("basic")) return true;
		const cleanName = name
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "")
			.trim();
		return BASIC_LAND_NAMES.has(cleanName);
	}

	/**
	 * Returns the WUBRG order index (0 to 5) for basic lands.
	 * @param {string} name
	 * @returns {number}
	 */
	function getBasicLandOrder(name) {
		const n = name
			.toLowerCase()
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/g, "");
		if (n.includes("plains")) return 0; // W
		if (n.includes("island")) return 1; // U
		if (n.includes("swamp")) return 2; // B
		if (n.includes("mountain")) return 3; // R
		if (n.includes("forest")) return 4; // G
		if (n.includes("wastes")) return 5; // C
		return 6;
	}

	/**
	 * Sorts cards: highest mana value on left descending, then nonbasic lands (alphabetical), then basic lands on far right (WUBRG).
	 * @param {{ id: string, name: string }[]} cards
	 * @returns {{ id: string, name: string }[]}
	 */
	function sortHandCards(cards) {
		return [...cards].sort((a, b) => {
			const metaA = getMeta(a.name);
			const metaB = getMeta(b.name);
			const aIsLand = (metaA.type_line || "")
				.toLowerCase()
				.includes("land");
			const bIsLand = (metaB.type_line || "")
				.toLowerCase()
				.includes("land");

			if (!aIsLand && bIsLand) return -1;
			if (aIsLand && !bIsLand) return 1;

			if (!aIsLand && !bIsLand) {
				const cmcA = metaA.cmc ?? 0;
				const cmcB = metaB.cmc ?? 0;
				if (cmcB !== cmcA) return cmcB - cmcA;
				return a.name.localeCompare(b.name);
			}

			const aIsBasic = isBasicLand(a.name, metaA);
			const bIsBasic = isBasicLand(b.name, metaB);

			if (!aIsBasic && bIsBasic) return -1;
			if (aIsBasic && !bIsBasic) return 1;

			if (!aIsBasic && !bIsBasic) {
				return a.name.localeCompare(b.name);
			}

			const orderA = getBasicLandOrder(a.name);
			const orderB = getBasicLandOrder(b.name);
			if (orderA !== orderB) return orderA - orderB;
			return a.name.localeCompare(b.name);
		});
	}

	function manualSortHand() {
		isOpeningDeal = false;
		hand = sortHandCards(hand);
	}

	/**
	 * @param {any[]} cards
	 * @param {boolean} strictParity
	 * @returns {number}
	 */
	function countLands(cards, strictParity) {
		return cards.reduce((/** @type {number} */ sum, c) => {
			const name = typeof c === "string" ? c : c.name;
			return sum + getCardLandValue(name, strictParity);
		}, 0);
	}

	/**
	 * @param {string[]} decklist
	 */
	function drawHand(decklist) {
		const toDraw = Math.max(7 - mulliganCount, 0);
		if (toDraw === 0 || decklist.length === 0) {
			hand = [];
			library = shuffle(decklist);
			return;
		}

		if (decklist.length <= toDraw || !settingsStore.sampleHandSmoother) {
			const shuffled = shuffle(decklist);
			const rawHand = shuffled.slice(0, toDraw).map(createHandCard);
			hand = sortHandCards(rawHand);
			library = shuffled.slice(toDraw);
			return;
		}

		const strictParity = settingsStore.sampleHandArenaParity;
		const totalLands = countLands(decklist, strictParity);
		const lAvg = toDraw * (totalLands / decklist.length);

		/** @type {{ shuffled: string[], hand: string[], weight: number }[]} */
		const candidates = [];
		for (let i = 0; i < 3; i++) {
			const candidateShuffled = shuffle(decklist);
			const candidateHand = candidateShuffled.slice(0, toDraw);
			const l = countLands(candidateHand, strictParity);
			const delta = Math.abs(l - lAvg);
			const weight = Math.pow(4, -Math.pow(delta, 2.5));
			candidates.push({
				shuffled: candidateShuffled,
				hand: candidateHand,
				weight: Math.max(weight, 1e-9),
			});
		}

		const totalWeight = candidates.reduce(
			(/** @type {number} */ sum, c) => sum + c.weight,
			0,
		);
		const rand = Math.random() * totalWeight;
		let cumulative = 0;
		let chosen = candidates[0];
		for (const candidate of candidates) {
			cumulative += candidate.weight;
			if (rand <= cumulative) {
				chosen = candidate;
				break;
			}
		}

		const rawHand = chosen.hand.map(createHandCard);
		hand = sortHandCards(rawHand);
		library = chosen.shuffled.slice(toDraw);
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
		drawHand(decklist);
	}

	function mulligan() {
		dealKey++;
		isOpeningDeal = true;
		mulliganCount++;
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
		drawHand(decklist);
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

	// 2. Required Tokens Finder (Scryfall metadata all_parts)
	const requiredTokens = $derived.by(() => {
		/** @type {any[]} */
		const tokens = [];
		const seen = new Set();
		activeCards.forEach((c) => {
			const meta = getMeta(c.name);
			if (meta.all_parts) {
				/**
				 * @param {any} part
				 */
				const processPart = (part) => {
					if (part.component === "token" && !seen.has(part.name)) {
						seen.add(part.name);
						tokens.push({
							name: part.name,
							image_uri:
								part.image_uris?.normal ||
								part.image_uris?.large ||
								null,
						});
					}
				};
				meta.all_parts.forEach(processPart);
			}
		});
		return tokens;
	});

	// 3. Combos Finder (Commander Spellbook API)
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

	onMount(() => {
		resetSampleHand();
		return () => {
			window.removeEventListener("pointermove", handleWindowPointerMove);
			window.removeEventListener("pointerup", handleWindowPointerUp);
			window.removeEventListener("pointercancel", handleWindowPointerUp);
		};
	});

	$effect(() => {
		if (settingsStore.statsSubTab === "combos") {
			loadCombos();
		}
	});

	// Default subtab when landing in 'more' if not already set
	$effect(() => {
		if (
			settingsStore.statsSubTab !== "sample-hand" &&
			settingsStore.statsSubTab !== "tokens" &&
			settingsStore.statsSubTab !== "combos"
		) {
			settingsStore.statsSubTab = "sample-hand";
		}
	});
</script>

<svelte:window onclick={handleDocumentClick} />

<div class="more-container" class:sample-hand-mode={settingsStore.statsSubTab === "sample-hand"}>
	{#if settingsStore.statsSubTab === "sample-hand"}
		<!-- Sample Hand Simulator (Arena-style Fan) -->
		<div class="arena-hand-view">
			<div class="arena-controls-bar">
				<div class="arena-hand-meta">
					<span class="hand-count-text"
						>{hand.length} {hand.length === 1 ? "Card" : "Cards"} in Hand</span
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
						<span>Mulligan to {Math.max(0, 7 - (mulliganCount + 1))}</span>
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
								<div class="options-menu-header">
									Hand Options
								</div>

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
										handleCardPointerDown(
											e,
											card.id,
											card.i,
										)}
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
												<span
													class="fallback-card-title"
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
								<img
									src={token.image_uri}
									alt={token.name}
									class="token-img"
								/>
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
	{/if}
</div>

<style>
	.more-container {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		background: transparent;
		font-family: var(--font-sans), sans-serif;
	}

	.more-container.sample-hand-mode {
		padding: 0.5rem 1rem 2rem;
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

	/* Tokens Grid */
	.tokens-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 1.5rem;
	}

	.token-card-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
	}

	.token-img {
		width: 100%;
		aspect-ratio: 5 / 7;
		border-radius: var(--radius-md);
		object-fit: cover;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: transform 0.2s ease;
	}

	.token-img:hover {
		transform: translateY(-4px) scale(1.02);
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

	.token-title {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		text-align: center;
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

	/* Arena-style Sample Hand */
	.arena-hand-view {
		width: 100%;
		max-width: 1400px;
		margin: 0 auto;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 0.25rem 1rem 2rem;
		position: relative;
	}

	.arena-controls-bar {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		flex-wrap: wrap;
		margin-bottom: 0.75rem;
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
		height: 400px;
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
