<script>
	import { fade, scale } from "svelte/transition";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { toastStore } from "$lib/stores/toast.svelte.js";
	import { parseDecklist } from "$lib/utils/decklistParser.js";
	import { getCardByName } from "$lib/localSearch";
	import { fetchCollection, scryfallFetch } from "$lib/api/scryfall.js";
	import {
		X,
		FileText,
		Sparkles,
		Layers,
		Copy,
		Trash2,
		AlertTriangle,
		Check,
		Loader2,
		Sliders
	} from "lucide-svelte";
	import Button from "$lib/components/ui/Button.svelte";

	let isOpen = $derived(interactionStore.advancedImportModal.isOpen);
	let initialText = $derived(interactionStore.advancedImportModal.initialText);

	// Local form state
	let rawText = $state("");
	/** @type {'mainboard' | 'sideboard' | 'maybeboard'} */
	let targetBoard = $state("mainboard");
	/** @type {'imported' | 'one'} */
	let quantityMode = $state("imported");
	/** @type {'add' | 'skip'} */
	let duplicateStrategy = $state("add");
	/** @type {'default' | 'cheapest' | 'newest' | 'oldest'} */
	let printingPreference = $state("default");

	let isProcessing = $state(false);
	let progressMessage = $state("");

	/** @type {HTMLTextAreaElement | null} */
	let textareaEl = $state(null);

	// Map of lower-case card name -> boolean (true = recognized Magic card, false = unrecognized)
	/** @type {Map<string, boolean>} */
	let recognizedMap = $state(new Map());

	// Sync initial text and active board when modal opens
	$effect(() => {
		if (isOpen) {
			rawText = initialText || "";
			const currentActive = deckStore.activeBoard;
			if (currentActive === "sideboard" || currentActive === "maybeboard") {
				targetBoard = currentActive;
			} else {
				targetBoard = "mainboard";
			}
			isProcessing = false;
			progressMessage = "";

			setTimeout(() => {
				if (textareaEl) {
					textareaEl.focus();
					if (rawText) {
						textareaEl.select();
					}
				}
			}, 50);
		}
	});

	// Reactively parse input text
	const parsedCards = $derived.by(() => {
		if (!rawText.trim()) return [];
		return parseDecklist(rawText);
	});

	// Reactively validate card names against local card database
	$effect(() => {
		const cards = parsedCards;
		if (cards.length === 0) {
			recognizedMap = new Map();
			return;
		}

		let isCancelled = false;

		const checkAll = async () => {
			const map = new Map(recognizedMap);
			const uniqueNames = [...new Set(cards.map(c => (c.name || "").trim().toLowerCase()))].filter(Boolean);

			for (const lowerName of uniqueNames) {
				if (map.has(lowerName)) continue;
				try {
					const match = await getCardByName(lowerName);
					if (!isCancelled) {
						map.set(lowerName, !!match);
					}
				} catch (e) {
					if (!isCancelled) {
						map.set(lowerName, false);
					}
				}
			}

			if (!isCancelled) {
				recognizedMap = map;
			}
		};

		checkAll();

		return () => {
			isCancelled = true;
		};
	});

	// Cards currently in the target board
	const existingBoardCards = $derived.by(() => {
		const board = deckStore[targetBoard];
		return Array.isArray(board) ? board : [];
	});

	// Set of existing card names in lower-case for duplicate checking
	const existingCardNameCounts = $derived.by(() => {
		/** @type {Map<string, number>} */
		const map = new Map();
		for (const card of existingBoardCards) {
			const lower = (card.name || "").toLowerCase();
			map.set(lower, (map.get(lower) || 0) + 1);
		}
		return map;
	});

	// Enriched parsed list with effective quantities, validation, and duplicate flags
	const previewCards = $derived.by(() => {
		return parsedCards.map((card) => {
			const name = (card.name || "").trim();
			const lower = name.toLowerCase();
			const isRecognized = recognizedMap.get(lower); // true, false, or undefined (pending)
			const isUnrecognized = isRecognized === false;

			const existingCount = existingCardNameCounts.get(lower) || 0;
			const isDuplicate = existingCount > 0;
			const effectiveQty = quantityMode === "one" ? 1 : Math.max(1, card.quantity || 1);
			const willSkip = isUnrecognized || (isDuplicate && duplicateStrategy === "skip");

			return {
				...card,
				name,
				lower,
				effectiveQty,
				isRecognized,
				isUnrecognized,
				isDuplicate,
				existingCount,
				willSkip
			};
		});
	});

	const totalParsedCount = $derived(previewCards.length);
	// Only recognized cards (or pending check) that are not skipped duplicates can be imported
	const importableCards = $derived(previewCards.filter(c => !c.willSkip && c.isRecognized !== false));
	const importableQuantity = $derived(importableCards.reduce((acc, c) => acc + c.effectiveQty, 0));
	const unrecognizedCards = $derived(previewCards.filter(c => c.isUnrecognized));
	const unrecognizedCount = $derived(unrecognizedCards.length);
	const skippedDuplicatesCount = $derived(previewCards.filter(c => c.isDuplicate && duplicateStrategy === "skip" && !c.isUnrecognized).length);

	function handleClose() {
		if (isProcessing) return;
		interactionStore.closeAdvancedImportModal();
	}

	async function pasteFromClipboard() {
		try {
			if (typeof navigator !== "undefined" && navigator.clipboard) {
				const text = await navigator.clipboard.readText();
				if (text) {
					rawText = text;
				}
			}
		} catch (e) {
			toastStore.show("Could not access clipboard", { type: "error" });
		}
	}

	function clearInput() {
		rawText = "";
		if (textareaEl) textareaEl.focus();
	}

	/**
	 * @param {any} printing
	 */
	function getCheapestPrice(printing) {
		const usd = parseFloat(printing.prices?.usd);
		const usdFoil = parseFloat(printing.prices?.usd_foil);
		const prices = [];
		if (!isNaN(usd) && usd > 0) prices.push(usd);
		if (!isNaN(usdFoil) && usdFoil > 0) prices.push(usdFoil);
		return prices.length > 0 ? Math.min(...prices) : Infinity;
	}

	async function handleImport() {
		if (importableCards.length === 0) {
			toastStore.show("No recognized cards to import", { type: "error" });
			return;
		}

		isProcessing = true;
		progressMessage = "Resolving card data...";

		try {
			/** @type {Map<string, { price: number, metadata: any }>} */
			const resolutionCache = new Map();

			// Group unique card names to avoid redundant queries
			const uniqueNames = [...new Set(importableCards.map(c => c.name.toLowerCase()))];

			if (printingPreference === "default") {
				// Fast local DB + Scryfall batch fallback
				/** @type {{ name: string, identifier: any }[]} */
				const missingFromDb = [];

				for (let i = 0; i < uniqueNames.length; i++) {
					const nameLower = uniqueNames[i];
					const sample = importableCards.find(c => c.name.toLowerCase() === nameLower);
					const localCard = await getCardByName(sample?.name || nameLower);

					if (localCard && !sample?.set) {
						const localPrice = priceStore.getPrice(localCard.name) || 0;
						resolutionCache.set(nameLower, {
							price: localPrice,
							metadata: {
								id: localCard.id,
								name: localCard.name,
								type_line: localCard.type,
								oracle_text: localCard.text,
								mana_cost: localCard.mana,
								cmc: localCard.cmc,
								colors: localCard.colors || [],
								color_identity: localCard.identity || [],
								image_uris: {
									normal: localCard.image,
									art_crop: localCard.image ? localCard.image.replace("/normal/", "/art_crop/") : null
								},
								prices: {
									usd: String(localPrice),
									usd_foil: null
								}
							}
						});
					} else {
						// Needs batch Scryfall resolution
						if (sample?.set && sample?.collector_number) {
							missingFromDb.push({
								name: sample.name,
								identifier: { set: sample.set.toLowerCase(), collector_number: String(sample.collector_number).toLowerCase() }
							});
						} else {
							missingFromDb.push({
								name: sample?.name || nameLower,
								identifier: { name: sample?.name || nameLower }
							});
						}
					}
				}

				if (missingFromDb.length > 0) {
					progressMessage = `Resolving ${missingFromDb.length} card${missingFromDb.length === 1 ? "" : "s"} with Scryfall...`;
					const response = await fetchCollection(missingFromDb.map(x => x.identifier));
					const data = response.data || [];

					for (const found of data) {
						const foundNameLower = (found.name || "").toLowerCase();
						const price = parseFloat(found.prices?.usd || found.prices?.usd_foil) || 0;
						resolutionCache.set(foundNameLower, { price, metadata: found });

						// Also cache short name for double-faced cards
						if (found.name?.includes(" // ")) {
							const short = found.name.split(" // ")[0].trim().toLowerCase();
							resolutionCache.set(short, { price, metadata: found });
						}
					}
				}
			} else {
				// Specific printing preference: cheapest, newest, or oldest
				for (let i = 0; i < uniqueNames.length; i++) {
					const nameLower = uniqueNames[i];
					const sample = importableCards.find(c => c.name.toLowerCase() === nameLower);
					const cardName = sample?.name || nameLower;

					progressMessage = `Finding ${printingPreference} printing (${i + 1}/${uniqueNames.length})...`;

					try {
						const q = `!"${cardName}" unique:prints`;
						const res = await scryfallFetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(q)}`);
						if (res.ok) {
							const json = await res.json();
							const prints = (json.data || []).filter((/** @type {any} */ p) => {
								const pName = p.name.toLowerCase();
								const cName = cardName.toLowerCase();
								return pName === cName ||
									(pName.includes(" // ") && pName.split(" // ")[0].trim() === cName) ||
									(cName.includes(" // ") && cName.split(" // ")[0].trim() === pName);
							});

							if (prints.length > 0) {
								let sorted = [...prints];
								if (printingPreference === "cheapest") {
									sorted.sort((a, b) => getCheapestPrice(a) - getCheapestPrice(b));
								} else if (printingPreference === "newest") {
									sorted.sort((a, b) => new Date(b.released_at).getTime() - new Date(a.released_at).getTime());
								} else if (printingPreference === "oldest") {
									sorted.sort((a, b) => new Date(a.released_at).getTime() - new Date(b.released_at).getTime());
								}

								const best = sorted[0];
								const bestPrice = parseFloat(best.prices?.usd || best.prices?.usd_foil) || 0;
								resolutionCache.set(nameLower, { price: bestPrice, metadata: best });
							}
						}
					} catch (err) {
						console.warn(`Failed to resolve printings for ${cardName}:`, err);
					}
				}
			}

			// Add cards to the deckStore inside batchUpdate
			progressMessage = "Adding cards to deck...";

			deckStore.batchUpdate(() => {
				for (const card of importableCards) {
					const resolved = resolutionCache.get(card.name.toLowerCase());
					const price = resolved?.price ?? 0;
					const metadata = resolved?.metadata ?? (card.set ? { set: card.set.toLowerCase(), collector_number: card.collector_number } : null);

					if (targetBoard === "maybeboard") {
						deckStore.addCard(card.name, "maybeboard", price, metadata);
					} else {
						for (let q = 0; q < card.effectiveQty; q++) {
							deckStore.addCard(card.name, targetBoard, price, metadata);
						}
					}
				}
			});

			// Preload images for newly imported cards
			deckStore.preloadDeckImagesAndShow(importableCards.map(c => c.name));

			const targetTitle = targetBoard.charAt(0).toUpperCase() + targetBoard.slice(1);
			const totalAdded = importableQuantity;
			const skippedParts = [];
			if (skippedDuplicatesCount > 0) skippedParts.push(`${skippedDuplicatesCount} duplicates skipped`);
			if (unrecognizedCount > 0) skippedParts.push(`${unrecognizedCount} unrecognized ignored`);
			const suffix = skippedParts.length > 0 ? ` (${skippedParts.join(", ")})` : "";

			toastStore.show(`Imported ${totalAdded} card${totalAdded === 1 ? "" : "s"} into ${targetTitle}${suffix}.`, { type: "success" });

			handleClose();
		} catch (e) {
			console.error("Advanced import failed:", e);
			toastStore.show("Failed to complete card import", { type: "error" });
		} finally {
			isProcessing = false;
			progressMessage = "";
		}
	}
</script>

{#if isOpen}
	<div class="modal-portal-wrapper" role="presentation">
		<!-- Backdrop -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="modal-backdrop"
			onclick={handleClose}
			transition:fade={{ duration: 150 }}
		></div>

		<!-- Dialog Container -->
		<div
			class="modal-container"
			role="dialog"
			aria-modal="true"
			aria-labelledby="advanced-import-title"
			transition:scale={{ duration: 200, start: 0.96 }}
		>
			<!-- Header -->
			<div class="modal-header">
				<div class="modal-title-group">
					<div class="title-icon-badge">
						<FileText size={18} />
					</div>
					<div>
						<h2 id="advanced-import-title" class="modal-title">Advanced Card Import</h2>
						<p class="modal-subtitle">Configure destination, quantities, and printings before importing</p>
					</div>
				</div>
				<div class="header-actions">
					<span class="hotkey-badge" title="Shortcut to open this modal">
						<kbd>⌘</kbd><kbd>⇧</kbd><kbd>V</kbd>
					</span>
					<button
						class="close-btn"
						onclick={handleClose}
						disabled={isProcessing}
						aria-label="Close modal"
					>
						<X size={18} />
					</button>
				</div>
			</div>

			<!-- Body: Two-Column Layout -->
			<div class="modal-body">
				<!-- Left Column: Input & Options (Containers removed, clean spacing) -->
				<div class="form-column">
					<!-- Text Input Area -->
					<div class="input-section">
						<div class="section-label-row">
							<span class="section-label">Card List</span>
							<div class="input-tools">
								<button
									class="tool-btn"
									onclick={pasteFromClipboard}
									title="Paste from clipboard"
									type="button"
									disabled={isProcessing}
								>
									<Copy size={13} />
									<span>Paste Clipboard</span>
								</button>
								{#if rawText.trim()}
									<button
										class="tool-btn danger"
										onclick={clearInput}
										title="Clear text"
										type="button"
										disabled={isProcessing}
									>
										<Trash2 size={13} />
										<span>Clear</span>
									</button>
								{/if}
							</div>
						</div>

						<div class="textarea-wrapper">
							<textarea
								bind:this={textareaEl}
								bind:value={rawText}
								class="import-textarea"
								placeholder="Paste cards here, for example:&#10;4 Lightning Bolt&#10;2 Counterspell (MH2) 267&#10;1 Sol Ring"
								disabled={isProcessing}
								spellcheck="false"
							></textarea>
							{#if rawText.trim()}
								<div class="textarea-footer">
									<span>{rawText.split('\n').filter(l => l.trim()).length} line{rawText.split('\n').filter(l => l.trim()).length === 1 ? '' : 's'}</span>
								</div>
							{/if}
						</div>
					</div>

					<!-- Options Group: Clean spacing without visible card containers -->
					<div class="options-container">
						<!-- Target Board -->
						<div class="option-group">
							<div class="option-header">
								<Layers size={14} class="option-icon" />
								<span class="option-title">Target Board</span>
							</div>
							<div class="segmented-control" role="radiogroup" aria-label="Target Board">
								<button
									type="button"
									role="radio"
									aria-checked={targetBoard === "mainboard"}
									class="segment-btn"
									class:active={targetBoard === "mainboard"}
									onclick={() => (targetBoard = "mainboard")}
									disabled={isProcessing}
								>
									Mainboard
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={targetBoard === "sideboard"}
									class="segment-btn"
									class:active={targetBoard === "sideboard"}
									onclick={() => (targetBoard = "sideboard")}
									disabled={isProcessing}
								>
									Sideboard
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={targetBoard === "maybeboard"}
									class="segment-btn"
									class:active={targetBoard === "maybeboard"}
									onclick={() => (targetBoard = "maybeboard")}
									disabled={isProcessing}
								>
									Maybeboard
								</button>
							</div>
						</div>

						<!-- Quantity Mode -->
						<div class="option-group">
							<div class="option-header">
								<Sliders size={14} class="option-icon" />
								<span class="option-title">Quantity</span>
							</div>
							<div class="segmented-control" role="radiogroup" aria-label="Card Quantity Mode">
								<button
									type="button"
									role="radio"
									aria-checked={quantityMode === "imported"}
									class="segment-btn"
									class:active={quantityMode === "imported"}
									onclick={() => (quantityMode = "imported")}
									disabled={isProcessing}
								>
									From list
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={quantityMode === "one"}
									class="segment-btn"
									class:active={quantityMode === "one"}
									onclick={() => (quantityMode = "one")}
									disabled={isProcessing}
								>
									1 of each
								</button>
							</div>
						</div>

						<!-- Duplicate Strategy -->
						<div class="option-group">
							<div class="option-header">
								<Copy size={14} class="option-icon" />
								<span class="option-title">Duplicates</span>
							</div>
							<div class="segmented-control" role="radiogroup" aria-label="Duplicate Strategy">
								<button
									type="button"
									role="radio"
									aria-checked={duplicateStrategy === "add"}
									class="segment-btn"
									class:active={duplicateStrategy === "add"}
									onclick={() => (duplicateStrategy = "add")}
									disabled={isProcessing}
								>
									Add cards
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={duplicateStrategy === "skip"}
									class="segment-btn"
									class:active={duplicateStrategy === "skip"}
									onclick={() => (duplicateStrategy = "skip")}
									disabled={isProcessing}
								>
									Skip duplicates
								</button>
							</div>
						</div>

						<!-- Printing Preference -->
						<div class="option-group">
							<div class="option-header">
								<Sparkles size={14} class="option-icon" />
								<span class="option-title">Printing Preference</span>
							</div>
							<div class="segmented-control four-items" role="radiogroup" aria-label="Printing Preference">
								<button
									type="button"
									role="radio"
									aria-checked={printingPreference === "default"}
									class="segment-btn"
									class:active={printingPreference === "default"}
									onclick={() => (printingPreference = "default")}
									disabled={isProcessing}
									title="Fastest, standard database printing"
								>
									Default
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={printingPreference === "cheapest"}
									class="segment-btn"
									class:active={printingPreference === "cheapest"}
									onclick={() => (printingPreference = "cheapest")}
									disabled={isProcessing}
									title="Picks the lowest USD printing"
								>
									Cheapest
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={printingPreference === "newest"}
									class="segment-btn"
									class:active={printingPreference === "newest"}
									onclick={() => (printingPreference = "newest")}
									disabled={isProcessing}
									title="Picks the latest released printing"
								>
									Newest
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={printingPreference === "oldest"}
									class="segment-btn"
									class:active={printingPreference === "oldest"}
									onclick={() => (printingPreference = "oldest")}
									disabled={isProcessing}
									title="Picks the earliest released printing"
								>
									Oldest
								</button>
							</div>
						</div>
					</div>
				</div>

				<!-- Right Column: Live Parsed List Preview -->
				<div class="preview-column">
					<div class="preview-header">
						<div class="preview-title-row">
							<span class="preview-title">Parsed Cards</span>
							{#if previewCards.length > 0}
								<div class="preview-badges">
									<span class="badge count-badge">{totalParsedCount} parsed</span>
									<span class="badge qty-badge">{importableQuantity} to import</span>
									{#if unrecognizedCount > 0}
										<span class="badge unrec-badge">{unrecognizedCount} unrecognized</span>
									{/if}
									{#if skippedDuplicatesCount > 0}
										<span class="badge skip-badge">{skippedDuplicatesCount} skipped</span>
									{/if}
								</div>
							{/if}
						</div>
					</div>

					<!-- Unrecognized Warning Banner -->
					{#if unrecognizedCount > 0}
						<div class="unrecognized-banner">
							<AlertTriangle size={14} class="banner-icon" />
							<span>
								<strong>{unrecognizedCount}</strong> line{unrecognizedCount === 1 ? "" : "s"} not recognized as Magic cards (will be ignored)
							</span>
						</div>
					{/if}

					<div class="preview-list-container">
						{#if previewCards.length === 0}
							<div class="preview-empty">
								<div class="empty-icon-circle">
									<FileText size={24} />
								</div>
								<p class="empty-main-text">No cards parsed yet</p>
								<p class="empty-sub-text">Type or paste card names into the left box to see a live preview of your import.</p>
							</div>
						{:else}
							<div class="card-items-list" role="list">
								{#each previewCards as card, i (i + '_' + card.name)}
									<div
										class="preview-card-item"
										class:is-unrecognized={card.isUnrecognized}
										class:is-skipped={card.willSkip && !card.isUnrecognized}
										class:is-duplicate={card.isDuplicate && !card.isUnrecognized}
										role="listitem"
									>
										<div class="card-item-left">
											<span class="card-qty-badge" class:muted={card.willSkip}>
												{card.effectiveQty}×
											</span>
											<span
												class="card-name-text"
												class:unrecognized-text={card.isUnrecognized}
												class:strikethrough={card.willSkip && !card.isUnrecognized}
											>
												{card.name}
											</span>
											{#if card.set && !card.isUnrecognized}
												<span class="card-set-badge">
													{card.set.toUpperCase()}{card.collector_number ? ` #${card.collector_number}` : ""}
												</span>
											{/if}
										</div>

										<div class="card-item-right">
											{#if card.isUnrecognized}
												<span class="status-tag tag-unrecognized" title="This line was not recognized in the Magic card database and will be ignored.">
													Unrecognized
												</span>
											{:else if card.isDuplicate && duplicateStrategy === "skip"}
												<span class="status-tag tag-skipped" title="Card already exists in {targetBoard}; skipping.">
													In deck (skip)
												</span>
											{:else if card.isDuplicate && duplicateStrategy === "add"}
												<span class="status-tag tag-duplicate" title="Already in deck. Will add {card.effectiveQty} more copies.">
													+{card.effectiveQty} to existing
												</span>
											{:else}
												<span class="status-tag tag-new">
													New
												</span>
											{/if}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="modal-footer">
				<div class="footer-status">
					{#if isProcessing}
						<div class="processing-indicator">
							<Loader2 size={16} class="spinner" />
							<span>{progressMessage}</span>
						</div>
					{:else if importableCards.length > 0}
						<span class="ready-text">
							Ready to import <strong>{importableQuantity}</strong> card{importableQuantity === 1 ? "" : "s"} into <strong>{targetBoard}</strong>
							{#if skippedDuplicatesCount > 0 || unrecognizedCount > 0}
								<span class="skipped-hint">
									({[
										skippedDuplicatesCount > 0 ? `${skippedDuplicatesCount} duplicates skipped` : null,
										unrecognizedCount > 0 ? `${unrecognizedCount} unrecognized ignored` : null
									].filter(Boolean).join(", ")})
								</span>
							{/if}
						</span>
					{:else if previewCards.length > 0}
						{#if unrecognizedCount === totalParsedCount}
							<span class="warning-text">⚠️ No recognized Magic cards found.</span>
						{:else}
							<span class="warning-text">All cards are duplicates and set to be skipped.</span>
						{/if}
					{/if}
				</div>

				<div class="footer-buttons">
					<Button
						variant="ghost"
						onclick={handleClose}
						disabled={isProcessing}
					>
						Cancel
					</Button>
					<button
						type="button"
						class="import-submit-btn"
						onclick={handleImport}
						disabled={isProcessing || importableCards.length === 0}
					>
						{#if isProcessing}
							Importing...
						{:else}
							Import {importableQuantity > 0 ? `${importableQuantity} ` : ""}Card{importableQuantity === 1 ? "" : "s"}
						{/if}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.modal-portal-wrapper {
		position: fixed;
		inset: 0;
		z-index: 10000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 16px;
		pointer-events: auto;
	}

	.modal-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(4, 6, 11, 0.78);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		z-index: -1;
	}

	.modal-container {
		display: flex;
		flex-direction: column;
		width: 920px;
		max-width: 96vw;
		height: 720px;
		max-height: 90vh;
		background: #0f1219;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 14px;
		box-shadow: 0 24px 64px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.04) inset;
		color: #e2e8f0;
		overflow: hidden;
	}

	/* Header */
	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 16px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(255, 255, 255, 0.015);
	}

	.modal-title-group {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.title-icon-badge {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: rgba(99, 102, 241, 0.12);
		border: 1px solid rgba(99, 102, 241, 0.25);
		color: #818cf8;
	}

	.modal-title {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		color: #f8fafc;
		letter-spacing: -0.01em;
	}

	.modal-subtitle {
		margin: 2px 0 0;
		font-size: 12px;
		color: #94a3b8;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	.hotkey-badge {
		display: flex;
		align-items: center;
		gap: 3px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		padding: 3px 6px;
	}

	.hotkey-badge kbd {
		font-family: inherit;
		font-size: 11px;
		color: #94a3b8;
	}

	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: #f8fafc;
	}

	/* Body Layout */
	.modal-body {
		display: flex;
		flex: 1;
		min-height: 0;
		overflow: hidden;
	}

	.form-column {
		width: 50%;
		display: flex;
		flex-direction: column;
		gap: 18px;
		padding: 20px;
		border-right: 1px solid rgba(255, 255, 255, 0.07);
		overflow-y: auto;
	}

	.preview-column {
		width: 50%;
		display: flex;
		flex-direction: column;
		background: rgba(0, 0, 0, 0.2);
		min-height: 0;
		overflow: hidden;
	}

	/* Input Section */
	.input-section {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.section-label-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.section-label {
		font-size: 11.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #94a3b8;
	}

	.input-tools {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.tool-btn {
		display: flex;
		align-items: center;
		gap: 5px;
		padding: 4px 8px;
		font-size: 11px;
		font-weight: 500;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 6px;
		color: #cbd5e1;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.tool-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.09);
		color: #fff;
	}

	.tool-btn.danger:hover:not(:disabled) {
		background: rgba(239, 68, 68, 0.15);
		border-color: rgba(239, 68, 68, 0.3);
		color: #fca5a5;
	}

	.textarea-wrapper {
		position: relative;
		display: flex;
		flex-direction: column;
	}

	.import-textarea {
		width: 100%;
		height: 130px;
		padding: 10px 12px;
		background: #080b11;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		color: #f1f5f9;
		font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
		font-size: 12px;
		line-height: 1.5;
		resize: none;
		outline: none;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
		box-sizing: border-box;
	}

	.import-textarea:focus {
		border-color: #6366f1;
		box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.2);
	}

	.textarea-footer {
		position: absolute;
		bottom: 8px;
		right: 10px;
		font-size: 10px;
		color: #64748b;
		pointer-events: none;
		background: rgba(8, 11, 17, 0.85);
		padding: 2px 6px;
		border-radius: 4px;
	}

	/* Options Container (Clean Spacing, No Visible Box Containers) */
	.options-container {
		display: flex;
		flex-direction: column;
		gap: 16px;
	}

	.option-group {
		display: flex;
		flex-direction: column;
		gap: 7px;
	}

	.option-header {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		font-weight: 500;
	}

	:global(.option-icon) {
		color: #818cf8;
	}

	.option-title {
		color: #cbd5e1;
		font-size: 12px;
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	/* Segmented Control */
	.segmented-control {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
		background: #080b11;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 7px;
		padding: 3px;
		gap: 3px;
	}

	.segmented-control.four-items {
		grid-template-columns: repeat(4, 1fr);
	}

	.segment-btn {
		border: none;
		background: transparent;
		color: #94a3b8;
		font-size: 12px;
		font-weight: 500;
		padding: 6px 8px;
		border-radius: 5px;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		text-align: center;
	}

	.segment-btn:hover:not(:disabled) {
		color: #e2e8f0;
	}

	.segment-btn:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -1px;
	}

	.segment-btn.active {
		background: #1c2230;
		color: #f8fafc;
		font-weight: 600;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.08) inset;
	}

	/* Right Preview Column */
	.preview-header {
		padding: 16px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.07);
	}

	.preview-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.preview-title {
		font-size: 12px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: #94a3b8;
	}

	.preview-badges {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.badge {
		font-size: 11px;
		font-weight: 500;
		padding: 2px 7px;
		border-radius: 10px;
	}

	.count-badge {
		background: rgba(255, 255, 255, 0.07);
		color: #cbd5e1;
	}

	.qty-badge {
		background: rgba(99, 102, 241, 0.15);
		color: #a5b4fc;
		border: 1px solid rgba(99, 102, 241, 0.25);
	}

	.unrec-badge {
		background: rgba(234, 88, 12, 0.15);
		color: #fb923c;
		border: 1px solid rgba(234, 88, 12, 0.3);
	}

	.skip-badge {
		background: rgba(239, 68, 68, 0.15);
		color: #fca5a5;
		border: 1px solid rgba(239, 68, 68, 0.25);
	}

	.unrecognized-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		background: rgba(234, 88, 12, 0.12);
		border-bottom: 1px solid rgba(234, 88, 12, 0.25);
		color: #fdba74;
		font-size: 12px;
	}

	.unrecognized-banner strong {
		color: #fed7aa;
	}

	:global(.banner-icon) {
		color: #f97316;
		flex-shrink: 0;
	}

	.preview-list-container {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: 12px 16px;
	}

	.preview-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100%;
		min-height: 240px;
		text-align: center;
		padding: 24px;
	}

	.empty-icon-circle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #64748b;
		margin-bottom: 12px;
	}

	.empty-main-text {
		font-size: 14px;
		font-weight: 500;
		color: #94a3b8;
		margin: 0 0 4px;
	}

	.empty-sub-text {
		font-size: 12px;
		color: #64748b;
		max-width: 240px;
		margin: 0;
		line-height: 1.4;
	}

	.card-items-list {
		display: flex;
		flex-direction: column;
		gap: 4px;
	}

	.preview-card-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 7px 10px;
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.04);
		transition: background 0.1s ease;
	}

	.preview-card-item:hover {
		background: rgba(255, 255, 255, 0.05);
	}

	.preview-card-item.is-skipped {
		opacity: 0.55;
		background: rgba(0, 0, 0, 0.2);
	}

	.preview-card-item.is-unrecognized {
		background: rgba(234, 88, 12, 0.06);
		border-color: rgba(234, 88, 12, 0.2);
	}

	.card-item-left {
		display: flex;
		align-items: center;
		gap: 8px;
		min-width: 0;
		flex: 1;
	}

	.card-qty-badge {
		font-size: 11px;
		font-weight: 700;
		color: #818cf8;
		font-family: ui-monospace, monospace;
		min-width: 20px;
	}

	.card-qty-badge.muted {
		color: #64748b;
	}

	.card-name-text {
		font-size: 13px;
		font-weight: 500;
		color: #f1f5f9;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.card-name-text.unrecognized-text {
		color: #f87171;
		font-style: italic;
	}

	.card-name-text.strikethrough {
		text-decoration: line-through;
		color: #94a3b8;
	}

	.card-set-badge {
		font-size: 10px;
		font-family: ui-monospace, monospace;
		color: #94a3b8;
		background: rgba(255, 255, 255, 0.06);
		padding: 1px 4px;
		border-radius: 4px;
		white-space: nowrap;
	}

	.card-item-right {
		margin-left: 8px;
		flex-shrink: 0;
	}

	.status-tag {
		font-size: 10px;
		font-weight: 600;
		padding: 2px 6px;
		border-radius: 4px;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	.status-tag.tag-new {
		background: rgba(16, 185, 129, 0.15);
		color: #6ee7b7;
		border: 1px solid rgba(16, 185, 129, 0.25);
	}

	.status-tag.tag-duplicate {
		background: rgba(245, 158, 11, 0.15);
		color: #fcd34d;
		border: 1px solid rgba(245, 158, 11, 0.25);
	}

	.status-tag.tag-skipped {
		background: rgba(239, 68, 68, 0.12);
		color: #fca5a5;
		border: 1px solid rgba(239, 68, 68, 0.2);
	}

	.status-tag.tag-unrecognized {
		background: rgba(234, 88, 12, 0.16);
		color: #fb923c;
		border: 1px solid rgba(234, 88, 12, 0.3);
	}

	/* Footer */
	.modal-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 14px 20px;
		border-top: 1px solid rgba(255, 255, 255, 0.07);
		background: rgba(255, 255, 255, 0.015);
	}

	.footer-status {
		font-size: 12px;
		color: #94a3b8;
	}

	.processing-indicator {
		display: flex;
		align-items: center;
		gap: 8px;
		color: #818cf8;
	}

	:global(.spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	.ready-text strong {
		color: #f8fafc;
	}

	.skipped-hint {
		color: #94a3b8;
		margin-left: 4px;
	}

	.warning-text {
		color: #fca5a5;
		font-weight: 500;
	}

	.footer-buttons {
		display: flex;
		align-items: center;
		gap: 10px;
	}

	/* Custom primary import button matching Budgericards theme */
	.import-submit-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 36px;
		padding: 0 16px;
		font-size: 0.875rem;
		font-weight: 600;
		color: #ffffff;
		background: hsl(var(--primary));
		border: 1px solid transparent;
		border-radius: var(--radius, 8px);
		cursor: pointer;
		box-shadow: 0 2px 8px hsl(var(--primary) / 0.25);
		transition: all 0.15s ease;
	}

	.import-submit-btn:hover:not(:disabled) {
		background: hsl(var(--primary-dark));
		transform: translateY(-1px);
		box-shadow: 0 4px 12px hsl(var(--primary) / 0.35);
	}

	.import-submit-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
		transform: none;
		box-shadow: none;
	}

	.import-submit-btn:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
	}

	/* Responsive for narrow screens */
	@media (max-width: 680px) {
		.modal-body {
			flex-direction: column;
		}
		.form-column, .preview-column {
			width: 100%;
			border-right: none;
		}
		.form-column {
			max-height: 50%;
			border-bottom: 1px solid rgba(255, 255, 255, 0.07);
		}
	}
</style>
