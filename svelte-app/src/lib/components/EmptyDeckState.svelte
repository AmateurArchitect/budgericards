<script>
	import { fade } from "svelte/transition";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";

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
	in:fade={{ duration: 150 }}
>
	<div class="content-container">
		<h2>Build Your Deck</h2>
		<p class="description">
			To get started, paste a decklist, drag and drop cards from Scryfall, or start typing a card name or a card search.
		</p>
	</div>
</div>

<style>
	.empty-state-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: calc(100vh - 56px); /* Full height minus main header */
		background: transparent;
		box-sizing: border-box;
		padding: 2rem;
		transition: background-color 0.2s ease;
	}

	.empty-state-wrapper.drag-over {
		background-color: hsl(var(--primary) / 0.03);
	}

	.content-container {
		text-align: center;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
		user-select: none;
	}

	h2 {
		margin: 0;
		font-size: 1.85rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		color: hsl(var(--foreground));
	}

	.description {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.6;
		color: hsl(var(--muted-foreground));
	}
</style>
