<script>
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import {
		LayoutGrid,
		SortAsc,
		Clock,
		Eye,
		Image,
		DollarSign,
		ChevronDown,
		StretchHorizontal,
		StretchVertical,
		ArrowDownWideNarrow,
		MoreVertical,
		SquareSplitVertical,
		Table,
		Check,
		List,
		Layers,
		Cloud,
		CloudOff,
		RefreshCw,
	} from "lucide-svelte";
	import Button from "./ui/Button.svelte";
	import Input from "./ui/Input.svelte";
	import Badge from "./ui/Badge.svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import DeckOptionsModal from "./DeckOptionsModal.svelte";
	import ViewOptionsModal from "./ViewOptionsModal.svelte";
	import { fade, fly } from "svelte/transition";
	import { cubicOut, backOut } from "svelte/easing";
	import { horizontalSlide } from "$lib/utils/transitions.js";
	import { authStore } from "$lib/stores/auth.svelte.js";

	let showDeckOptionsModal = $state(false);
	let showViewOptionsModal = $state(false);
	/** @type {HTMLElement | null} */
	let viewOptionsBtn = $state(null);
	/** @type {HTMLElement | null} */
	let deckInfoBtn = $state(null);

	const allCards = $derived([
		...deckStore.commander,
		...deckStore.companion,
		...deckStore.mainboard,
		...deckStore.sideboard,
	]);

	const deckImage = $derived(() => {
		if (deckStore.coverArt) return deckStore.coverArt;
		if (deckStore.coverArt === "") return null;
		const leadCard =
			deckStore.commander[0] ||
			deckStore.companion[0] ||
			deckStore.mainboard[0];
		if (!leadCard) return null;
		const meta = deckStore.metadata[leadCard.name.toLowerCase()];
		if (!meta) return null;
		return (
			meta.image_uris?.art_crop ||
			meta.card_faces?.[0]?.image_uris?.art_crop
		);
	});

	let isDragOverArt = $state(false);

	/** @param {DragEvent} e */
	function handleArtDragOver(e) {
		e.preventDefault();
		isDragOverArt = true;
	}

	function handleArtDragLeave() {
		isDragOverArt = false;
	}

	/** @param {DragEvent} e */
	async function handleArtDrop(e) {
		e.preventDefault();
		isDragOverArt = false;
		if (!e.dataTransfer) return;

		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (internalData) {
			try {
				const data = JSON.parse(internalData);
				const meta =
					data.card || deckStore.metadata[data.name.toLowerCase()];
				if (meta) {
					const art =
						meta.image_uris?.art_crop ||
						meta.card_faces?.[0]?.image_uris?.art_crop;
					if (art) deckStore.coverArt = art;
				}
			} catch (err) {
				console.error("Failed to set art from internal drag:", err);
			}
			return;
		}

		// External Drop
		const html = e.dataTransfer.getData("text/html");
		if (html) {
			const doc = new DOMParser().parseFromString(html, "text/html");
			const img = doc.querySelector("img");
			if (img && img.src) {
				// If it's a Scryfall image, try to get the art crop
				if (img.src.includes("cards.scryfall.io")) {
					const art = img.src
						.replace("/normal/", "/art_crop/")
						.replace("/large/", "/art_crop/");
					deckStore.coverArt = art;
				} else {
					deckStore.coverArt = img.src;
				}
			}
		}
	}

	const colorIdentity = $derived(() => {
		const colors = new Set();
		allCards.forEach((c) => {
			const meta = deckStore.metadata[c.name.toLowerCase()];
			if (meta?.color_identity) {
				for (const col of meta.color_identity) {
					colors.add(col);
				}
			}
		});
		return ["W", "U", "B", "R", "G"].filter((c) => colors.has(c));
	});

	const colorMap = {
		W: { bg: "#f8f6d8", icon: "󰄯" },
		U: { bg: "#c1d7e9", icon: "󰄯" },
		B: { bg: "#bab1ab", icon: "󰄯" },
		R: { bg: "#e49977", icon: "󰄯" },
		G: { bg: "#a3c095", icon: "󰄯" },
	};

	let showBoardDropdown = $state(false);
	const columns = [
		{ id: "cmc", label: "Mana Value" },
		{ id: "creature", label: "Creature/Non-Creature" },
		{ id: "type", label: "Type" },
		{ id: "color", label: "Color" },
		{ id: "none", label: "None" },
	];

	const visibleGroupings = $derived(
		settingsStore.deckViewMode === "stacks"
			? columns.filter((c) => c.id !== "creature" && c.id !== "none")
			: columns,
	);

	$effect(() => {
		// 1. Sanitize grouping for Stacks View
		if (settingsStore.deckViewMode === "stacks") {
			if (
				deckStore.grouping === "none" ||
				deckStore.grouping === "creature"
			) {
				deckStore.grouping = "cmc";
			}
		}

		// 2. Sanitize sorting for the current view mode (if current sort is not available)
		const availableSortIds = visibleSorts.map((s) => s.id);
		if (
			!availableSortIds.includes(deckStore.sorting) &&
			availableSortIds.length > 0
		) {
			deckStore.sorting = availableSortIds.includes("color")
				? "color"
				: availableSortIds[0];
		}

		// 3. Resolve grouping/sorting clash (never allow set to same value)
		if (
			deckStore.grouping === deckStore.sorting &&
			deckStore.grouping !== "none" &&
			deckStore.grouping !== "freeform"
		) {
			/** @type {Record<string, string>} */
			const defaultSorts = {
				cmc: "color",
				type: "cmc",
				color: "cmc",
			};
			deckStore.sorting = defaultSorts[deckStore.grouping] || "color";
		}
	});

	const visibleSorts = $derived(
		settingsStore.deckViewMode !== "table"
			? [
					{ id: "name", label: "Alphabetical" },
					{ id: "added", label: "Recently Added" },
					{ id: "price", label: "Price" },
					{ id: "cmc", label: "Mana Value" },
					{ id: "type", label: "Type" },
					{ id: "color", label: "Color" },
				]
			: [
					{ id: "qty", label: "Quantity" },
					{ id: "name", label: "Alphabetical" },
					...(settingsStore.visibleColumns.includes("mana")
						? [{ id: "mana", label: "Mana Cost" }]
						: []),
					...(settingsStore.visibleColumns.includes("cmc")
						? [{ id: "cmc", label: "Mana Value" }]
						: []),
					...(settingsStore.visibleColumns.includes("type")
						? [{ id: "type", label: "Type" }]
						: []),
					...(settingsStore.visibleColumns.includes("printing")
						? [{ id: "printing", label: "Printing" }]
						: []),
					...(settingsStore.visibleColumns.includes("color-cat") ||
					settingsStore.visibleColumns.includes("color-id")
						? [{ id: "color", label: "Color" }]
						: []),
					...(settingsStore.visibleColumns.includes("price")
						? [{ id: "price", label: "Price" }]
						: []),
				],
	);

	let showColumnsDropdown = $state(false);
	let showSortDropdown = $state(false);
	let showTableColumnsDropdown = $state(false);

	const toggleableColumns = [
		{ id: "mana", label: "Mana Cost" },
		{ id: "cmc", label: "Mana Value" },
		{ id: "type", label: "Type" },
		{ id: "printing", label: "Printing" },
		{ id: "color-cat", label: "Color Category" },
		{ id: "color-id", label: "Color ID" },
		{ id: "tags", label: "Tags" },
		{ id: "price", label: "Price" },
	];

	/** @param {string} colId */
	function toggleTableColumn(colId) {
		if (settingsStore.visibleColumns.includes(colId)) {
			if (settingsStore.visibleColumns.length > 1) {
				settingsStore.visibleColumns =
					settingsStore.visibleColumns.filter((id) => id !== colId);
			}
		} else {
			settingsStore.visibleColumns = [
				...settingsStore.visibleColumns,
				colId,
			];
		}
	}

	/** @param {string} id */
	function selectGrouping(id) {
		/** @type {Record<string, string>} */
		const defaultSorts = {
			cmc: "color",
			type: "cmc",
			color: "cmc",
		};

		if (id !== "freeform") {
			deckStore.lastNaturalGrouping = id;
		} else {
			// If we are switching to freeform, make sure lastNaturalGrouping is captured
			// from whatever the current non-freeform grouping was.
			if (deckStore.grouping !== "freeform") {
				deckStore.lastNaturalGrouping = deckStore.grouping;
			}
		}

		deckStore.grouping = id;
		showColumnsDropdown = false;

		// Auto-reset sorting if it matches the new grouping
		if (deckStore.sorting === id) {
			deckStore.sorting = defaultSorts[id] || "color";
		}
	}

	/** @param {string} id */
	function selectSorting(id) {
		deckStore.sorting = id;
		deckStore.sortAscending = id !== "price" && id !== "added";
		showSortDropdown = false;

		// Auto-reset grouping if it matches the new sorting
		if (deckStore.grouping === id) {
			/** @type {Record<string, string>} */
			const defaultGroupings = {
				cmc: "type",
				type: "cmc",
				color: "cmc",
			};
			deckStore.grouping = defaultGroupings[id] || "cmc";
		}
	}

	/** @type {{ id: 'mainboard' | 'sideboard' | 'maybeboard' | 'garbage', label: string }[]} */
	const boards = [
		{ id: "mainboard", label: "Mainboard" },
		{ id: "sideboard", label: "Sideboard" },
		{ id: "maybeboard", label: "Maybeboard" },
	];

	/** @param {'mainboard' | 'sideboard' | 'maybeboard' | 'garbage'} id */
	function selectBoard(id) {
		deckStore.activeBoard = id;
		showBoardDropdown = false;
	}
