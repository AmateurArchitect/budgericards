<script>
	import { fade } from "svelte/transition";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { FileText, Clipboard, Search, PlusCircle } from "lucide-svelte";
	import { onMount } from "svelte";

	let dropZoneActive = $state(false);

	/** @param {ClipboardEvent} e */
	async function handlePaste(e) {
		if (!deckStore.isEmptyStateActive) return;

		let text = e.clipboardData?.getData("text/plain") || "";
		if (!text) {
			try {
				text = await navigator.clipboard.readText();
			} catch (err) {
				// Clipboard permission block
			}
		}

		if (!text) return;

		e.preventDefault();
		e.stopPropagation();

		// Determine if it is a TSV list (contains tabs) or a normal decklist
		const hasTabs = text.includes("\t");
		if (hasTabs) {
			settingsStore.deckViewMode = "table";
		} else {
			const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
			settingsStore.deckViewMode = lastView;
		}

		// Trigger paste logic
		interactionStore.pasteSelected();
	}

	/** @param {KeyboardEvent} e */
	function handleKeyDown(e) {
		if (!deckStore.isEmptyStateActive) return;

		// Ignore modifier/system keys
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key.length !== 1) return; // Only capture printable character inputs

		// Check if we are typing inside an input element elsewhere
		const target = /** @type {HTMLElement} */ (e.target);
		if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable) {
			return;
		}

		const char = e.key;

		// Determine if this is a Search Query vs. Card Name
		// Search syntax typically starts with / or ? or contains a colon (like o:, type:, etc.)
		const isSearchTrigger = char === "/" || char === "?";
		
		if (isSearchTrigger) {
			e.preventDefault();
			const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
			settingsStore.deckViewMode = lastView === "spoiler" ? "spoiler" : "stacks";
			
			// Focus search input
			setTimeout(() => {
				const searchInput = /** @type {HTMLInputElement | null} */ (document.querySelector(".search-input-field, input[type='search'], input[placeholder*='Search']"));
				if (searchInput) {
					searchInput.focus();
					searchInput.select();
				}
			}, 50);
		} else if (char === ":") {
			// Search operator syntax
			e.preventDefault();
			const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
			settingsStore.deckViewMode = lastView === "spoiler" ? "spoiler" : "stacks";
			searchStore.query = ":";
			
			setTimeout(() => {
				const searchInput = /** @type {HTMLInputElement | null} */ (document.querySelector(".search-input-field, input[type='search'], input[placeholder*='Search']"));
				if (searchInput) {
					searchInput.focus();
				}
			}, 50);
		} else {
			// Card name - go to list/import view and insert character
			e.preventDefault();
			settingsStore.deckViewMode = "list";
			deckStore.importText = char;
		}
	}

	function handleActionBrowse() {
		const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
		settingsStore.deckViewMode = lastView === "spoiler" ? "spoiler" : "stacks";
		
		setTimeout(() => {
			const searchInput = /** @type {HTMLInputElement | null} */ (document.querySelector(".search-input-field, input[type='search'], input[placeholder*='Search']"));
			if (searchInput) {
				searchInput.focus();
			}
		}, 50);
	}

	function handleActionPaste() {
		settingsStore.deckViewMode = "list";
	}

	/** @param {DragEvent} e */
	function handleDragOver(e) {
		e.preventDefault();
		dropZoneActive = true;
	}

	function handleDragLeave() {
		dropZoneActive = false;
	}

	function handleDrop() {
		dropZoneActive = false;
		const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
		settingsStore.deckViewMode = lastView === "spoiler" ? "spoiler" : "stacks";
	}
</script>

<svelte:window 
	onpaste={handlePaste} 
	onkeydown={handleKeyDown} 
/>

<div 
	class="empty-state-wrapper" 
	class:drag-over={dropZoneActive}
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
	aria-label="Empty Deck Workspace"
	in:fade={{ duration: 250 }}
