<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { fade } from "svelte/transition";
	import { onMount } from "svelte";

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	/**
	 * Calculate the destination position for a card based on its metadata and the current deck layout
	 * @param {any} card
	 * @returns {{x: number, y: number, width: number, height: number} | null}
	 */
	function getDestinationRect(card) {
		const grouping = deckStore.grouping?.toLowerCase() || "cmc";
		const splitView = deckStore.splitView;
		const isTypeMode = grouping === "type";
		const effectiveSplitView = splitView && !isTypeMode;
		const isSplitColorMode = effectiveSplitView && grouping === "color";

		// Determine the details (in animation, we use the card directly as it's from search)
		const details = card;
		
		let key = "Other";
		const isLand = details.type_line?.includes("Land") && !details.type_line.includes("//");

		if (details.notFound) {
			key = "Unknown";
		} else if (isLand && !isSplitColorMode) {
			if (grouping === "type") {
				key = details.type_line?.includes("Basic Land") ? "Basic Lands" : "Nonbasic Lands";
				// Fallback for custom layouts
				if (!document.querySelector(`[data-column-key="${key}"]`)) key = "Lands";
			} else {
				key = "Lands";
			}
		} else if (grouping === "cmc") {
			let cmc = details.cmc || 0;
			let floorCmc = Math.floor(cmc);
			if (settingsStore.combine01Drops && (floorCmc === 0 || floorCmc === 1)) {
				key = "0-1";
			} else if (settingsStore.combine6PlusDrops && cmc >= 6) {
				key = "6+";
			} else {
				key = floorCmc.toString();
			}
		} else if (grouping === "type") {
			const typeLine = details.type_line || "";
			if (typeLine.includes("Creature")) key = "Creatures";
			else if (typeLine.includes("Planeswalker")) key = "Planeswalkers";
			else if (typeLine.includes("Instant")) key = "Instants";
			else if (typeLine.includes("Sorcery")) key = "Sorceries";
			else if (typeLine.includes("Artifact")) key = "Artifacts";
			else if (typeLine.includes("Enchantment")) key = "Enchantments";
			else key = "Other";
		} else if (grouping === "color") {
			const colorIds = isSplitColorMode ? (details.color_identity || []) : (details.colors || []);
			if (colorIds.length === 0) key = "Colorless";
			else if (colorIds.length > 1) key = "Multicolor";
			else {
				const colorMap = { W: "White", U: "Blue", B: "Black", R: "Red", G: "Green" };
				key = colorMap[/** @type {keyof typeof colorMap} */ (colorIds[0])] || "Colorless";
			}
		}

		// Determine row
		let row = "top";
		if (effectiveSplitView) {
			if (grouping === "cmc") {
				row = details.type_line?.includes("Creature") ? "top" : "bottom";
			} else if (grouping === "color") {
				row = isLand ? "bottom" : "top";
			}
		}

		// Selector construction
		const targetKey = key;
		const targetRow = row;
		
		// Diagnostic log (removable after debugging)
		console.log(`[Animation] Targeting ${grouping}: ${targetKey} (${targetRow})`);

		let selector = `[data-column-key="${targetKey}"][data-row="${targetRow}"]`;
		let colEl = document.querySelector(selector);
		
		if (!colEl) {
			colEl = document.querySelector(`[data-column-key="${targetKey}"]`);
		}
		
		// DEEP SCAN FALLBACK: If querySelector fails, manually iterate all columns
		if (!colEl) {
			const allCols = document.querySelectorAll(".curve-col");
			// Log what we found to help debug the discrepancy
			const foundKeys = Array.from(allCols).map(el => /** @type {HTMLElement} */(el).dataset.columnKey);
			console.log(`[Animation] Deep scan. Looking for "${targetKey}". Available keys in DOM:`, foundKeys);

			for (const el of allCols) {
				const htmlEl = /** @type {HTMLElement} */(el);
				if (htmlEl.dataset.columnKey === targetKey) {
					colEl = htmlEl;
					break;
				}
			}
		}
		
		if (!colEl && targetKey === "Lands") {
			colEl = document.querySelector(".lands-area");
		}

		if (!colEl) {
			console.warn(`[Animation] Could not find column for key: "${targetKey}". Row: "${targetRow}"`);
			const container = document.querySelector(".deck-curve-container");
			if (container) {
				const rect = container.getBoundingClientRect();
				return { x: rect.left + 100, y: rect.top + 50, width: 40, height: 60 };
			}
			return null;
		}

		const rect = colEl.getBoundingClientRect();
		return {
			x: rect.left + rect.width / 2 - 20,
			y: rect.top + 60,
			width: 40,
			height: 60
		};
	}
</script>

<div use:portal class="animation-layer">
	{#each interactionStore.activeAnimations as anim (anim.id)}
		{@const dest = getDestinationRect(anim.card)}
		{#if dest}
			<div 
				class="flying-card"
				style:--start-x="{anim.sourceRect.left}px"
				style:--start-y="{anim.sourceRect.top}px"
				style:--start-w="{anim.sourceRect.width}px"
				style:--start-h="{anim.sourceRect.height}px"
				style:--end-x="{dest.x}px"
				style:--end-y="{dest.y}px"
				style:--end-w="{dest.width}px"
				style:--end-h="{dest.height}px"
			>
				<img 
					src={anim.card.image_uris?.normal || anim.card.card_faces?.[0]?.image_uris?.normal} 
					alt=""
				/>
			</div>
		{/if}
	{/each}
</div>

<style>
	.animation-layer {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		pointer-events: none;
		z-index: 9999;
		overflow: hidden;
	}

	.flying-card {
		position: absolute;
		left: 0;
		top: 0;
		width: var(--start-w);
		height: var(--start-h);
		transform: translate(var(--start-x), var(--start-y));
		animation: genie-move 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
		z-index: 100;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow: 0 10px 30px rgba(0,0,0,0.5);
	}

	.flying-card img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	@keyframes genie-move {
		0% {
			transform: translate(var(--start-x), var(--start-y)) scale(1);
			opacity: 1;
		}
		20% {
			transform: translate(var(--start-x), var(--start-y)) scale(0.4);
			opacity: 1;
		}
		100% {
			transform: translate(var(--end-x), var(--end-y)) scale(0.2);
			opacity: 0;
		}
	}
</style>
