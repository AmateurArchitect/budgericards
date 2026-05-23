<script>
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import { X, Upload, Loader2, Info } from 'lucide-svelte';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { parseDecklist } from '$lib/utils/decklistParser.js';
	import Button from '$lib/components/ui/Button.svelte';

	/** @type {{ isOpen: boolean, onSuccess?: () => void }} */
	let { isOpen = $bindable(false), onSuccess } = $props();

	let decklistText = $state('');
	let isImporting = $state(false);
	let replaceDeck = $state(false);

	// Load persistence for "replaceDeck"
	if (typeof localStorage !== 'undefined') {
		const savedReplace = localStorage.getItem('budgericards_import_replace');
		if (savedReplace !== null) {
			replaceDeck = savedReplace === 'true';
		}
	}

	// Persist "replaceDeck" when it changes
	$effect(() => {
		if (typeof localStorage !== 'undefined') {
			localStorage.setItem('budgericards_import_replace', replaceDeck.toString());
		}
	});

	function close() {
		if (isImporting) return;
		isOpen = false;
		decklistText = '';
	}

	async function handleImport() {
		if (!decklistText.trim() || isImporting) return;

		isImporting = true;
		try {
			const parsedCards = parseDecklist(decklistText);
			if (parsedCards.length > 0) {
				await deckStore.importCards(parsedCards, { replace: replaceDeck });
				isImporting = false; // Allow close() to proceed
				onSuccess?.();
				close();
			} else {
				alert('No valid cards found in the list. Please check the format.');
			}
		} catch (e) {
			console.error('Import failed:', e);
			alert('Failed to import decklist. Please try again.');
		} finally {
			isImporting = false;
		}
	}

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}
	onMount(() => {
		window.addEventListener('keydown', handleKeydown, { capture: true });
		return () => {
			window.removeEventListener('keydown', handleKeydown, { capture: true });
		};
	});
</script>

{#if isOpen}
	<div 
		use:portal
		class="modal-portal-wrapper"
	>
		<div 
			class="modal-backdrop" 
			role="presentation" 
			onclick={(e) => {
				if (e.target === e.currentTarget) close();
			}}
			in:fade={{ duration: 150 }}
			out:fade={{ duration: 150 }}
		></div>

		<div 
			class="modal-content" 
			role="dialog" 
			aria-modal="true" 
			aria-labelledby="import-modal-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			in:fly={{ y: 8, duration: 200 }}
			out:fly={{ y: 8, duration: 150 }}
		>
		<div class="modal-header">
			<div class="title-row">
				<Upload size={18} class="header-icon" />
				<h2 id="import-modal-title">Import Cards</h2>
			</div>
			<button class="close-btn" onclick={close} aria-label="Close modal">
				<X size={20} />
			</button>
		</div>

		<div class="modal-body">
			<div class="info-box">
				<Info size={16} />
				<p>Paste your decklist below. Supports Archidekt, MTGO, Arena, and plain text.</p>
			</div>

			<textarea 
				bind:value={decklistText} 
				placeholder="1x Card Name&#10;1 Card Name (SET)&#10;Island&#10;..."
				spellcheck="false"
				disabled={isImporting}
			></textarea>

			<div class="options-row">
				<label class="checkbox-label">
					<input type="checkbox" bind:checked={replaceDeck} disabled={isImporting} />
					<span class="custom-checkbox"></span>
					Replace current deck
				</label>
			</div>

			<div class="actions">
				<Button 
					variant="outline" 
					onclick={close} 
					disabled={isImporting}
					class="cancel-btn"
				>
					Cancel
				</Button>
				<Button 
					variant="primary" 
					onclick={handleImport} 
					disabled={isImporting || !decklistText.trim()}
					class="import-btn"
				>
					{#if isImporting}
						<Loader2 size={16} class="spinner" />
						Importing...
					{:else}
						Import Cards
					{/if}
				</Button>
			</div>
		</div>
		</div>
	</div>
{/if}

<style>
	.modal-portal-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		pointer-events: none;
		z-index: 10002;
	}

	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 10003;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		pointer-events: auto;
	}

	.modal-content {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 10004;
		pointer-events: auto;
		background: hsl(var(--popover));
		backdrop-filter: blur(20px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		width: 480px;
		max-width: 90vw;
		box-shadow: 
			0 20px 50px rgba(0, 0, 0, 0.5), 
			0 0 0 1px hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		overflow: hidden;
		outline: none;
	}

	.modal-header {
		padding: 1.25rem 1.5rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.header-icon) {
		color: hsl(var(--primary));
	}

	h2 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.close-btn {
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 4px;
		border-radius: var(--radius);
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.modal-body {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.info-box {
		display: flex;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		background: hsl(var(--primary) / 0.05);
		border: 1px solid hsl(var(--primary) / 0.1);
		border-radius: var(--radius);
		color: hsl(var(--primary) / 0.9);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.info-box p {
		margin: 0;
	}

	textarea {
		width: 100%;
		height: 240px;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		padding: 1rem;
		color: hsl(var(--foreground));
		font-family: var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace);
		font-size: 0.875rem;
		resize: none;
		transition: border-color 0.2s, box-shadow 0.2s;
		outline: none;
	}

	textarea:focus {
		border-color: hsl(var(--primary) / 0.5);
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.1);
	}

	textarea:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.options-row {
		display: flex;
		align-items: center;
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		cursor: pointer;
		user-select: none;
	}

	.checkbox-label input {
		display: none;
	}

	.custom-checkbox {
		width: 18px;
		height: 18px;
		border: 2px solid hsl(var(--border));
		border-radius: var(--radius-sm);
		position: relative;
		transition: all 0.2s;
	}

	.checkbox-label input:checked + .custom-checkbox {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
	}

	.checkbox-label input:checked + .custom-checkbox::after {
		content: '';
		position: absolute;
		left: 5px;
		top: 2px;
		width: 4px;
		height: 8px;
		border: solid white;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: flex-end;
		margin-top: 0.5rem;
	}

	:global(.cancel-btn) {
		min-width: 100px;
	}

	:global(.import-btn) {
		min-width: 140px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
	}

	:global(.import-btn:hover:not(:disabled)) {
		background: hsl(var(--primary) / 0.9);
	}

	:global(.spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
