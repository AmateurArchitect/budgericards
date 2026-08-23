<script>
	import { fade, scale, slide } from "svelte/transition";
	import {
		X,
		Trash2,
		Plus,
		ArrowDownWideNarrow,
		ArrowUpNarrowWide,
		ChevronDown,
		ChevronRight,
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
	/** @type {number | null} */
	let dragOverIndex = $state(null);

	// Initialize local draft state whenever modal opens
	$effect(() => {
		if (isOpen) {
			showDefaultDetails = false;
			draggedIndex = null;
			dragOverIndex = null;

			if (target === "search") {
				const current = searchStore.activeSorts;
				draftSorts = current ? current.map((s) => ({ ...s })) : [];
			} else {
				// Deck mode
				const current = deckStore.activeSorts;
				draftSorts = current ? current.map((/** @type {any} */ s) => ({ ...s })) : [];
			}
		}
	});

	function close() {
		isOpen = false;
		if (onClose) onClose();
	}

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
			<div class="sort-rules-list custom-scrollbar">
				<!-- User-Configured Drag-and-Drop Sort Rows -->
				{#each draftSorts as rule, idx (idx)}
					<div
						class="sort-rule-row user-sort-row"
						class:is-drag-over={dragOverIndex === idx && draggedIndex !== idx}
						class:is-dragging={draggedIndex === idx}
						draggable="true"
						ondragstart={(e) => {
							draggedIndex = idx;
							if (e.dataTransfer) {
								e.dataTransfer.effectAllowed = "move";
								e.dataTransfer.setData("text/plain", String(idx));
							}
						}}
						ondragover={(e) => {
							e.preventDefault();
							dragOverIndex = idx;
						}}
						ondragleave={() => {
							if (dragOverIndex === idx) dragOverIndex = null;
						}}
						ondrop={(e) => {
							e.preventDefault();
							if (draggedIndex !== null && draggedIndex !== idx) {
								reorderSorts(draggedIndex, idx);
							}
							draggedIndex = null;
							dragOverIndex = null;
						}}
						ondragend={() => {
							draggedIndex = null;
							dragOverIndex = null;
						}}
					>
						<!-- Drag Handle -->
						<div class="drag-handle" title="Drag to reorder sort priority">
							<GripVertical size={14} />
						</div>

						<span class="rule-label">
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

				<!-- Permanent Base: Default Sort Row -->
				<div class="default-sort-container">
					<div
						class="sort-rule-row default-sort-row"
						onclick={() => (showDefaultDetails = !showDefaultDetails)}
						role="button"
						tabindex="0"
						onkeydown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								showDefaultDetails = !showDefaultDetails;
							}
						}}
						title="Default MTG tie-breaker order (always applied at lowest level)"
					>
						<div class="default-drag-placeholder"></div>

						<span class="rule-label">
							{draftSorts.length === 0 ? "Sort by" : "then by"}
						</span>

						<div class="default-sort-content">
							<div class="default-summary">
								<span class="default-badge">Default MTG Order</span>
								<span class="default-hint-text">Color &rarr; Identity &rarr; Mana Value &rarr; Name</span>
							</div>

							<div class="expand-indicator">
								{#if showDefaultDetails}
									<ChevronDown size={14} />
								{:else}
									<ChevronRight size={14} />
								{/if}
							</div>
						</div>
					</div>

					<!-- Expanded Read-only Details of Default Fallback Sort Chain -->
					{#if showDefaultDetails}
						<div class="default-details-panel" transition:slide={{ duration: 150 }}>
							<div class="default-step">
								<span class="step-num">1.</span>
								<span class="step-label">Color Category</span>
								<div class="mana-symbols-group">
									<ManaSymbol symbol="w" size="13px" />
									<ManaSymbol symbol="u" size="13px" />
									<ManaSymbol symbol="b" size="13px" />
									<ManaSymbol symbol="r" size="13px" />
									<ManaSymbol symbol="g" size="13px" />
								</div>
							</div>
							<div class="default-step">
								<span class="step-num">2.</span>
								<span class="step-label">Color Identity</span>
								<div class="mana-symbols-group">
									<ManaSymbol symbol="w" size="13px" />
									<ManaSymbol symbol="u" size="13px" />
									<ManaSymbol symbol="b" size="13px" />
									<ManaSymbol symbol="r" size="13px" />
									<ManaSymbol symbol="g" size="13px" />
								</div>
							</div>
							<div class="default-step">
								<span class="step-num">3.</span>
								<span class="step-label">Mana Value</span>
								<span class="step-val">Low to High</span>
							</div>
							<div class="default-step">
								<span class="step-num">4.</span>
								<span class="step-label">Alphabetical</span>
								<span class="step-val">A to Z</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Add & Tier Actions Row -->
			<div class="tier-actions-row">
				<button
					class="add-tier-btn"
					onclick={addSortTier}
					disabled={!canAddMore}
				>
					<Plus size={14} />
					<span>Add Sort</span>
				</button>

				<div class="tier-right-actions">
					{#if draftSorts.length > 0}
						<button
							class="text-action-btn"
							onclick={clearAll}
							title="Clear all custom sort levels"
						>
							<Trash2 size={13} />
							<span>Clear all</span>
						</button>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<Button variant="outline" onclick={close} class="footer-btn cancel-btn">
					Cancel
				</Button>
				<Button variant="default" onclick={applySorts} class="footer-btn apply-btn">
					Sort
				</Button>
			</div>
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
	}

	.modal-dialog {
		position: relative;
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
		gap: 0.55rem;
		overflow-y: auto;
		overflow-x: hidden;
		max-height: 48vh;
		padding-right: 6px;
		margin-right: -6px;
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

	.sort-rule-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.35rem 0.5rem;
		border-radius: var(--radius);
		border: 1px solid transparent;
		flex-shrink: 0;
		transition: all 0.15s ease;
	}

	.user-sort-row {
		background: hsl(var(--muted) / 0.25);
		border-color: hsl(var(--border) / 0.4);
		cursor: grab;
	}

	.user-sort-row:hover {
		background: hsl(var(--muted) / 0.45);
		border-color: hsl(var(--border) / 0.7);
	}

	.user-sort-row.is-dragging {
		opacity: 0.45;
		cursor: grabbing;
	}

	.user-sort-row.is-drag-over {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.drag-handle {
		color: hsl(var(--muted-foreground) / 0.5);
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

	.rule-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		width: 54px;
		flex-shrink: 0;
		white-space: nowrap;
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
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
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
		background: hsl(var(--muted) / 0.8);
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
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
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
		background: hsl(var(--muted) / 0.9);
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

	/* Default Sort Container & Row */
	.default-sort-container {
		display: flex;
		flex-direction: column;
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.15);
		border: 1px dashed hsl(var(--border) / 0.6);
	}

	.default-sort-row {
		cursor: pointer;
		user-select: none;
	}

	.default-sort-row:hover {
		background: hsl(var(--muted) / 0.3);
	}

	.default-sort-content {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 4px;
		min-width: 0;
	}

	.default-summary {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		min-width: 0;
	}

	.default-badge {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground) / 0.85);
		background: hsl(var(--muted) / 0.7);
		padding: 3px 8px;
		border-radius: 4px;
		border: 1px solid hsl(var(--border) / 0.5);
		white-space: nowrap;
	}

	.default-hint-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.expand-indicator {
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		padding: 4px;
	}

	/* Expanded Details Panel */
	.default-details-panel {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
		gap: 0.5rem;
		padding: 0.5rem 0.75rem 0.75rem 4.75rem;
		border-top: 1px dashed hsl(var(--border) / 0.4);
		background: hsl(var(--muted) / 0.08);
	}

	.default-step {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.step-num {
		font-weight: 700;
		color: hsl(var(--primary));
		font-size: 0.7rem;
	}

	.step-label {
		font-weight: 500;
		color: hsl(var(--foreground) / 0.8);
	}

	.step-val {
		color: hsl(var(--muted-foreground));
		font-size: 0.7rem;
	}

	/* Add & Reset Actions Row */
	.tier-actions-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.15rem;
		flex-shrink: 0;
	}

	.add-tier-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		background: hsl(var(--primary) / 0.08);
		border: 1px solid hsl(var(--primary) / 0.3);
		border-radius: var(--radius);
		padding: 0.45rem 0.85rem;
		color: hsl(var(--primary));
		font-size: 0.85rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.add-tier-btn:hover:not(:disabled) {
		background: hsl(var(--primary) / 0.16);
		border-color: hsl(var(--primary) / 0.5);
	}

	.add-tier-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.tier-right-actions {
		display: flex;
		align-items: center;
		gap: 0.65rem;
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
		justify-content: flex-end;
		gap: 0.75rem;
		padding-top: 0.85rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
		flex-shrink: 0;
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
		.direction-toggle-btn {
			width: 100%;
		}
		.default-details-panel {
			padding-left: 0.75rem;
		}
	}
</style>
