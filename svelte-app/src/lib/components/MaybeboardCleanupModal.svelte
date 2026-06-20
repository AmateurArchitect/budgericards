<script>
	import { fade, fly } from "svelte/transition";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { X, Trash2, CheckSquare, Square } from "lucide-svelte";
	import { onMount } from "svelte";

	/** @type {{ isOpen: boolean }} */
	let { isOpen = $bindable(false) } = $props();

	/** @type {string[]} */
	let selectedIds = $state([]);

	const count = $derived(deckStore.maybeboard.length);
	const usagePct = $derived(Math.min(100, Math.round((count / 100) * 100)));

	// Grouping logic based on session clusters (30-minute gap)
	const groupedCards = $derived.by(() => {
		if (deckStore.maybeboard.length === 0) return [];

		// Sort maybeboard cards by addedAt descending
		const sorted = [...deckStore.maybeboard].sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

		/** @type {any[]} */
		const groups = [];
		/** @type {any} */
		let currentGroup = null;

		for (const card of sorted) {
			const cardTime = card.addedAt || Date.now();
			// Start new group if no group exists or the time gap is greater than 30 minutes
			if (!currentGroup || (currentGroup.latestTime - cardTime > 30 * 60 * 1000)) {
				const dt = new Date(cardTime);
				const dateString = dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
				const timeString = dt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
				const label = `${dateString} at ${timeString}`;

				/** @type {{ id: string, label: string, latestTime: number, cards: any[] }} */
				currentGroup = {
					id: `session-${cardTime}`,
					label,
					latestTime: cardTime,
					cards: []
				};
				groups.push(currentGroup);
			}
			currentGroup.cards.push(card);
		}

		return groups;
	});

	function close() {
		isOpen = false;
		selectedIds = [];
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (isOpen && e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	}

	onMount(() => {
		window.addEventListener("keydown", handleKeydown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeydown, { capture: true });
		};
	});

	/** @param {string} id */
	function toggleSelectCard(id) {
		if (selectedIds.includes(id)) {
			selectedIds = selectedIds.filter((x) => x !== id);
		} else {
			selectedIds = [...selectedIds, id];
		}
	}

	/** @param {any[]} cards */
	function toggleSelectSection(cards) {
		const cardIds = cards.map((c) => c.id);
		const allSelected = cardIds.every((id) => selectedIds.includes(id));

		if (allSelected) {
			selectedIds = selectedIds.filter((id) => !cardIds.includes(id));
		} else {
			const uniqueIds = new Set([...selectedIds, ...cardIds]);
			selectedIds = Array.from(uniqueIds);
		}
	}

	/** @param {any[]} cards */
	function isSectionAllSelected(cards) {
		return cards.every((c) => selectedIds.includes(c.id));
	}

	function deleteSelected() {
		if (selectedIds.length === 0) return;

		deckStore.batchUpdate(() => {
			for (const id of selectedIds) {
				const card = deckStore.maybeboard.find(/** @param {any} c */ (c) => c.id === id);
				if (card) {
					deckStore.removeCard(card.name, "maybeboard", id);
				}
			}
		});
		selectedIds = [];
	}

	function purgeAll() {
		if (confirm("Are you sure you want to completely purge your maybeboard?")) {
			deckStore.clearMetadataAndCards; // Wait, we just want to clear maybeboard
			deckStore.batchUpdate(() => {
				const cards = [...deckStore.maybeboard];
				for (const card of cards) {
					deckStore.removeCard(card.name, "maybeboard", card.id);
				}
			});
			close();
		}
	}

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			},
		};
	}
</script>

