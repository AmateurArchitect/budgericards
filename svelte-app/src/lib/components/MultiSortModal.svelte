<script>
	import { untrack } from "svelte";
	import { fade, scale, slide } from "svelte/transition";
	import {
		X,
		Trash2,
		Plus,
		ArrowDownWideNarrow,
		ArrowUpNarrowWide,
		ChevronDown,
		ChevronUp,
		GripVertical,
	} from "lucide-svelte";
	import Button from "./ui/Button.svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";

	/** @type {{
	 *   isOpen: boolean,
	 *   target?: 'search' | 'deck',
	 *   title?: string,
	 *   onClose?: () => void,
	 *   onApply?: (sorts: { type: string, direction: string }[]) => void
	 * }} */
	let {
		isOpen = $bindable(false),
		target = "search",
		title = "",
		onClose = undefined,
		onApply = undefined,
	} = $props();

	/** @type {Array<{ id: string, label: string }>} */
	const availableCriteria = $derived([
		{ id: "color-cat", label: "Color Category" },
		{ id: "color-id", label: "Color Identity" },
		{ id: "cmc", label: "Mana Value" },
		{ id: "name", label: "Alphabetical (Name)" },
		{ id: "type", label: "Card Type" },
		{ id: "price", label: "Price" },
		{ id: "rarity", label: "Rarity" },
		...(target === "deck" ? [{ id: "added", label: "Recently Added" }] : []),
	]);

	/** @type {Record<string, { default: string, reverse: string }>} */
	const directionLabels = {
		"color-cat": { default: "WUBRG", reverse: "GRBUW" },
		"color-id": { default: "WUBRG", reverse: "GRBUW" },
		cmc: { default: "Low to High", reverse: "High to Low" },
		name: { default: "A to Z", reverse: "Z to A" },
		type: { default: "A to Z", reverse: "Z to A" },
		price: { default: "Low to High", reverse: "High to Low" },
		rarity: { default: "Common to Mythic", reverse: "Mythic to Common" },
		added: { default: "Newest First", reverse: "Oldest First" },
	};

	/** @type {Array<{ type: string, direction: string }>} */
	let draftSorts = $state([]);
	let showDefaultDetails = $state(false);

	// Drag and drop state
	/** @type {number | null} */
	let draggedIndex = $state(null);
	/** @type {{ index: number, position: 'top' | 'bottom' } | null} */
	let dropTarget = $state(null);

	/** @type {string} */
	let initialSortsJson = $state("[]");

	// Initialize local draft state ONLY when modal transitions from closed to open
	$effect(() => {
		if (isOpen) {
			untrack(() => {
				showDefaultDetails = false;
				draggedIndex = null;
				dropTarget = null;

				let current = [];
				if (target === "search") {
					current = searchStore.activeSorts || [];
				} else {
					// Deck mode
					current = deckStore.activeSorts || [];
				}
				draftSorts = current.map((/** @type {any} */ s) => ({ ...s }));
				initialSortsJson = JSON.stringify(draftSorts);
			});
		}
	});

	const hasChanged = $derived(JSON.stringify(draftSorts) !== initialSortsJson);

	function close() {
		isOpen = false;
		if (onClose) onClose();
	}

	/** @param {MouseEvent} e */
	function handleBackdropClick(e) {
		if (e.target === e.currentTarget) {
			close();
		}
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (!isOpen) return;
		if (e.key === "Escape") {
			e.preventDefault();
			e.stopPropagation();
			close();
		} else if (e.key === "Enter" && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
			const targetEl = /** @type {HTMLElement | null} */ (e.target);
			if (targetEl?.tagName !== "BUTTON" && targetEl?.tagName !== "SELECT") {
				e.preventDefault();
				applySorts();
			}
		}
	}

	function addSortTier() {
		// Find first unused criteria
		const usedTypes = new Set(draftSorts.map((s) => s.type));
		const nextUnused = availableCriteria.find((c) => !usedTypes.has(c.id));
		const nextType = nextUnused ? nextUnused.id : (target === "deck" ? "added" : "cmc");
		draftSorts = [...draftSorts, { type: nextType, direction: "default" }];
	}

	/** @param {number} index */
	function removeSortTier(index) {
		draftSorts = draftSorts.filter((_, i) => i !== index);
	}

	function clearAll() {
		draftSorts = [];
	}

	/**
	 * @param {number} fromIndex
	 * @param {number} toIndex
	 */
	function reorderSorts(fromIndex, toIndex) {
		if (fromIndex === toIndex || toIndex < 0 || toIndex >= draftSorts.length) return;
		const updated = [...draftSorts];
		const [movedItem] = updated.splice(fromIndex, 1);
		updated.splice(toIndex, 0, movedItem);
		draftSorts = updated;
	}

	/**
	 * @param {DragEvent} e
	 * @param {number} idx
	 */
	function handleDragOver(e, idx) {
		e.preventDefault();
		const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
		const rect = currentTarget.getBoundingClientRect();
		const mid = rect.top + rect.height / 2;
		const pos = e.clientY < mid ? "top" : "bottom";
		dropTarget = { index: idx, position: pos };
	}

	/** @param {DragEvent} e */
	function handleDrop(e) {
		e.preventDefault();
		if (draggedIndex !== null && dropTarget !== null) {
			let targetIdx = dropTarget.position === "top" ? dropTarget.index : dropTarget.index + 1;
			if (draggedIndex < targetIdx) targetIdx--;
			if (draggedIndex !== targetIdx && targetIdx >= 0 && targetIdx < draftSorts.length) {
				reorderSorts(draggedIndex, targetIdx);
			}
		}
		draggedIndex = null;
		dropTarget = null;
	}

	function applySorts() {
		if (onApply) {
			onApply(draftSorts);
		} else if (target === "search") {
			searchStore.activeSorts = draftSorts;
		} else {
			deckStore.activeSorts = draftSorts;
			if (draftSorts.length > 0) {
				const primary = draftSorts[0];
				deckStore.sorting = primary.type === "color-cat" ? "color" : primary.type;
				deckStore.sortAscending = primary.direction === "default";
			} else {
				deckStore.sorting = "color";
				deckStore.sortAscending = true;
			}
		}
		close();
	}

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			},
		};
	}

	const modalTitle = $derived(
		title || (target === "search" ? "Sort Search" : "Sort Deck"),
	);
	const canAddMore = $derived(draftSorts.length < availableCriteria.length);
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
	<div use:portal class="modal-portal-wrapper">
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={handleBackdropClick}
			in:fade={{ duration: 150 }}
			out:fade={{ duration: 120 }}
		></div>

		<div
			class="modal-dialog"
			role="dialog"
			aria-modal="true"
			aria-labelledby="multisort-title"
			tabindex="-1"
			in:scale={{ duration: 180, start: 0.95 }}
			out:scale={{ duration: 120, start: 0.95 }}
		>
			<!-- Header -->
			<div class="modal-header">
				<div class="header-title-group">
					<h2 id="multisort-title" class="dialog-title">{modalTitle}</h2>
					<span class="dialog-subtitle">Choose how your cards are ordered</span>
				</div>
				<button class="close-btn" onclick={close} aria-label="Close sort dialog" title="Close (Esc)">
					<X size={18} />
				</button>
			</div>

			<!-- Sort Rules Container -->
			<div class="sort-rules-list custom-scrollbar" class:is-drag-active={draggedIndex !== null}>
				<!-- User-Configured Drag-and-Drop Sort Rows -->
				{#each draftSorts as rule, idx (idx)}
					<div
						class="sort-rule-row user-sort-row"
						class:is-dragging={draggedIndex === idx}
						role="group"
						aria-label={`Sort tier ${idx + 1}`}
						ondragover={(e) => handleDragOver(e, idx)}
						ondragleave={() => {
							if (dropTarget?.index === idx) dropTarget = null;
						}}
						ondrop={handleDrop}
					>
						<!-- Absolute Drop Indicator Line (Zero layout shift) -->
						{#if dropTarget && dropTarget.index === idx && draggedIndex !== idx}
							<div
								class="drop-indicator-line"
								class:pos-top={dropTarget.position === "top"}
								class:pos-bottom={dropTarget.position === "bottom"}
							></div>
						{/if}

						<!-- Drag Handle (only shown when > 1 sort tier is present) -->
						{#if draftSorts.length > 1}
							<div
								class="drag-handle"
								role="button"
								tabindex="0"
								aria-label="Drag to reorder sort priority"
								title="Drag to reorder sort priority"
								draggable="true"
								ondragstart={(e) => {
									draggedIndex = idx;
									if (e.dataTransfer) {
										e.dataTransfer.effectAllowed = "move";
										e.dataTransfer.setData("text/plain", String(idx));
									}
								}}
								ondragend={() => {
									draggedIndex = null;
									dropTarget = null;
								}}
							>
								<GripVertical size={14} />
							</div>
						{/if}

						<span
							class="rule-label"
							class:rule-label-single={draftSorts.length === 1}
						>
							{idx === 0 ? "Sort by" : "then by"}
						</span>

						<!-- Field Selector with Custom Chevron -->
						<div class="select-wrapper">
							<select
								bind:value={rule.type}
								class="sort-select"
								aria-label={idx === 0 ? "Primary sort criterion" : `Sort criterion level ${idx + 1}`}
							>
								{#each availableCriteria as crit}
									<option value={crit.id}>{crit.label}</option>
								{/each}
							</select>
							<ChevronDown size={14} class="select-chevron" />
						</div>

						<!-- Direction Toggle Button with Custom Symbols / Text -->
						<button
							type="button"
							class="direction-toggle-btn"
							onclick={() => {
								rule.direction = rule.direction === "default" ? "reverse" : "default";
							}}
							title="Click to toggle sort direction"
							aria-label={`Sort direction: ${rule.direction === "default" ? directionLabels[rule.type]?.default : directionLabels[rule.type]?.reverse}`}
						>
							{#if rule.direction === "default"}
								<ArrowDownWideNarrow size={14} class="dir-icon" />
							{:else}
								<ArrowUpNarrowWide size={14} class="dir-icon" />
							{/if}

							<!-- Mana Symbols for WUBRG / GRBUW -->
							{#if rule.type === "color-cat" || rule.type === "color-id"}
								<div class="mana-symbols-group">
									{#if rule.direction === "default"}
										<ManaSymbol symbol="w" size="14px" />
										<ManaSymbol symbol="u" size="14px" />
										<ManaSymbol symbol="b" size="14px" />
										<ManaSymbol symbol="r" size="14px" />
										<ManaSymbol symbol="g" size="14px" />
									{:else}
										<ManaSymbol symbol="g" size="14px" />
										<ManaSymbol symbol="r" size="14px" />
										<ManaSymbol symbol="b" size="14px" />
										<ManaSymbol symbol="u" size="14px" />
										<ManaSymbol symbol="w" size="14px" />
									{/if}
								</div>
							{:else if rule.type === "rarity"}
								<!-- Rarity Badges -->
								<div class="rarity-badges-group">
									{#if rule.direction === "default"}
										<span class="rarity-badge common" title="Common">C</span>
										<span class="rarity-badge uncommon" title="Uncommon">U</span>
										<span class="rarity-badge rare" title="Rare">R</span>
										<span class="rarity-badge mythic" title="Mythic">M</span>
									{:else}
										<span class="rarity-badge mythic" title="Mythic">M</span>
										<span class="rarity-badge rare" title="Rare">R</span>
										<span class="rarity-badge uncommon" title="Uncommon">U</span>
										<span class="rarity-badge common" title="Common">C</span>
									{/if}
								</div>
							{:else}
								<span class="dir-text">
									{rule.direction === "default"
										? (directionLabels[rule.type]?.default || "Ascending")
										: (directionLabels[rule.type]?.reverse || "Descending")}
								</span>
							{/if}
						</button>

						<!-- Delete Tier Button -->
						<button
							class="delete-tier-btn"
							onclick={() => removeSortTier(idx)}
							title="Remove this sort level"
							aria-label="Remove this sort level"
						>
							<Trash2 size={16} />
						</button>
					</div>
				{/each}

				<!-- Full Width Add Sort Button placed directly above Default Sort Row -->
				<div class="add-sort-inline-container">
					<button
						class="add-tier-btn"
						onclick={addSortTier}
						disabled={!canAddMore}
					>
						<Plus size={14} />
						<span>Add Sort</span>
					</button>
				</div>

				<!-- Base Default Sort Row (Collapsed vs Expanded) -->
				{#if !showDefaultDetails}
					<!-- Collapsed View: Clean Trigger Line -->
					<div class="sort-rule-row default-collapsed-row">
						{#if draftSorts.length === 0}
							<span class="rule-label rule-label-start">Sort by</span>
						{:else if draftSorts.length === 1}
							<span class="rule-label rule-label-single">and finally by</span>
						{:else}
							<span class="rule-label finally-label">and finally by</span>
						{/if}

						<button
							type="button"
							class="default-sort-trigger-btn"
							onclick={() => (showDefaultDetails = true)}
							title="View default fallback sort order"
						>
							<span class="default-trigger-title">Default Sort Order</span>
							<div class="default-action-pill">
								<span class="default-action-text">Show</span>
								<ChevronDown size={13} class="default-chevron" />
							</div>
						</button>
					</div>
				{:else}
					<!-- Expanded View: Read-Only Rows Matching Custom Rows Layout -->
					<div class="default-expanded-container" transition:slide={{ duration: 160 }}>
						<div class="default-expanded-header">
							<span class="default-header-title">Default Sort Order</span>
							<button
								type="button"
								class="collapse-default-btn"
								onclick={() => (showDefaultDetails = false)}
								title="Collapse default sort details"
							>
								<span class="default-action-text">Collapse</span>
								<ChevronUp size={13} class="default-chevron" />
							</button>
						</div>

						<!-- Step 1: Color Category -->
						<div class="sort-rule-row default-readonly-row">
							<div class="default-drag-placeholder"></div>
							<span class="rule-label">
								{draftSorts.length === 0 ? "Sort by" : "then by"}
							</span>
							<div class="readonly-field-box">
								<span>Color Category</span>
							</div>
							<div class="readonly-direction-box">
								<ArrowDownWideNarrow size={14} class="dir-icon-muted" />
								<div class="mana-symbols-group">
									<ManaSymbol symbol="w" size="14px" />
									<ManaSymbol symbol="u" size="14px" />
									<ManaSymbol symbol="b" size="14px" />
									<ManaSymbol symbol="r" size="14px" />
									<ManaSymbol symbol="g" size="14px" />
								</div>
							</div>
							<div class="delete-placeholder"></div>
						</div>

						<!-- Step 2: Color Identity -->
						<div class="sort-rule-row default-readonly-row">
							<div class="default-drag-placeholder"></div>
							<span class="rule-label">then by</span>
							<div class="readonly-field-box">
								<span>Color Identity</span>
							</div>
							<div class="readonly-direction-box">
								<ArrowDownWideNarrow size={14} class="dir-icon-muted" />
								<div class="mana-symbols-group">
									<ManaSymbol symbol="w" size="14px" />
									<ManaSymbol symbol="u" size="14px" />
									<ManaSymbol symbol="b" size="14px" />
									<ManaSymbol symbol="r" size="14px" />
									<ManaSymbol symbol="g" size="14px" />
								</div>
							</div>
							<div class="delete-placeholder"></div>
						</div>

						<!-- Step 3: Mana Value -->
						<div class="sort-rule-row default-readonly-row">
							<div class="default-drag-placeholder"></div>
							<span class="rule-label">then by</span>
							<div class="readonly-field-box">
								<span>Mana Value</span>
							</div>
							<div class="readonly-direction-box">
								<ArrowDownWideNarrow size={14} class="dir-icon-muted" />
								<span class="dir-text">Low to High</span>
							</div>
							<div class="delete-placeholder"></div>
						</div>

						<!-- Step 4: Alphabetical -->
						<div class="sort-rule-row default-readonly-row">
							<span class="rule-label finally-label">and finally by</span>
							<div class="readonly-field-box">
								<span>Alphabetical (Name)</span>
							</div>
							<div class="readonly-direction-box">
								<ArrowDownWideNarrow size={14} class="dir-icon-muted" />
								<span class="dir-text">A to Z</span>
							</div>
							<div class="delete-placeholder"></div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer (only shown once changes have been made) -->
			{#if hasChanged}
				<div class="modal-footer" transition:slide={{ duration: 150 }}>
					<div class="footer-left">
						{#if draftSorts.length > 0}
							<button
								type="button"
								class="text-action-btn footer-clear-btn"
								onclick={clearAll}
								title="Clear all custom sort levels"
							>
								<Trash2 size={13} />
								<span>Clear all</span>
							</button>
						{/if}
					</div>

					<div class="footer-right">
						<Button variant="outline" onclick={close} class="footer-btn cancel-btn">
							Cancel
						</Button>
						<Button variant="default" onclick={applySorts} class="footer-btn apply-btn">
							Sort
						</Button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-portal-wrapper {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 12500;
		padding: 1rem;
		box-sizing: border-box;
	}

	.modal-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: 1;
	}

	.modal-dialog {
		position: relative;
		z-index: 2;
		pointer-events: auto;
		width: 100%;
		max-width: 600px;
		max-height: min(90vh, 680px);
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.6), 0 0 1px 1px hsl(var(--border) / 0.5);
		padding: 1.5rem 1.75rem;
		color: hsl(var(--card-foreground));
		display: flex;
		flex-direction: column;
		gap: 1.15rem;
		outline: none;
		box-sizing: border-box;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		padding-bottom: 0.25rem;
		flex-shrink: 0;
	}

	.header-title-group {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}

	.dialog-title {
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		letter-spacing: -0.015em;
	}

	.dialog-subtitle {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.close-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.15s ease;
		margin-top: -4px;
		margin-right: -4px;
	}

	.close-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted));
	}

	/* Sort Rules List */
	.sort-rules-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		overflow-y: auto;
		overflow-x: hidden;
		max-height: 50vh;
		padding: 4px 6px 4px 4px;
		margin-right: -6px;
		transition: gap 0.18s ease;
	}

	.sort-rules-list.is-drag-active {
		gap: 0.65rem;
	}

	/* Custom Sleek Scrollbar */
	.custom-scrollbar::-webkit-scrollbar {
		width: 6px;
	}

	.custom-scrollbar::-webkit-scrollbar-track {
		background: transparent;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb {
		background: hsl(var(--muted) / 0.8);
		border-radius: 4px;
	}

	.custom-scrollbar::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--muted-foreground) / 0.5);
	}

	/* Absolute Drop Indicator Line (Zero Reflow) */
	.drop-indicator-line {
		position: absolute;
		left: 4px;
		right: 4px;
		height: 2px;
		background: hsl(var(--primary));
		border-radius: 2px;
		pointer-events: none;
		z-index: 20;
		box-shadow: 0 0 8px hsl(var(--primary));
	}

	.drop-indicator-line.pos-top {
		top: -4px;
	}

	.drop-indicator-line.pos-bottom {
		bottom: -4px;
	}

	.drop-indicator-line::before,
	.drop-indicator-line::after {
		content: "";
		position: absolute;
		top: 50%;
		transform: translateY(-50%);
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: hsl(var(--primary));
	}

	.drop-indicator-line::before {
		left: -2px;
	}

	.drop-indicator-line::after {
		right: -2px;
	}

	/* Sort Rule Row (Unboxed clean styling) */
	.sort-rule-row {
		position: relative;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.3rem 0.4rem;
		border-radius: var(--radius);
		background: transparent;
		border: 1px solid transparent;
		flex-shrink: 0;
		transition: background 0.15s ease, border-color 0.15s ease, opacity 0.15s ease;
	}

	.user-sort-row:hover {
		background: hsl(var(--muted) / 0.35);
		border-color: hsl(var(--border) / 0.45);
	}

	.user-sort-row.is-dragging {
		opacity: 0.25;
	}

	.drag-handle {
		color: hsl(var(--muted-foreground) / 0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: grab;
		padding: 2px;
		flex-shrink: 0;
		transition: color 0.15s ease;
	}

	.user-sort-row:hover .drag-handle {
		color: hsl(var(--muted-foreground));
	}

	.default-drag-placeholder {
		width: 18px;
		flex-shrink: 0;
	}

	.delete-placeholder {
		width: 28px;
		flex-shrink: 0;
	}

	.rule-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		width: 54px;
		flex-shrink: 0;
		white-space: nowrap;
		text-align: right;
	}

	.rule-label.rule-label-start {
		width: auto;
		text-align: left;
	}

	.rule-label.rule-label-single {
		width: 96px;
		text-align: right;
	}

	.finally-label {
		width: 106px;
		margin-left: -22px;
		text-align: right;
	}

	.select-wrapper {
		position: relative;
		flex: 1;
		min-width: 140px;
		display: flex;
		align-items: center;
	}

	.sort-select {
		width: 100%;
		height: 36px;
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		background: hsl(var(--muted) / 0.4);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		font-weight: 500;
		padding: 0 32px 0 12px;
		cursor: pointer;
		outline: none;
		transition: border-color 0.15s ease, background 0.15s ease;
	}

	.sort-select:hover {
		background: hsl(var(--muted) / 0.7);
		border-color: hsl(var(--border));
	}

	.sort-select:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.sort-select option {
		background: hsl(var(--card));
		color: hsl(var(--card-foreground));
	}

	:global(.select-chevron) {
		position: absolute;
		right: 11px;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		color: hsl(var(--muted-foreground));
	}

	/* Direction Toggle Button */
	.direction-toggle-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		height: 36px;
		min-width: 136px;
		padding: 0 12px 0 10px;
		background: hsl(var(--muted) / 0.4);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		outline: none;
		transition: all 0.15s ease;
		user-select: none;
		flex-shrink: 0;
		justify-content: flex-start;
	}

	.direction-toggle-btn:hover {
		background: hsl(var(--muted) / 0.8);
		border-color: hsl(var(--border));
		color: hsl(var(--primary));
	}

	.direction-toggle-btn:focus-visible {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	:global(.dir-icon) {
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	:global(.dir-icon-muted) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
	}

	.dir-text {
		white-space: nowrap;
	}

	/* Mana Symbols Group in Direction Button */
	.mana-symbols-group {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	/* Rarity Badges Group in Direction Button */
	.rarity-badges-group {
		display: inline-flex;
		align-items: center;
		gap: 3px;
	}

	.rarity-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 16px;
		height: 16px;
		border-radius: 3px;
		font-size: 10px;
		font-weight: 700;
		line-height: 1;
		font-family: var(--font-mono, monospace);
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}

	.rarity-badge.common {
		background: #475569;
		color: #f8fafc;
		border: 1px solid #64748b;
	}

	.rarity-badge.uncommon {
		background: #64748b;
		color: #f8fafc;
		border: 1px solid #94a3b8;
	}

	.rarity-badge.rare {
		background: #b45309;
		color: #fef08a;
		border: 1px solid #f59e0b;
	}

	.rarity-badge.mythic {
		background: #c2410c;
		color: #ffedd5;
		border: 1px solid #ea580c;
	}

	.delete-tier-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground) / 0.7);
		cursor: pointer;
		padding: 6px;
		border-radius: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.delete-tier-btn:hover {
		color: hsl(var(--destructive-foreground, #ef4444));
		background: hsl(var(--destructive) / 0.15);
	}

	/* Full-Width Add Sort Button */
	.add-sort-inline-container {
		display: flex;
		align-items: center;
		width: 100%;
		padding: 0.15rem 0.25rem;
		box-sizing: border-box;
	}

	.add-tier-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.45rem;
		width: 100%;
		height: 36px;
		background: hsl(var(--primary) / 0.08);
		border: 1px dashed hsl(var(--primary) / 0.4);
		border-radius: var(--radius);
		padding: 0 1rem;
		color: hsl(var(--primary));
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		box-sizing: border-box;
	}

	.add-tier-btn:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.16);
		border-color: hsl(var(--primary) / 0.7);
	}

	.add-tier-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	/* Default Sort Trigger Button (Collapsed) */
	.default-collapsed-row {
		margin-top: 0.1rem;
	}

	.default-sort-trigger-btn {
		flex: 1;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 5px 0 12px;
		background: hsl(var(--muted) / 0.2);
		border: 1px dashed hsl(var(--border) / 0.7);
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		outline: none;
		box-sizing: border-box;
	}

	.default-sort-trigger-btn:hover {
		background: hsl(var(--muted) / 0.45);
		color: hsl(var(--foreground));
		border-color: hsl(var(--border));
	}

	.default-trigger-title {
		font-size: 0.85rem;
		font-weight: 500;
	}

	.default-action-pill,
	.collapse-default-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 4px;
		height: 24px;
		padding: 0 8px;
		font-size: 0.75rem;
		line-height: 1;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--muted) / 0.5);
		border-radius: 4px;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
		box-sizing: border-box;
	}

	.default-sort-trigger-btn:hover .default-action-pill,
	.collapse-default-btn:hover {
		background: hsl(var(--muted) / 0.85);
		color: hsl(var(--foreground));
	}

	.default-action-text {
		font-weight: 500;
		line-height: 1;
	}

	:global(.default-chevron) {
		color: hsl(var(--muted-foreground));
		transition: transform 0.15s ease;
		flex-shrink: 0;
	}

	/* Default Expanded Group */
	.default-expanded-container {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		padding: 0.5rem 0.25rem 0.6rem 0.25rem;
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.1);
		border: 1px dashed hsl(var(--border) / 0.5);
		margin-top: 0.2rem;
	}

	.default-expanded-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 0.5rem 0.35rem 0.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.default-header-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.default-readonly-row {
		opacity: 0.65;
		cursor: default;
		pointer-events: none;
	}

	.readonly-field-box {
		flex: 1;
		min-width: 140px;
		height: 36px;
		display: flex;
		align-items: center;
		padding: 0 12px;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.85rem;
		font-weight: 500;
	}

	.readonly-direction-box {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		height: 36px;
		min-width: 136px;
		padding: 0 12px 0 10px;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		font-size: 0.85rem;
		font-weight: 500;
		flex-shrink: 0;
	}

	.text-action-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		padding: 4px 6px;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.text-action-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.5);
	}

	/* Footer */
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.85rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
		flex-shrink: 0;
	}

	.footer-left,
	.footer-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.footer-btn) {
		min-width: 76px;
		height: 36px;
		font-weight: 600;
	}

	/* Responsive tweaks for narrow screens */
	@media (max-width: 560px) {
		.sort-rule-row {
			flex-wrap: wrap;
		}
		.direction-toggle-btn,
		.readonly-direction-box {
			width: 100%;
		}
	}
</style>
