<script>
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { fade, scale } from "svelte/transition";
	import { Plus, Minus, X } from "lucide-svelte";

	let qty = $state(0);
	/** @type {HTMLInputElement | null} */
	let inputEl = $state(null);

	$effect(() => {
		if (interactionStore.quantityModal.isOpen) {
			qty = interactionStore.quantityModal.initialValue || 1;
			setTimeout(() => inputEl?.focus(), 50);
		}
	});

	function handleClose() {
		interactionStore.closeQuantityModal();
	}

	/** @param {number} delta */
	function adjust(delta) {
		qty = Math.max(0, Math.min(999, qty + delta));
	}

	function handleSubmit() {
		const { card, zone, price, isAdding } = interactionStore.quantityModal;
		const n = parseInt(String(qty));
		
		if (!isNaN(n) && n >= 0) {
			if (isAdding) {
				for (let i = 0; i < n; i++) {
					deckStore.addCard(card.name, deckStore.activeBoard, price, card);
				}
			} else {
				deckStore.setQuantity(card.name, zone || deckStore.activeBoard, n, price, card);
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

{#if interactionStore.quantityModal.isOpen}
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
			<button class="close-btn" onclick={handleClose}>
				<X size={16} />
			</button>

			<div class="modal-header">
				<h3 class="text-lg font-semibold tracking-tight">
					{interactionStore.quantityModal.isAdding ? 'Add Copies' : 'Set Quantity'}
				</h3>
				<p class="text-sm text-muted-foreground">{interactionStore.quantityModal.card?.name}</p>
			</div>

			<div class="modal-body">
				<div class="quantity-control">
					<button 
						class="adjust-btn" 
						onclick={() => adjust(-1)}
						disabled={qty <= 0}
					>
						<Minus size={20} />
					</button>
					
					<div class="input-container">
						<input
							bind:this={inputEl}
							type="number"
							bind:value={qty}
							min="0"
							max="999"
							onkeydown={handleKeydown}
						/>
					</div>

					<button 
						class="adjust-btn" 
						onclick={() => adjust(1)}
					>
						<Plus size={20} />
					</button>
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
		max-width: 360px;
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
	}

	.quantity-control {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1.5rem;
	}

	.adjust-btn {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: hsl(var(--secondary));
		border: 1px solid hsl(var(--border));
		color: hsl(var(--secondary-foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: all 0.2s;
	}

	.adjust-btn:hover:not(:disabled) {
		background: hsl(var(--accent));
		transform: scale(1.05);
	}

	.adjust-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.input-container {
		width: 80px;
	}

	input {
		width: 100%;
		background: transparent;
		border: none;
		font-size: 2.5rem;
		font-weight: 700;
		text-align: center;
		color: hsl(var(--foreground));
		outline: none;
		font-family: inherit;
		letter-spacing: -0.02em;
	}

	/* Hide spin buttons */
	input::-webkit-outer-spin-button,
	input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
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
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		box-shadow: 0 4px 12px hsla(var(--primary-hsl), 0.3);
	}

	.btn-primary:hover {
		filter: brightness(1.1);
		box-shadow: 0 6px 15px hsla(var(--primary-hsl), 0.4);
	}
</style>
