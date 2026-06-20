<script>
	import { slide, fade } from "svelte/transition";
	import { flip } from "svelte/animate";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import CardShell from "./CardShell.svelte";
	import CardArt from "./CardArt.svelte";
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

	/** @param {HTMLInputElement} node */
	function selectOnMount(node) {
		node.focus();
		node.select();
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
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M2 9L5 12L2 15M19 9C19 7.69378 18.1652 6.58254 17 6.17071C16.6872 6.06015 16.3506 6 16 6C14.3431 6 13 7 13 9C13 11 14.8348 11.5882 16 12C17.1652 12.4118 19 13 19 15C19 17 17.6569 18 16 18C15.6494 18 15.3128 17.9398 15 17.8293C13.8348 17.4175 13 16.3062 13 15M12 3H20C21.1046 3 22 3.89543 22 5V19C22 20.1046 21.1046 21 20 21H12C10.8954 21 10 20.1046 10 19V5C10 3.89543 10.8954 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			{:else}
				<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
					<path d="M5 9L2 12L5 15M19 9C19 7.69378 18.1652 6.58254 17 6.17071C16.6872 6.06015 16.3506 6 16 6C14.3431 6 13 7 13 9C13 11 14.8348 11.5882 16 12C17.1652 12.4118 19 13 19 15C19 17 17.6569 18 16 18C15.6494 18 15.3128 17.9398 15 17.8293C13.8348 17.4175 13 16.3062 13 15M12 3H20C21.1046 3 22 3.89543 22 5V19C22 20.1046 21.1046 21 20 21H12C10.8954 21 10 20.1046 10 19V5C10 3.89543 10.8954 3 12 3Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
				</svg>
			{/if}
		</button>

		<div class="panel-content">
			<div class="panel-header">
				<h4>Sideboard</h4>
				<span class="card-counter">{totalCount} {totalCount === 1 ? "card" : "cards"}</span>
			</div>

			<div class="panel-body">
				<div class="sideboard-stack-container">
					{#each groupedSideboard as group, idx (group.name)}
						{@const item = group.instances[0]}
						{@const isStack = group.quantity > 1}
						<div
							animate:flip={{ duration: 200 }}
							class="sideboard-card-item"
							class:has-badge={isStack}
							style="z-index: {idx + 1};"
						>
							<CardShell
								card={item}
								price={item.price}
								zone="sideboard"
								inSearchPanel={false}
							>
								{#snippet children({
									isFlipped,
									isRotated,
									toggleFlip,
									toggleRotate,
								})}
									{#if isStack}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<button
											type="button"
											class="stack-badge"
											onclick={(e) => {
												e.stopPropagation();
												e.preventDefault();
												interactionStore.startEditing(
													item.id,
													"sideboard",
													item.price,
												);
											}}
										>
											<span class="multiplier">&times;</span>{group.quantity}
										</button>
									{/if}
									{#if interactionStore.editingCardId === item.id}
										<!-- svelte-ignore a11y_autofocus -->
										<input
											type="number"
											class="stack-badge-input"
											value={group.quantity}
											min="0"
											max="999"
											autofocus
											use:selectOnMount
											onclick={(e) => e.stopPropagation()}
											onmousedown={(e) => e.stopPropagation()}
											onkeydown={(e) => {
												if (e.key === "Enter") {
													const val = parseInt(e.currentTarget.value, 10);
													if (!isNaN(val) && val >= 0) {
														deckStore.setQuantity(
															item.name,
															"sideboard",
															val,
															item.price,
															item,
														);
													}
													interactionStore.stopEditing();
												} else if (e.key === "Escape") {
													interactionStore.stopEditing();
												}
											}}
										/>
									{/if}
									<CardArt
										card={item}
										price={item.price}
										{isFlipped}
										{isRotated}
										{toggleFlip}
										{toggleRotate}
										showPrice={false}
										loading={!item._metadata && !deckStore.metadata[item.name.toLowerCase()]}
										hideControlsUntilHover={true}
									/>
								{/snippet}
							</CardShell>
						</div>
					{/each}
				</div>
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
		left: -32px;
		top: 80px;
		width: 32px;
		height: 32px;
		padding: 4px;
		background: hsl(var(--popover) / 0.9);
		backdrop-filter: blur(20px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-right: none;
		border-radius: var(--radius-md) 0 0 var(--radius-md);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: -5px 0 15px rgba(0, 0, 0, 0.15);
		transition: color 0.15s, background-color 0.15s;
	}

	.panel-tab:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--popover));
	}

	.panel-tab svg {
		width: 20px;
		height: 20px;
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
	}

	/* Card stack styles inside Sideboard */
	.sideboard-stack-container {
		--card-width: 220px;
		--column-gap: 12px;
		--stack-overlap: -0.888;
		--stack-lift: -0.08;
		--stack-push: 0.08;
		display: flex;
		flex-direction: column;
		position: relative;
		width: 100%;
		padding-bottom: calc(var(--card-width) * 1.4 * 0.85); /* Allow scroll room for the last card */
		align-items: center;
	}

	.sideboard-card-item {
		position: relative;
		width: var(--card-width);
		height: calc(
			var(--card-width) * 1.4 * (1 + var(--stack-overlap))
		) !important;
		border-radius: 4.5% / 3.2%;
		background: transparent;
		flex-shrink: 0;
		transition: transform 0.2s ease;
		cursor: pointer;
		user-select: none;
		overflow: visible !important;
		z-index: 1;
	}

	.sideboard-card-item.has-badge {
		height: calc(var(--card-width) * 1.4 * 0.22) !important;
	}

	.sideboard-card-item:hover :global(.card-shell) {
		transform: translateY(
			calc(var(--card-width) * 1.4 * var(--stack-lift))
		);
		box-shadow: 0 12px 30px -10px rgba(0, 0, 0, 0.7);
	}

	.sideboard-card-item:hover ~ .sideboard-card-item :global(.card-shell) {
		transform: translateY(
			calc(var(--card-width) * 1.4 * var(--stack-push))
		);
	}

	.stack-badge {
		position: absolute;
		top: 11.2%; /* Anchored immediately below name bar */
		right: 6px;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		color: white;
		border-radius: 4px;
		padding: 1px 4px;
		font-size: 11px;
		font-weight: 700;
		z-index: 10;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		cursor: pointer;
		transition: transform 0.15s, background-color 0.15s;
		display: flex;
		align-items: center;
		gap: 1px;
	}

	.stack-badge:hover {
		background: rgba(0, 0, 0, 0.75);
		transform: scale(1.1);
	}

	.sideboard-card-item:hover .stack-badge {
		transform: translateY(
			calc(var(--card-width) * 1.4 * var(--stack-lift))
		);
	}

	.stack-badge-input {
		position: absolute;
		top: 11.2%;
		right: 6px;
		width: 45px;
		background: hsl(var(--background));
		border: 2px solid hsl(var(--primary));
		color: hsl(var(--foreground));
		border-radius: 4px;
		padding: 1px 4px;
		font-size: 11px;
		font-weight: 700;
		z-index: 20;
		text-align: center;
		box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
	}

	.stack-badge-input::-webkit-outer-spin-button,
	.stack-badge-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}
</style>
