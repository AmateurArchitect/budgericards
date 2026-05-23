<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";

	/** @type {{ 
	 * 	label: string, 
	 * 	count: number,
	 *  type: 'row' | 'column' | 'stack',
	 *  colKey?: string,
	 * 	renamingColumn?: string | null,
	 * 	onRename?: (key: string) => void,
	 * 	onCommit?: (key: string) => void,
	 * 	onCancel?: () => void,
	 * 	renameValue?: string
	 * }} */
	let { 
		label, 
		count,
		type = 'column',
		colKey = '', 
		renamingColumn = null, 
		onRename = () => {}, 
		onCommit = () => {}, 
		onCancel = () => {},
		renameValue = $bindable('')
	} = $props();

	/** @param {HTMLElement} node */
	function focusOnMount(node) {
		node.focus();
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Enter') onCommit(colKey);
		else if (e.key === 'Escape') onCancel();
	}
</script>

<div class="header-container" class:type-row={type === 'row'} class:type-column={type === 'column'} class:type-stack={type === 'stack'}>
	{#if type === 'column' && deckStore.grouping === 'freeform' && renamingColumn === colKey}
		<input
			class="col-rename-input"
			bind:value={renameValue}
			onblur={() => onCommit(colKey)}
			onkeydown={handleKeydown}
			use:focusOnMount
		/>
	{:else if type === 'column' && deckStore.grouping === 'freeform'}
		<button
			class="title freeform-renameable"
			type="button"
			ondblclick={() => onRename(colKey)}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === 'F2') onRename(colKey); }}
			title="Double-click or press Enter to rename"
		>
			{label}
		</button>
	{:else}
		<span class="title">
			{label}
		</span>
	{/if}
	<span class="count">
		({count})
	</span>
</div>

<style>
	.header-container {
		display: flex;
		justify-content: flex-start;
		gap: 0.25rem;
		align-items: baseline;
		padding: 0 4px;
		height: auto;
		margin-bottom: 0.75rem;
	}

	.title {
		font-weight: 700;
		font-size: var(--font-base);
		letter-spacing: -0.01em;
	}

	/* Hierarchy 1: Row Header - Premium Style */
	.type-row {
		margin-bottom: 1rem;
		padding: 0;
	}
	.type-row .title {
		color: var(--text-primary);
		font-size: var(--font-xs);
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}
	.type-row .count {
		display: inline;
		font-weight: 800;
		opacity: 1;
	}

	/* Hierarchy 2: Column Header - Simple Style */
	.type-column {
		margin-bottom: 0.75rem;
	}
	.type-column .title {
		font-weight: 700;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		letter-spacing: -0.01em;
		text-transform: none;
	}
	.type-column .count {
		font-weight: 700;
		opacity: 0.7;
	}

	/* Hierarchy 3: Stack Header */
	.type-stack {
		margin-bottom: 0.75rem;
		opacity: 0.7;
	}
	.type-stack .title {
		color: var(--text-primary);
		font-size: 0.75rem;
		text-transform: none;
		letter-spacing: -0.01em;
	}

	.title.freeform-renameable {
		appearance: none;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		font: inherit;
		color: inherit;
		text-align: left;
		cursor: text;
		transition: color 0.15s ease;
	}

	.title.freeform-renameable:hover {
		color: hsl(var(--primary));
	}

	.count {
		font-family: inherit;
		font-size: var(--font-xs);
		font-weight: 700;
		color: hsl(var(--muted-foreground));
		font-variant-numeric: tabular-nums;
		opacity: 1;
	}

	.col-rename-input {
		background: hsl(var(--muted) / 0.4);
		border: 1px solid hsl(var(--primary) / 0.6);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: var(--font-base);
		font-weight: 700;
		font-family: inherit;
		padding: 1px 4px;
		width: 100%;
		outline: none;
		flex: 1;
	}

	.col-rename-input:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}
</style>
