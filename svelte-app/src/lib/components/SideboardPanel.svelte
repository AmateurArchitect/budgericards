<script>
	import { slide, fade } from "svelte/transition";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { ChevronLeft, ChevronRight, Plus, Minus, ArrowLeftRight, FolderHeart } from "lucide-svelte";
	import { onMount } from "svelte";

	let isExpanded = $state(true);

	// Load collapsed/expanded state from localStorage if available
	onMount(() => {
		const cached = localStorage.getItem("budgericards_sideboard_expanded");
		if (cached !== null) {
			isExpanded = cached === "true";
		}
	});

	function togglePanel() {
		isExpanded = !isExpanded;
		localStorage.setItem("budgericards_sideboard_expanded", String(isExpanded));
	}

	// Group sideboard cards by name and sort alphabetically
	const groupedSideboard = $derived.by(() => {
		/** @type {Map<string, { name: string, price: number, instances: any[], quantity: number }>} */
		const map = new Map();
		
		for (const card of deckStore.sideboard) {
			const nameLower = card.name.toLowerCase();
			if (!map.has(nameLower)) {
				map.set(nameLower, {
					name: card.name,
					price: card.price || 0,
					instances: [],
					get quantity() { return this.instances.length; }
				});
			}
			map.get(nameLower)?.instances.push(card);
		}
		
		return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
	});

	const totalCount = $derived(deckStore.sideboard.length);

	/**
	 * @param {string} name
	 * @param {any[]} instances
	 */
	function handleDecrement(name, instances) {
		if (instances.length > 0) {
			deckStore.removeCard(name, "sideboard", instances[0].id);
		}
	}

	/**
	 * @param {string} name
	 * @param {number} price
	 */
	function handleIncrement(name, price) {
		deckStore.addCard(name, "sideboard", price);
	}

	/**
	 * @param {string} name
	 * @param {any[]} instances
	 * @param {number} price
	 */
	function handleMoveToMain(name, instances, price) {
		if (instances.length > 0) {
			deckStore.moveCard(name, "sideboard", "mainboard", instances[0].id, price);
		}
	}
</script>

{#if totalCount > 0}
	<aside class="sideboard-panel-wrapper" class:expanded={isExpanded}>
		<!-- Trigger Tab -->
		<button
			type="button"
			class="panel-tab"
			onclick={togglePanel}
			aria-label={isExpanded ? "Collapse Sideboard" : "Expand Sideboard"}
		>
			{#if isExpanded}
				<ChevronRight size={14} />
			{:else}
				<ChevronLeft size={14} />
			{/if}
			<div class="vertical-label">
				<FolderHeart size={12} class="icon" />
				<span>SIDEBOARD ({totalCount})</span>
			</div>
		</button>

		<div class="panel-content">
			<div class="panel-header">
				<h4>Sideboard</h4>
				<span class="card-counter">{totalCount} {totalCount === 1 ? "card" : "cards"}</span>
			</div>

			<div class="panel-body">
				{#each groupedSideboard as group (group.name)}
					<div class="sideboard-item" transition:slide={{ duration: 150 }}>
						<div class="item-info">
							<span class="card-name" title={group.name}>{group.name}</span>
							{#if group.price > 0}
								<span class="card-price">${(group.price * group.quantity).toFixed(2)}</span>
							{/if}
						</div>
						<div class="item-actions">
							<div class="quantity-controller">
								<button
									class="action-btn"
									onclick={() => handleDecrement(group.name, group.instances)}
									title="Remove 1 copy"
								>
									<Minus size={12} />
								</button>
								<span class="quantity-display">{group.quantity}</span>
								<button
									class="action-btn"
									onclick={() => handleIncrement(group.name, group.price)}
									title="Add 1 copy"
								>
									<Plus size={12} />
								</button>
							</div>
							<button
								class="action-btn move-btn"
								onclick={() => handleMoveToMain(group.name, group.instances, group.price)}
								title="Move 1 copy to Mainboard"
							>
								<ArrowLeftRight size={12} />
								<span>Main</span>
							</button>
						</div>
					</div>
				{/each}
			</div>
		</div>
	</aside>
{/if}

<style>
	.sideboard-panel-wrapper {
		position: fixed;
		top: 56px; /* Below app header */
		right: 0;
		bottom: 0;
		width: 280px;
		z-index: 900;
		background: hsl(var(--popover) / 0.85);
		backdrop-filter: blur(24px);
		border-left: 1px solid hsl(var(--border) / 0.6);
		box-shadow: -10px 0 30px rgba(0, 0, 0, 0.2);
		transform: translateX(100%);
		transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		display: flex;
		flex-direction: column;
	}

	.sideboard-panel-wrapper.expanded {
		transform: translateX(0);
	}

	/* Panel Trigger Tab */
	.panel-tab {
		position: absolute;
		left: -28px;
		top: 80px;
		width: 28px;
		padding: 12px 4px;
		background: hsl(var(--popover) / 0.9);
		backdrop-filter: blur(20px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-right: none;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		box-shadow: -5px 0 15px rgba(0, 0, 0, 0.15);
		transition: color 0.15s, background-color 0.15s;
	}

	.panel-tab:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--popover));
	}

	.vertical-label {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 6px;
		font-size: 0.625rem;
		font-weight: 750;
		letter-spacing: 0.08em;
		writing-mode: vertical-rl;
		text-transform: uppercase;
		white-space: nowrap;
	}

	.vertical-label :global(.icon) {
		transform: rotate(90deg);
		opacity: 0.7;
	}

	/* Panel Inner Content */
	.panel-content {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.panel-header {
		padding: 1rem 1.25rem;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.panel-header h4 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.card-counter {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--foreground) / 0.06);
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.panel-body {
		flex: 1;
		overflow-y: auto;
		padding: 1rem 1.25rem 3rem 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.sideboard-item {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.625rem;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: var(--radius-md);
		transition: border-color 0.15s, background-color 0.15s;
	}

	.sideboard-item:hover {
		border-color: hsl(var(--border) / 0.6);
		background: hsl(var(--muted) / 0.25);
	}

	.item-info {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.card-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.card-price {
		font-size: 0.75rem;
		color: hsl(var(--primary));
		font-weight: 600;
		font-variant-numeric: tabular-nums;
	}

	.item-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
	}

	.quantity-controller {
		display: flex;
		align-items: center;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		overflow: hidden;
	}

	.quantity-display {
		font-size: 0.75rem;
		font-weight: 700;
		min-width: 20px;
		text-align: center;
		color: hsl(var(--foreground));
	}

	.action-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px 6px;
		transition: all 0.1s;
	}

	.action-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--accent) / 0.5);
	}

	.move-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		font-size: 0.6875rem;
		font-weight: 600;
		padding: 3px 6px;
	}

	.move-btn:hover {
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--primary));
	}
</style>
