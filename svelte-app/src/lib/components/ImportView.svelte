<script>
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { Info, HelpCircle } from 'lucide-svelte';
	import { fade } from 'svelte/transition';
</script>

<div class="import-view-container" in:fade={{ duration: 200 }}>
	<div class="editor-pane">
		<div class="pane-header">
			<h3>Decklist Editor</h3>
			<span class="info-badge">Plain Text Format</span>
		</div>
		<textarea
			bind:value={deckStore.importText}
			placeholder="// Commander&#10;1 Atraxa, Praetors' Voice&#10;&#10;// Deck&#10;1 Sol Ring&#10;1 Arcane Signet&#10;38 Island&#10;..."
			spellcheck="false"
			aria-label="Decklist Text Input"
		></textarea>
	</div>

	<div class="guide-pane">
		<div class="guide-header">
			<HelpCircle size={18} class="guide-icon" />
			<h3>Decklist Format Guide</h3>
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

		<div class="info-note">
			<Info size={16} />
			<p>Saving changes will replace the entire current deck with the contents of this editor. Make sure to back up anything important first.</p>
		</div>
	</div>
</div>

<style>
	.import-view-container {
		display: grid;
		grid-template-columns: 1fr 340px;
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
		background: hsl(var(--card) / 0.3);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		gap: 1rem;
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
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.info-badge {
		font-size: 0.75rem;
		padding: 0.25rem 0.625rem;
		background: hsl(var(--primary) / 0.1);
		color: hsl(var(--primary-light));
		border-radius: var(--radius-full);
		font-weight: 500;
		border: 1px solid hsl(var(--primary) / 0.2);
	}

	textarea {
		flex: 1;
		width: 100%;
		background: hsl(var(--muted) / 0.15);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius);
		padding: 1.25rem;
		color: hsl(var(--foreground));
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
		font-size: 0.875rem;
		line-height: 1.6;
		resize: none;
		transition: border-color 0.2s, box-shadow 0.2s;
		outline: none;
		box-sizing: border-box;
	}

	textarea:focus {
		border-color: hsl(var(--primary) / 0.5);
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
		background: hsl(var(--muted) / 0.2);
	}

	.guide-pane {
		display: flex;
		flex-direction: column;
		background: hsl(var(--card) / 0.2);
		backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-lg);
		padding: 1.25rem;
		gap: 1.25rem;
		overflow: hidden;
	}

	.guide-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
		padding-bottom: 0.75rem;
	}

	.guide-header h3 {
		margin: 0;
		font-size: 0.9375rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	:global(.guide-icon) {
		color: hsl(var(--primary));
	}

	.guide-scroll {
		flex: 1;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding-right: 4px;
	}

	/* Custom Scrollbar for Guide Scroll */
	.guide-scroll::-webkit-scrollbar {
		width: 6px;
	}
	.guide-scroll::-webkit-scrollbar-track {
		background: transparent;
	}
	.guide-scroll::-webkit-scrollbar-thumb {
		background: hsl(var(--border) / 0.5);
		border-radius: 3px;
	}
	.guide-scroll::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--border));
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

	.info-note {
		display: flex;
		gap: 0.625rem;
		padding: 0.75rem;
		background: hsl(var(--primary) / 0.05);
		border: 1px solid hsl(var(--primary) / 0.1);
		border-radius: var(--radius);
		color: hsl(var(--primary-light));
		font-size: 0.75rem;
		line-height: 1.4;
		flex-shrink: 0;
	}

	.info-note p {
		margin: 0;
	}

	@media (max-width: 768px) {
		.import-view-container {
			grid-template-columns: 1fr;
		}
		.guide-pane {
			display: none;
		}
	}
</style>
