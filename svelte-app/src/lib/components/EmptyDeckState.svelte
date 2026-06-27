<script>
	import { fade } from "svelte/transition";
	import { onMount } from "svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { db } from "$lib/db";

	import DeckOptionsModal from "./DeckOptionsModal.svelte";

	let dropZoneActive = $state(false);
	let showDeckOptionsModal = $state(false);
	/** @type {HTMLElement | null} */
	let headerEl = $state(null);
	/** @type {HTMLTextAreaElement | null} */
	let textareaEl = $state(null);
	let inputText = $state("");

	let suggestions = $state(/** @type {string[]} */ ([]));
	let activeIndex = $state(0);

	onMount(() => {
		textareaEl?.focus();
	});

	// Query IndexedDB for card name suggestions
	$effect(() => {
		const query = inputText.trim();
		if (query.length < 2 || query.startsWith("/") || query.startsWith("?")) {
			suggestions = [];
			return;
		}

		const fetchSuggestions = async () => {
			try {
				const matches = await db.cards
					.where("name")
					.startsWithIgnoreCase(query)
					.limit(5)
					.toArray();
				suggestions = [...new Set(matches.map((m) => m.name))];
				activeIndex = 0;
			} catch (err) {
				console.error("Autocomplete search error:", err);
			}
		};

		fetchSuggestions();
	});

	// Handle routing to search or list views based on text input reactively
	$effect(() => {
		const val = inputText;
		if (val.startsWith("/") || val.startsWith("?")) {
			// Search trigger syntax
			searchStore.query = val.slice(1);
			inputText = "";
			const lastView =
				localStorage.getItem("budgericards_last_active_view_mode") ||
				"stacks";
			settingsStore.deckViewMode =
				lastView === "spoiler" ? "spoiler" : "stacks";

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
		} else if (val.includes(":")) {
			// Search operator syntax
			searchStore.query = val;
			inputText = "";
			const lastView =
				localStorage.getItem("budgericards_last_active_view_mode") ||
				"stacks";
			settingsStore.deckViewMode =
				lastView === "spoiler" ? "spoiler" : "stacks";

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
		} else if (val.includes("\n")) {
			// Multiline input (pasted decklist) goes straight to List View
			deckStore.importText = val;
			inputText = "";
			settingsStore.deckViewMode = "list";
		}
	});

	/** @param {string} name */
	async function addSingleCard(name) {
		deckStore.addCard(name, deckStore.activeBoard, 0);
		inputText = "";
		suggestions = [];
	}

	/** @param {ClipboardEvent} e */
	async function handlePaste(e) {
		if (!deckStore.isEmptyStateActive) return;

		// If pasting directly into our textarea, let standard textarea paste and reactivity handle it
		if (e.target === textareaEl) return;

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

		// Direct focus and let character input register
		textareaEl?.focus();
	}

	/** @param {KeyboardEvent} e */
	function handleTextareaKeyDown(e) {
		if (suggestions.length > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				activeIndex = (activeIndex + 1) % suggestions.length;
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				activeIndex = (activeIndex - 1 + suggestions.length) % suggestions.length;
			} else if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				addSingleCard(suggestions[activeIndex]);
			} else if (e.key === "Escape") {
				e.preventDefault();
				suggestions = [];
			}
		} else if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			const val = inputText.trim();
			if (val) {
				addSingleCard(val);
			}
		}
	}

	/** @param {MouseEvent} e */
	function handleWindowClick(e) {
		if (!deckStore.isEmptyStateActive) return;
		const target = /** @type {HTMLElement} */ (e.target);
		if (
			target.closest(".empty-state-wrapper") &&
			!target.closest("button, textarea, input, ul")
		) {
			textareaEl?.focus();
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

<svelte:window onpaste={handlePaste} onkeydown={handleKeyDown} onclick={handleWindowClick} />

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
		<div class="input-positioner">
			<textarea
				bind:this={textareaEl}
				bind:value={inputText}
				onkeydown={handleTextareaKeyDown}
				placeholder="Paste a decklist or type a card name..."
				class="borderless-input"
				rows="1"
				aria-label="Decklist or card entry field"
			></textarea>
			
			{#if suggestions.length > 0}
				<ul class="autocomplete-suggestions" transition:fade={{ duration: 100 }}>
					{#each suggestions as sug, i}
						<li class:active={i === activeIndex}>
							<button 
								onclick={() => addSingleCard(sug)}
								type="button"
								tabindex="-1"
							>
								{sug}
							</button>
						</li>
					{/each}
				</ul>
			{/if}
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
		cursor: text;
	}

	.empty-state-wrapper.drag-over {
		background-color: hsl(var(--primary) / 0.03);
	}

	.content-container {
		text-align: left;
		max-width: 480px;
		width: 100%;
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

	.input-positioner {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	.borderless-input {
		width: 100%;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		color: hsl(var(--foreground));
		font-family: var(--font-sans), sans-serif;
		font-size: 0.95rem;
		line-height: 1.5;
		margin-top: 1rem;
		padding: 0;
		height: auto;
		min-height: 24px;
		cursor: text;
	}

	.borderless-input::placeholder {
		color: hsl(var(--muted-foreground) / 0.4);
	}

	.autocomplete-suggestions {
		position: absolute;
		top: calc(100% + 0.5rem);
		left: 0;
		width: 100%;
		background: hsl(var(--popover) / 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4);
		padding: 0.35rem;
		margin: 0;
		list-style: none;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		z-index: 50;
	}

	.autocomplete-suggestions li {
		width: 100%;
	}

	.autocomplete-suggestions button {
		width: 100%;
		background: none;
		border: none;
		text-align: left;
		padding: 0.4rem 0.75rem;
		font-size: 0.9rem;
		color: hsl(var(--muted-foreground));
		border-radius: var(--radius-sm);
		cursor: pointer;
		outline: none;
		transition: all 0.15s ease;
	}

	.autocomplete-suggestions li.active button,
	.autocomplete-suggestions button:hover {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--foreground));
	}
</style>
