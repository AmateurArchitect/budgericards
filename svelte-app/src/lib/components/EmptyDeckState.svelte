<script>
	import { fade } from "svelte/transition";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";

	import DeckOptionsModal from "./DeckOptionsModal.svelte";

	let dropZoneActive = $state(false);
	let showDeckOptionsModal = $state(false);
	/** @type {HTMLElement | null} */
	let headerEl = $state(null);

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
			const lastView =
				localStorage.getItem("budgericards_last_active_view_mode") ||
				"stacks";
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
		if (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.isContentEditable
		) {
			return;
		}

		const char = e.key;

		// Determine if this is a Search Query vs. Card Name
		// Search syntax typically starts with / or ? or contains a colon (like o:, type:, etc.)
		const isSearchTrigger = char === "/" || char === "?";

		if (isSearchTrigger) {
			e.preventDefault();
			const lastView =
				localStorage.getItem("budgericards_last_active_view_mode") ||
				"stacks";
			settingsStore.deckViewMode =
				lastView === "spoiler" ? "spoiler" : "stacks";

			// Focus search input
			setTimeout(() => {
				const searchInput = /** @type {HTMLInputElement | null} */ (
					document.querySelector(
						".search-input-field, input[type='search'], input[placeholder*='Search']",
					)
				);
				if (searchInput) {
					searchInput.focus();
					searchInput.select();
				}
			}, 50);
		} else if (char === ":") {
			// Search operator syntax
			e.preventDefault();
			const lastView =
				localStorage.getItem("budgericards_last_active_view_mode") ||
				"stacks";
			settingsStore.deckViewMode =
				lastView === "spoiler" ? "spoiler" : "stacks";
			searchStore.query = ":";

			setTimeout(() => {
				const searchInput = /** @type {HTMLInputElement | null} */ (
					document.querySelector(
						".search-input-field, input[type='search'], input[placeholder*='Search']",
					)
				);
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
		const lastView =
			localStorage.getItem("budgericards_last_active_view_mode") ||
			"stacks";
		settingsStore.deckViewMode =
			lastView === "spoiler" ? "spoiler" : "stacks";
	}
</script>

<svelte:window onpaste={handlePaste} onkeydown={handleKeyDown} />

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
		<button
			bind:this={headerEl}
			class="deck-title-editable-btn"
			onclick={(e) => {
				e.stopPropagation();
				showDeckOptionsModal = true;
			}}
			title="Click to rename deck"
		>
			<h2>
				{deckStore.name && deckStore.name !== "Untitled Deck" ? deckStore.name : "New Deck"}
			</h2>
		</button>
		<p class="description">
			To get started, paste a decklist or search for cards
		</p>
		<div class="cursor-prompt" aria-hidden="true">
			<span class="blinking-cursor"></span>
		</div>
	</div>
</div>

<DeckOptionsModal
	bind:isOpen={showDeckOptionsModal}
	fallbackArt={null}
	triggerElement={headerEl}
/>

<style>
	.empty-state-wrapper {
		display: flex;
		align-items: flex-start;
		justify-content: center;
		width: 100%;
		height: calc(100vh - 56px); /* Full height minus main header */
		background: transparent;
		box-sizing: border-box;
		padding: 25vh 2rem 2rem 2rem; /* Position 25% from top to leave ~2x space below */
		transition: background-color 0.2s ease;
	}

	.empty-state-wrapper.drag-over {
		background-color: hsl(var(--primary) / 0.03);
	}

	.content-container {
		text-align: left;
		max-width: 480px;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 1.25rem;
		user-select: none;
	}

	h2 {
		margin: 0;
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria,
			Georgia, serif;
		font-size: 1.625rem;
		font-style: italic;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: hsl(var(--foreground));
	}

	.deck-title-editable-btn {
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		outline: none;
		text-align: left;
		transition: opacity 0.25s ease;
	}

	.deck-title-editable-btn:hover {
		opacity: 0.8;
	}

	.deck-title-editable-btn:hover h2 {
		text-decoration: underline;
		text-decoration-style: dashed;
		text-decoration-thickness: 1px;
		text-underline-offset: 4px;
	}

	.description {
		margin: 0;
		font-size: 0.95rem;
		line-height: 1.33;
		color: hsl(var(--muted-foreground));
	}

	.cursor-prompt {
		display: flex;
		align-items: center;
		margin-top: 1rem;
		padding-left: 0.15rem;
	}

	.blinking-cursor {
		width: 1.5px;
		height: 1.35rem;
		background-color: hsl(var(--foreground));
		animation: blink 1.1s step-end infinite;
	}

	@keyframes blink {
		from,
		to {
			background-color: transparent;
		}
		50% {
			background-color: hsl(var(--foreground));
		}
	}
</style>