{#if isOpen}
	<div use:portal class="cleanup-portal-wrapper">
		<div
			class="cleanup-backdrop"
			role="presentation"
			onclick={close}
			in:fade={{ duration: 200 }}
			out:fade={{ duration: 150 }}
		></div>

		<div
			class="cleanup-card"
			role="dialog"
			aria-modal="true"
			in:fly={{ y: 20, duration: 250 }}
			out:fly={{ y: 20, duration: 150 }}
		>
			<div class="cleanup-header">
				<div class="title-area">
					<h3>Clean up Maybeboard</h3>
					<div class="usage-bar-wrapper">
						<div class="usage-text">
							<span>Storage: <strong>{count} / 100</strong> cards</span>
						</div>
						<div class="progress-track">
							<div
								class="progress-fill"
								class:warning={usagePct >= 80 && usagePct < 100}
								class:danger={usagePct === 100}
								style="width: {usagePct}%"
							></div>
						</div>
					</div>
				</div>
				<button class="close-btn" onclick={close} aria-label="Close">
					<X size={16} />
				</button>
			</div>

			<div class="cleanup-body">
				{#if count === 0}
					<div class="empty-cleanup">
						<p>Your maybeboard is completely clean!</p>
					</div>
				{:else}
					<div class="groups-list">
						{#each groupedCards as group (group.id)}
							<div class="group-section">
								<div class="group-header">
									<button
										type="button"
										class="select-section-btn"
										onclick={() => toggleSelectSection(group.cards)}
									>
										{#if isSectionAllSelected(group.cards)}
											<CheckSquare size={16} class="checkbox-icon checked" />
										{:else}
											<Square size={16} class="checkbox-icon" />
										{/if}
										<span class="group-label">{group.label}</span>
									</button>
									<span class="group-count">{group.cards.length} cards</span>
								</div>

								<div class="group-cards-grid">
									{#each group.cards as card (card.id)}
										{@const isSelected = selectedIds.includes(card.id)}
										<!-- svelte-ignore a11y_click_events_have_key_events -->
										<div
											class="card-item-row"
											class:selected={isSelected}
											onclick={() => toggleSelectCard(card.id)}
											role="checkbox"
											aria-checked={isSelected}
											tabindex="0"
										>
											<div class="checkbox-box">
												{#if isSelected}
													<CheckSquare size={14} class="checked" />
												{:else}
													<Square size={14} />
												{/if}
											</div>
											<span class="card-name">{card.name}</span>
											{#if card.price}
												<span class="card-price">${card.price.toFixed(2)}</span>
											{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</div>

			{#if count > 0}
				<div class="cleanup-footer">
					<button class="purge-all-btn" onclick={purgeAll}>
						Purge All
					</button>

					<div class="right-buttons">
						<button class="cancel-btn" onclick={close}>Cancel</button>
						<button
							class="delete-btn"
							disabled={selectedIds.length === 0}
							onclick={deleteSelected}
						>
							<Trash2 size={14} />
							<span>Remove Selected ({selectedIds.length})</span>
						</button>
					</div>
				</div>
			{/if}
		</div>
	</div>
{/if}

<style>
	.cleanup-portal-wrapper {
		position: fixed;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.cleanup-backdrop {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(12px);
	}

	.cleanup-card {
		position: relative;
		width: 600px;
		max-width: 90vw;
		max-height: 85vh;
		background: hsl(var(--popover) / 0.92);
		backdrop-filter: blur(24px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow: 0 30px 60px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		overflow: hidden;
	}

	.cleanup-header {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
	}

	.title-area {
		flex: 1;
	}

	.title-area h3 {
		font-size: 1.125rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		margin: 0 0 0.75rem 0;
		letter-spacing: -0.01em;
	}

	.usage-bar-wrapper {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.usage-text {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.progress-track {
		height: 6px;
		background: hsl(var(--muted) / 0.4);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: hsl(var(--primary));
		border-radius: 3px;
		transition: width 0.3s ease;
	}

	.progress-fill.warning {
		background: #d97706; /* orange-600 */
	}

	.progress-fill.danger {
		background: hsl(var(--destructive));
	}

	.close-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 0.25rem;
		border-radius: var(--radius-sm);
		transition: color 0.15s, background-color 0.15s;
		margin-top: -0.25rem;
	}

	.close-btn:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--accent) / 0.4);
	}

	.cleanup-body {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
	}

	.empty-cleanup {
		text-align: center;
		padding: 3rem 0;
		color: hsl(var(--muted-foreground));
	}

	.groups-list {
		display: flex;
		flex-direction: column;
		gap: 1.75rem;
	}

	.group-section {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.group-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 0.375rem;
	}

	.select-section-btn {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		background: none;
		border: none;
		color: inherit;
		cursor: pointer;
		font: inherit;
		padding: 0;
		text-align: left;
	}

	.select-section-btn :global(.checkbox-icon) {
		color: hsl(var(--muted-foreground) / 0.6);
		transition: color 0.15s;
	}

	.select-section-btn :global(.checkbox-icon.checked) {
		color: hsl(var(--primary));
	}

	.group-label {
		font-size: 0.8125rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.group-count {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground) / 0.7);
	}

	.group-cards-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	@media (max-width: 500px) {
		.group-cards-grid {
			grid-template-columns: 1fr;
		}
	}

	.card-item-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		padding: 0.5rem 0.75rem;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.3);
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s;
		user-select: none;
	}

	.card-item-row:hover {
		background: hsl(var(--muted) / 0.3);
		border-color: hsl(var(--border) / 0.6);
	}

	.card-item-row.selected {
		background: hsla(var(--primary-hsl), 0.08);
		border-color: hsl(var(--primary) / 0.5);
	}

	.checkbox-box {
		color: hsl(var(--muted-foreground) / 0.5);
		display: flex;
		align-items: center;
	}

	.card-item-row.selected .checkbox-box {
		color: hsl(var(--primary));
	}

	.card-name {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
		flex: 1;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-price {
		font-size: 0.75rem;
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.cleanup-footer {
		padding: 1rem 1.5rem;
		border-top: 1px solid hsl(var(--border) / 0.5);
		background: hsl(var(--muted) / 0.1);
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
	}

	.purge-all-btn {
		background: none;
		border: 1px solid hsl(var(--destructive) / 0.5);
		color: hsl(var(--destructive));
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s;
	}

	.purge-all-btn:hover {
		background: hsl(var(--destructive));
		color: white;
		border-color: hsl(var(--destructive));
		box-shadow: 0 0 15px hsl(var(--destructive) / 0.3);
	}

	.right-buttons {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.cancel-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.15s;
	}

	.cancel-btn:hover {
		background: hsl(var(--accent) / 0.4);
		color: hsl(var(--foreground));
	}

	.delete-btn {
		background: hsl(var(--primary));
		color: white;
		border: none;
		padding: 0.5rem 1rem;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: var(--radius-md);
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		transition: all 0.15s;
	}

	.delete-btn:hover:not(:disabled) {
		background: hsl(var(--primary-dark));
		box-shadow: 0 0 15px hsl(var(--primary) / 0.4);
	}

	.delete-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
</style>
