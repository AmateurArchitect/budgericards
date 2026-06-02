<script>
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { Info, HelpCircle, X } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
	import Button from '$lib/components/ui/Button.svelte';
	import { parseDecklist } from '$lib/utils/decklistParser.js';

	/** @type {HTMLTextAreaElement | null} */
	let textareaEl = $state(null);
	let showGuide = $state(false);

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

		// Consolidate quantities per board
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
			// Ensure safe indexing
			if (!boards[board]) {
				boards[board] = {};
			}
			const name = card.name;
			boards[board][name] = (boards[board][name] || 0) + card.quantity;
		}

		// Re-serialize consolidated deck
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

	const placeholderText = `// Commander
1 Atraxa, Praetors' Voice

// Deck
1 Sol Ring
1 Arcane Signet
38 Island`;
</script>

<div class="import-view-container" in:fade={{ duration: 200 }}>
	<div class="editor-pane">
		<div class="pane-header">
			<h3>Decklist Editor</h3>
		</div>
		<textarea
			bind:this={textareaEl}
			bind:value={deckStore.importText}
			placeholder={placeholderText}
			spellcheck="false"
			aria-label="Decklist Text Input"
		></textarea>
	</div>

	<div class="actions-pane">
		<div class="actions-list">
			<Button variant="outline" class="action-btn" onclick={handleSelectAll}>
				Select All
			</Button>

			<Button variant="outline" class="action-btn" onclick={handleConsolidateDuplicates}>
				Consolidate Duplicates
			</Button>

			<Button variant="outline" class="action-btn" onclick={() => showGuide = true}>
				Import Format Guide
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
		grid-template-columns: 1fr 280px;
		gap: 1.5rem;
		padding: 1.25rem;
		height: calc(100vh - 88px);
		box-sizing: border-box;
		background: hsl(var(--background));
		overflow: hidden;
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

	textarea {
		flex: 1;
		width: 100%;
		background: transparent;
		border: none;
		padding: 0.5rem 0;
		color: hsl(var(--foreground));
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
		font-size: 0.875rem;
		line-height: 1.6;
		resize: none;
		outline: none;
		box-sizing: border-box;
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

	@media (max-width: 768px) {
		.import-view-container {
			grid-template-columns: 1fr;
		}
		.actions-pane {
			padding-top: 0;
		}
	}
</style>
