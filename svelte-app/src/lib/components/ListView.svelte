<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { layoutStore } from "$lib/stores/layout.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { getGroupedCategories } from "$lib/layouts/grouping.svelte.js";
	import { AlertTriangle, MoreVertical } from "lucide-svelte";
	import { onMount } from "svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";

	let isDragOver = $state(false);

	// Re-use logic for inline quantity editing
	let editingCardName = $state(null);
	let editingCardZone = $state(null);
	let localQtyText = $state("");

	/** @param {any} cardRow */
	function handleQtySubmit(cardRow) {
		if (
			editingCardName !== cardRow.name ||
			editingCardZone !== cardRow.zone
		)
			return;

		const parsed = parseInt(localQtyText, 10);
		if (isNaN(parsed) || parsed <= 0) {
			deckStore.removeAllCopies(cardRow.name, cardRow.zone);
		} else {
			deckStore.setQuantity(
				cardRow.name,
				cardRow.zone,
				parsed,
				cardRow.price,
				cardRow.card,
			);
		}

		editingCardName = null;
		editingCardZone = null;
	}

	/**
	 * @param {KeyboardEvent} e
	 * @param {any} cardRow
	 */
	function handleQtyKeyDown(e, cardRow) {
		if (e.key === "Enter") {
			e.preventDefault();
			handleQtySubmit(cardRow);
		} else if (e.key === "Escape") {
			e.preventDefault();
			editingCardName = null;
			editingCardZone = null;
		}
	}

	/** @param {HTMLInputElement} node */
	function focusOnMount(node) {
		node.focus();
		const val = node.value;
		node.value = "";
		node.value = val;
	}

	const effectiveGrouping = $derived(
		deckStore.grouping?.toLowerCase() === 'freeform'
			? (deckStore.lastNaturalGrouping || 'cmc')
			: (deckStore.grouping?.toLowerCase() || 'cmc')
	);
	const groupedCategories = $derived(getGroupedCategories());

	// Drag & Drop handlers
	/**
	 * @param {DragEvent} e
	 */
	function handleDragOver(e) {
		e.preventDefault();
		isDragOver = true;
	}

	function handleDragLeave() {
		isDragOver = false;
	}

	/**
	 * @param {DragEvent} e
	 */
	async function handleDrop(e) {
		isDragOver = false;
		if (!e.dataTransfer) return;
		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (internalData) {
			e.preventDefault();
			e.stopPropagation();
			const data = JSON.parse(internalData);

			if (!data.fromDeck || data.sourceBoard !== deckStore.activeBoard) {
				const isLocalSource = [
					"sideboard",
					"maybeboard",
					"garbage",
					"commander",
					"companion",
					"mainboard",
				].includes(data.sourceBoard);

				if (data.sourceBoard !== deckStore.activeBoard) {
					if (isLocalSource) {
						deckStore.moveCard(
							data.name,
							data.sourceBoard,
							deckStore.activeBoard,
							data.id,
							data.price,
						);
					} else {
						deckStore.addCard(
							data.name,
							deckStore.activeBoard,
							data.price,
							data.card,
						);
					}
				}
			}
		}
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="list-view-container"
	class:drag-over={isDragOver}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
>
	<div class="list-wrapper">
		<div class="columns-container">
			{#each groupedCategories as category}
				{#if category.cards.length > 0}
					<div class="list-group">
						<div class="group-header">
							{category.name.toUpperCase()} ({category.totalQty})
						</div>
						<div class="group-cards">
							{#each category.cards as cardRow (cardRow.name)}
								<div
									class="card-row"
									class:is-illegal={cardRow.isIllegal}
									class:is-editing={editingCardName ===
										cardRow.name &&
										editingCardZone === cardRow.zone}
									data-tooltip-img={cardRow.imgUrl}
									oncontextmenu={(e) => {
										e.preventDefault();
										interactionStore.showMenu(
											e,
											cardRow.card,
											cardRow.zone,
											cardRow.price,
										);
									}}
									onmouseenter={() =>
										interactionStore.registerHover(
											cardRow.card,
											cardRow.zone,
											cardRow.price,
										)}
									onmouseleave={() =>
										interactionStore.unregisterHover()}
								>
									<div class="col-qty">
										{#if editingCardName === cardRow.name && editingCardZone === cardRow.zone}
											<input
												type="number"
												class="qty-inline-input"
												bind:value={localQtyText}
												onblur={() =>
													handleQtySubmit(cardRow)}
												onkeydown={(e) =>
													handleQtyKeyDown(
														e,
														cardRow,
													)}
												min="0"
												max="999"
												use:focusOnMount
												onclick={(e) =>
													e.stopPropagation()}
											/>
										{:else}
											<button
												type="button"
												class="qty-text-btn"
												onclick={(e) => {
													e.stopPropagation();
													editingCardName =
														cardRow.name;
													editingCardZone =
														cardRow.zone;
													localQtyText = String(
														cardRow.quantity,
													);
												}}
												title="Click to change quantity inline"
											>
												{cardRow.quantity}
											</button>
										{/if}
									</div>

									<div class="col-name">
										<span class="card-name-label"
											>{cardRow.name}</span
										>
										{#if cardRow.isIllegal}
											<div
												class="legality-warning-icon"
												title={cardRow.legalityReasons.join(
													", ",
												)}
											>
												<AlertTriangle size={12} />
											</div>
										{/if}
									</div>

									<div class="col-mana">
										<div class="mana-icons-cell">
											{#each cardRow.manaSymbols as sym}
												<ManaSymbol
													symbol={sym}
													size="1.1em"
													className="ms-cost"
												/>
											{/each}
										</div>
									</div>

									{#if settingsStore.showPrices || deckStore.sorting === "price"}
										<div class="col-price">
											<span class="price-span">
												{cardRow.price > 0
													? `$${cardRow.price.toFixed(2)}`
													: ""}
											</span>
										</div>
									{/if}

									<div class="col-actions">
										<button
											type="button"
											class="row-action-btn"
											onclick={(e) => {
												e.stopPropagation();
												interactionStore.showMenu(
													e,
													cardRow.card,
													cardRow.zone,
													cardRow.price,
												);
											}}
											title="More Options"
										>
											<MoreVertical size={14} />
										</button>
									</div>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			{/each}
		</div>
	</div>
</div>

<style>
	.list-view-container {
		flex: 1;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		background: linear-gradient(to bottom, rgba(0, 0, 0, 0.2), transparent);
		padding: 1rem 0;
		position: relative;
		transition: background-color 0.2s ease;
	}

	.list-view-container.drag-over {
		background-color: hsla(var(--primary-hsl), 0.05);
	}

	.list-wrapper {
		flex: 1;
		overflow-x: hidden;
		overflow-y: auto;
		padding: 3rem var(--edge-margin, 1.5rem);
	}

	.columns-container {
		column-count: 3;
		column-gap: 2rem;
		width: max-content;
		max-width: 100%;
		margin: 0 auto;
	}

	@media (max-width: 1100px) {
		.columns-container {
			column-count: 2;
		}
	}

	@media (max-width: 700px) {
		.columns-container {
			column-count: 1;
		}
	}

	.list-group {
		break-inside: avoid;
		page-break-inside: avoid;
		margin-bottom: 2rem;
	}

	.group-header {
		font-size: 0.75rem;
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.25rem;
	}

	.group-cards {
		display: flex;
		flex-direction: column;
	}

	.card-row {
		display: flex;
		align-items: center;
		padding: 0.15rem 0;
		font-size: 0.875rem;
		border-radius: var(--radius-sm);
		transition: background-color 0.15s ease;
		cursor: default;
	}

	.card-row:hover,
	.card-row.is-editing {
		background-color: hsla(var(--primary-hsl), 0.1);
	}

	.col-qty {
		text-align: left;
		color: hsl(var(--muted-foreground));
		font-variant-numeric: tabular-nums;
		padding-right: 0.5rem;
	}

	.qty-text-btn {
		background: none;
		border: none;
		color: inherit;
		font: inherit;
		padding: 0;
		cursor: pointer;
		text-align: left;
	}

	.qty-text-btn:hover {
		color: hsl(var(--foreground));
		text-decoration: underline;
	}

	.qty-inline-input {
		width: 30px;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--primary));
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		padding: 0;
		margin: 0;
		text-align: left;
		border-radius: 2px;
		outline: none;
		-moz-appearance: textfield;
		appearance: textfield;
	}
	.qty-inline-input::-webkit-outer-spin-button,
	.qty-inline-input::-webkit-inner-spin-button {
		-webkit-appearance: none;
		margin: 0;
	}

	.col-name {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-name-label {
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		color: hsl(var(--foreground));
	}

	.is-illegal .card-name-label {
		color: hsl(var(--destructive));
	}

	.legality-warning-icon {
		color: hsl(var(--destructive));
		display: flex;
		align-items: center;
	}

	.col-mana {
		padding: 0 0.5rem 0 1.5rem;
		flex-shrink: 0;
	}

	.mana-icons-cell {
		display: flex;
		align-items: center;
		gap: 0.15em;
	}



	.col-price {
		min-width: 45px;
		text-align: right;
		padding-right: 0.25rem;
		color: hsl(var(--primary));
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.col-actions {
		width: 24px;
		min-width: 24px;
		display: flex;
		justify-content: flex-end;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.card-row:hover .col-actions,
	.card-row.is-editing .col-actions {
		opacity: 1;
	}

	.row-action-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 0.125rem;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.row-action-btn:hover {
		background: hsla(var(--foreground-hsl), 0.1);
		color: hsl(var(--foreground));
	}
</style>
