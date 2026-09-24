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

<div class="more-container">
	{#if settingsStore.statsSubTab === "sample-hand"}
		<!-- Sample Hand Simulator (Arena-style Fan) -->
		<div class="arena-hand-view">
			<div class="arena-controls-bar">
				<div class="arena-hand-meta">
					<span class="hand-count-text"
						>{hand.length} card{hand.length === 1 ? "" : "s"} in hand</span
					>
					<span class="library-count-text"
						>{library.length} remaining in library</span
					>
					{#if mulliganCount > 0}
						<span class="mulligan-badge"
							>Mulligan ({mulliganCount})</span
						>
					{/if}
				</div>

				<div class="arena-buttons">
					<button
						class="arena-btn primary-arena-btn"
						onclick={resetSampleHand}
						title="Shuffle library and draw 7 cards"
					>
						<RotateCcw size={14} />
						New Hand
					</button>

					<button
						class="arena-btn"
						onclick={mulligan}
						disabled={hand.length === 0}
						title="Take a mulligan (draws 7 - mulligan count)"
					>
						Mulligan
					</button>

					<button
						class="arena-btn"
						onclick={drawCard}
						disabled={library.length === 0}
						title="Draw 1 card from library"
					>
						Draw Card
					</button>

					<button
						class="arena-btn"
						onclick={manualSortHand}
						disabled={hand.length <= 1}
						title="Sort Hand (Spells by descending CMC, then nonbasics, then basics WUBRG)"
					>
						Sort Hand
					</button>

					<!-- Options Button & Popover -->
					<div class="arena-options-container">
						<button
							class="arena-btn options-btn"
							class:active={showHandOptions}
							onclick={(e) => {
								e.stopPropagation();
								showHandOptions = !showHandOptions;
							}}
							title="Sample Hand Settings"
							aria-label="Sample Hand Settings"
						>
							<SlidersHorizontal size={14} />
						</button>

						{#if showHandOptions}
							<div
								class="arena-options-popover"
								transition:fly={{ y: -6, duration: 150 }}
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => e.stopPropagation()}
								role="dialog"
								tabindex="-1"
							>
								<div class="popover-header">
									<SlidersHorizontal size={13} />
									<span>Algorithm Settings</span>
								</div>

								<div class="popover-body">
									<label class="toggle-option-row">
										<div class="toggle-text-block">
											<span class="toggle-title"
												>Hand Smoother (Bo1)</span
											>
											<span class="toggle-desc"
												>Emulate MTG Arena best-of-one
												opening hand algorithm</span
											>
										</div>
										<input
											type="checkbox"
											class="toggle-checkbox"
											bind:checked={settingsStore.sampleHandSmoother}
											onchange={() => resetSampleHand()}
										/>
									</label>

									<label
										class="toggle-option-row"
										class:disabled={!settingsStore.sampleHandSmoother}
									>
										<div class="toggle-text-block">
											<span class="toggle-title"
												>Strict Arena Parity</span
											>
											<span class="toggle-desc"
												>Ignore custom land heuristics
												(Moxen/cyclers) and strictly
												count land types</span
											>
										</div>
										<input
											type="checkbox"
											class="toggle-checkbox"
											disabled={!settingsStore.sampleHandSmoother}
											bind:checked={settingsStore.sampleHandArenaParity}
											onchange={() => resetSampleHand()}
										/>
									</label>
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			{#if hand.length === 0}
				<div class="arena-empty-state">
					<p>No cards in hand. Click "New Hand" to draw.</p>
				</div>
			{:else}
				<div
					class="arena-stage"
					class:pointer-active-global={isCardDragging}
				>
					{#key dealKey}
						<div class="arena-card-fan">
							{#each handCards as card, index (card.id)}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="arena-card-slot"
									class:is-dragging={card.isDragging}
									class:pointer-active={isCardDragging}
									style="
										--target-x: {card.x}px;
										--target-y: {card.y}px;
										--target-rot: {card.rot}deg;
										--target-z: {card.z};
										--target-scale: {card.scale};
										--deal-delay: {card.delay}ms;
									"
									onpointerdown={(e) =>
										handleCardPointerDown(
											e,
											card.id,
											index,
										)}
								>
									{#if card.img}
										<img
											src={card.img}
											alt={card.name}
											class="arena-card-img"
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

	/* Arena Sample Hand Styles */
	.arena-hand-view {
		display: flex;
		flex-direction: column;
		height: calc(100vh - 120px);
		min-height: 600px;
		background: radial-gradient(
			circle at 50% 120%,
			hsl(var(--card) / 0.35) 0%,
			transparent 75%
		);
		border-radius: var(--radius-lg);
		border: 1px solid hsl(var(--border) / 0.3);
		overflow: hidden;
		position: relative;
	}

	.arena-controls-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.5rem;
		background: hsl(var(--card) / 0.4);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		z-index: 100;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.arena-hand-meta {
		display: flex;
		align-items: center;
		gap: 1rem;
		font-size: 0.875rem;
	}

	.hand-count-text {
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.library-count-text {
		color: hsl(var(--muted-foreground));
	}

	.mulligan-badge {
		background: hsl(var(--destructive) / 0.2);
		color: hsl(var(--destructive));
		border: 1px solid hsl(var(--destructive) / 0.4);
		padding: 0.15rem 0.5rem;
		border-radius: var(--radius-sm);
		font-size: 0.75rem;
		font-weight: 600;
	}

	.arena-buttons {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.arena-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.45rem 0.9rem;
		font-size: 0.825rem;
		font-weight: 500;
		border-radius: var(--radius-md);
		background: hsl(var(--secondary) / 0.6);
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border) / 0.6);
		cursor: pointer;
		transition: all 0.15s ease;
		user-select: none;
	}

	.arena-btn:hover:not(:disabled) {
		background: hsl(var(--secondary));
		border-color: hsl(var(--border));
		transform: translateY(-1px);
	}

	.arena-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.arena-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.primary-arena-btn {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.primary-arena-btn:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.9);
		border-color: hsl(var(--primary) / 0.9);
	}

	.arena-options-container {
		position: relative;
	}

	.options-btn {
		padding: 0.45rem;
	}

	.options-btn.active {
		background: hsl(var(--secondary));
		border-color: hsl(var(--primary) / 0.6);
		color: hsl(var(--primary));
	}

	.arena-options-popover {
		position: absolute;
		top: calc(100% + 8px);
		right: 0;
		width: 310px;
		background: hsl(var(--card) / 0.95);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
		padding: 1rem;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 0.85rem;
	}

	.popover-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
	}

	.popover-body {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.toggle-option-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.75rem;
		cursor: pointer;
		user-select: none;
	}

	.toggle-option-row.disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.toggle-text-block {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
	}

	.toggle-title {
		font-size: 0.825rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.toggle-desc {
		font-size: 0.725rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.35;
	}

	.toggle-checkbox {
		width: 16px;
		height: 16px;
		accent-color: hsl(var(--primary));
		cursor: pointer;
		margin-top: 2px;
	}

	.toggle-option-row.disabled .toggle-checkbox {
		cursor: not-allowed;
	}

	.arena-empty-state {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
		font-size: 1rem;
	}

	.arena-stage {
		flex: 1;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		padding-bottom: 3.5rem;
		overflow: hidden;
		position: relative;
		user-select: none;
		touch-action: none;
	}

	.arena-card-fan {
		position: relative;
		width: 1px;
		height: 380px;
		display: flex;
		align-items: flex-end;
		justify-content: center;
		pointer-events: none;
	}

	.arena-card-slot {
		position: absolute;
		bottom: 0;
		width: 250px;
		aspect-ratio: 5 / 7;
		pointer-events: auto;
		cursor: grab;
		touch-action: none;
		transform-origin: 50% 120%;
		transform: translate(var(--target-x), var(--target-y))
			rotate(var(--target-rot)) scale(var(--target-scale));
		z-index: var(--target-z);
		transition:
			transform 0.38s cubic-bezier(0.18, 0.89, 0.32, 1.15),
			box-shadow 0.25s ease,
			filter 0.2s ease;
		animation: arenaDealIn 0.45s cubic-bezier(0.16, 1, 0.3, 1) both;
		animation-delay: var(--deal-delay);
		will-change: transform;
	}

	.arena-card-slot.pointer-active {
		transition:
			transform 0.18s cubic-bezier(0.2, 0.8, 0.25, 1),
			box-shadow 0.15s ease;
	}

	.arena-card-slot.is-dragging {
		cursor: grabbing;
		transition: none !important;
		filter: drop-shadow(0 24px 38px rgba(0, 0, 0, 0.75))
			drop-shadow(0 8px 16px rgba(0, 0, 0, 0.5));
		animation: none !important;
	}

	.arena-card-slot:hover:not(.is-dragging):not(.pointer-active) {
		transform: translate(var(--target-x), calc(var(--target-y) - 52px))
			rotate(0deg) scale(1.15) !important;
		z-index: 400 !important;
		filter: drop-shadow(0 20px 32px rgba(0, 0, 0, 0.65))
			drop-shadow(0 4px 10px rgba(0, 0, 0, 0.4));
	}

	.arena-card-img {
		width: 100%;
		height: 100%;
		border-radius: 12px;
		object-fit: cover;
		pointer-events: none;
		user-select: none;
		box-shadow:
			0 4px 16px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.08);
	}

	.arena-card-fallback {
		width: 100%;
		height: 100%;
		background: #1e2025;
		border: 2px solid #3a3f4b;
		border-radius: 12px;
		padding: 10px;
		box-sizing: border-box;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
	}

	.fallback-frame {
		width: 100%;
		height: 100%;
		border: 1px solid #4a5160;
		border-radius: 8px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 12px;
		box-sizing: border-box;
		text-align: center;
		background: linear-gradient(135deg, #181a1f 0%, #252830 100%);
	}

	.fallback-card-title {
		font-size: 0.95rem;
		font-weight: 600;
		color: #e0e4eb;
		line-height: 1.3;
	}

	@keyframes arenaDealIn {
		0% {
			opacity: 0;
			transform: translate(var(--target-x), 160px) rotate(0deg) scale(0.65);
		}
		100% {
			opacity: 1;
			transform: translate(var(--target-x), var(--target-y))
				rotate(var(--target-rot)) scale(var(--target-scale));
		}
	}
</style>
