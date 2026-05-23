<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";

	/** @type {{ card: any, price: number | null, zone?: string, inSearchPanel?: boolean, disableTooltip?: boolean, class?: string, style?: string, children: import('svelte').Snippet<[any]> }} */
	let { card, price, zone, inSearchPanel = false, disableTooltip = false, class: className = "", style = "", children } = $props();

	let isDragging = $state(false);
	let isFlipped = $state(false);
	let isRotated = $state(false);

	/** @param {MouseEvent | KeyboardEvent} e */
	function handleLeftClick(e) {
		// Ignore clicks on the quantity badge to prevent conflicting actions
		if (e.target instanceof HTMLElement && e.target.closest('.stack-badge')) return;

		const isLocalBoard = ["sideboard", "maybeboard", "deleted"].includes(
			searchStore.collection,
		);
		const currentBoard = zone || (
			searchStore.collection === "deleted"
				? "garbage"
				: searchStore.collection
		);

		if (e.shiftKey) {
			deckStore.addCard(card.name, deckStore.activeBoard, price, card);
		} else if (inSearchPanel && isLocalBoard) {
			deckStore.moveCard(
				card.name,
				currentBoard,
				deckStore.activeBoard,
				card.id,
				price,
			);
		} else if (
			!inSearchPanel &&
			isLocalBoard &&
			searchStore.collection !== "deleted"
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
			const typeLine = (card.type_line || "").toLowerCase();
			const oracle = (card.oracle_text || "").toLowerCase();
			const facesOracle = (card.card_faces || [])
				.map((/** @type {any} */ f) => (f.oracle_text || "").toLowerCase())
				.join(" ");

			const isLegendaryCreature =
				typeLine.includes("legendary") && typeLine.includes("creature");
			const isPlaneswalker = typeLine.includes("planeswalker");
			const isCompanion =
				oracle.includes("companion —") ||
				facesOracle.includes("companion —");
			const isCommanderFormat = [
				"Commander",
				"Brawl",
				"Oathbreaker",
			].includes(deckStore.format);

			if (
				isCommanderFormat &&
				deckStore.commander.length === 0 &&
				(isLegendaryCreature ||
					(deckStore.format === "Brawl" && isPlaneswalker))
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
		const data = {
			name: card.name,
			price: price,
			id: card.id,
			fromDeck: !inSearchPanel,
			sourceBoard: zone || (inSearchPanel
				? searchStore.collection === "deleted"
					? "garbage"
					: searchStore.collection
				: deckStore.activeBoard),
			card: card,
		};
		e.dataTransfer.setData(
			"application/x-budgericard",
			JSON.stringify(data),
		);
		e.dataTransfer.setData("text/plain", card.name);

		setTimeout(() => (isDragging = true), 0);
	}

	/** @param {DragEvent} e */
	function handleDragEnd(e) {
		isDragging = false;
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
	onclick={handleLeftClick}
	onkeydown={(e) => {
		if (e.key === "Enter" || e.key === " ") {
			e.preventDefault();
			handleLeftClick(e);
		}
	}}
	oncontextmenu={(e) => {
		const currentBoard = zone || (inSearchPanel
			? searchStore.collection === "deleted"
				? "garbage"
				: searchStore.collection
			: deckStore.activeBoard);
		interactionStore.showMenu(e, card, currentBoard, price);
	}}
	onmouseenter={() => {
		const currentBoard = zone || (inSearchPanel
			? searchStore.collection === "deleted"
				? "garbage"
				: searchStore.collection
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
	data-tooltip-img={(!inSearchPanel && !disableTooltip) ? (card.image_uris?.normal || (card.card_faces ? card.card_faces[0].image_uris?.normal : "")) : undefined}
	aria-label="{inSearchPanel ? 'Add' : 'Remove'} {card.name}"
>
	{@render children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
</div>

<style>
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
