<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { X, Plus, Tags } from "lucide-svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import { untrack } from "svelte";

	/** @type {string[]} */
	let tagUnion = $state([]);
	/** @type {Set<string>} */
	let sharedTags = $state(new Set());
	let newTagInput = $state("");
	/** @type {any[]} */
	let cards = $state([]);

	// Derived: all tags used elsewhere in the deck (for suggestions)
	let deckTagsList = $derived.by(() => {
		const allTags = new Set();
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			const list = storeAny[board] || [];
			for (const c of list) {
				if (c.tags) {
					for (const t of c.tags) {
						allTags.add(t);
					}
				}
			}
		}
		return [...allTags].sort((a, b) => a.localeCompare(b));
	});

	let isOpen = $derived(interactionStore.bulkTagsModal.isOpen);

	// When modal opens, compute the union of all tags across selected cards
	let lastOpenState = false;
	$effect(() => {
		const open = isOpen;
		if (open && !lastOpenState) {
			untrack(() => {
				cards = interactionStore.bulkTagsModal.cards || [];
				computeTagSets();
				newTagInput = "";
			});
		}
		lastOpenState = open;
	});

	function computeTagSets() {
		const unionMap = new Map(); // tag -> count of cards that have it
		for (const card of cards) {
			if (card.tags) {
				for (const t of card.tags) {
					unionMap.set(t, (unionMap.get(t) || 0) + 1);
				}
			}
		}
		tagUnion = [...unionMap.keys()].sort((a, b) => {
			// Shared-by-all tags come first
			const aShared = unionMap.get(a) === cards.length;
			const bShared = unionMap.get(b) === cards.length;
			if (aShared && !bShared) return -1;
			if (!aShared && bShared) return 1;
			return a.localeCompare(b);
		});
		sharedTags = new Set(
			[...unionMap.entries()]
				.filter(([, count]) => count === cards.length)
				.map(([t]) => t)
		);
	}

	function handleClose() {
		interactionStore.closeBulkTagsModal();
	}

	/** @param {string} tag */
	function addTagToAll(tag) {
		const trimmed = tag.trim();
		if (!trimmed) return;
		deckStore.batchUpdate(() => {
			for (const card of cards) {
				deckStore.addCardTag(card.id, trimmed);
			}
		});
		// Optimistically update local state
		if (!tagUnion.includes(trimmed)) {
			tagUnion = [...tagUnion, trimmed].sort((a, b) => a.localeCompare(b));
		}
		sharedTags = new Set([...sharedTags, trimmed]);
		newTagInput = "";
	}

	/** @param {string} tag */
	function removeTagFromAll(tag) {
		deckStore.batchUpdate(() => {
			for (const card of cards) {
				deckStore.removeCardTag(card.id, tag);
			}
		});
		// Optimistically update local state
		tagUnion = tagUnion.filter(t => t !== tag);
		const next = new Set(sharedTags);
		next.delete(tag);
		sharedTags = next;
	}

	function handleAddTag() {
		addTagToAll(newTagInput);
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
		onkeydown={(e) => { if (e.key === "Escape") handleClose(); }}
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
					<span class="card-count-badge">{cards.length} card{cards.length !== 1 ? 's' : ''}</span>
				</div>
				<button class="close-btn" onclick={handleClose} aria-label="Close">
					<X size={16} />
				</button>
			</div>

			<!-- Body -->
			<div class="modal-body">
				<!-- Legend -->
				<div class="legend-row">
					<span class="legend-item">
						<span class="legend-dot shared"></span>
						<span class="legend-text">Shared by all</span>
					</span>
					<span class="legend-item">
						<span class="legend-dot partial"></span>
						<span class="legend-text">Partial (some cards)</span>
					</span>
				</div>

				<!-- Active tag pills -->
				{#if tagUnion.length > 0}
					<div class="active-tags-list">
						{#each tagUnion as tag}
							{@const isShared = sharedTags.has(tag)}
							<div
								class="tag-badge-pill"
								class:is-shared={isShared}
								class:is-partial={!isShared}
								title={isShared ? `All ${cards.length} cards have this tag` : `Only some cards have this tag`}
							>
								<span class="tag-label-text">{tag}</span>
								{#if !isShared}
									<span class="partial-indicator">~</span>
								{/if}
								<button
									type="button"
									class="remove-tag-btn"
									onclick={() => removeTagFromAll(tag)}
									aria-label="Remove tag from all cards"
								>
									<X size={11} />
								</button>
							</div>
						{/each}
					</div>
				{:else}
					<p class="no-tags-placeholder">No tags on any selected cards yet.</p>
				{/if}

				<!-- Add tag input -->
				<div class="tag-input-row">
					<div class="tag-input-container">
						<Input
							id="bulk-tag-input"
							type="text"
							placeholder="Add a tag to all cards..."
							bind:value={newTagInput}
							onkeydown={(/** @type {KeyboardEvent} */ e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									handleAddTag();
								}
							}}
						/>
						{#if newTagInput.trim()}
							<span class="enter-hint" transition:fade={{ duration: 100 }}>
								press <kbd class="enter-kbd">Enter</kbd>
							</span>
						{/if}
					</div>
					{#if newTagInput.trim()}
						<Button variant="outline" size="icon" onclick={handleAddTag} aria-label="Add tag">
							<Plus size={16} />
						</Button>
					{/if}
				</div>

				<!-- Suggestions from deck -->
				{#if deckTagsList.some(t => !tagUnion.includes(t))}
					<div class="suggestions-section">
						<span class="suggestions-label">Add from deck tags:</span>
						<div class="suggestions-list">
							{#each deckTagsList as gTag}
								{#if !tagUnion.includes(gTag)}
									<button
										type="button"
										class="suggestion-pill"
										onclick={() => addTagToAll(gTag)}
									>
										{gTag}
									</button>
								{/if}
							{/each}
						</div>
					</div>
				{/if}
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<Button variant="default" onclick={handleClose}>Done</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.45);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10500;
	}

	.modal-content {
		position: relative;
		background: hsl(var(--card));
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow:
			0 25px 50px -12px rgba(0, 0, 0, 0.6),
			0 0 0 1px hsla(255, 100%, 100%, 0.04);
		width: 100%;
		max-width: 420px;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1rem 1.25rem 0.75rem;
		border-bottom: 1px solid hsla(var(--border) / 0.4);
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
		transition: color 0.1s, background 0.1s;
	}

	.close-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.4);
	}

	.modal-body {
		padding: 1rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.legend-row {
		display: flex;
		gap: 1rem;
		align-items: center;
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 0.35rem;
	}

	.legend-dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.legend-dot.shared {
		background: hsl(var(--primary));
	}

	.legend-dot.partial {
		background: hsl(var(--muted-foreground));
		opacity: 0.5;
	}

	.legend-text {
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
	}

	.active-tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		min-height: 1.5rem;
		align-items: center;
	}

	.no-tags-placeholder {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
		margin: 0;
	}

	.tag-badge-pill {
		display: inline-flex;
		align-items: center;
		gap: 4px;
		border-radius: var(--radius-sm);
		padding: 3px 7px;
		font-size: 0.75rem;
		font-weight: 500;
		transition: background 0.1s;
	}

	.tag-badge-pill.is-shared {
		background: hsl(var(--primary) / 0.15);
		border: 1px solid hsl(var(--primary) / 0.35);
		color: hsl(var(--primary-light));
	}

	.tag-badge-pill.is-partial {
		background: hsla(var(--muted) / 0.35);
		border: 1px solid hsla(var(--border) / 0.4);
		color: hsl(var(--muted-foreground));
		opacity: 0.8;
	}

	.tag-label-text {
		line-height: 1;
	}

	.partial-indicator {
		font-size: 0.625rem;
		font-weight: 700;
		opacity: 0.7;
	}

	.remove-tag-btn {
		background: transparent;
		border: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		color: inherit;
		opacity: 0.6;
		transition: opacity 0.1s, color 0.1s;
	}

	.remove-tag-btn:hover {
		opacity: 1;
		color: hsl(var(--destructive));
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

	.suggestions-section {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}

	.suggestions-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}

	.suggestions-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.suggestion-pill {
		background: hsla(var(--muted) / 0.25);
		border: 1px solid hsla(var(--border) / 0.3);
		border-radius: var(--radius-sm);
		padding: 2px 7px;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.1s;
	}

	.suggestion-pill:hover {
		background: hsla(var(--muted) / 0.6);
		color: hsl(var(--foreground));
		border-color: hsla(var(--border) / 0.6);
	}

	.modal-footer {
		display: flex;
		justify-content: flex-end;
		padding: 0.75rem 1.25rem 1rem;
		border-top: 1px solid hsla(var(--border) / 0.4);
	}
</style>
