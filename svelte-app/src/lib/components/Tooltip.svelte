<script>
	import { onMount, untrack } from "svelte";
	import { fade } from "svelte/transition";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { checkLegality } from "$lib/utils/legality.js";

	let visible = $state(false);
	let imgUrl = $state("");
	let x = $state(0);
	let y = $state(0);
	/** @type {HTMLElement | undefined} */
	let tooltipEl = $state();

	const padding = 14;
	let tooltipWidth = $state(260);
	let tooltipHeight = $state(364);
	let currentSide = $state("right"); // 'left' or 'right'

	/** @param {MouseEvent} e */
	function handleMouseOver(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target) return;
		const trigger = /** @type {HTMLElement | null} */ (
			target.closest("[data-tooltip-img]")
		);
		if (!trigger) {
			visible = false;
			return;
		}

		imgUrl = trigger.getAttribute("data-tooltip-img") || "";
		if (!imgUrl) return;

		visible = true;
		// Measure immediately and on the first frame
		if (tooltipEl) {
			tooltipWidth = tooltipEl.offsetWidth;
			tooltipHeight = tooltipEl.offsetHeight;
		}
		updatePosition(e, trigger);
	}

	/** @type {HTMLElement | null} */
	let currentTrigger = $state(null);
	let lastEvent = /** @type {MouseEvent | null} */ (null);

	/** @param {MouseEvent} e */
	function handleMouseMove(e) {
		lastEvent = e;
		if (!visible) return;
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target) return;
		const trigger = /** @type {HTMLElement | null} */ (
			target.closest("[data-tooltip-img]")
		);

		if (trigger) {
			// If it's a curve item and we're already on it, don't recalculate
			if (
				trigger === currentTrigger &&
				trigger.classList.contains("curve-card-item")
			) {
				return;
			}

			currentTrigger = trigger;

			if (tooltipEl) {
				tooltipWidth = tooltipEl.offsetWidth;
				tooltipHeight = tooltipEl.offsetHeight;
			}
			updatePosition(e, trigger);
		}
	}

	/** @param {MouseEvent} e */
	function handleMouseOut(e) {
		if (interactionStore.isMenuOpen) return;
		const target = /** @type {HTMLElement} */ (e.target);
		if (target && target.closest("[data-tooltip-img]")) {
			visible = false;
		}
	}

	$effect(() => {
		// Reposition if menu opens OR moves to a different card
		if (
			interactionStore.isMenuOpen &&
			interactionStore.menuCard &&
			currentTrigger &&
			lastEvent
		) {
			untrack(() => {
				updatePosition(
					/** @type {MouseEvent} */ (lastEvent),
					/** @type {HTMLElement} */ (currentTrigger),
				);
			});
		} else if (!interactionStore.isMenuOpen) {
			// When menu closes, hide the tooltip immediately
			// It will be re-shown by the mousemove/mouseover handlers if still over a card
			visible = false;
			currentTrigger = null;
		}
	});

	const lockedImgUrl = $derived.by(() => {
		if (interactionStore.isMenuOpen && interactionStore.menuCard) {
			const card = interactionStore.menuCard;
			return (
				card.image_uris?.normal ||
				(card.card_faces ? card.card_faces[0].image_uris?.normal : "")
			);
		}
		return imgUrl;
	});

	const currentPrice = $derived.by(() => {
		const raw = interactionStore.isMenuOpen
			? interactionStore.menuPrice
			: interactionStore.hoveredPrice;
		if (raw !== null && raw !== 0) return raw;

		const card = interactionStore.isMenuOpen
			? interactionStore.menuCard
			: interactionStore.hoveredCard;
		if (card) return priceStore.getPrice(card.name);

		return raw;
	});

	const currentCard = $derived.by(() => {
		return interactionStore.isMenuOpen
			? interactionStore.menuCard
			: interactionStore.hoveredCard;
	});

	const legality = $derived(checkLegality(currentCard));

	/**
	 * @param {MouseEvent} e
	 * @param {HTMLElement} trigger
	 */
	function updatePosition(e, trigger) {
		let nextX, nextY;
		const rect = trigger.getBoundingClientRect();
		const menuOpen = interactionStore.isMenuOpen;
		const menuPos = interactionStore.menuPosition;

		if (menuOpen && menuPos) {
			// FIXED position relative to context menu
			const menuWidth = 200;
			const menuOnRight = menuPos.x + menuWidth < window.innerWidth - 10;

			if (menuOnRight) {
				nextX = menuPos.x + menuWidth + padding;
			} else {
				nextX = menuPos.x - menuWidth - tooltipWidth - padding;
			}
			nextY = menuPos.y;
		} else if (
			trigger.classList.contains("curve-card-item") ||
			trigger.closest(".card-shell")
		) {
			const midX = rect.left + rect.width / 2;

			// Hysteresis: Only flip side if we cross a threshold (e.g. 35% / 65%)
			const leftThreshold = window.innerWidth * 0.35;
			const rightThreshold = window.innerWidth * 0.65;

			if (currentSide === "right" && midX > rightThreshold) {
				currentSide = "left";
			} else if (currentSide === "left" && midX < leftThreshold) {
				currentSide = "right";
			}

			if (currentSide === "left") {
				nextX = rect.left - tooltipWidth - padding;
			} else {
				nextX = rect.right + padding;
			}
			// Center vertically relative to the card itself
			nextY = rect.top + rect.height / 2 - tooltipHeight / 2;
		} else {
			nextX = e.clientX + padding / 2;
			nextY = e.clientY + padding / 2;

			if (nextX + tooltipWidth > window.innerWidth) {
				nextX = e.clientX - tooltipWidth - padding / 2;
			}
		}

		// Viewport clamping with a safety margin
		const safety = 20;
		x = Math.max(
			safety,
			Math.min(nextX, window.innerWidth - tooltipWidth - safety),
		);
		y = Math.max(
			safety,
			Math.min(nextY, window.innerHeight - tooltipHeight - safety),
		);
	}

	onMount(() => {
		/** @param {MouseEvent} e */
		const handleGlobalMouseOver = (e) => {
			if (interactionStore.isMenuOpen) return;
			handleMouseOver(e);
		};

		/** @param {MouseEvent} e */
		const handleGlobalMouseMove = (e) => {
			if (interactionStore.isMenuOpen) return;
			handleMouseMove(e);
		};

		document.addEventListener("mouseover", handleGlobalMouseOver);
		document.addEventListener("mousemove", handleGlobalMouseMove);
		document.addEventListener("mouseout", handleMouseOut);

		return () => {
			document.removeEventListener("mouseover", handleGlobalMouseOver);
			document.removeEventListener("mousemove", handleGlobalMouseMove);
			document.removeEventListener("mouseout", handleMouseOut);
		};
	});
