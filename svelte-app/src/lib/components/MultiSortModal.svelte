<script>
	import { fade, scale } from "svelte/transition";
	import { X, Trash2, Plus, RotateCcw, ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown } from "lucide-svelte";
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
	const defaultSortChain = [
		{ type: "color-cat", direction: "default" },
		{ type: "color-id", direction: "default" },
		{ type: "cmc", direction: "default" },
		{ type: "name", direction: "default" }
	];

	/** @type {Array<{ type: string, direction: string }>} */
	let draftSorts = $state([]);

	// Initialize local draft state whenever modal opens
	$effect(() => {
		if (isOpen) {
			if (target === "search") {
				const current = searchStore.activeSorts;
				draftSorts = current && current.length > 0
					? current.map(s => ({ ...s }))
					: defaultSortChain.map(s => ({ ...s }));
			} else {
				// Deck mode
				const current = deckStore.activeSorts;
				if (current && current.length > 0) {
					draftSorts = current.map((/** @type {any} */ s) => ({ ...s }));
				} else {
					draftSorts = defaultSortChain.map(s => ({ ...s }));
				}
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
		const usedTypes = new Set(draftSorts.map(s => s.type));
		const nextUnused = availableCriteria.find(c => !usedTypes.has(c.id));
		const nextType = nextUnused ? nextUnused.id : "name";
		draftSorts = [...draftSorts, { type: nextType, direction: "default" }];
	}

	/** @param {number} index */
	function removeSortTier(index) {
		draftSorts = draftSorts.filter((_, i) => i !== index);
		if (draftSorts.length === 0) {
			draftSorts = [{ type: "color-cat", direction: "default" }];
		}
	}

	function resetToDefault() {
		draftSorts = defaultSortChain.map(s => ({ ...s }));
	}

	function clearAll() {
		draftSorts = [{ type: "name", direction: "default" }];
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

	const isDefaultApplied = $derived(() => {
		if (draftSorts.length !== defaultSortChain.length) return false;
		for (let i = 0; i < defaultSortChain.length; i++) {
			if (
				draftSorts[i].type !== defaultSortChain[i].type ||
				draftSorts[i].direction !== defaultSortChain[i].direction
			) {
				return false;
			}
		}
		return true;
	});

	const canClearAll = $derived(draftSorts.length > 1);
	const canResetDefault = $derived(!isDefaultApplied());
	const modalTitle = $derived(
		title || (target === "search" ? "Sort Search" : "Sort Deck")
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

			<!-- Sort Tier Rows Scrollable Container -->
			<div class="sort-rules-list custom-scrollbar">
				{#each draftSorts as rule, idx (idx)}
					<div class="sort-rule-row" class:single-row={draftSorts.length === 1}>
						{#if draftSorts.length > 1}
							<span class="rule-label">
								{idx === 0 ? "Sort by" : "then by"}
							</span>
						{/if}

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
							aria-label={`Sort direction: ${rule.direction === 'default' ? directionLabels[rule.type]?.default : directionLabels[rule.type]?.reverse}`}
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

						<!-- Delete Tier Button (only rendered when > 1 tier) -->
						{#if draftSorts.length > 1}
							<button
								class="delete-tier-btn"
								onclick={() => removeSortTier(idx)}
								title="Remove this sort level"
								aria-label="Remove this sort level"
							>
								<Trash2 size={16} />
							</button>
						{/if}
					</div>
				{/each}
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
					{#if canClearAll}
						<button
							class="text-action-btn"
							onclick={clearAll}
							title="Clear down to a single sort tier"
						>
							<Trash2 size={13} />
							<span>Clear all</span>
						</button>
					{/if}

					{#if canResetDefault}
						<button
							class="text-action-btn"
							onclick={resetToDefault}
							title="Reset sort levels to default"
						>
							<RotateCcw size={13} />
							<span>Reset to default</span>
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
		gap: 0.75rem;
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
		gap: 0.85rem;
		padding: 0.4rem 0;
		border-bottom: 1px solid hsl(var(--border) / 0.35);
		flex-shrink: 0;
	}

	.sort-rule-row:last-child {
		border-bottom: none;
	}

	.sort-rule-row.single-row {
		gap: 0.75rem;
	}

	.rule-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		width: 58px;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.select-wrapper {
		position: relative;
		flex: 1;
		min-width: 150px;
		display: flex;
		align-items: center;
	}

	.sort-select {
		width: 100%;
		height: 36px;
		appearance: none;
		-webkit-appearance: none;
		-moz-appearance: none;
		background: hsl(var(--muted) / 0.5);
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
		background: hsl(var(--muted) / 0.5);
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

	.sort-rule-row.single-row .direction-toggle-btn {
		min-width: 140px;
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
	}
</style>
