<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale, fly } from "svelte/transition";
	import {
		X,
		Plus,
		Tags,
		Star,
		ChevronsRight,
		Pencil,
		Check,
	} from "lucide-svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	/** @type {any[]} */
	let cards = $state([]);
	let newTagInput = $state("");
	/** @type {string | null} */
	let editingTag = $state(null);
	let editingValue = $state("");

	let isOpen = $derived(interactionStore.bulkTagsModal.isOpen);
	let isSuggestionsOpen = $state(false);
	let activeIndex = $state(-1);
	/** @type {HTMLDivElement | null} */
	let suggestionsListEl = $state(null);

	// Reactively sync cards from the store when modal opens
	$effect(() => {
		if (isOpen) {
			cards = interactionStore.bulkTagsModal.cards || [];
			newTagInput = "";
			isSuggestionsOpen = deckTagsList.length > 0;
			activeIndex = -1;
		}
	});

	// When user types, auto-highlight top suggestion if any
	$effect(() => {
		const query = newTagInput.trim();
		if (query && filteredSuggestions.length > 0) {
			activeIndex = 0;
			isSuggestionsOpen = true;
		} else if (!query) {
			activeIndex = -1;
		}
	});

	// Live-derived tag rows — always reads fresh from deckStore
	let tagRows = $derived.by(() => {
		if (!isOpen || cards.length === 0) return [];

		/** @type {Map<string, { count: number; notPrimaryCount: number }>} */
		const unionMap = new Map();

		for (const snapshotCard of cards) {
			// Read live card data
			const result = deckStore.findCardById(snapshotCard.id);
			const liveCard = result?.card ?? snapshotCard;

			if (liveCard.tags) {
				for (const t of liveCard.tags) {
					if (!unionMap.has(t)) {
						unionMap.set(t, { count: 0, notPrimaryCount: 0 });
					}
					const entry = unionMap.get(t);
					if (entry) {
						entry.count++;
						if (liveCard.primaryTag !== t) entry.notPrimaryCount++;
					}
				}
			}
		}

		return [...unionMap.entries()]
			.map(([tag, { count, notPrimaryCount }]) => ({
				tag,
				count,
				isShared: count === cards.length,
				needsPrimary: count === cards.length && notPrimaryCount > 0,
			}))
			.sort((a, b) => {
				// Shared first, then alphabetical
				if (a.isShared && !b.isShared) return -1;
				if (!a.isShared && b.isShared) return 1;
				return a.tag.localeCompare(b.tag);
			});
	});

	// Derived deck-wide suggestions
	let deckTagsList = $derived.by(() => {
		const allTags = new Set();
		const boards = [
			"commander",
			"companion",
			"mainboard",
			"sideboard",
			"maybeboard",
		];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			for (const c of storeAny[board] || []) {
				if (c.tags) for (const t of c.tags) allTags.add(t);
			}
		}
		return [...allTags].sort((a, b) => a.localeCompare(b));
	});

	// Derived deck-wide tag counts
	let deckTagCounts = $derived.by(() => {
		/** @type {Map<string, number>} */
		const counts = new Map();
		const boards = [
			"commander",
			"companion",
			"mainboard",
			"sideboard",
			"maybeboard",
		];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			for (const c of storeAny[board] || []) {
				if (c.tags) {
					for (const t of c.tags) {
						counts.set(t, (counts.get(t) || 0) + 1);
					}
				}
			}
		}
		return counts;
	});

	// Tags from the deck not already shared by all selected cards
	let availableTags = $derived.by(() => {
		const sharedSet = new Set(
			tagRows.filter((r) => r.isShared).map((r) => r.tag),
		);
		return deckTagsList.filter((t) => !sharedSet.has(t));
	});

	// Filtered & prioritized suggestions
	let filteredSuggestions = $derived.by(() => {
		const query = newTagInput.trim().toLowerCase();
		if (!query) return availableTags;

		return availableTags
			.filter((t) => t.toLowerCase().includes(query))
			.sort((a, b) => {
				const aLower = a.toLowerCase();
				const bLower = b.toLowerCase();
				const aStarts = aLower.startsWith(query);
				const bStarts = bLower.startsWith(query);
				if (aStarts && !bStarts) return -1;
				if (!aStarts && bStarts) return 1;
				return aLower.localeCompare(bLower);
			});
	});

	function scrollActiveSuggestionIntoView() {
		requestAnimationFrame(() => {
			if (!suggestionsListEl) return;
			const activeEl = suggestionsListEl.querySelector(
				".suggestion-item.active",
			);
			if (activeEl && typeof activeEl.scrollIntoView === "function") {
				activeEl.scrollIntoView({ block: "nearest" });
			}
		});
	}

	/** @param {KeyboardEvent} e */
	function handleInputKeydown(e) {
		if (e.key === "Escape") {
			if (isSuggestionsOpen) {
				e.preventDefault();
				e.stopPropagation();
				isSuggestionsOpen = false;
				return;
			}
		}

		if (e.key === "ArrowDown") {
			if (!isSuggestionsOpen && filteredSuggestions.length > 0) {
				isSuggestionsOpen = true;
				activeIndex = 0;
				e.preventDefault();
				return;
			}
			if (isSuggestionsOpen && filteredSuggestions.length > 0) {
				e.preventDefault();
				activeIndex = (activeIndex + 1) % filteredSuggestions.length;
				scrollActiveSuggestionIntoView();
				return;
			}
		}

		if (e.key === "ArrowUp") {
			if (isSuggestionsOpen && filteredSuggestions.length > 0) {
				e.preventDefault();
				activeIndex =
					(activeIndex - 1 + filteredSuggestions.length) %
					filteredSuggestions.length;
				scrollActiveSuggestionIntoView();
				return;
			}
		}

		if (e.key === "Tab") {
			if (
				isSuggestionsOpen &&
				filteredSuggestions.length > 0 &&
				activeIndex >= 0 &&
				activeIndex < filteredSuggestions.length
			) {
				e.preventDefault();
				newTagInput = filteredSuggestions[activeIndex];
				return;
			}
		}

		if (e.key === "Enter") {
			e.preventDefault();
			if (
				isSuggestionsOpen &&
				filteredSuggestions.length > 0 &&
				activeIndex >= 0 &&
				activeIndex < filteredSuggestions.length
			) {
				addTagToAll(filteredSuggestions[activeIndex]);
			} else if (newTagInput.trim().length > 0) {
				addTagToAll(newTagInput);
			}
		}
	}

	function handleClose() {
		editingTag = null;
		editingValue = "";
		newTagInput = "";
		isSuggestionsOpen = false;
		activeIndex = -1;
		interactionStore.closeBulkTagsModal();
	}

	function handleApply() {
		if (newTagInput.trim().length > 0) {
			addTagToAll(newTagInput);
		}
		handleClose();
	}

	/** @param {string} tag */
	function addTagToAll(tag) {
		const trimmed = tag.trim();
		if (!trimmed) return;
		deckStore.batchUpdate(() => {
			for (const card of cards) {
				const liveCard = deckStore.findCardById(card.id)?.card ?? card;
				// Only add if the card doesn't already have this tag
				if (!(liveCard.tags || []).includes(trimmed)) {
					deckStore.addCardTag(card.id, trimmed);
				}
			}
		});
		newTagInput = "";
		activeIndex = -1;
	}

	/** @param {string} tag */
	function extendToAll(tag) {
		deckStore.batchUpdate(() => {
			for (const card of cards) {
				const liveCard = deckStore.findCardById(card.id)?.card ?? card;
				// Only extend to cards that don't already have this tag — prevents duplication
				if (!(liveCard.tags || []).includes(tag)) {
					deckStore.addCardTag(card.id, tag);
					// Primary tag logic: only auto-set primary if this card had NO tags before.
					// Cards that already have tags keep their existing primary (or lack thereof).
				}
			}
		});
	}

	/** @param {string} tag */
	function removeTagFromAll(tag) {
		deckStore.batchUpdate(() => {
			for (const card of cards) deckStore.removeCardTag(card.id, tag);
		});
		if (editingTag === tag) {
			editingTag = null;
			editingValue = "";
		}
	}

	/** @param {string} tag */
	function setPrimaryForAll(tag) {
		deckStore.batchUpdate(() => {
			for (const card of cards) {
				const result = deckStore.findCardById(card.id);
				const liveCard = result?.card;
				if (liveCard?.tags?.includes(tag)) {
					deckStore.setPrimaryTag(card.id, tag);
				}
			}
		});
	}

	/** @param {string} tag */
	function startEdit(tag) {
		editingTag = tag;
		editingValue = tag;
	}

	function cancelEdit() {
		editingTag = null;
		editingValue = "";
	}

	/** @param {string} oldTag */
	function commitEdit(oldTag) {
		const newTag = editingValue.trim();
		if (!newTag || newTag === oldTag) {
			cancelEdit();
			return;
		}
		// Rename tag for each selected card that has it
		deckStore.batchUpdate(() => {
			for (const card of cards) {
				const result = deckStore.findCardById(card.id);
				const liveCard = result?.card;
				if (liveCard?.tags?.includes(oldTag)) {
					const newTags = liveCard.tags.map(
						(/** @type {string} */ t) =>
							t === oldTag ? newTag : t,
					);
					deckStore.reorderCardTags(card.id, newTags);
					if (liveCard.primaryTag === oldTag) {
						deckStore.setPrimaryTag(card.id, newTag);
					}
				}
			}
		});
		cancelEdit();
	}

	/** @param {KeyboardEvent} e
	 *  @param {string} oldTag */
	function handleEditKeydown(e, oldTag) {
		if (e.key === "Enter") {
			e.preventDefault();
			commitEdit(oldTag);
		}
		if (e.key === "Escape") {
			e.preventDefault();
			cancelEdit();
		}
	}
