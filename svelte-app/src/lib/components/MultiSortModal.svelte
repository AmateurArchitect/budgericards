<script>
	import { fade, scale } from "svelte/transition";
	import { X, Trash2, Plus, RotateCcw } from "lucide-svelte";
	import Button from "./ui/Button.svelte";
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
	const availableCriteria = [
		{ id: "color-cat", label: "Color Category" },
		{ id: "color-id", label: "Color Identity" },
		{ id: "cmc", label: "Mana Value" },
		{ id: "name", label: "Alphabetical (Name)" },
		{ id: "type", label: "Card Type" },
		{ id: "price", label: "Price" },
		{ id: "rarity", label: "Rarity" },
	];

	/** @type {Record<string, { default: string, reverse: string }>} */
	const directionLabels = {
		"color-cat": { default: "WUBRG", reverse: "GRBUW" },
		"color-id": { default: "WUBRG", reverse: "GRBUW" },
		cmc: { default: "Low to High", reverse: "High to Low" },
		name: { default: "A to Z", reverse: "Z to A" },
		type: { default: "A to Z", reverse: "Z to A" },
		price: { default: "Low to High", reverse: "High to Low" },
		rarity: { default: "Common to Mythic", reverse: "Mythic to Common" },
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

	const modalTitle = $derived(
		title || (target === "search" ? "Sort Search Results" : "Sort Deck Cards")
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
					<span class="dialog-subtitle">Configure multi-level sorting priority for cards</span>
				</div>
				<button class="close-btn" onclick={close} aria-label="Close sort dialog" title="Close (Esc)">
					<X size={18} />
				</button>
			</div>

			<!-- Sort Tier Rows Scrollable Container -->
			<div class="sort-rules-list custom-scrollbar">
				{#each draftSorts as rule, idx (idx)}
					<div class="sort-rule-row">
						<span class="rule-label">
							{idx === 0 ? "Sort by" : "then by"}
						</span>

						<!-- Field Selector -->
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
						</div>

						<!-- Direction Radios -->
						<div class="direction-radio-group">
							<label class="radio-label">
								<input
									type="radio"
									name={`sort-dir-${idx}`}
									value="default"
									bind:group={rule.direction}
									class="radio-input"
								/>
								<span class="radio-text">
									{directionLabels[rule.type]?.default || "Ascending"}
								</span>
							</label>

							<label class="radio-label">
								<input
									type="radio"
									name={`sort-dir-${idx}`}
									value="reverse"
									bind:group={rule.direction}
									class="radio-input"
								/>
								<span class="radio-text">
									{directionLabels[rule.type]?.reverse || "Descending"}
								</span>
							</label>
						</div>

						<!-- Delete Tier Button -->
						{#if draftSorts.length > 1}
							<button
								class="delete-tier-btn"
								onclick={() => removeSortTier(idx)}
								title="Remove this sort level"
								aria-label="Remove this sort level"
							>
								<Trash2 size={16} />
							</button>
						{:else}
							<div class="delete-placeholder"></div>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Add & Reset Tier Row -->
			<div class="tier-actions-row">
				<button
					class="add-tier-btn"
					onclick={addSortTier}
					disabled={!canAddMore}
				>
					<Plus size={14} />
					<span>Add another sort column</span>
				</button>

				<button
					class="reset-defaults-btn"
					onclick={resetToDefault}
					title="Reset sort levels to default"
				>
					<RotateCcw size={13} />
					<span>Reset to default</span>
				</button>
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<div class="footer-left">
					<Button variant="ghost" onclick={clearAll} class="footer-btn text-muted-btn">
						Clear All
					</Button>
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
		max-width: 620px;
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

	.rule-label {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		width: 58px;
		flex-shrink: 0;
		white-space: nowrap;
	}

	.select-wrapper {
		flex: 1;
		min-width: 150px;
	}

	.sort-select {
		width: 100%;
		height: 36px;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		font-weight: 500;
		padding: 0 10px;
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

	/* Direction Radios */
	.direction-radio-group {
		display: flex;
		align-items: center;
		gap: 1.15rem;
		flex-shrink: 0;
	}

	.radio-label {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
		font-size: 0.85rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		cursor: pointer;
		user-select: none;
	}

	.radio-input {
		accent-color: hsl(var(--primary)); /* Budgericards primary blue */
		cursor: pointer;
		width: 16px;
		height: 16px;
		margin: 0;
	}

	.radio-text {
		white-space: nowrap;
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

	.delete-placeholder {
		width: 28px;
		flex-shrink: 0;
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

	.reset-defaults-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
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

	.reset-defaults-btn:hover {
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

	:global(.text-muted-btn) {
		color: hsl(var(--muted-foreground)) !important;
	}

	:global(.text-muted-btn:hover) {
		color: hsl(var(--foreground)) !important;
	}

	/* Responsive tweaks for narrow screens */
	@media (max-width: 560px) {
		.sort-rule-row {
			flex-wrap: wrap;
		}
		.direction-radio-group {
			width: 100%;
			padding-left: 58px;
		}
	}
</style>
