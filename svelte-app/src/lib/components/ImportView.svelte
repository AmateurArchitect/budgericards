<script>
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { Info, HelpCircle, Trash2, Sparkles, BookOpen, X, Eye } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';
	import { parseDecklist } from '$lib/utils/decklistParser.js';
	import { getCardByName } from '$lib/localSearch';
	import { db } from '$lib/db';
	import { interactionStore } from '$lib/stores/interaction.svelte.js';

	/** @type {HTMLTextAreaElement | null} */
	let textareaEl = $state(null);
	/** @type {HTMLDivElement | null} */
	let highlightsEl = $state(null);
	/** @type {HTMLDivElement | null} */
	let iconsEl = $state(null);

	let showGuide = $state(false);

	// Reactive parsing of current text
	const parsedCards = $derived(parseDecklist(deckStore.importText));
	const lines = $derived(deckStore.importText.split('\n'));

	// Local reactive state for fully resolved card metadata (live stats)
	let resolvedCards = $state([]);

	$effect(() => {
		const cards = parsedCards;
		const uniqueNames = [...new Set(cards.map(c => c.name.toLowerCase()))];
		
		const resolveAll = async () => {
			/** @type {Record<string, any>} */
			const details = {};
			for (const name of uniqueNames) {
				if (deckStore.metadata[name]) {
					details[name] = deckStore.metadata[name];
					continue;
				}
				try {
					const localCard = await getCardByName(name);
					if (localCard) {
						const priceRecord = await db.prices.get(localCard.id);
						details[name] = {
							name: localCard.name,
							type_line: localCard.type || '',
							cmc: localCard.cmc ?? 0,
							image_uris: {
								normal: localCard.image,
								art_crop: localCard.image ? localCard.image.replace('/normal/', '/art_crop/') : null
							},
							prices: {
								usd: priceRecord ? String(priceRecord.price) : null
							}
						};
					}
				} catch (e) {
					// Fallback
				}
			}

			resolvedCards = cards.map(c => {
				const lowName = c.name.toLowerCase();
				const meta = details[lowName];
				return {
					...c,
					cmc: meta ? (meta.cmc ?? 0) : 0,
					type: meta ? (meta.type_line || '') : '',
					price: meta ? parseFloat(meta.prices?.usd || '0') : 0
				};
			});
		};

		resolveAll();
	});

	// Derivations for stats
	const totalCount = $derived(parsedCards.reduce((sum, c) => sum + c.quantity, 0));
	const totalPrice = $derived(resolvedCards.reduce((sum, c) => sum + (c.quantity * c.price), 0));

	const boardStats = $derived.by(() => {
		/** @type {Record<string, { qty: number, price: number }>} */
		const stats = {
			commander: { qty: 0, price: 0 },
			companion: { qty: 0, price: 0 },
			mainboard: { qty: 0, price: 0 },
			sideboard: { qty: 0, price: 0 },
			maybeboard: { qty: 0, price: 0 }
		};

		for (const card of resolvedCards) {
			const board = card.board || 'mainboard';
			if (stats[board]) {
				stats[board].qty += card.quantity;
				stats[board].price += card.quantity * card.price;
			}
		}
		return stats;
	});

	const mainboardStats = $derived.by(() => {
		const stats = {
			creatures: { qty: 0, price: 0 },
			spells: { qty: 0, price: 0 },
			basicLands: { qty: 0, price: 0 },
			nonBasicLands: { qty: 0, price: 0 }
		};

		const mainCards = resolvedCards.filter(c => (c.board || 'mainboard') === 'mainboard');

		for (const card of mainCards) {
			const isLand = card.type.includes('Land');
			const isBasic = card.type.includes('Basic Land');
			const isCreature = card.type.includes('Creature');

			if (isLand) {
				if (isBasic) {
					stats.basicLands.qty += card.quantity;
					stats.basicLands.price += card.quantity * card.price;
				} else {
					stats.nonBasicLands.qty += card.quantity;
					stats.nonBasicLands.price += card.quantity * card.price;
				}
			} else {
				if (isCreature) {
					stats.creatures.qty += card.quantity;
					stats.creatures.price += card.quantity * card.price;
				} else {
					stats.spells.qty += card.quantity;
					stats.spells.price += card.quantity * card.price;
				}
			}
		}
		return stats;
	});

	// Mana curve calculations for mainboard spells (excluding lands)
	const manaCurve = $derived.by(() => {
		const counts = Array(8).fill(0);
		const mainSpells = resolvedCards.filter(c => (c.board || 'mainboard') === 'mainboard' && !c.type.includes('Land'));
		
		for (const card of mainSpells) {
			const cmc = Math.floor(card.cmc);
			if (cmc < 0) continue;
			if (cmc >= 7) {
				counts[7] += card.quantity;
			} else {
				counts[cmc] += card.quantity;
			}
		}

		const totalSpells = mainSpells.reduce((sum, c) => sum + c.quantity, 0);
		const maxCount = Math.max(...counts, 1);

		return {
			counts,
			maxCount,
			totalSpells
		};
	});

	function handleClear() {
		deckStore.importText = '';
	}

	function handleSelectAll() {
		if (textareaEl) {
			textareaEl.focus();
			textareaEl.select();
		}
	}

	function handleConsolidateDuplicates() {
		if (!deckStore.importText.trim()) return;

		const parsed = parseDecklist(deckStore.importText);
		const seen = new Set();
		const duplicates = [];
		
		for (const card of parsed) {
			const key = `${card.board || 'mainboard'}:${card.name.toLowerCase()}`;
			if (seen.has(key)) {
				duplicates.push(card.name);
			}
			seen.add(key);
		}

		if (duplicates.length === 0) {
			alert("No duplicate entries found.");
			return;
		}

		/** @type {Record<string, Record<string, number>>} */
		const boards = {
			commander: {},
			companion: {},
			mainboard: {},
			sideboard: {},
			maybeboard: {}
		};

		for (const card of parsed) {
			const board = card.board || 'mainboard';
			if (!boards[board]) {
				boards[board] = {};
			}
			const name = card.name;
			boards[board][name] = (boards[board][name] || 0) + card.quantity;
		}

		let newText = '';
		const boardLabels = [
			{ name: 'commander', label: 'Commander' },
			{ name: 'companion', label: 'Companion' },
			{ name: 'mainboard', label: 'Deck' },
			{ name: 'sideboard', label: 'Sideboard' },
			{ name: 'maybeboard', label: 'Maybeboard' }
		];

		for (const board of boardLabels) {
			const cards = boards[board.name];
			if (!cards || Object.keys(cards).length === 0) continue;
			newText += `// ${board.label}\n`;
			for (const [name, qty] of Object.entries(cards)) {
				newText += `${qty} ${name}\n`;
			}
			newText += '\n';
		}

		deckStore.importText = newText.trim();
		alert(`Consolidated duplicate entries for: ${[...new Set(duplicates)].join(', ')}`);
	}

	// Helper to check if a line represents a recognized card
	/** @param {string} line */
	function getCardInfo(line) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#')) return null;
		
		const parsed = parseDecklist(trimmed);
		if (parsed.length === 1) {
			return parsed[0];
		}
		return null;
	}

	// Synchronize scroll of textarea to highlights and icons
	function handleScroll() {
		if (textareaEl) {
			const scrollTop = textareaEl.scrollTop;
			const scrollLeft = textareaEl.scrollLeft;
			if (highlightsEl) {
				highlightsEl.scrollTop = scrollTop;
				highlightsEl.scrollLeft = scrollLeft;
			}
			if (iconsEl) {
				iconsEl.scrollTop = scrollTop;
			}
		}
	}

	const placeholderText = `// Commander
1 Atraxa, Praetors' Voice

// Deck
1 Sol Ring
1 Arcane Signet
38 Island`;
</script>

