<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { X } from "lucide-svelte";

	let cmc = $state(0);
	let typeLine = $state("");
	let colorCategory = $state("Default");
	let customColumn = $state("");

	/** @type {HTMLInputElement | null} */
	let inputEl = $state(null);

	let card = $derived(interactionStore.cardDataModal.card);

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

			customColumn = card.customColumn || "";

			setTimeout(() => inputEl?.focus(), 50);
		}
	});

	function handleClose() {
		interactionStore.closeCardDataModal();
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

		// 4. Custom Column Override
		if (customColumn.trim()) {
			deckStore.setCustomColumn(cardId, customColumn.trim());
		} else {
			const result = deckStore.findCardById(cardId);
			if (result && result.card) {
				delete result.card.customColumn;
			}
		}

		handleClose();
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "Enter") handleSubmit();
		if (e.key === "Escape") handleClose();
	}
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
					<input
						id="card-cmc"
						bind:this={inputEl}
						type="number"
						bind:value={cmc}
						min="0"
						max="99"
						onkeydown={handleKeydown}
					/>
				</div>

				<div class="form-group">
					<label for="card-type">Type Line</label>
					<input
						id="card-type"
						type="text"
						bind:value={typeLine}
						onkeydown={handleKeydown}
						placeholder="e.g. Creature — Elf Warrior"
					/>
				</div>

				<div class="form-group">
					<label for="card-color-cat">Color Category</label>
					<select id="card-color-cat" bind:value={colorCategory}>
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

				<div class="form-group">
					<label for="card-custom-column">Custom Column</label>
					<input
						id="card-custom-column"
						type="text"
						bind:value={customColumn}
						onkeydown={handleKeydown}
						placeholder="e.g. Draw, Removal, Ramp"
					/>
				</div>
			</div>

			<div class="modal-footer">
				<button class="btn btn-outline" onclick={handleClose}>Cancel</button>
				<button class="btn btn-primary" onclick={handleSubmit}>Confirm</button>
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
		max-width: 400px;
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
	}

	.form-group input, .form-group select {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		outline: none;
		font-family: inherit;
		transition: all 0.2s;
	}

	.form-group input:focus, .form-group select:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.modal-footer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}

	.btn {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		border: 1px solid transparent;
	}

	.btn-outline {
		background: transparent;
		border-color: hsl(var(--border));
		color: hsl(var(--foreground));
	}

	.btn-outline:hover {
		background: hsl(var(--accent));
	}

	.btn-primary {
		background: hsl(var(--primary-dark));
		color: hsl(var(--primary-foreground));
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.2);
	}

	.btn-primary:hover {
		background: hsl(var(--primary));
		box-shadow: 0 6px 15px hsl(var(--primary) / 0.3);
	}
</style>