</script>

<div
	bind:this={tooltipEl}
	class="card-tooltip"
	class:visible
	style="left: {x}px; top: {y}px;"
>
	<div class="card-tooltip-container" class:illegal={!legality.isLegal}>
		<img src={lockedImgUrl} alt="Card Preview" />
		{#if settingsStore.showPrices && currentPrice !== null}
			<div class="tooltip-price" in:fade={{ duration: 150 }}>
				${Number(currentPrice).toFixed(2)}
			</div>
		{/if}

		{#if !legality.isLegal}
			<div class="legality-warning" in:fade={{ duration: 150 }}>
				{#each legality.reasons as reason}
					<div class="reason">{reason}</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.card-tooltip {
		position: fixed;
		/* Physical Scale Interpolation: 0.75x to 1.0x of a real MTG card */
		/* Multiplier logic: (0.25 growth * 2.5 inches) = 0.625 inches of total growth range */
		--popover-width: calc(
			(0.75 * var(--physical-card-width)) + (var(--card-width) - 120px) *
				(0.625 * var(--dpi-num) / 120)
		);
		width: var(--popover-width);
		pointer-events: none;
		z-index: 9999;
		opacity: 0;
		transform: scale(0.95);
		transition:
			opacity 0.15s ease-out,
			transform 0.15s ease-out,
			left 0.2s cubic-bezier(0.19, 1, 0.22, 1);
		box-shadow: 0 20px 40px -12px rgba(0, 0, 0, 0.8);
		will-change: left, top, opacity, transform;
		border-radius: 12px;
	}

	.card-tooltip-container {
		width: 100%;
		position: relative;
		border-radius: inherit;
		overflow: hidden;
		background: #000;
	}

	.card-tooltip-container::after {
		content: "";
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1);
		border-radius: inherit;
		pointer-events: none;
	}

	.card-tooltip-container.illegal {
		box-shadow: 0 0 0 2px var(--danger);
	}

	.card-tooltip-container.illegal::after {
		box-shadow: inset 0 0 0 1px rgba(255, 0, 0, 0.2);
	}

	.card-tooltip.visible {
		opacity: 1;
		transform: scale(1);
	}

	.card-tooltip img {
		width: 100%;
		height: auto;
		display: block;
		border-radius: inherit;
	}

	.tooltip-price {
		position: absolute;
		bottom: 12px;
		left: 12px;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: var(--success);
		font-size: var(--font-sm);
		font-weight: 700;
		font-family: inherit;
		font-variant-numeric: tabular-nums;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
		z-index: 10;
	}

	.legality-warning {
		position: absolute;
		top: 11.2%; /* Anchored immediately below name bar */
		left: 0;
		right: 0;
		background: rgba(180, 0, 0, 0.85);
		backdrop-filter: blur(8px);
		padding: 8px 12px;
		border-radius: var(--radius-sm);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		font-size: var(--font-xs);
		font-weight: 600;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
		z-index: 10;
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.legality-warning .reason {
		line-height: 1.2;
	}
</style>
