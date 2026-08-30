<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { toastStore } from "$lib/stores/toast.svelte.js";

	/** @type {{ card: any, price: number | null, zone?: string, inSearchPanel?: boolean, disableTooltip?: boolean, onclick?: (e: MouseEvent | KeyboardEvent) => void, class?: string, style?: string, children: import('svelte').Snippet<[any]> }} */
	let { card, price, zone, inSearchPanel = false, disableTooltip = false, onclick = undefined, class: className = "", style = "", children } = $props();

	const meta = $derived(card.type_line ? card : (deckStore.metadata[card.name?.toLowerCase()] || card));

	let isDragging = $state(false);
	let isFlipped = $state(false);
	let isRotated = $state(false);

	/** @type {HTMLCanvasElement | null} */
	let blankDragImage = null;
	function getBlankDragImage() {
		if (!blankDragImage && typeof document !== "undefined") {
			blankDragImage = document.createElement("canvas");
			blankDragImage.width = 1;
			blankDragImage.height = 1;
		}
		return blankDragImage;
	}

	/** @param {MouseEvent | KeyboardEvent} e */
	function handleLeftClick(e) {
		// Ignore clicks on the quantity badge to prevent conflicting actions
		if (e.target instanceof HTMLElement && e.target.closest('.stack-badge')) return;

		const isLocalBoard = ["sideboard", "maybeboard"].includes(
			searchStore.collection,
		);
		const currentBoard = zone || searchStore.collection;

		const isAddShortcut = e.altKey;
		const isMultiSelectToggle = e.metaKey || (e.ctrlKey && !e.altKey);
		const isRangeSelect = e.shiftKey;

		if (isAddShortcut) {
			deckStore.addCard(card.name, deckStore.activeBoard, price, card);
			return;
		}

		if (!inSearchPanel && (isMultiSelectToggle || isRangeSelect || interactionStore.selectedCells.size > 0)) {
			e.stopPropagation();
			e.preventDefault();
			interactionStore.handleCardSelectClick(card.id, isRangeSelect, isMultiSelectToggle);
			return;
		}

		if (!inSearchPanel && interactionStore.sideboardExpanded) {
			const currentBoardName = zone || deckStore.activeBoard;
			if (currentBoardName === "sideboard") {
				deckStore.moveCard(card.name, "sideboard", "mainboard", card.id, price);
			} else {
				deckStore.moveCard(card.name, currentBoardName, "sideboard", card.id, price);
			}
			return;
		}

		if (inSearchPanel && isLocalBoard) {
			deckStore.moveCard(
				card.name,
				currentBoard,
				deckStore.activeBoard,
				card.id,
				price,
			);
		} else if (
			!inSearchPanel &&
			isLocalBoard
		) {
			deckStore.moveCard(
				card.name,
				deckStore.activeBoard,
				currentBoard,
				card.id,
				price,
			);
		} else if (inSearchPanel) {
			let targetBoard = deckStore.activeBoard;

			// Smart Landing Logic: If special slots are empty and card is a candidate, send it there
			const typeLine = (meta.type_line || "").toLowerCase();
			const oracle = (meta.oracle_text || "").toLowerCase();
			const facesOracle = (meta.card_faces || [])
				.map((/** @type {any} */ f) => (f.oracle_text || "").toLowerCase())
				.join(" ");

			const isLegendaryCreature =
				typeLine.includes("legendary") && typeLine.includes("creature");
			const isPlaneswalker = typeLine.includes("planeswalker");
			const canBeCommander =
				oracle.includes("can be your commander") ||
				facesOracle.includes("can be your commander");
			const isCompanion =
				oracle.includes("companion —") ||
				facesOracle.includes("companion —");
			const isCommanderFormat = [
				"Commander",
				"Brawl",
				"Oathbreaker",
			].includes(deckStore.format);

			const isCommanderCandidate =
				isLegendaryCreature ||
				canBeCommander ||
				(deckStore.format === "Brawl" && isPlaneswalker);

			const isDeckEmpty = deckStore.totalCount === 0;
			const isFormatUnset = !deckStore.format || deckStore.format === "List" || deckStore.format === "None" || deckStore.format === "Draft";

			if (isDeckEmpty && isFormatUnset && isCommanderCandidate) {
				deckStore.format = "Commander";
				targetBoard = "commander";
				toastStore.show(`Set format to Commander with ${card.name} as your commander.`);
			} else if (
				isCommanderFormat &&
				deckStore.commander.length === 0 &&
				isCommanderCandidate
			) {
				targetBoard = "commander";
			} else if (isCompanion && deckStore.companion.length === 0) {
				targetBoard = "companion";
			}

			// Trigger Animation
			const target = /** @type {HTMLElement} */ (e.currentTarget);
			const rect = target.getBoundingClientRect();
			interactionStore.triggerMoveAnimation(card, rect, targetBoard);

			// Delay adding to store so it appears to "land" at the end of the animation
			setTimeout(() => {
				deckStore.addCard(card.name, targetBoard, price, card);
			}, 200);
		} else {
			deckStore.removeCard(card.name, zone || deckStore.activeBoard, card.id);
		}
	}

	/** @param {DragEvent} e */
	function handleDragStart(e) {
		if (!e.dataTransfer) return;
		e.dataTransfer.effectAllowed = "copyMove";

		// Suppress browser default translucent drag ghost
		const blank = getBlankDragImage();
		if (blank && e.dataTransfer.setDragImage) {
			e.dataTransfer.setDragImage(blank, 0, 0);
		}

		const isSelected = !inSearchPanel && [...interactionStore.selectedCells].some(cell => cell.startsWith(card.id + ":"));
		let selectedCards = [];
		if (isSelected) {
			const selectedIds = new Set(
				[...interactionStore.selectedCells].map(cell => cell.split(':')[0])
			);
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const id of selectedIds) {
				for (const board of boards) {
					const boardArray = (/** @type {any} */ (deckStore))[board];
					if (boardArray) {
						const found = boardArray.find((/** @type {any} */ c) => c.id === id);
						if (found) {
							selectedCards.push({
								name: found.name,
								price: found.price,
								id: found.id,
								fromDeck: true,
								sourceBoard: board,
								card: found
							});
							break;
						}
					}
				}
			}
		}

		const data = {
			name: card.name,
			price: price,
			id: card.id,
			fromDeck: !inSearchPanel,
			sourceBoard: zone || (inSearchPanel
				? searchStore.collection
				: deckStore.activeBoard),
			card: card,
			selectedCards: selectedCards.length > 0 ? selectedCards : null
		};
		e.dataTransfer.setData(
			"application/x-budgericard",
			JSON.stringify(data),
		);
		e.dataTransfer.setData("text/plain", card.name);

		const target = /** @type {HTMLElement} */ (e.currentTarget);
		const rect = target.getBoundingClientRect();
		const grabOffsetX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
		const grabOffsetY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

		interactionStore.startCardDrag({
			card: card,
			price: price,
			zone: zone || (inSearchPanel ? searchStore.collection : deckStore.activeBoard),
			selectedCards: selectedCards.length > 0 ? selectedCards : null,
			isFlipped: isFlipped,
			isRotated: isRotated,
			width: rect.width || 140,
			height: rect.height || 196,
			grabOffsetX: grabOffsetX,
			grabOffsetY: grabOffsetY,
			cursorX: e.clientX,
			cursorY: e.clientY
		});

		setTimeout(() => (isDragging = true), 0);
	}

	/** @param {DragEvent} e */
	function handleDragEnd(e) {
		isDragging = false;
		interactionStore.endCardDrag();
	}

	/** @param {MouseEvent | null} e */
	function toggleFlip(e) {
		if (e) e.stopPropagation();
		isFlipped = !isFlipped;
	}

	/** @param {MouseEvent | null} e */
	function toggleRotate(e) {
		if (e) e.stopPropagation();
		isRotated = !isRotated;
	}