>
	<div class="glass-container">
		<div class="glow-sphere"></div>
		
		<div class="icon-ring">
			<PlusCircle size={40} class="icon-plus" />
		</div>
		
		<h2>Build Your Deck</h2>
		
		<p class="description">
			To get started, paste a decklist, drag and drop cards from Scryfall, or start typing a card name or a card search.
		</p>
		
		<div class="actions-group">
			<button class="action-card" onclick={handleActionPaste}>
				<div class="card-icon-wrapper">
					<Clipboard size={22} />
				</div>
				<div class="card-info">
					<span class="card-title">Paste Decklist</span>
					<span class="card-sub">Import from text or TSV format</span>
				</div>
			</button>
			
			<button class="action-card" onclick={handleActionBrowse}>
				<div class="card-icon-wrapper">
					<Search size={22} />
				</div>
				<div class="card-info">
					<span class="card-title">Search & Browse</span>
					<span class="card-sub">Add cards manually from Scryfall</span>
				</div>
			</button>
		</div>

		<div class="shortcuts-legend">
			<div class="shortcut-item">
				<kbd>Cmd/Ctrl</kbd> + <kbd>V</kbd> <span>to paste list</span>
			</div>
			<div class="shortcut-item">
				<kbd>/</kbd> or <kbd>?</kbd> <span>to start search</span>
			</div>
			<div class="shortcut-item">
				<span>Type letters to enter card name</span>
			</div>
		</div>
	</div>
</div>

<style>
	.empty-state-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: calc(100vh - 56px); /* Full height minus main header */
		background: radial-gradient(circle at center, hsl(var(--background) / 0.8) 0%, hsl(var(--background)) 100%);
		position: relative;
		overflow: hidden;
		box-sizing: border-box;
		padding: 2rem;
		transition: border-color 0.25s ease, background 0.25s ease;
		border: 2px dashed transparent;
	}

	.empty-state-wrapper.drag-over {
		border-color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.05);
	}

	.glass-container {
		position: relative;
		max-width: 560px;
		width: 100%;
		background: hsl(var(--popover) / 0.4);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		padding: 3rem 2.5rem;
		text-align: center;
		box-shadow: 0 20px 50px -15px rgba(0, 0, 0, 0.35);
		display: flex;
		flex-direction: column;
		align-items: center;
		overflow: hidden;
	}

	.glow-sphere {
		position: absolute;
		top: -20%;
		width: 250px;
		height: 250px;
		background: radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%);
		border-radius: 50%;
		pointer-events: none;
		z-index: 0;
	}

	.icon-ring {
		width: 80px;
		height: 80px;
		border-radius: 50%;
		background: hsl(var(--primary) / 0.1);
		border: 1px solid hsl(var(--primary) / 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.5rem;
		position: relative;
		z-index: 1;
		box-shadow: 0 8px 24px -6px hsl(var(--primary) / 0.15);
	}

	:global(.icon-plus) {
		color: hsl(var(--primary));
	}

	h2 {
		margin: 0 0 0.75rem 0;
		font-size: 1.75rem;
		font-weight: 800;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
		position: relative;
		z-index: 1;
	}

	.description {
		font-size: 0.95rem;
		line-height: 1.6;
		color: hsl(var(--muted-foreground));
		margin: 0 0 2.5rem 0;
		max-width: 420px;
		position: relative;
		z-index: 1;
	}

	.actions-group {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1rem;
		width: 100%;
		margin-bottom: 2.5rem;
		position: relative;
		z-index: 1;
	}

	.action-card {
		background: hsl(var(--muted) / 0.1);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		text-align: left;
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		color: inherit;
		outline: none;
	}

	.action-card:hover {
		background: hsl(var(--muted) / 0.25);
		border-color: hsl(var(--primary) / 0.4);
		transform: translateY(-2px);
		box-shadow: 0 8px 20px -8px rgba(0, 0, 0, 0.25);
	}

	.action-card:focus-visible {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.card-icon-wrapper {
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.1);
		width: 44px;
		height: 44px;
		border-radius: var(--radius-sm);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 0.875rem;
	}

	.card-title {
		font-weight: 600;
		font-size: 0.95rem;
		color: hsl(var(--foreground));
		display: block;
		margin-bottom: 0.25rem;
	}

	.card-sub {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.3;
	}

	.shortcuts-legend {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
		border-top: 1px solid hsl(var(--border) / 0.4);
		padding-top: 1.5rem;
		width: 100%;
		position: relative;
		z-index: 1;
	}

	.shortcut-item {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
	}

	kbd {
		background: hsl(var(--muted) / 0.25);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: 4px;
		padding: 1px 5px;
		font-size: 0.75rem;
		font-family: var(--font-mono, monospace);
		color: hsl(var(--foreground));
		box-shadow: 0 1px 0 rgba(0,0,0,0.2);
	}
</style>
