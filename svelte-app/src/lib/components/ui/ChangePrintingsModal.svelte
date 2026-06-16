<script>
	import { fade, fly } from 'svelte/transition';
	import { interactionStore } from '$lib/stores/interaction.svelte.js';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { priceStore } from '$lib/stores/prices.svelte.js';
	import { db } from '$lib/db';
	import { scryfallFetch } from '$lib/api/scryfall.js';

	let { isOpen, selectedCards } = $derived(interactionStore.changePrintingsModal);

	let isProcessing = $state(false);
	let currentCardIndex = $state(0);
	let totalCards = $state(0);
	let statusMessage = $state("");

	/** @param {any} printing */
	function getCheapestPrice(printing) {
		const usd = parseFloat(printing.prices?.usd);
		const usdFoil = parseFloat(printing.prices?.usd_foil);
		const prices = [];
		if (!isNaN(usd) && usd > 0) prices.push(usd);
		if (!isNaN(usdFoil) && usdFoil > 0) prices.push(usdFoil);
		return prices.length > 0 ? Math.min(...prices) : Infinity;
	}

	/**
	 * @param {any} card
	 * @param {string} columnKey
	 */
	function getCardCellValue(card, columnKey) {
		const name = card.name || "";
		const meta = deckStore.metadata[name.toLowerCase()];

		if (columnKey === 'qty') {
			const boards = ['commander', 'companion', 'mainboard', 'sideboard', 'maybeboard'];
			for (const board of boards) {
				const boardArray = /** @type {any[]} */ (/** @type {any} */ (deckStore)[board]);
				if (boardArray) {
					const matches = boardArray.filter(c => c.name.toLowerCase() === name.toLowerCase());
					if (matches.length > 0) return matches.length;
				}
			}
			return 1;
		}
		return "";
	}

	/** @param {string} rule */
	async function applyRule(rule) {
		if (selectedCards.length === 0) return;
		isProcessing = true;
		totalCards = selectedCards.length;
		currentCardIndex = 0;

		/** @type {{ name: string, metadata: any }[]} */
		const resolvedUpdates = [];

		for (let i = 0; i < selectedCards.length; i++) {
			const card = selectedCards[i];
			currentCardIndex = i + 1;
			statusMessage = `Resolving ${card.name} (${i + 1}/${totalCards})...`;

			if (rule === 'default') {
				try {
					const defaultCard = await db.cards.where("name").equals(card.name).first();
					if (defaultCard) {
						const localPrice = priceStore.getPrice(card.name);
						const metadata = {
							id: defaultCard.id,
							name: defaultCard.name,
							type_line: defaultCard.type,
							oracle_text: defaultCard.text,
							mana_cost: defaultCard.mana,
							cmc: defaultCard.cmc,
							colors: defaultCard.colors || [],
							color_identity: defaultCard.identity || [],
							image_uris: {
								normal: defaultCard.image,
								art_crop: defaultCard.image ? defaultCard.image.replace('/normal/', '/art_crop/') : null
							},
							prices: {
								usd: localPrice !== null ? String(localPrice) : null,
								usd_foil: null
							}
						};
						resolvedUpdates.push({ name: card.name, metadata });
					}
				} catch (e) {
					console.error("Failed to reset printing:", e);
				}
			} else {
				try {
					const q = `!"${card.name}" unique:prints`;
					const res = await scryfallFetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`);
					if (res.ok) {
						const result = await res.json();
						if (result && result.data && result.data.length > 0) {
							const exactPrints = result.data.filter((/** @type {any} */ p) => {
								const pName = p.name.toLowerCase();
								const cName = card.name.toLowerCase();
								return pName === cName || 
									(pName.includes(" // ") && pName.split(" // ")[0].trim() === cName) ||
									(cName.includes(" // ") && cName.split(" // ")[0].trim() === pName);
							});
							if (exactPrints.length > 0) {
								let sorted = [...exactPrints];
								if (rule === 'cheapest') {
									sorted.sort((a, b) => getCheapestPrice(a) - getCheapestPrice(b));
								} else if (rule === 'newest') {
									sorted.sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime());
								} else if (rule === 'oldest') {
									sorted.sort((a, b) => new Date(a.released_at).getTime() - new Date(b.released_at).getTime());
								}
								resolvedUpdates.push({ name: card.name, metadata: sorted[0] });
							}
						}
					}
				} catch (e) {
					console.error(`Failed to fetch printings for ${card.name}:`, e);
				}
			}
		}

		// Apply all updates inside a single batch update
		deckStore.batchUpdate(() => {
			for (const update of resolvedUpdates) {
				deckStore.setCardPrinting(update.name, update.metadata);
			}
		});

		isProcessing = false;
		statusMessage = "";
		interactionStore.closeChangePrintingsModal();
	}
</script>

{#if isOpen}
	<!-- Backdrop -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		role="presentation"
		class="modal-backdrop"
		onclick={() => { if (!isProcessing) interactionStore.closeChangePrintingsModal(); }}
		transition:fade={{ duration: 150 }}
	>
		<!-- Modal Content -->
		<div
			role="dialog"
			aria-modal="true"
			aria-label="Change Printings"
			tabindex="-1"
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			transition:fly={{ y: 15, duration: 250 }}
		>
			<h2 class="title">Change Printings</h2>
			<p class="subtitle">Set printing for {selectedCards.length} selected cards based on:</p>

			{#if isProcessing}
				<div class="progress-container">
					<div class="progress-bar">
						<div class="progress-fill" style="width: {(currentCardIndex / totalCards) * 100}%"></div>
					</div>
					<div class="status-msg">{statusMessage}</div>
				</div>
			{:else}
				<div class="button-grid">
					<button class="rule-btn" onclick={() => applyRule('cheapest')}>
						<span class="icon">🏷️</span>
						<span class="btn-label">Cheapest</span>
						<span class="btn-desc">Lowest USD/foil price printing</span>
					</button>
					<button class="rule-btn" onclick={() => applyRule('newest')}>
						<span class="icon">✨</span>
						<span class="btn-label">Newest</span>
						<span class="btn-desc">Most recently printed version</span>
					</button>
					<button class="rule-btn" onclick={() => applyRule('oldest')}>
						<span class="icon">🕰️</span>
						<span class="btn-label">Oldest</span>
						<span class="btn-desc">First original printing</span>
					</button>
					<button class="rule-btn" onclick={() => applyRule('default')}>
						<span class="icon">🔄</span>
						<span class="btn-label">Default</span>
						<span class="btn-desc">Reset to original database default</span>
					</button>
				</div>

				<div class="footer">
					<button class="cancel-btn" onclick={() => interactionStore.closeChangePrintingsModal()}>Cancel</button>
				</div>
			{/if}
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
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(8px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 30000;
	}

	.modal-content {
		background: hsla(var(--background) / 0.85);
		backdrop-filter: blur(25px) saturate(190%);
		-webkit-backdrop-filter: blur(25px) saturate(190%);
		border: 1px solid hsla(var(--border) / 0.5);
		border-radius: var(--radius);
		padding: 24px;
		width: 100%;
		max-width: 440px;
		box-shadow: 
			0 20px 40px -15px rgba(0, 0, 0, 0.7),
			inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.title {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
		margin: 0;
		letter-spacing: -0.02em;
	}

	.subtitle {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin: 0;
	}

	.button-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 12px;
		margin: 8px 0;
	}

	.rule-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		padding: 16px 12px;
		background: hsla(var(--muted) / 0.2);
		border: 1px solid hsla(var(--border) / 0.4);
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
		gap: 4px;
	}

	.rule-btn:hover {
		background: hsla(var(--primary) / 0.15);
		border-color: hsl(var(--primary));
		transform: translateY(-2px);
	}

	.rule-btn .icon {
		font-size: 1.5rem;
		margin-bottom: 4px;
	}

	.btn-label {
		font-size: 0.9rem;
		font-weight: 600;
		color: var(--text-primary);
	}

	.btn-desc {
		font-size: 0.7rem;
		color: var(--text-muted);
		line-height: 1.2;
	}

	.progress-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 12px;
		padding: 20px 0;
	}

	.progress-bar {
		width: 100%;
		height: 6px;
		background: hsla(var(--muted) / 0.3);
		border-radius: 3px;
		overflow: hidden;
	}

	.progress-fill {
		height: 100%;
		background: hsl(var(--primary));
		transition: width 0.1s ease;
	}

	.status-msg {
		font-size: 0.8rem;
		color: var(--text-secondary);
		font-weight: 500;
	}

	.footer {
		display: flex;
		justify-content: flex-end;
		margin-top: 8px;
	}

	.cancel-btn {
		padding: 8px 16px;
		background: transparent;
		border: 1px solid hsla(var(--border) / 0.5);
		color: var(--text-primary);
		border-radius: var(--radius-sm);
		cursor: pointer;
		font-size: 0.875rem;
		font-weight: 500;
		transition: all 0.2s;
	}

	.cancel-btn:hover {
		background: hsla(var(--muted) / 0.2);
	}
</style>
