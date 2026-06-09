<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { X, Plus, Star } from "lucide-svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	let cmc = $state(0);
	let typeLine = $state("");
	let colorCategory = $state("Default");
	
	// Local tags state
	/** @type {string[]} */
	let tags = $state([]);
	/** @type {string | null} */
	let primaryTag = $state(null);
	let newTagInput = $state("");

	// Track values as they were when the modal opened
	let initialCmc = $state(0);
	let initialTypeLine = $state("");
	let initialColorCategory = $state("Default");
	/** @type {string[]} */
	let initialTags = $state([]);
	/** @type {string | null} */
	let initialPrimaryTag = $state(null);

	let card = $derived(interactionStore.cardDataModal.card);

	// Derived default values from card metadata
	let defaultCmc = $derived(card ? (deckStore.metadata[card.name.toLowerCase()]?.cmc ?? card.cmc ?? 0) : 0);
	let defaultTypeLine = $derived(card ? (card.type_line || deckStore.metadata[card.name.toLowerCase()]?.type_line || "") : "");
	let defaultColorCategory = $derived("Default");

	// Derived global list of tags in the deck
	let deckTagsList = $derived.by(() => {
		const allTags = new Set();
		const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
		const storeAny = /** @type {any} */ (deckStore);
		for (const board of boards) {
			if (storeAny[board]) {
				const list = storeAny[board] || [];
				for (const c of list) {
					if (c.tags) {
						for (const t of c.tags) {
							allTags.add(t);
						}
					}
				}
			}
		}
		return [...allTags].sort((a, b) => a.localeCompare(b));
	});

	$effect(() => {
		if (interactionStore.cardDataModal.isOpen && card) {
			const overrides = card.overrides || {};
			const metadata = deckStore.metadata[card.name.toLowerCase()] || {};

			cmc = overrides.manaValue !== undefined 
				? overrides.manaValue 
				: (card.cmc !== undefined ? card.cmc : (metadata.cmc ?? 0));

			typeLine = overrides.primaryType !== undefined 
				? overrides.primaryType 
				: (card.type_line || metadata.type_line || "");

			colorCategory = overrides.colorCategory !== undefined 
				? overrides.colorCategory 
				: "Default";

			tags = card.tags ? [...card.tags] : [];
			primaryTag = card.primaryTag || (tags[0] || null);

			// Store initial values to determine if newly edited
			initialCmc = cmc;
			initialTypeLine = typeLine;
			initialColorCategory = colorCategory;
			initialTags = [...tags];
			initialPrimaryTag = primaryTag;
		}
	});

	function handleClose() {
		interactionStore.closeCardDataModal();
	}

	function addTag() {
		const val = newTagInput.trim();
		if (val && !tags.includes(val)) {
			tags.push(val);
			if (!primaryTag) {
				primaryTag = val;
			}
			newTagInput = "";
		}
	}

	/** @param {string} tag */
	function removeTag(tag) {
		tags = tags.filter(t => t !== tag);
		if (primaryTag === tag) {
			primaryTag = tags[0] || null;
		}
	}

	/** @param {string} tag */
	function togglePrimary(tag) {
		primaryTag = primaryTag === tag ? (tags.find(t => t !== tag) || null) : tag;
	}

	function handleSubmit() {
		if (!card) return;
		const cardId = card.id;

		// 1. CMC Override
		const parsedCmc = parseInt(String(cmc), 10);
		if (!isNaN(parsedCmc)) {
			deckStore.setCardOverride(cardId, 'manaValue', parsedCmc);
		}

		// 2. Type Override
		deckStore.setCardOverride(cardId, 'primaryType', typeLine.trim());

		// 3. Color Category Override
		if (colorCategory === "Default") {
			deckStore.resetCardOverride(cardId, 'colorCategory');
			deckStore.resetCardOverride(cardId, 'colors');
			deckStore.resetCardOverride(cardId, 'colorIdentity');
		} else {
			deckStore.setCardOverride(cardId, 'colorCategory', colorCategory);
			/** @type {Record<string, string[]>} */
			const mapColors = { "White": ["W"], "Blue": ["U"], "Black": ["B"], "Red": ["R"], "Green": ["G"] };
			if (mapColors[colorCategory]) {
				deckStore.setCardOverride(cardId, 'colors', mapColors[colorCategory]);
				deckStore.setCardOverride(cardId, 'colorIdentity', mapColors[colorCategory]);
			} else if (colorCategory === "Colorless") {
				deckStore.setCardOverride(cardId, 'colors', []);
				deckStore.setCardOverride(cardId, 'colorIdentity', []);
			}
		}

		// 4. Tags Override
		deckStore.reorderCardTags(cardId, tags);
		if (primaryTag) {
			deckStore.setPrimaryTag(cardId, primaryTag);
		} else {
			const result = deckStore.findCardById(cardId);
			if (result && result.card) {
				delete result.card.primaryTag;
			}
		}

		handleClose();
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "Enter") handleSubmit();
		if (e.key === "Escape") handleClose();
	}

	// Dynamic comparison for tags array equality
	let isTagsChanged = $derived(
		tags.length !== initialTags.length ||
		tags.some((t, i) => t !== initialTags[i]) ||
		primaryTag !== initialPrimaryTag
	);

	let isTagsCustom = $derived(
		tags.length > 0
	);