</script>

{#if isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop"
		transition:fade={{ duration: 150 }}
		onmousedown={(e) => {
			if (e.target === e.currentTarget) handleClose();
		}}
		onkeydown={(e) => {
			if (e.key === "Escape") handleClose();
		}}
	>
		<div
			class="modal-content"
			transition:scale={{ duration: 150, start: 0.95 }}
			role="dialog"
			aria-modal="true"
			aria-label="Edit Tags for selected cards"
		>
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-row">
					<Tags size={16} class="title-icon" />
					<span class="modal-title">Edit Tags</span>
					<span class="card-count-badge"
						>{cards.length} card{cards.length !== 1
							? "s"
							: ""}</span
					>
				</div>
				<button
					class="close-btn"
					onclick={handleClose}
					aria-label="Close"><X size={16} /></button
				>
			</div>

			<!-- Body -->
			<div class="modal-body">
				<!-- Vertical tag list -->
				{#if tagRows.length > 0}
					<div class="tag-list" role="list">
						{#each tagRows as row (row.tag)}
							<div
								class="tag-row"
								class:is-shared={row.isShared}
								class:is-partial={!row.isShared}
								role="listitem"
								transition:fly={{ y: -4, duration: 120 }}
							>
								<!-- Left: status dot + name/edit -->
								<div class="tag-row-left">
									<span
										class="status-dot"
										class:shared={row.isShared}
										class:partial={!row.isShared}
										title={row.isShared
											? "Shared by all"
											: "Partial"}
									></span>

									{#if editingTag === row.tag}
										<!-- Inline edit mode -->
										<input
											class="tag-edit-input"
											type="text"
											bind:value={editingValue}
											onkeydown={(e) =>
												handleEditKeydown(e, row.tag)}
											aria-label="Edit tag name"
										/>
										<button
											class="action-btn confirm-btn"
											onclick={() => commitEdit(row.tag)}
											title="Confirm rename"
											aria-label="Confirm"
										>
											<Check size={13} />
										</button>
										<button
											class="action-btn cancel-btn"
											onclick={cancelEdit}
											title="Cancel"
											aria-label="Cancel"
										>
											<X size={13} />
										</button>
									{:else}
										<span class="tag-name">{row.tag}</span>

										<!-- Card count -->
										<span
											class="count-badge"
											title="{row.count} of {cards.length} selected cards have this tag"
										>
											{row.count}/{cards.length}
										</span>
									{/if}
								</div>

								<!-- Right: action buttons (hidden in edit mode) -->
								{#if editingTag !== row.tag}
									<div class="tag-row-actions">
										<!-- Extend to all (only if partial) -->
										{#if !row.isShared}
											<button
												class="action-btn extend-btn"
												onclick={() =>
													extendToAll(row.tag)}
												title="Apply to all {cards.length} selected cards"
												aria-label="Extend tag to all selected cards"
											>
												<ChevronsRight size={13} />
												<span class="btn-label"
													>Extend</span
												>
											</button>
										{/if}

										<!-- Set as primary (only if shared but not primary on all) -->
										{#if row.needsPrimary}
											<button
												class="action-btn primary-btn"
												onclick={() =>
													setPrimaryForAll(row.tag)}
												title="Set as primary tag for all cards"
												aria-label="Set as primary tag"
											>
												<Star size={13} />
												<span class="btn-label"
													>Primary</span
												>
											</button>
										{/if}

										<!-- Edit/rename -->
										<button
											class="action-btn edit-btn"
											onclick={() => startEdit(row.tag)}
											title="Rename tag"
											aria-label="Rename tag"
										>
											<Pencil size={12} />
										</button>

										<!-- Remove from all -->
										<button
											class="action-btn remove-btn"
											onclick={() =>
												removeTagFromAll(row.tag)}
											title="Remove from all selected cards"
											aria-label="Remove tag"
										>
											<X size={13} />
										</button>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				{:else}
					<p class="no-tags-placeholder">
						Looks like these cards don't have any tags yet. Want to
						add some?
					</p>
				{/if}

				<!-- Add tag section -->
				<div class="add-tag-section">
					<div class="tag-input-row">
						<div class="tag-input-container">
							<Input
								id="bulk-tag-input"
								type="text"
								autocomplete="off"
								autocorrect="off"
								autocapitalize="off"
								spellcheck="false"
								placeholder="Add a tag to all {cards.length} cards..."
								bind:value={newTagInput}
								onfocus={() => {
									if (availableTags.length > 0) {
										isSuggestionsOpen = true;
									}
								}}
								onkeydown={handleInputKeydown}
							/>
							{#if newTagInput.trim()}
								<span
									class="enter-hint"
									transition:fade={{ duration: 100 }}
								>
									press <kbd class="enter-kbd">Enter</kbd>
								</span>
							{/if}
						</div>
						{#if newTagInput.trim()}
							<Button
								variant="outline"
								size="icon"
								onclick={() => addTagToAll(newTagInput)}
								aria-label="Add tag"
							>
								<Plus size={16} />
							</Button>
						{/if}
					</div>

					<!-- Predictive tag suggestions menu -->
					{#if isSuggestionsOpen && (filteredSuggestions.length > 0 || (newTagInput.trim() && deckTagsList.length > 0))}
						<div
							class="suggestions-panel"
							transition:fly={{ y: -4, duration: 140 }}
						>
							<div class="suggestions-header">
								<div class="suggestions-title">
									<Tags size={12} class="suggestions-title-icon" />
									<span>
										{#if newTagInput.trim()}
											Matching deck tags
										{:else}
											Existing tags in deck
										{/if}
									</span>
								</div>
								<div class="suggestions-header-actions">
									<span class="suggestions-badge">
										{filteredSuggestions.length}
									</span>
									<button
										type="button"
										class="close-suggestions-btn"
										onclick={() => (isSuggestionsOpen = false)}
										title="Hide suggestions (Esc)"
										aria-label="Hide suggestions"
									>
										<X size={11} />
									</button>
								</div>
							</div>

							{#if filteredSuggestions.length > 0}
								<div
									class="suggestions-list-container"
									bind:this={suggestionsListEl}
									role="listbox"
								>
									{#each filteredSuggestions as tag, idx}
										<button
											type="button"
											class="suggestion-item"
											class:active={idx === activeIndex}
											role="option"
											aria-selected={idx === activeIndex}
											onmouseenter={() => (activeIndex = idx)}
											onmousedown={(e) => e.preventDefault()}
											onclick={() => addTagToAll(tag)}
										>
											<div class="suggestion-item-left">
												<span class="suggestion-bullet"></span>
												<span class="suggestion-tag-name">
													{tag}
												</span>
											</div>
											{#if deckTagCounts.has(tag)}
												<span class="suggestion-count-pill">
													{deckTagCounts.get(tag)} card{deckTagCounts.get(tag) === 1 ? "" : "s"}
												</span>
											{/if}
										</button>
									{/each}
								</div>
							{:else if newTagInput.trim()}
								<div class="suggestions-empty">
									<span class="suggestions-empty-text">No matching existing tags</span>
									<span class="suggestions-empty-hint">
										Press <kbd class="hint-kbd">Enter</kbd> to add "{newTagInput.trim()}" as a new tag
									</span>
								</div>
							{/if}

							<div class="suggestions-footer-hint">
								<span><kbd class="hint-kbd">↑↓</kbd> navigate</span>
								<span><kbd class="hint-kbd">Tab</kbd> complete</span>
								<span><kbd class="hint-kbd">↵</kbd> add</span>
								<span><kbd class="hint-kbd">Esc</kbd> hide</span>
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<Button variant="ghost" onclick={handleClose}>Cancel</Button>
				<Button variant="default" onclick={handleApply}>Apply</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10500;
	}

	.modal-content {
		background: hsl(var(--card));
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow:
			0 25px 50px -12px rgba(0, 0, 0, 0.65),
			0 0 0 1px hsla(255, 100%, 100%, 0.04);
		width: 100%;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		max-height: calc(100vh - 4rem);
	}

	/* ── Header ── */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid hsla(var(--border) / 0.4);
		flex-shrink: 0;
	}

	.modal-title-row {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	:global(.title-icon) {
		color: hsl(var(--primary));
		flex-shrink: 0;
	}

	.modal-title {
		font-size: 0.9375rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	.card-count-badge {
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 99px;
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary));
		border: 1px solid hsl(var(--primary) / 0.25);
	}

	.close-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		transition:
			color 0.1s,
			background 0.1s;
	}

	.close-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.4);
	}

	/* ── Body ── */
	.modal-body {
		padding: 0.875rem 1.25rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
		overflow-y: auto;
		scrollbar-width: thin;
		scrollbar-color: hsla(var(--border) / 0.6) transparent;
	}

	/* ── Tag list ── */
	.tag-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.tag-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-sm);
		border: 1px solid transparent;
		gap: 0.5rem;
		min-height: 2.375rem;
		transition: background 0.1s;
	}

	.tag-row.is-shared {
		background: hsl(var(--primary) / 0.07);
		border-color: hsl(var(--primary) / 0.18);
	}

	.tag-row.is-partial {
		background: hsla(var(--muted) / 0.25);
		border-color: hsla(var(--border) / 0.3);
	}

	.tag-row:hover {
		filter: brightness(1.07);
	}

	.tag-row-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
	}

	.status-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.status-dot.shared {
		background: hsl(var(--primary));
		box-shadow: 0 0 5px hsl(var(--primary) / 0.5);
	}

	.status-dot.partial {
		background: hsl(var(--muted-foreground));
		opacity: 0.45;
	}

	.tag-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-width: 0;
	}

	.tag-row.is-partial .tag-name {
		color: hsl(var(--muted-foreground));
	}

	.count-badge {
		font-size: 0.6875rem;
		font-weight: 500;
		padding: 1px 6px;
		border-radius: 99px;
		background: hsla(var(--muted) / 0.4);
		color: hsl(var(--muted-foreground));
		border: 1px solid hsla(var(--border) / 0.3);
		white-space: nowrap;
		flex-shrink: 0;
	}

	.tag-row.is-shared .count-badge {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
		border-color: hsl(var(--primary) / 0.2);
	}

	/* ── Inline edit ── */
	.tag-edit-input {
		flex: 1;
		min-width: 0;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--primary) / 0.5);
		border-radius: var(--radius-sm);
		padding: 2px 7px;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		outline: none;
	}

	.tag-edit-input:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15);
	}

	/* ── Action buttons ── */
	.tag-row-actions {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		flex-shrink: 0;
	}

	.action-btn {
		display: inline-flex;
		align-items: center;
		gap: 3px;
		border: none;
		border-radius: var(--radius-sm);
		padding: 3px 7px;
		font-size: 0.6875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.1s;
		white-space: nowrap;
	}

	/* Extend button */
	.extend-btn {
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary));
	}

	.extend-btn:hover {
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary-light, var(--primary)));
	}

	/* Primary/star button */
	.primary-btn {
		background: hsla(43, 100%, 55%, 0.1);
		color: hsl(43, 90%, 55%);
	}

	.primary-btn:hover {
		background: hsla(43, 100%, 55%, 0.2);
		color: hsl(43, 100%, 60%);
	}

	/* Edit/pencil — icon only */
	.edit-btn {
		background: transparent;
		color: hsl(var(--muted-foreground));
		padding: 4px 5px;
	}

	.edit-btn:hover {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
	}

	/* Confirm (check) */
	.confirm-btn {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		padding: 3px 6px;
	}

	.confirm-btn:hover {
		background: hsl(var(--primary) / 0.3);
	}

	/* Cancel (x on edit) */
	.cancel-btn {
		background: transparent;
		color: hsl(var(--muted-foreground));
		padding: 3px 5px;
	}

	.cancel-btn:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
	}

	/* Remove button — icon only */
	.remove-btn {
		background: transparent;
		color: hsl(var(--muted-foreground));
		padding: 4px 5px;
		opacity: 0.6;
	}

	.remove-btn:hover {
		background: hsl(var(--destructive) / 0.1);
		color: hsl(var(--destructive));
		opacity: 1;
	}

	.btn-label {
		font-size: 0.6875rem;
	}

	/* ── Empty state ── */
	.no-tags-placeholder {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		margin: 0;
		padding: 0.5rem 0;
	}

	/* ── Add tag section ── */
	.add-tag-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding-top: 0.25rem;
		border-top: 1px solid hsla(var(--border) / 0.3);
	}

	.tag-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.tag-input-container {
		position: relative;
		flex: 1;
		display: flex;
		align-items: center;
	}

	.enter-hint {
		position: absolute;
		right: 0.75rem;
		font-size: 0.7rem;
		color: hsl(var(--muted-foreground));
		pointer-events: none;
		background: hsl(var(--muted) / 0.8);
		padding: 2px 6px;
		border-radius: 3px;
		border: 1px solid hsl(var(--border));
		display: flex;
		align-items: center;
		gap: 3px;
	}

	.enter-kbd {
		font-family: inherit;
		font-weight: 600;
	}

	/* ── Predictive suggestions panel ── */
	.suggestions-panel {
		background: hsla(var(--card) / 0.95);
		border: 1px solid hsla(var(--border) / 0.55);
		border-radius: var(--radius-md);
		overflow: hidden;
		display: flex;
		flex-direction: column;
		box-shadow:
			0 10px 25px -5px rgba(0, 0, 0, 0.45),
			0 0 0 1px hsla(255, 100%, 100%, 0.03);
		margin-top: 0.25rem;
	}

	.suggestions-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.35rem 0.65rem;
		border-bottom: 1px solid hsla(var(--border) / 0.3);
		background: hsla(var(--muted) / 0.2);
	}

	.suggestions-title {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	:global(.suggestions-title-icon) {
		color: hsl(var(--primary));
		opacity: 0.8;
	}

	.suggestions-header-actions {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.suggestions-badge {
		font-size: 0.625rem;
		font-weight: 600;
		padding: 1px 5px;
		border-radius: 99px;
		background: hsla(var(--muted) / 0.5);
		color: hsl(var(--muted-foreground));
	}

	.close-suggestions-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 2px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		transition: color 0.1s;
	}

	.close-suggestions-btn:hover {
		color: hsl(var(--foreground));
	}

	.suggestions-list-container {
		max-height: 150px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1px;
		padding: 3px;
		scrollbar-width: thin;
		scrollbar-color: hsla(var(--border) / 0.6) transparent;
	}

	.suggestion-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.375rem 0.625rem;
		border-radius: var(--radius-sm);
		background: transparent;
		border: 1px solid transparent;
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		text-align: left;
		width: 100%;
		transition:
			background 0.1s,
			border-color 0.1s;
	}

	.suggestion-item:hover {
		background: hsl(var(--primary) / 0.1);
	}

	.suggestion-item.active {
		background: hsl(var(--primary) / 0.18);
		border-color: hsl(var(--primary) / 0.35);
		font-weight: 600;
	}

	.suggestion-item-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.suggestion-bullet {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: hsl(var(--primary));
		opacity: 0.7;
		flex-shrink: 0;
	}

	.suggestion-item.active .suggestion-bullet {
		opacity: 1;
		box-shadow: 0 0 5px hsl(var(--primary));
	}

	.suggestion-tag-name {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.suggestion-count-pill {
		font-size: 0.6875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: hsla(var(--muted) / 0.35);
		padding: 1px 6px;
		border-radius: 99px;
		white-space: nowrap;
		flex-shrink: 0;
	}

	.suggestion-item.active .suggestion-count-pill {
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
	}

	.suggestions-empty {
		padding: 0.75rem 0.65rem;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		align-items: center;
		text-align: center;
	}

	.suggestions-empty-text {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.suggestions-empty-hint {
		font-size: 0.71875rem;
		color: hsl(var(--muted-foreground) / 0.8);
	}

	.suggestions-footer-hint {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 0.3rem 0.65rem;
		font-size: 0.65rem;
		color: hsl(var(--muted-foreground));
		border-top: 1px solid hsla(var(--border) / 0.25);
		background: hsla(var(--muted) / 0.1);
	}

	.hint-kbd {
		font-family: inherit;
		font-size: 0.625rem;
		font-weight: 600;
		padding: 1px 4px;
		border-radius: 3px;
		background: hsla(var(--muted) / 0.6);
		border: 1px solid hsla(var(--border) / 0.5);
	}

	/* ── Footer ── */
	.modal-footer {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding: 0.75rem 1.25rem 1rem;
		border-top: 1px solid hsla(var(--border) / 0.4);
		flex-shrink: 0;
	}
</style>