</script>

<div class="deck-header">
	<div class="deck-info-wrapper">
		<div
			class="deck-info"
			role="button"
			tabindex="0"
			bind:this={deckInfoBtn}
			onclick={(e) => {
				e.stopPropagation();
				showDeckOptionsModal = true;
			}}
			onkeydown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					e.stopPropagation();
					showDeckOptionsModal = true;
				}
			}}
			aria-label="Open deck options"
		>
			<div
				class="deck-art-drop-zone"
				class:drag-over={isDragOverArt}
				ondragover={handleArtDragOver}
				ondragleave={handleArtDragLeave}
				ondrop={handleArtDrop}
				title="Drop a card here to set deck art"
				aria-label="Deck cover art drop zone"
				role="region"
			>
				<div class="card-preview-slot">
					{#if deckImage()}
						<img
							src={deckImage()}
							alt="Deck Preview"
							class="deck-art"
						/>
					{:else}
						<div class="deck-art-placeholder">
							<Image size={24} class="placeholder-icon" />
						</div>
					{/if}
				</div>
			</div>

			<div class="name-container">
				<h2>{deckStore.name}</h2>

				<div class="deck-meta">
					{#if colorIdentity().length > 0}
						<div class="deck-colors">
							{#each colorIdentity() as col}
								<ManaSymbol
									symbol={col}
									size="18px"
									className="color-identity-dot"
								/>
							{/each}
						</div>
					{/if}

					<div class="board-dropdown-container">
						<button
							class="board-dropdown-trigger"
							onclick={(e) => {
								e.stopPropagation();
								showBoardDropdown = !showBoardDropdown;
							}}
							aria-expanded={showBoardDropdown}
							aria-haspopup="listbox"
						>
							<span class="count"
								>{deckStore.currentBoardCount}</span
							>
							<span class="label"
								>Card {boards.find(
									(b) => b.id === deckStore.activeBoard,
								)?.label}</span
							>
							<ChevronDown
								size={14}
								class="chevron {showBoardDropdown
									? 'open'
									: ''}"
							/>
						</button>

						{#if showBoardDropdown}
							<div
								class="dropdown-backdrop"
								role="presentation"
								onclick={(e) => {
									e.stopPropagation();
									showBoardDropdown = false;
								}}
							></div>
							<div class="board-dropdown-menu">
								{#each boards as board}
									<button
										class="dropdown-item"
										class:active={deckStore.activeBoard ===
											board.id}
										onclick={(e) => {
											e.stopPropagation();
											selectBoard(board.id);
										}}
									>
										<span class="item-label"
											>{board.label}</span
										>
										<span class="item-count"
											>{board.id === "mainboard"
												? deckStore.mainboard.length +
													deckStore.commander.length +
													deckStore.companion.length
												: deckStore[board.id]
														.length}</span
										>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					{#if authStore.isAuthenticated}
						<div class="sync-indicator-container">
							{#if deckStore.syncState.isSyncing}
								<span class="sync-status is-syncing" title="Syncing with cloud...">
									<RefreshCw size={11} class="icon animate-spin" />
									<span>Syncing...</span>
								</span>
							{:else if deckStore.syncState.error}
								<span class="sync-status has-error" title={deckStore.syncState.error}>
									<CloudOff size={11} class="icon" />
									<span>Error</span>
								</span>
							{:else}
								<span class="sync-status is-synced" title={deckStore.syncState.lastSynced ? `Last synced at ${new Date(deckStore.syncState.lastSynced).toLocaleTimeString()}` : 'Saved to cloud'}>
									<Cloud size={11} class="icon" />
									<span>Synced</span>
								</span>
							{/if}
						</div>
					{/if}
				</div>
			</div>
		</div>
		<DeckOptionsModal
			bind:isOpen={showDeckOptionsModal}
			fallbackArt={deckImage()}
			triggerElement={deckInfoBtn}
		/>
	</div>

	<div class="deck-controls">
		<div class="header-select-group">
			<span class="group-label">LAYOUT</span>
			<div class="toggle-group">
				<div class="group-content">
					<Button
						variant={settingsStore.deckViewMode === "stacks"
							? "toggle-active"
							: "ghost"}
						size="icon"
						class="display-toggle-btn"
						onclick={() => (settingsStore.deckViewMode = "stacks")}
						title="Stacks View"
					>
						<Layers size={14} />
					</Button>
					<Button
						variant={settingsStore.deckViewMode === "table"
							? "toggle-active"
							: "ghost"}
						size="icon"
						class="display-toggle-btn"
						onclick={() => (settingsStore.deckViewMode = "table")}
						title="Table View"
					>
						<Table size={14} />
					</Button>
					<Button
						variant={settingsStore.deckViewMode === "list"
							? "toggle-active"
							: "ghost"}
						size="icon"
						class="display-toggle-btn"
						onclick={() => (settingsStore.deckViewMode = "list")}
						title="List View"
					>
						<List size={14} />
					</Button>
					<Button
						variant={settingsStore.deckViewMode === "spoiler"
							? "toggle-active"
							: "ghost"}
						size="icon"
						class="display-toggle-btn"
						onclick={() => (settingsStore.deckViewMode = "spoiler")}
						title="Spoiler View"
					>
						<Image size={14} />
					</Button>
				</div>
			</div>
		</div>

		<div class="action-buttons">
			<!-- Grouping Dropdown (Renamed from Columns) -->
			<div class="header-select-group">
				<span class="group-label">GROUPING</span>
				<div class="header-select-container">
					<button
						class="header-select-trigger"
						onclick={() =>
							(showColumnsDropdown = !showColumnsDropdown)}
						aria-expanded={showColumnsDropdown}
						aria-haspopup="listbox"
					>
						<span class="trigger-value"
							>{columns.find((c) => c.id === deckStore.grouping)
								?.label}</span
						>
						<ChevronDown
							size={14}
							class="trigger-chevron {showColumnsDropdown
								? 'open'
								: ''}"
						/>
					</button>

					{#if showColumnsDropdown}
						<div
							class="dropdown-backdrop"
							role="presentation"
							onclick={(e) => {
								e.stopPropagation();
								showColumnsDropdown = false;
							}}
							in:fade={{ duration: 200 }}
							out:fade={{ duration: 150 }}
						></div>
						<div
							class="header-select-menu"
							in:fly={{ y: 5, duration: 250 }}
							out:fly={{ y: 5, duration: 200 }}
						>
							{#each visibleGroupings as col}
								<button
									class="select-item"
									class:active={deckStore.grouping === col.id}
									onclick={() => selectGrouping(col.id)}
								>
									{col.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>
			</div>

			<!-- Columns multi-select dropdown (visible only in table view) -->
			{#if settingsStore.deckViewMode === "table"}
				<div
					class="header-select-group"
					in:horizontalSlide={{ duration: 400, delay: 300 }}
					out:horizontalSlide={{ duration: 300 }}
				>
					<span class="group-label">COLUMNS</span>
					<div class="header-select-container">
						<button
							class="header-select-trigger"
							onclick={() =>
								(showTableColumnsDropdown =
									!showTableColumnsDropdown)}
							aria-expanded={showTableColumnsDropdown}
							aria-haspopup="listbox"
						>
							<span class="trigger-value">
								{settingsStore.visibleColumns.length === 8
									? "All"
									: `${settingsStore.visibleColumns.length} Selected`}
							</span>
							<ChevronDown
								size={14}
								class="trigger-chevron {showTableColumnsDropdown
									? 'open'
									: ''}"
							/>
						</button>

						{#if showTableColumnsDropdown}
							<div
								class="dropdown-backdrop"
								role="presentation"
								onclick={(e) => {
									e.stopPropagation();
									showTableColumnsDropdown = false;
								}}
								in:fade={{ duration: 200 }}
								out:fade={{ duration: 150 }}
							></div>
							<div
								class="header-select-menu"
								in:fly={{ y: 5, duration: 250 }}
								out:fly={{ y: 5, duration: 200 }}
							>
								{#each toggleableColumns as col}
									<button
										class="select-item multi-select-item"
										class:active={settingsStore.visibleColumns.includes(
											col.id,
										)}
										onclick={(e) => {
											e.stopPropagation();
											toggleTableColumn(col.id);
										}}
									>
										<div class="checkbox-indicator">
											{#if settingsStore.visibleColumns.includes(col.id)}
												<Check size={10} />
											{/if}
										</div>
										<span>{col.label}</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			{/if}

			{#if settingsStore.deckViewMode === "stacks" || settingsStore.deckViewMode === "spoiler"}
				<div
					class="header-select-group"
					style="position: relative;"
					in:horizontalSlide={{ duration: 400, delay: 300 }}
					out:horizontalSlide={{ duration: 300 }}
				>
					<span class="group-label" style="visibility: hidden;"
						>SPLIT</span
					>
					<Button
						variant={deckStore.splitView
							? "toggle-active"
							: "ghost"}
						size="icon"
						class="split-view-btn {deckStore.splitView
							? 'bg-secondary'
							: ''}"
						onclick={() =>
							(deckStore.splitView = !deckStore.splitView)}
						title={settingsStore.deckViewMode === "spoiler"
							? "Toggle Category Dividers"
							: (deckStore.grouping === "type"
								? "Toggle Type Split View (Creatures / Non-Creatures)"
								: "Toggle Spell / Land Row Split View")}
					>
						{#if settingsStore.deckViewMode === "spoiler"}
							<StretchHorizontal size={16} />
						{:else if deckStore.grouping === "type"}
							<StretchVertical size={16} />
						{:else}
							<StretchHorizontal size={16} />
						{/if}
					</Button>
				</div>
			{/if}

			<!-- Sort Dropdown -->
			<div class="header-select-group">
				<span class="group-label">SORT</span>
				<div class="sort-group-container">
					<div class="header-select-container">
						<button
							class="header-select-trigger"
							onclick={() =>
								(showSortDropdown = !showSortDropdown)}
							aria-expanded={showSortDropdown}
							aria-haspopup="listbox"
						>
							<ArrowDownWideNarrow size={14} class="sort-icon" />
							<span class="trigger-value"
								>{visibleSorts.find(
									(s) => s.id === deckStore.sorting,
								)?.label || "Color"}</span
							>
							<ChevronDown
								size={14}
								class="trigger-chevron {showSortDropdown
									? 'open'
									: ''}"
							/>
						</button>

						{#if showSortDropdown}
							<div
								class="dropdown-backdrop"
								role="presentation"
								onclick={(e) => {
									e.stopPropagation();
									showSortDropdown = false;
								}}
								in:fade={{ duration: 200 }}
								out:fade={{ duration: 150 }}
							></div>
							<div
								class="header-select-menu"
								in:fly={{ y: 5, duration: 250 }}
								out:fly={{ y: 5, duration: 200 }}
							>
								{#each visibleSorts.filter((s) => s.id !== deckStore.grouping) as sort}
									<button
										class="select-item"
										class:active={deckStore.sorting ===
											sort.id}
										onclick={() => selectSorting(sort.id)}
									>
										{sort.label}
									</button>
								{/each}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<div class="header-select-group" style="position: relative;">
				<span class="group-label" style="visibility: hidden;">OPT</span>
				<Button
					variant={showViewOptionsModal ? "toggle-active" : "ghost"}
					size="icon"
					class="view-options-btn"
					bind:el={viewOptionsBtn}
					onclick={() => (showViewOptionsModal = true)}
					title="View Options"
				>
					<MoreVertical size={16} />
				</Button>
				<ViewOptionsModal
					bind:isOpen={showViewOptionsModal}
					triggerElement={viewOptionsBtn}
				/>
			</div>
		</div>
	</div>
</div>

<style>
	.deck-header {
		height: 88px;
		background: hsl(var(--background));
		border-bottom: 1px solid hsl(var(--border));
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 1.25rem;
		position: relative;
		z-index: 20;
	}

	.deck-info {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 0.5rem 2rem 0.5rem 0.75rem;
		margin-left: -0.75rem;
		border-radius: var(--radius);
		cursor: pointer;
		transition: background-color 0.2s ease;
	}

	.deck-info:hover {
		background-color: hsl(var(--muted) / 0.4);
	}

	.deck-art-drop-zone {
		position: relative;
		padding: 0.75rem;
		margin: -0.75rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-lg);
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		z-index: 5;
	}

	.deck-art-drop-zone.drag-over {
		background: hsl(var(--primary) / 0.1);
	}

	.card-preview-slot {
		width: 80px;
		height: 56px;
		position: relative;
		border-radius: var(--radius);
		overflow: hidden;
		box-shadow:
			0 4px 12px rgba(0, 0, 0, 0.5),
			inset 0 0 0 1px rgba(255, 255, 255, 0.1);
		transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
		background: hsl(var(--muted) / 0.1);
		pointer-events: none;
	}

	.deck-art-drop-zone.drag-over .card-preview-slot {
		transform: scale(1.1);
		box-shadow:
			0 12px 32px rgba(0, 0, 0, 0.7),
			0 0 0 2px hsl(var(--primary));
		background: hsl(var(--primary) / 0.2);
	}

	.deck-art {
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}

	.deck-art-placeholder {
		width: 100%;
		height: 100%;
		background: #1a1a1a;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground) / 0.2);
	}

	.name-container {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.deck-colors {
		display: flex;
		gap: 0.15em;
		align-items: center;
	}

	:global(.color-identity-dot) {
		font-size: 0.875rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
	}

	.name-container h2 {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		letter-spacing: -0.02em;
		line-height: 1;
	}



	:global(.deck-name-input) {
		font-size: 1rem !important;
		font-weight: 600 !important;
		height: 28px !important;
		width: auto !important;
		min-width: 180px !important;
	}

	.deck-meta {
		display: flex;
		align-items: center;
		margin-top: 0.25rem;
		gap: 0.75rem;
	}

	.board-dropdown-container {
		position: relative;
	}

	.board-dropdown-trigger {
		background: none;
		border: none;
		padding: 0;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		line-height: 1;
		cursor: pointer;
		transition: color 0.2s;
	}

	.board-dropdown-trigger:hover {
		color: hsl(var(--foreground));
	}

	.board-dropdown-trigger :global(.chevron) {
		transition: transform 0.2s;
		opacity: 0.5;
		margin-left: 0.25rem;
		align-self: center;
	}

	.board-dropdown-trigger :global(.chevron.open) {
		transform: rotate(180deg);
	}

	.board-dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 100;
		background: hsla(var(--popover) / 0.85);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		padding: 5px;
		min-width: 140px;
		box-shadow:
			0 15px 35px -5px rgba(0, 0, 0, 0.5),
			0 0 0 1px hsla(255, 100%, 100%, 0.04);
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 2rem;
		background: none;
		border: none;
		padding: 6px 12px;
		text-align: left;
		font-size: 0.875rem;
		color: var(--text-secondary);
		border-radius: var(--radius);
		cursor: pointer;
		transition: all 0.1s;
	}

	.dropdown-item .item-count {
		font-size: 0.75rem;
		opacity: 0.5;
		font-variant-numeric: tabular-nums;
	}

	.dropdown-item.active {
		background: hsla(var(--primary-hsl), 0.12);
		color: hsl(var(--foreground));
	}

	.dropdown-item:hover {
		background: hsl(var(--primary) / 0.9);
		color: white;
	}

	.deck-controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.toggle-group {
		display: flex;
		align-items: center;
		background: hsl(var(--muted) / 0.5);
		padding: 2px;
		border-radius: var(--radius);
		border: 1px solid hsl(var(--border));
		height: 36px;
	}

	.group-label {
		font-size: 10px;
		color: hsl(var(--muted-foreground));
		font-weight: 700;
		letter-spacing: 0.05em;
		text-transform: uppercase;
	}

	.group-content {
		display: flex;
		gap: 1px;
	}

	:global(.display-toggle-btn) {
		width: 30px !important;
		height: 30px !important;
		padding: 0 !important;
		border-radius: calc(var(--radius) - 3px) !important;
		color: hsl(var(--muted-foreground)) !important;
	}

	.action-buttons {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-select-group {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.header-select-container {
		position: relative;
	}

	.header-select-trigger {
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		padding: 0 0.75rem;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
		user-select: none;
		min-width: 130px;
	}

	.header-select-trigger:hover {
		background: hsl(var(--muted) / 0.8);
		border-color: hsl(var(--border) / 1);
	}

	:global(.sort-icon) {
		opacity: 0.6;
		margin-right: 0.25rem;
	}

	.trigger-value {
		flex: 1;
		text-align: left;
	}

	:global(.trigger-chevron) {
		opacity: 0.5;
		transition: transform 0.2s;
	}

	:global(.trigger-chevron.open) {
		transform: rotate(180deg);
	}

	.header-select-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		min-width: 180px;
		width: max-content;
		background: hsla(var(--popover) / 0.85);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow:
			0 15px 35px -5px rgba(0, 0, 0, 0.5),
			0 0 0 1px hsla(255, 100%, 100%, 0.04);
		padding: 5px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.select-item {
		width: 100%;
		text-align: left;
		padding: 6px 12px;
		font-size: 0.875rem;
		font-weight: 500;
		color: var(--text-secondary);
		background: none;
		border: none;
		border-radius: var(--radius);
		cursor: pointer;
		white-space: nowrap;
		transition: all 0.1s;
	}

	.select-item.active {
		background: hsla(var(--primary-hsl), 0.12);
		color: hsl(var(--foreground));
	}

	.select-item:hover {
		background: hsl(var(--primary) / 0.9);
		color: white;
	}

	:global(.split-view-btn),
	:global(.view-options-btn) {
		height: 36px !important;
		width: 36px !important;
		border-radius: var(--radius) !important;
		background: hsl(var(--muted) / 0.5) !important;
		border: 1px solid hsl(var(--border)) !important;
		color: hsl(var(--muted-foreground)) !important;
	}

	:global(.split-view-btn:hover),
	:global(.view-options-btn:hover) {
		background: hsl(var(--muted) / 0.8) !important;
		color: hsl(var(--foreground)) !important;
	}

	:global(.split-view-btn.bg-secondary),
	:global(.view-options-btn.bg-secondary) {
		color: hsl(var(--foreground)) !important;
		border-color: hsl(var(--border) / 1) !important;
	}

	.sort-group-container {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.board-dropdown-menu .item-count {
		color: hsl(var(--muted-foreground));
		font-variant-numeric: tabular-nums;
	}

	.dropdown-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 90;
	}

	.deck-info-wrapper {
		position: relative;
	}

	.multi-select-item {
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.checkbox-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		border-radius: var(--radius-sm);
		border: 1px solid hsl(var(--border));
		background: transparent;
		flex-shrink: 0;
		color: currentColor;
	}

	.select-item.active .checkbox-indicator {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: white;
	}

	.select-item:hover .checkbox-indicator {
		border-color: white;
	}

	.sync-indicator-container {
		display: flex;
		align-items: center;
		padding-left: 0.75rem;
		border-left: 1px solid hsl(var(--border) / 0.5);
		height: 14px;
	}

	.sync-status {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}

	.sync-status.is-syncing {
		color: hsl(var(--muted-foreground));
	}

	.sync-status.has-error {
		color: #f87171;
	}

	.sync-status.is-synced {
		color: #34d399;
	}

	.sync-status :global(.icon) {
		opacity: 0.8;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}

	:global(.animate-spin) {
		animation: spin 1s linear infinite;
	}
</style>