</script>

<div
	class="card-shell {className}"
	style="{style}"
	class:is-dragging={isDragging}
	class:is-selected={!inSearchPanel && [...interactionStore.selectedCells].some(cell => cell.startsWith(card.id + ":"))}
	onclick={onclick || handleLeftClick}
	onkeydown={(e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			const handler = onclick || handleLeftClick;
			handler(e);
		}
	}}
	oncontextmenu={(e) => {
		const currentBoard = zone || (inSearchPanel
			? searchStore.collection
			: deckStore.activeBoard);
		interactionStore.showMenu(e, card, currentBoard, price);
	}}
	onmouseenter={() => {
		if (interactionStore.isDraggingCard) return;
		const currentBoard = zone || (inSearchPanel
			? searchStore.collection
			: deckStore.activeBoard);
		interactionStore.registerHover(card, currentBoard, price);
	}}
	onmouseleave={() => {
		interactionStore.unregisterHover();
	}}
	ondragstart={handleDragStart}
	ondragend={handleDragEnd}
	draggable="true"
	role="button"
	tabindex="0"
	data-tooltip-img={(!inSearchPanel && !disableTooltip && !interactionStore.isDraggingCard) ? (meta.card_faces && meta.card_faces.length > 1 && meta.card_faces[0].image_uris ? (isFlipped ? meta.card_faces[1].image_uris?.normal : meta.card_faces[0].image_uris?.normal) : (meta.image_uris?.normal || "")) : undefined}
	aria-label="{inSearchPanel ? 'Add' : 'Remove'} {card.name}"
>
	{@render children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
</div>

<style>
	.card-shell.is-dragging {
		opacity: 0.12 !important;
		filter: grayscale(1) brightness(0.8);
		transform: scale(0.96) !important;
		transition: opacity 0.15s ease, transform 0.15s ease;
		pointer-events: none;
	}

	.card-shell.is-selected {
		box-shadow: 0 0 0 3px hsl(var(--primary)), 0 12px 30px -10px rgba(0, 0, 0, 0);
		border-radius: var(--radius-md);
		transform: scale(0.98);
		z-index: 10;
	}

	.card-shell {
		position: relative;
		display: block;
		width: inherit;
		background: none;
		border: none;
		outline: none;
		/* Use the slot height from CurveView. If no height is provided, default to fit-content */
		min-height: 0; 
		transition: 
			transform 0.2s ease,
			box-shadow 0.2s ease,
			margin-top 0.2s ease;
		transition-delay: 0ms !important;
		will-change: transform;
		overflow: visible;
	}

	.card-shell:hover {
		transition-delay: 0ms !important;
		/* We no longer lift z-index on hover to maintain stack order */
	}
</style>