<div class="import-view-container" in:fade={{ duration: 200 }}>
	<!-- Left Stat Preview Panel -->
	<div class="stats-pane">
		<div class="stats-section-header">
			<h3>Live Stats</h3>
		</div>

		<!-- Mini Mana Curve Graphic -->
		{#if manaCurve.totalSpells > 10}
			<div class="curve-graphic">
				<div class="curve-bars">
					{#each manaCurve.counts as count, i}
						{@const heightPct = (count / manaCurve.maxCount) * 100}
						<div class="curve-bar-wrapper" title="{count} cards at CMC {i === 7 ? '7+' : i}">
							<div class="curve-bar" style="height: {heightPct}%">
								{#if count > 0}
									<span class="bar-count">{count}</span>
								{/if}
							</div>
							<span class="bar-label">{i === 7 ? '7+' : i}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<div class="stats-overview">
			<div class="stat-row main-price">
				<span class="stat-label">Est. Price</span>
				<span class="stat-value price-text">${totalPrice.toFixed(2)}</span>
			</div>
			<div class="stat-row">
				<span class="stat-label">Total Cards</span>
				<span class="stat-value">{totalCount}</span>
			</div>
		</div>

		<div class="stats-divider"></div>

		<!-- Board Breakdowns -->
		<div class="breakdown-list">
			{#if boardStats.commander.qty > 0}
				<div class="breakdown-item">
					<span class="item-name">Commander</span>
					<span class="item-stats">{boardStats.commander.qty} <span class="muted">•</span> ${boardStats.commander.price.toFixed(2)}</span>
				</div>
			{/if}
			{#if boardStats.companion.qty > 0}
				<div class="breakdown-item">
					<span class="item-name">Companion</span>
					<span class="item-stats">{boardStats.companion.qty} <span class="muted">•</span> ${boardStats.companion.price.toFixed(2)}</span>
				</div>
			{/if}
			
			{#if boardStats.mainboard.qty > 0}
				<div class="breakdown-item mainboard-header">
					<span class="item-name">Mainboard</span>
					<span class="item-stats">{boardStats.mainboard.qty} <span class="muted">•</span> ${boardStats.mainboard.price.toFixed(2)}</span>
				</div>
				<div class="mainboard-subcategories">
					{#if mainboardStats.creatures.qty > 0}
						<div class="sub-item">
							<span class="sub-name">Creature</span>
							<span class="sub-stats">{mainboardStats.creatures.qty} <span class="muted">•</span> ${mainboardStats.creatures.price.toFixed(2)}</span>
						</div>
					{/if}
					{#if mainboardStats.spells.qty > 0}
						<div class="sub-item">
							<span class="sub-name">Non-Creature</span>
							<span class="sub-stats">{mainboardStats.spells.qty} <span class="muted">•</span> ${mainboardStats.spells.price.toFixed(2)}</span>
						</div>
					{/if}
					{#if mainboardStats.nonBasicLands.qty > 0}
						<div class="sub-item">
							<span class="sub-name">Non-Basic Land</span>
							<span class="sub-stats">{mainboardStats.nonBasicLands.qty} <span class="muted">•</span> ${mainboardStats.nonBasicLands.price.toFixed(2)}</span>
						</div>
					{/if}
					{#if mainboardStats.basicLands.qty > 0}
						<div class="sub-item">
							<span class="sub-name">Basic Land</span>
							<span class="sub-stats">{mainboardStats.basicLands.qty} <span class="muted">•</span> ${mainboardStats.basicLands.price.toFixed(2)}</span>
						</div>
					{/if}
				</div>
			{/if}

			{#if boardStats.sideboard.qty > 0}
				<div class="breakdown-item">
					<span class="item-name">Sideboard</span>
					<span class="item-stats">{boardStats.sideboard.qty} <span class="muted">•</span> ${boardStats.sideboard.price.toFixed(2)}</span>
				</div>
			{/if}
			{#if boardStats.maybeboard.qty > 0}
				<div class="breakdown-item">
					<span class="item-name">Maybeboard</span>
					<span class="item-stats">{boardStats.maybeboard.qty} <span class="muted">•</span> ${boardStats.maybeboard.price.toFixed(2)}</span>
				</div>
			{/if}
		</div>
	</div>

	<!-- Text Area Editor (Middle Column) -->
	<div class="editor-pane">
		<div class="pane-header">
			<h3>Decklist Editor</h3>
		</div>
		
		<div class="editor-wrapper">
			<!-- Background Layer: Card Name Containers -->
			<div class="highlights-layer" bind:this={highlightsEl}>
				{#each lines as line}
					{@const cardInfo = getCardInfo(line)}
					<div class="line-row" class:recognized={cardInfo}>
						<!-- Double space for matching exact textarea text alignment -->
						<span class="line-text">{line || ' '}</span>
					</div>
				{/each}
			</div>

			<!-- Middle Layer: Real Textarea -->
			<textarea
				bind:this={textareaEl}
				bind:value={deckStore.importText}
				placeholder={placeholderText}
				spellcheck="false"
				onscroll={handleScroll}
				aria-label="Decklist Text Input"
			></textarea>

			<!-- Foreground Layer: Interactive Eye Icons -->
			<div class="icons-layer" bind:this={iconsEl}>
				{#each lines as line}
					{@const cardInfo = getCardInfo(line)}
					<div class="icon-row-placeholder">
						{#if cardInfo}
							{@const lowName = cardInfo.name.toLowerCase()}
							{@const meta = deckStore.metadata[lowName]}
							{#if meta}
								<button
									class="eye-trigger"
									onmouseenter={() => {
										interactionStore.registerHover(meta, cardInfo.board || 'mainboard', parseFloat(meta.prices?.usd || '0'));
									}}
									onmouseleave={() => {
										interactionStore.unregisterHover();
									}}
									aria-label="Preview {cardInfo.name}"
								>
									<Eye size={14} />
								</button>
							{/if}
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</div>

	<!-- Action Sidebar Panel (Right Column) -->
	<div class="actions-pane">
		<div class="actions-header">
			<h3>Editor Actions</h3>
		</div>
		
		<div class="actions-list">
			<Button variant="outline" class="action-btn" onclick={handleSelectAll}>
				Select All
			</Button>

			<Button variant="outline" class="action-btn" onclick={handleConsolidateDuplicates}>
				Consolidate Duplicates
			</Button>

			<Button variant="outline" class="action-btn" onclick={() => showGuide = true}>
				Formatting Help
			</Button>

			<Button variant="outline" class="action-btn delete-btn" onclick={handleClear}>
				Clear Deck
			</Button>
		</div>

		<div class="info-note">
			<Info size={16} />
			<p>Saving changes will replace the entire current deck with the contents of this editor.</p>
		</div>
	</div>
</div>

{#if showGuide}
	<div class="guide-modal-backdrop" onclick={() => showGuide = false} role="presentation" transition:fade={{ duration: 150 }}>
		<div 
			class="guide-modal-content" 
			onclick={(e) => e.stopPropagation()} 
			onkeydown={(e) => e.stopPropagation()}
			tabindex="-1"
			role="dialog" 
			aria-modal="true" 
			aria-label="Format Guide"
		>
			<div class="modal-header">
				<div class="modal-title-row">
					<HelpCircle size={18} class="guide-icon-class" />
					<h3>Decklist Format Guide</h3>
				</div>
				<button class="close-btn" onclick={() => showGuide = false} aria-label="Close guide">
					<X size={18} />
				</button>
			</div>
			
			<div class="guide-scroll">
				<div class="guide-section">
					<h4>General Syntax</h4>
					<p>List cards one per line with their quantity at the beginning. If no quantity is specified, 1 is assumed.</p>
					<pre><code>4 Brainstorm
1 Force of Will
Sol Ring</code></pre>
				</div>

				<div class="guide-section">
					<h4>Board Categories</h4>
					<p>Use section headers starting with <code>//</code> to assign cards to specific boards (Mainboard/Deck, Commander, Companion, Sideboard, Maybeboard).</p>
					<pre><code>// Commander
1 Atraxa, Praetors' Voice

// Companion
1 Kaheera, the Orphanguard

// Deck
1 Sol Ring
38 Island

// Sideboard
1 Relic of Progenitus

// Maybeboard
1 Cyclonic Rift</code></pre>
				</div>

				<div class="guide-section">
					<h4>Extras & Set Tags</h4>
					<p>You can paste lists directly from MTG Arena, MTGO, or Archidekt. Extra metadata tags (set codes, collector numbers, and prices) are automatically parsed and cleaned up.</p>
					<pre><code>1 Arcane Signet (CLB) 298
4 Lightning Bolt *F*
1 Swords to Plowshares #Removal</code></pre>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.import-view-container {
		display: grid;
		grid-template-columns: 260px 1fr 280px;
		gap: 1.5rem;
		padding: 1.25rem;
		height: calc(100vh - 88px);
		box-sizing: border-box;
		background: hsl(var(--background));
		overflow: hidden;
	}

	.stats-pane {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		overflow-y: auto;
		border-right: 1px solid hsl(var(--border) / 0.4);
		padding-right: 1.5rem;
	}

	.stats-section-header h3,
	.actions-header h3 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.curve-graphic {
		height: 75px;
		display: flex;
		flex-direction: column;
		justify-content: flex-end;
		background: hsl(var(--muted) / 0.05);
		border: 1px solid hsl(var(--border) / 0.2);
		border-radius: var(--radius-sm);
		padding: 0.5rem;
		box-sizing: border-box;
		margin-bottom: 0.5rem;
	}

	.curve-bars {
		display: grid;
		grid-template-columns: repeat(8, 1fr);
		gap: 3px;
		align-items: flex-end;
		height: 100%;
		width: 100%;
	}

	.curve-bar-wrapper {
		display: flex;
		flex-direction: column;
		align-items: center;
		height: 100%;
		justify-content: flex-end;
		position: relative;
	}

	.curve-bar {
		background: linear-gradient(to top, hsl(var(--primary) / 0.8), hsl(var(--primary-light) / 0.9));
		border-radius: 1px 1px 0 0;
		width: 100%;
		min-height: 2px;
		position: relative;
		display: flex;
		align-items: flex-start;
		justify-content: center;
		transition: height 0.3s ease;
	}

	.bar-count {
		font-size: 8px;
		font-weight: 700;
		color: #ffffff;
		transform: translateY(-9px);
		position: absolute;
	}

	.bar-label {
		font-size: 8px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		margin-top: 4px;
	}

	.stats-overview {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
	}

	.main-price {
		font-size: 0.875rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.price-text {
		color: #34d399;
	}

	.stats-divider {
		height: 1px;
		background: hsl(var(--border) / 0.3);
	}

	.breakdown-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.breakdown-item {
		display: flex;
		justify-content: space-between;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.breakdown-item.mainboard-header {
		margin-bottom: 0.125rem;
	}

	.mainboard-subcategories {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		padding-left: 0.75rem;
		border-left: 1.5px solid hsl(var(--border) / 0.3);
		margin-bottom: 0.25rem;
	}

	.sub-item {
		display: flex;
		justify-content: space-between;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
	}

	.item-stats,
	.sub-stats {
		font-weight: 500;
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace);
	}

	.muted {
		opacity: 0.4;
	}

	.editor-pane {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		overflow: hidden;
	}

	.pane-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-shrink: 0;
	}

	.pane-header h3 {
		margin: 0;
		font-size: 0.875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	/* Layered Code/Text Editor Styling */
	.editor-wrapper {
		position: relative;
		flex: 1;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	textarea,
	.highlights-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		box-sizing: border-box;
		font-family: system-ui, -apple-system, sans-serif;
		font-size: 0.9375rem;
		line-height: 28px;
		letter-spacing: 0.01em;
	}

	textarea {
		z-index: 2;
		background: transparent;
		border: none;
		color: transparent; /* Makes raw text invisible, rendering highlights instead */
		caret-color: hsl(var(--foreground)); /* Blinking caret remains visible */
		padding: 0 48px 0 8px;
		resize: none;
		outline: none;
		overflow-y: auto;
		white-space: pre;
	}

	.highlights-layer {
		z-index: 1;
		color: hsl(var(--foreground));
		padding: 0 48px 0 8px;
		overflow-y: hidden;
		overflow-x: auto;
		white-space: pre;
		pointer-events: none;
	}

	.line-row {
		height: 28px;
		display: flex;
		align-items: center;
		border: 1px solid transparent;
		box-sizing: border-box;
	}

	.line-row.recognized {
		background: hsl(var(--primary) / 0.04);
		border-color: hsl(var(--primary) / 0.15);
		border-radius: var(--radius-sm);
	}

	.line-text {
		/* Inherits core typography */
		font-family: inherit;
		font-size: inherit;
		line-height: inherit;
	}

	/* Interactive eye icons on top right area */
	.icons-layer {
		position: absolute;
		top: 0;
		right: 8px;
		width: 24px;
		height: 100%;
		z-index: 3; /* Placed above textarea */
		overflow-y: hidden;
		pointer-events: none;
	}

	.icon-row-placeholder {
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.eye-trigger {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground) / 0.7);
		cursor: pointer;
		pointer-events: auto;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 4px;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
	}

	.eye-trigger:hover {
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
	}

	.actions-pane {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		overflow: hidden;
		padding-top: 0.5rem;
	}

	.actions-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	:global(.action-btn) {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.75rem;
		height: 38px;
		font-size: 0.8125rem;
		font-weight: 500;
		background: hsl(var(--muted) / 0.1) !important;
		border-color: hsl(var(--border) / 0.4) !important;
		transition: all 0.2s !important;
	}

	:global(.action-btn:hover) {
		background: hsl(var(--muted) / 0.25) !important;
		border-color: hsl(var(--border) / 0.8) !important;
	}

	:global(.delete-btn) {
		color: #ef4444 !important;
		border-color: rgba(239, 68, 68, 0.2) !important;
		background: rgba(239, 68, 68, 0.03) !important;
	}

	:global(.delete-btn:hover) {
		background: rgba(239, 68, 68, 0.1) !important;
		border-color: rgba(239, 68, 68, 0.4) !important;
	}

	.info-note {
		display: flex;
		gap: 0.625rem;
		padding: 0.75rem;
		background: hsl(var(--primary) / 0.03);
		border: 1px solid hsl(var(--primary) / 0.06);
		border-radius: var(--radius);
		color: hsl(var(--primary-light));
		font-size: 0.75rem;
		line-height: 1.4;
		margin-top: auto;
	}

	.info-note p {
		margin: 0;
	}

	/* Guide Modal Styles */
	.guide-modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		z-index: 10005;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.guide-modal-content {
		width: 480px;
		max-width: 90vw;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
		display: flex;
		flex-direction: column;
		max-height: 80vh;
		overflow: hidden;
		outline: none;
	}

	.modal-header {
		padding: 1.25rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		flex-shrink: 0;
	}

	.modal-title-row {
		display: flex;
		align-items: center;
		gap: 0.625rem;
	}

	.modal-title-row h3 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	:global(.guide-icon-class) {
		color: hsl(var(--primary));
	}

	.close-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: background-color 0.2s;
	}

	.close-btn:hover {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
	}

	.guide-scroll {
		padding: 1.5rem;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.guide-section {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.guide-section h4 {
		margin: 0;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.guide-section p {
		margin: 0;
		font-size: 0.8125rem;
		line-height: 1.4;
		color: hsl(var(--muted-foreground));
	}

	pre {
		margin: 0;
		background: hsl(var(--muted) / 0.25);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-sm);
		padding: 0.625rem;
		overflow-x: auto;
	}

	code {
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
		font-size: 0.75rem;
		color: hsl(var(--foreground));
	}

	@media (max-width: 900px) {
		.import-view-container {
			grid-template-columns: 1fr;
		}
		.stats-pane {
			border-right: none;
			border-bottom: 1px solid hsl(var(--border) / 0.4);
			padding-right: 0;
			padding-bottom: 1rem;
		}
		.actions-pane {
			padding-top: 0;
		}
	}
</style>
