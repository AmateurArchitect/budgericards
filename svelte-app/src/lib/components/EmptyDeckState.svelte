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
	import { parseDecklist } from "$lib/utils/decklistParser.js";
	import { getCardByName } from "$lib/localSearch";

	let dropZoneActive = $state(false);
	let showDeckOptionsModal = $state(false);
	/** @type {HTMLElement | null} */
	let headerEl = $state(null);
	/** @type {HTMLTextAreaElement | null} */
	let textareaEl = $state(null);
	let inputText = $state("");
	const lines = $derived(inputText.split(/\r?\n/));
	const parsedCards = $derived(parseDecklist(inputText));
	/** @type {Record<string, any>} */
	let resolvedMetadataMap = $state({});

	$effect(() => {
		const cards = parsedCards;
		const uniqueNames = [
			...new Set(cards.filter(c => c.name).map((c) => /** @type {string} */ (c.name).toLowerCase())),
		];

		const resolveAll = async () => {
			/** @type {Record<string, any>} */
			const details = {};

			await Promise.all(
				uniqueNames.map(async (name) => {
					if (deckStore.metadata[name]) {
						details[name] = deckStore.metadata[name];
						return;
					}
					try {
						const localCard = await getCardByName(name);
						if (localCard) {
							const priceRecord = await db.prices.get(localCard.id);
							const cardMetadata = {
								name: localCard.name,
								type_line: localCard.type || "",
								prices: {
									usd: priceRecord ? String(priceRecord.price) : null,
								},
							};
							deckStore.metadata[name] = cardMetadata;
							details[name] = cardMetadata;
						} else {
							details[name] = null;
						}
					} catch (e) {
						details[name] = null;
					}
				})
			);

			resolvedMetadataMap = details;
		};

		resolveAll();
	});

	let suggestions = $state(/** @type {string[]} */ ([]));
	let activeIndex = $state(0);
	let isMac = $state(false);
	let placeholderIndex = $state(0);

	const placeholders = [
		["1 Figure of Fable", "4 Flooded Strand", "2 Forest"],
		["t:creature c:wubrg"],
		["paste or start typing...", "", ""],
	];

	onMount(() => {
		const focusTimeout = setTimeout(() => {
			textareaEl?.focus();
		}, 50);
		if (typeof window !== "undefined" && typeof navigator !== "undefined") {
			isMac = navigator.platform.indexOf("Mac") > -1;
		}
		const interval = setInterval(() => {
			placeholderIndex = (placeholderIndex + 1) % placeholders.length;
		}, 4000);
		return () => {
			clearInterval(interval);
			clearTimeout(focusTimeout);
		};
	});

	// Query IndexedDB for card name suggestions matching the active line
	$effect(() => {
		const val = inputText;
		if (!val.trim()) {
			suggestions = [];
			return;
		}
		const lines = val.split(/\r?\n/);
		const lastLine = lines[lines.length - 1].trim();
		const cleanQuery = lastLine.replace(/^\d+\s+/, "");

		if (
			cleanQuery.length < 2 ||
			cleanQuery.startsWith("/") ||
			cleanQuery.startsWith("?")
		) {
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
				const exactMatch = matches.find(m => m.name.toLowerCase() === cleanQuery.toLowerCase());
				const otherMatches = matches.filter(m => m.name.toLowerCase() !== cleanQuery.toLowerCase());
				if (exactMatch && otherMatches.length === 0) {
					suggestions = [];
				} else {
					suggestions = [...new Set(matches.map((m) => m.name))];
				}
				activeIndex = 0;
			} catch (err) {
				console.error("Autocomplete search error:", err);
			}
		};

		fetchSuggestions();
	});

	let hasKnownCard = $state(false);

	// Verify if the typed text contains at least one exact matching card in IndexedDB
	$effect(() => {
		const val = inputText.trim();
		if (!val) {
			hasKnownCard = false;
			return;
		}

		const checkCards = async () => {
			const parsed = parseDecklist(val);
			for (const pc of parsed) {
				if (pc.name) {
					const match = await getCardByName(pc.name);
					if (match) {
						hasKnownCard = true;
						return;
					}
				}
			}
			hasKnownCard = false;
		};

		checkCards();
	});

	let unrecognizedCount = $state(0);
	let unrecognizedNames = $state(/** @type {string[]} */ ([]));
	let showErrorPopover = $state(false);

	/** @param {string} text */
	function calculateTotal(text) {
		const parsed = parseDecklist(text);
		return parsed.reduce((sum, card) => sum + (card.quantity || 1), 0);
	}

	const totalQty = $derived(calculateTotal(inputText));

	$effect(() => {
		const val = inputText.trim();
		if (!val) {
			unrecognizedCount = 0;
			unrecognizedNames = [];
			return;
		}

		const checkUnrecognized = async () => {
			const parsed = parseDecklist(val);
			let unrecognized = 0;
			const unrecNames = [];
			for (const pc of parsed) {
				if (pc.name) {
					const match = await getCardByName(pc.name);
					if (!match) {
						unrecognized++;
						unrecNames.push(pc.name);
					}
				}
			}
			unrecognizedCount = unrecognized;
			unrecognizedNames = unrecNames;
		};

		checkUnrecognized();
	});

	// Dynamically adjust textarea height to fit content without vertical scrollbars
	$effect(() => {
		if (textareaEl && inputText !== undefined) {
			textareaEl.style.height = "auto";
			textareaEl.style.height = textareaEl.scrollHeight + "px";
		}
	});

	// Determine if the input is meant as a card search
	const isSearch = $derived(
		(inputText.startsWith("/") && !inputText.startsWith("//")) ||
			inputText.startsWith("?") ||
			(inputText.includes(":") &&
				!/\r|\n/.test(inputText) &&
				!/^\s*\d+/.test(inputText) &&
				!inputText.startsWith("//") &&
				!inputText.startsWith("#")),
	);

	/** @param {string} name */
	async function addSingleCard(name) {
		const lines = inputText.split(/\r?\n/);
		const lastLine = lines[lines.length - 1];
		const match = lastLine.match(/^(\s*\d+\s+)/);
		const prefix = match ? match[1] : "1 ";
		lines[lines.length - 1] = prefix + name;
		inputText = lines.join("\n") + "\n";
		suggestions = [];
		textareaEl?.focus();
	}

	function highlightLineParts(line) {
		const trimmed = line.trim();
		if (!trimmed) {
			return [{ text: line || " ", className: "" }];
		}

		const isHeader = trimmed.startsWith("//") || trimmed.startsWith("#");
		if (isHeader) {
			return [{ text: line, className: "header-part" }];
		}

		const leadingSpacesMatch = line.match(/^(\s*)/);
		const leadingSpaces = leadingSpacesMatch ? leadingSpacesMatch[1] : "";

		const textToParse = line.slice(leadingSpaces.length);

		const qtyMatch = textToParse.match(/^(?:(x\s*\d+|\d+\s*x?)\s+)(.+)$/i);
		let quantityText = "";
		let remainingText = textToParse;

		if (qtyMatch) {
			quantityText = qtyMatch[1] + " ";
			remainingText = qtyMatch[2];
		}

		const suffixIndexMatch = remainingText.match(
			/\s+([([][A-Za-z0-9\-\/]{2,7}[)\]]|\*[a-zA-Z0-9:]+\*|[#\^\|]|[\$€£])/,
		);
		let cardName = remainingText;
		let suffixText = "";

		if (suffixIndexMatch && suffixIndexMatch.index !== undefined) {
			cardName = remainingText.substring(0, suffixIndexMatch.index);
			suffixText = remainingText.substring(suffixIndexMatch.index);
		}

		const cleanedName = cardName.trim().replace(/\s*$/, "");
		let nameClass = "unresolved-name";

		if (cleanedName) {
			const lowName = cleanedName.toLowerCase();
			const metadata = resolvedMetadataMap[lowName];

			if (metadata !== undefined && metadata !== null) {
				nameClass = "resolved-name";
			} else if (metadata === null) {
				nameClass = "unrecognized-name";
			}
		}

		return [
			{ text: leadingSpaces, className: "" },
			{ text: quantityText, className: "qty-part" },
			{ text: cardName, className: nameClass },
			{ text: suffixText, className: "suffix-part" },
		];
	}

	function handleSearch() {
		let query = inputText.trim();
		if (query.startsWith("/") || query.startsWith("?")) {
			query = query.slice(1);
		}
		searchStore.query = query;
		inputText = "";
		const lastView =
			localStorage.getItem("budgericards_last_active_view_mode") ||
			"stacks";
		settingsStore.deckViewMode =
			lastView === "spoiler" ? "spoiler" : "stacks";
	}

	async function handleSave() {
		deckStore.importText = inputText;
		inputText = "";
		await deckStore.saveImport();
		const lastView =
			localStorage.getItem("budgericards_last_active_view_mode") ||
			"stacks";
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
			const lastView =
				localStorage.getItem("budgericards_last_active_view_mode") ||
				"stacks";
			settingsStore.deckViewMode = lastView;
		}

		interactionStore.pasteSelected();
	}

	/** @param {ClipboardEvent} e */
	async function handleTextareaPaste(e) {
		const scrollY = window.scrollY;
		requestAnimationFrame(() => {
			window.scrollTo(window.scrollX, scrollY);
		});

		const text = e.clipboardData?.getData("text/plain") || "";
		if (!text) return;

		const parsed = parseDecklist(text);
		if (parsed.length === 0) return;

		let hasValidCards = false;
		let hasUnrecognized = false;

		for (const pc of parsed) {
			if (pc.name) {
				const match = await getCardByName(pc.name);
				if (match) {
					hasValidCards = true;
				} else {
					hasUnrecognized = true;
				}
			}
		}

		if (hasValidCards && !hasUnrecognized) {
			e.preventDefault();
			inputText = text;
			await handleSave();
		}
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
				activeIndex =
					(activeIndex - 1 + suggestions.length) % suggestions.length;
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
			} else {
				handleSave();
			}
		}
	}

	/** @param {MouseEvent} e */
	function handleWindowClick(e) {
		if (!deckStore.isEmptyStateActive) return;
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target.closest(".warning-indicator") && !target.closest(".error-popover")) {
			showErrorPopover = false;
		}
		if (
			target.closest(".empty-state-wrapper") &&
			!target.closest("button, textarea, input, ul, .error-popover")
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

<svelte:window
	onpaste={handlePaste}
	onkeydown={handleKeyDown}
	onclick={handleWindowClick}
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
				{deckStore.name && deckStore.name !== "Untitled Deck"
					? deckStore.name
					: "New Deck"}
			</h2>
		</button>
		<p class="description">
			To get started, <span class="highlight">paste</span> a decklist or
			<span class="highlight">search</span> for cards
		</p>
		<div class="input-positioner">
			<div class="editor-container">
				<!-- Background Layer: Highlighted plain text lines -->
				<div class="highlights-layer">
					{#each lines as line}
						<div class="line-row">
							{#each highlightLineParts(line) as part}
								<span class={part.className}>{part.text}</span>
							{/each}
						</div>
					{/each}
				</div>

				<!-- Foreground Layer: Real Textarea -->
				<textarea
					bind:this={textareaEl}
					bind:value={inputText}
					onkeydown={handleTextareaKeyDown}
					onpaste={handleTextareaPaste}
					placeholder=""
					class="editor-textarea"
					rows="6"
					aria-label="Decklist or card entry field"
				></textarea>
			</div>

			{#if !inputText}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="fake-placeholder"
					onclick={() => textareaEl?.focus()}
				>
					{#key placeholderIndex}
						<div
							class="placeholder-group"
							in:fade={{ duration: 300 }}
						>
							<div class="placeholder-line line-1">
								{placeholders[placeholderIndex][0]}
							</div>
							<div class="placeholder-line line-2">
								{placeholders[placeholderIndex][1]}
							</div>
							<div class="placeholder-line line-3">
								{placeholders[placeholderIndex][2]}
							</div>
						</div>
					{/key}
				</div>
			{/if}

			{#if suggestions.length > 0}
				<ul
					class="autocomplete-suggestions"
					style={`top: calc(1rem + (${inputText.split(/\r?\n/).length} * 1.425rem) + 4px);`}
					transition:fade={{ duration: 100 }}
				>
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
				{#if showErrorPopover && unrecognizedNames.length > 0}
					<div class="error-popover" transition:fade={{ duration: 100 }}>
						<div class="popover-header">Unrecognized Cards</div>
						<ul class="popover-list">
							{#each unrecognizedNames as name}
								<li>{name}</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if !isSearch && totalQty > 0}
					<span class="stats-indicator">
						{totalQty} {totalQty === 1 ? 'card' : 'cards'}
						{#if unrecognizedCount > 0}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<span
								class="warning-indicator"
								onclick={(e) => { e.stopPropagation(); showErrorPopover = !showErrorPopover; }}
								style="cursor: pointer;"
								title="Click to see unrecognized cards"
							>
								• ⚠️ {unrecognizedCount}
							</span>
						{/if}
					</span>
				{/if}
				{#if isSearch}
					<button
						class="primary-btn search-btn"
						onclick={handleSearch}
					>
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
		min-height: calc(100vh - 56px);
		background: transparent;
		box-sizing: border-box;
		padding: 20vh 2rem 180px 2rem;
		transition: background-color 0.2s ease;
		cursor: text;
		overflow-y: auto;
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

	.editor-container {
		position: relative;
		width: 100%;
		margin-top: 1rem;
		min-height: 140px;
	}

	.editor-textarea,
	.highlights-layer {
		width: 100%;
		height: 100%;
		min-height: 140px;
		margin: 0;
		padding: 0;
		box-sizing: border-box;
		font-family: var(--font-sans), sans-serif;
		font-size: 0.95rem;
		line-height: 1.5;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.editor-textarea {
		position: relative;
		z-index: 2;
		background: transparent;
		border: none;
		outline: none;
		resize: none;
		overflow: hidden;
		color: transparent;
		caret-color: hsl(var(--foreground));
		cursor: text;
	}

	.editor-textarea:focus {
		outline: none;
		border: none;
		box-shadow: none;
	}

	.highlights-layer {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		pointer-events: none;
		color: hsl(var(--muted-foreground));
	}

	.line-row {
		min-height: 1.5em;
		display: block;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.header-part {
		color: hsl(var(--muted-foreground));
		font-weight: 500;
		font-style: italic;
	}

	.qty-part,
	.suffix-part {
		color: hsl(var(--muted-foreground));
	}

	.resolved-name {
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	.unresolved-name {
		color: hsl(var(--muted-foreground));
	}

	.unrecognized-name {
		color: #ef4444;
	}

	.fake-placeholder {
		position: absolute;
		top: 1rem;
		left: 0;
		right: 0;
		pointer-events: none;
		font-family: var(--font-sans), sans-serif;
		font-size: 0.95rem;
		line-height: 1.5;
		user-select: none;
	}

	.placeholder-group {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.placeholder-line {
		color: hsl(var(--foreground));
	}

	.placeholder-line.line-1 {
		opacity: 0.35;
	}

	.placeholder-line.line-2 {
		opacity: 0.22;
	}

	.placeholder-line.line-3 {
		opacity: 0.1;
	}

	.autocomplete-suggestions {
		position: absolute;
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
		position: fixed;
		bottom: 2.5rem;
		left: 50%;
		transform: translateX(-50%);
		display: flex;
		align-items: center;
		gap: 1rem;
		background: hsl(var(--popover) / 0.85);
		backdrop-filter: blur(16px);
		-webkit-backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-full, 9999px);
		padding: 0.5rem 1rem 0.5rem 0.75rem;
		box-shadow: 0 10px 40px -10px rgba(0, 0, 0, 0.4);
		z-index: 100;
	}

	.error-popover {
		position: absolute;
		bottom: 120%;
		left: 0.5rem;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius-md);
		box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.4);
		padding: 0.75rem;
		width: max-content;
		max-width: 250px;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		z-index: 110;
		color: hsl(var(--foreground));
	}

	.popover-header {
		font-size: 0.75rem;
		font-weight: 600;
		color: #ef4444;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		text-align: left;
	}

	.popover-list {
		margin: 0;
		padding: 0 0 0 1.25rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-align: left;
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

	.stats-indicator {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		padding: 0 0.25rem 0 0.5rem;
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		border-right: 1px solid hsl(var(--border) / 0.6);
		margin-right: 0.25rem;
		height: 20px;
	}

	.warning-indicator {
		color: hsl(var(--destructive));
		font-weight: 600;
	}
</style>
