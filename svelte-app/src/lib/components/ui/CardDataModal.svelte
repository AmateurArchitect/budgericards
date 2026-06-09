<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { X } from "lucide-svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import Button from "$lib/components/ui/Button.svelte";

	let cmc = $state(0);
	let typeLine = $state("");
	let colorCategory = $state("Default");
	let customColumn = $state("");

	// Track values as they were when the modal opened
	let initialCmc = $state(0);
	let initialTypeLine = $state("");
	let initialColorCategory = $state("Default");
	let initialCustomColumn = $state("");

	let card = $derived(interactionStore.cardDataModal.card);

	// Derived default values from card metadata
	let defaultCmc = $derived(card ? (deckStore.metadata[card.name.toLowerCase()]?.cmc ?? card.cmc ?? 0) : 0);
	let defaultTypeLine = $derived(card ? (card.type_line || deckStore.metadata[card.name.toLowerCase()]?.type_line || "") : "");
	let defaultColorCategory = $derived("Default");
	let defaultCustomColumn = $derived("");

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

			// Store initial values to determine if newly edited
			initialCmc = cmc;
			initialTypeLine = typeLine;
			initialColorCategory = colorCategory;
			initialCustomColumn = customColumn;
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

				<div class="form-group">
					<label for="card-custom-column">Custom Column (for Freeform Layout)</label>
					<Input
						id="card-custom-column"
						type="text"
						bind:value={customColumn}
						class={customColumn !== initialCustomColumn ? 'text-blue' : (customColumn !== defaultCustomColumn ? 'text-white' : 'text-muted')}
						onkeydown={handleKeydown}
						placeholder="e.g. Draw, Removal, Ramp"
					/>
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

	.modal-footer {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
	}
</style>
