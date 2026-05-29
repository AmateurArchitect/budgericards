<script>
	import CardShell from "./CardShell.svelte";
	import CardArt from "./CardArt.svelte";
	import { settingsStore } from "$lib/stores/settings.svelte.js";

	/** @type {{ card: any, price: number | null, inSearchPanel?: boolean, index?: number }} */
	let { card, price, inSearchPanel = false, index = 0 } = $props();

	const priceDisplay = $derived(
		price !== null ? `$${Number(price).toFixed(2)}` : "Illegal",
	);
</script>

<CardShell {card} {price} {inSearchPanel}>
	{#snippet children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
		<div class="card-container">
			<div
				class="card-item"
				class:in-search={inSearchPanel}
				class:dragging={isDragging}
			>
				<CardArt 
					{card} 
					{price} 
					{isFlipped} 
					{isRotated} 
					{toggleFlip} 
					{toggleRotate}
					showPrice={inSearchPanel && settingsStore.showPrices}
					showLegalityLabel={inSearchPanel}
					hideControlsUntilHover={!inSearchPanel}
					lazy={inSearchPanel ? (index >= 12) : true}
				/>

				{#if !inSearchPanel}
					<div class="card-details">
						<div class="card-header">
							<span class="card-name" title={card.name}>{card.name}</span>
							<span class="card-price" class:illegal={price === null}
								>{priceDisplay}</span
							>
						</div>
					</div>
				{/if}
			</div>
		</div>
	{/snippet}
</CardShell>

<style>
	.card-container {
		container-type: inline-size;
		width: var(--card-width);
	}

	.card-item {
		background: var(--bg-panel);
		border-radius: calc(var(--card-width) * 0.045);
		overflow: hidden;
		transition:
			box-shadow 0.3s ease,
			transform 0.3s ease;
		position: relative;
		box-shadow:
			var(--shadow-sm),
			var(--inner-glow),
			inset 0 0 0 1px var(--border);
		width: 100%;
		cursor: pointer;
		user-select: none;
	}

	.card-item.dragging {
		opacity: 0.4;
		transform: scale(0.95);
	}

	.card-item:hover {
		transition:
			box-shadow 0.15s ease,
			transform 0.15s ease;
		box-shadow:
			var(--shadow-md),
			var(--inner-glow),
			inset 0 0 0 1px var(--border-hover);
		transform: translateY(-4px);
	}

	.card-item.in-search:hover {
		transform: translateY(-4px) scale(1.01);
	}

	.card-details {
		padding: 12px;
	}

	.card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 8px;
		margin-bottom: 8px;
	}

	.card-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-primary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-price {
		font-size: 0.75rem;
		color: var(--success);
		font-weight: 600;
		font-family: tabular-nums;
	}

	.card-price.illegal {
		color: var(--danger);
	}
</style>