</script>

{#if interactionStore.cardDataModal.isOpen}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div 
		class="modal-backdrop" 
		transition:fade={{ duration: 150 }}
		onclick={handleClose}
	>
		<div 
			class="modal-content" 
			transition:scale={{ duration: 200, start: 0.98 }}
			onclick={(e) => e.stopPropagation()}
		>
			<button class="close-btn" onclick={handleClose} aria-label="Close">
				<X size={16} />
			</button>

			<div class="modal-header">
				<h3 class="text-lg font-semibold tracking-tight">Change Card Data</h3>
				<p class="text-sm text-muted-foreground">{card?.name}</p>
			</div>

			<div class="modal-body">
				<div class="form-group">
					<label for="card-cmc">Mana Value (CMC)</label>
					<Input
						id="card-cmc"
						type="number"
						bind:value={cmc}
						min="0"
						max="99"
						class={cmc !== initialCmc ? 'text-blue' : (cmc !== defaultCmc ? 'text-white' : 'text-muted')}
						onkeydown={handleKeydown}
					/>
				</div>

				<div class="form-group">
					<label for="card-type">Type Line</label>
					<Input
						id="card-type"
						type="text"
						bind:value={typeLine}
						class={typeLine !== initialTypeLine ? 'text-blue' : (typeLine !== defaultTypeLine ? 'text-white' : 'text-muted')}
						onkeydown={handleKeydown}
						placeholder="e.g. Creature — Elf Warrior"
					/>
				</div>

				<div class="form-group">
					<label for="card-color-cat">Color Category</label>
					<select 
						id="card-color-cat" 
						bind:value={colorCategory}
						class={colorCategory !== initialColorCategory ? 'text-blue' : (colorCategory !== 'Default' ? 'text-white' : 'text-muted')}
					>
						<option value="Default">Default (Based on Card Colors)</option>
						<option value="White">White</option>
						<option value="Blue">Blue</option>
						<option value="Black">Black</option>
						<option value="Red">Red</option>
						<option value="Green">Green</option>
						<option value="Multicolor">Multicolor</option>
						<option value="Colorless">Colorless</option>
						<option value="Lands">Lands</option>
					</select>
				</div>

				<!-- Tags Editor -->
				<div class="form-group">
					<label for="card-tags" class={isTagsChanged ? 'label-blue' : (isTagsCustom ? 'label-white' : 'label-muted')}>Card Tags</label>
					
					<!-- Active Tags Badges -->
					<div class="active-tags-list">
						{#each tags as tag}
							<div class="tag-badge-pill" class:is-primary={primaryTag === tag}>
								<button 
									type="button" 
									class="primary-star-btn"
									onclick={() => togglePrimary(tag)}
									title={primaryTag === tag ? "Primary tag (click to demote)" : "Make primary tag"}
								>
									<Star size={12} fill={primaryTag === tag ? "currentColor" : "none"} />
								</button>
								<span class="tag-label-text">{tag}</span>
								<button 
									type="button" 
									class="remove-tag-btn" 
									onclick={() => removeTag(tag)}
									aria-label="Remove tag"
								>
									<X size={12} />
								</button>
							</div>
						{:else}
							<span class="no-tags-placeholder">No tags assigned</span>
						{/each}
					</div>

					<!-- Input to Add Tag -->
					<div class="tag-input-row">
						<Input
							id="card-tags"
							type="text"
							placeholder="Add a tag..."
							bind:value={newTagInput}
							onkeydown={(e) => {
								if (e.key === "Enter") {
									e.preventDefault();
									addTag();
								}
							}}
						/>
						<Button variant="outline" size="icon" onclick={addTag} aria-label="Add tag">
							<Plus size={16} />
						</Button>
					</div>

					<!-- Suggestions -->
					{#if deckTagsList.some(t => !tags.includes(t))}
						<div class="suggestions-section">
							<span class="suggestions-label">Suggestions:</span>
							<div class="suggestions-list">
								{#each deckTagsList as gTag}
									{#if !tags.includes(gTag)}
										<button 
											type="button" 
											class="suggestion-pill"
											onclick={() => {
												tags.push(gTag);
												if (!primaryTag) primaryTag = gTag;
											}}
										>
											{gTag}
										</button>
									{/if}
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<div class="modal-footer">
				<Button variant="outline" onclick={handleClose}>Cancel</Button>
				<Button variant="default" onclick={handleSubmit}>Confirm</Button>
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
		background: rgba(0, 0, 0, 0.4);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.modal-content {
		position: relative;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-lg);
		width: 100%;
		max-width: 420px;
		padding: 2.5rem 2rem 2rem;
		box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
		color: hsl(var(--foreground));
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 4px;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.close-btn:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.modal-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.modal-header h3 {
		margin: 0;
		color: hsl(var(--foreground));
	}

	.modal-header p {
		margin: 0.5rem 0 0;
	}

	.modal-body {
		margin-bottom: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		text-align: left;
	}

	.form-group label {
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		transition: color 0.15s;
	}

	.label-blue {
		color: #3b82f6 !important;
	}
	.label-white {
		color: #ffffff !important;
	}
	.label-muted {
		color: hsl(var(--muted-foreground)) !important;
	}

	/* Select styling matching standard ui-input but with chevron spacing */
	select {
		display: flex;
		height: 2.25rem;
		width: 100%;
		border-radius: var(--radius);
		border: 1px solid hsl(var(--border));
		background-color: hsla(var(--input) / 0.3);
		padding: 0 2.25rem 0 0.75rem;
		font-size: 0.875rem;
		transition: border-color 0.15s, box-shadow 0.15s;
		color: hsl(var(--foreground));
		outline: none;
		appearance: none;
		-webkit-appearance: none;
		background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='hsl(240, 5%, 65%)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
		background-repeat: no-repeat;
		background-position: right 0.75rem center;
		background-size: 1rem;
	}

	select:focus-visible {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 3px hsla(var(--primary) / 0.2);
	}

	/* Text color themes based on default, custom/saved override, or dirty edited state */
	:global(.ui-input.text-blue), select.text-blue {
		color: #3b82f6 !important;
	}
	:global(.ui-input.text-white), select.text-white {
		color: #ffffff !important;
	}
	:global(.ui-input.text-muted), select.text-muted {
		color: hsl(var(--muted-foreground)) !important;
	}

	/* Tags Editor specific styles */
	.active-tags-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 0.25rem;
		min-height: 1.5rem;
		align-items: center;
	}

	.no-tags-placeholder {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		font-style: italic;
	}

	.tag-badge-pill {
		display: inline-flex;
		align-items: center;
		background: hsla(var(--muted) / 0.4);
		border: 1px solid hsla(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		padding: 2px 6px;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		gap: 4px;
	}

	.tag-badge-pill.is-primary {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary) / 0.4);
		color: hsl(var(--primary));
	}

	.primary-star-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.tag-badge-pill.is-primary .primary-star-btn {
		color: hsl(var(--primary));
	}

	.tag-badge-pill:hover .primary-star-btn {
		color: hsl(var(--foreground));
	}

	.remove-tag-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
	}

	.remove-tag-btn:hover {
		color: hsl(var(--destructive));
	}

	.tag-input-row {
		display: flex;
		gap: 0.5rem;
	}

	.suggestions-section {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-top: 0.25rem;
	}

	.suggestions-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}

	.suggestions-list {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
	}

	.suggestion-pill {
		background: hsla(var(--muted) / 0.25);
		border: 1px solid hsla(var(--border) / 0.3);
		border-radius: var(--radius-sm);
		padding: 1px 5px;
		font-size: 0.6875rem;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.1s;
	}

	.suggestion-pill:hover {
		background: hsla(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.modal-footer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
</style>
