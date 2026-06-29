<script>
	import { fade, scale } from "svelte/transition";
	import { onMount } from "svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { db } from "$lib/db";
	import { Search, Save } from "lucide-svelte";

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
	let isMac = $state(false);

	onMount(() => {
		textareaEl?.focus();
		if (typeof window !== "undefined" && typeof navigator !== "undefined") {
			isMac = navigator.platform.indexOf("Mac") > -1;
		}
	});

	// Query IndexedDB for card name suggestions matching the active line
	$effect(() => {
		const val = inputText;
		if (!val.trim()) {
			suggestions = [];
			return;
		}
		const lines = val.split("\n");
		const lastLine = lines[lines.length - 1].trim();
		const cleanQuery = lastLine.replace(/^\d+\s+/, "");

		if (cleanQuery.length < 2 || cleanQuery.startsWith("/") || cleanQuery.startsWith("?")) {
			suggestions = [];
			return;
		}

		const fetchSuggestions = async () => {
			try {
				const matches = await db.cards
					.where("name")
					.startsWithIgnoreCase(cleanQuery)
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

	// Determine if the input is meant as a card search
	const isSearch = $derived(
		inputText.startsWith("/") ||
		inputText.startsWith("?") ||
		inputText.includes(":")
	);

	/** @param {string} name */
	async function addSingleCard(name) {
		const lines = inputText.split("\n");
		const lastLine = lines[lines.length - 1];
		const match = lastLine.match(/^(\s*\d+\s+)/);
		const prefix = match ? match[1] : "1 ";
		lines[lines.length - 1] = prefix + name;
		inputText = lines.join("\n") + "\n";
		suggestions = [];
		textareaEl?.focus();
	}

	function handleSearch() {
		let query = inputText.trim();
		if (query.startsWith("/") || query.startsWith("?")) {
			query = query.slice(1);
		}
		searchStore.query = query;
		inputText = "";
		const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
		settingsStore.deckViewMode = lastView === "spoiler" ? "spoiler" : "stacks";
	}

	function handleSave() {
		deckStore.importText = inputText;
		inputText = "";
		const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
		settingsStore.deckViewMode = lastView === "list" ? "stacks" : lastView;
	}

	/** @param {ClipboardEvent} e */
	async function handlePaste(e) {
		if (!deckStore.isEmptyStateActive) return;
		if (e.target === textareaEl) return;

		let text = e.clipboardData?.getData("text/plain") || "";
		if (!text) {
			try {
				text = await navigator.clipboard.readText();
			} catch (err) {
				// Clipboard permission blocked
			}
		}

		if (!text) return;

		e.preventDefault();
		e.stopPropagation();

		const hasTabs = text.includes("\t");
		if (hasTabs) {
			settingsStore.deckViewMode = "table";
		} else {
			const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
			settingsStore.deckViewMode = lastView;
		}

		interactionStore.pasteSelected();
	}

	/** @param {KeyboardEvent} e */
	function handleKeyDown(e) {
		if (!deckStore.isEmptyStateActive) return;
		if (e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key.length !== 1) return;

		const target = /** @type {HTMLElement} */ (e.target);
		if (
			target.tagName === "INPUT" ||
			target.tagName === "TEXTAREA" ||
			target.isContentEditable
		) {
			return;
		}

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
		} else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			if (isSearch) {
				handleSearch();
			} else if (inputText.trim()) {
				handleSave();
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
		const lastView = localStorage.getItem("budgericards_last_active_view_mode") || "stacks";
		settingsStore.deckViewMode = lastView === "spoiler" ? "spoiler" : "stacks";
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
			To get started, <span class="highlight">paste</span> a decklist or <span class="highlight">search</span> for cards
		</p>
		<div class="input-positioner">
			<textarea
				bind:this={textareaEl}
				bind:value={inputText}
				onkeydown={handleTextareaKeyDown}
				placeholder="1 Figure of Fable&#10;4 Flooded Strand&#10;2 Forest"
				class="editor-textarea"
				rows="6"
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

		{#if inputText.trim().length > 0}
			<div class="actions-row" in:fade={{ duration: 150 }}>
				{#if isSearch}
					<button class="primary-btn search-btn" onclick={handleSearch}>
						<Search size={14} style="margin-right: 6px;" />
						Search Cards
					</button>
				{:else}
					<button class="primary-btn save-btn" onclick={handleSave}>
						<Save size={14} style="margin-right: 6px;" />
						Save & Continue
					</button>
				{/if}
				<span class="shortcut-tip">
					Press <kbd>{isMac ? "⌘" : "Ctrl"}+Enter</kbd> to submit
				</span>
			</div>
		{/if}
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
		height: calc(100vh - 56px);
		background: transparent;
		box-sizing: border-box;
		padding: 20vh 2rem 2rem 2rem;
		transition: background-color 0.2s ease;
		cursor: text;
	}

	.empty-state-wrapper.drag-over {
		background-color: hsl(var(--primary) / 0.03);
	}

	.content-container {
		text-align: left;
		max-width: 520px;
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

	.description .highlight {
		color: hsl(var(--foreground));
	}

	.input-positioner {
		position: relative;
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	.editor-textarea {
		width: 100%;
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-sizing: border-box;
		outline: none;
		resize: vertical;
		color: hsl(var(--foreground));
		font-family: var(--font-mono), monospace;
		font-size: 0.875rem;
		line-height: 1.6;
		margin-top: 0.5rem;
		padding: 1rem;
		min-height: 140px;
		cursor: text;
		transition: all 0.2s ease;
	}

	.editor-textarea:focus {
		border-color: hsl(var(--primary) / 0.6);
		box-shadow: 0 0 0 4px hsl(var(--primary) / 0.1);
		background: hsl(var(--card) / 0.6);
	}

	.editor-textarea::placeholder {
		color: hsl(var(--muted-foreground) / 0.35);
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

	.actions-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		width: 100%;
		margin-top: 0.5rem;
	}

	.primary-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 38px;
		padding: 0 1.25rem;
		font-size: 0.875rem;
		font-weight: 600;
		border: none;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: all 0.2s ease;
		color: white;
	}

	.save-btn {
		background: hsl(var(--primary));
	}

	.save-btn:hover {
		background: hsl(var(--primary-dark));
		transform: translateY(-1px);
	}

	.search-btn {
		background: hsl(var(--foreground));
		color: hsl(var(--background));
	}

	.search-btn:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}

	.shortcut-tip {
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground) / 0.6);
	}

	.shortcut-tip kbd {
		font-family: var(--font-sans), sans-serif;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border) / 0.4);
		padding: 1px 4px;
		border-radius: 3px;
	}
</style>
