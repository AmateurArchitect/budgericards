<script>
	import { onMount, untrack } from "svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";
	import {
		Image,
		ChevronDown,
		StretchHorizontal,
		StretchVertical,
		MoreVertical,
		Table,
		Check,
		List,
		Layers,
		CloudOff,
		RefreshCw,
		BarChart2,
		Settings,
		Search,
		FolderOpen,
		Palette,
		HelpCircle,
		PlusCircle,
		LogOut,
		Settings as SettingsIcon,
	} from "lucide-svelte";
	import Button from "./ui/Button.svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import DeckOptionsModal from "./DeckOptionsModal.svelte";
	import ViewOptionsModal from "./ViewOptionsModal.svelte";
	import { fade, fly } from "svelte/transition";
	import { horizontalSlide } from "$lib/utils/transitions.js";

	/** @type {{ isTopBar?: boolean }} */
	let { isTopBar = false } = $props();

	let showDeckOptionsModal = $state(false);
	let showViewOptionsModal = $state(false);
	let showBudgieDropdown = $state(false);
	let showProfileDropdown = $state(false);
	let showAboutModal = $state(false);

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
		e.stopPropagation();
		isDragOverArt = true;
	}

	function handleArtDragLeave() {
		isDragOverArt = false;
	}

	/** @param {DragEvent} e */
	async function handleArtDrop(e) {
		e.preventDefault();
		e.stopPropagation();
		isDragOverArt = false;
		if (!e.dataTransfer) return;

		const internalData = e.dataTransfer.getData("application/x-budgericard");
		if (internalData) {
			try {
				const data = JSON.parse(internalData);
				const meta = deckStore.metadata[data.name.toLowerCase()] || data.card;
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

	let showBoardDropdown = $state(false);
	const columns = [
		{ id: "cmc", label: "Mana Value", shortLabel: "MV" },
		{ id: "creature", label: "Creature/Non-Creature", shortLabel: "Creature" },
		{ id: "type", label: "Type", shortLabel: "Type" },
		{ id: "color", label: "Color", shortLabel: "Color" },
		{ id: "primarytag", label: "Primary Tag", shortLabel: "Tag" },
		{ id: "freeform", label: "Freeform", shortLabel: "Freeform" },
		{ id: "none", label: "None", shortLabel: "None" },
	];

	const visibleGroupings = $derived(
		settingsStore.deckViewMode === "stacks"
			? columns.filter((c) => c.id !== "creature" && c.id !== "none")
			: columns.filter((c) => c.id !== "freeform"),
	);

	const curGroupingCol = $derived(
		columns.find((c) => c.id === deckStore.grouping)
	);

	$effect(() => {
		const viewMode = settingsStore.deckViewMode;
		const grouping = deckStore.grouping;
		const sorting = deckStore.sorting;
		const sortIds = visibleSorts.map((s) => s.id);

		untrack(() => {
			if (viewMode === "stacks") {
				if (
					deckStore.grouping === "none" ||
					deckStore.grouping === "creature"
				) {
					deckStore.grouping = "cmc";
				}
			}

			if (!sortIds.includes(deckStore.sorting) && sortIds.length > 0) {
				deckStore.sorting = sortIds.includes("color") ? "color" : sortIds[0];
			}

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
			if (deckStore.grouping !== "freeform") {
				deckStore.lastNaturalGrouping = deckStore.grouping;
			}
		}

		deckStore.grouping = id;
		showColumnsDropdown = false;

		if (deckStore.sorting === id) {
			deckStore.sorting = defaultSorts[id] || "color";
		}
	}

	/** @param {string} id */
	function selectSorting(id) {
		deckStore.sorting = id;
		deckStore.sortAscending = id !== "price" && id !== "added";
		showSortDropdown = false;

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

	function handleNewDeck() {
		showBudgieDropdown = false;
		showProfileDropdown = false;
		if (typeof window !== "undefined") {
			window.open("/?new_deck=true", "_blank");
		}
	}

	async function handleSignOut() {
		showProfileDropdown = false;
		await authStore.signOut();
	}

	/** @param {MouseEvent} e */
	function handleDocumentClick(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target.closest(".board-dropdown-container")) {
			showBoardDropdown = false;
		}
		if (!target.closest(".grouping-container")) {
			showColumnsDropdown = false;
		}
		if (!target.closest(".sort-container")) {
			showSortDropdown = false;
		}
		if (!target.closest(".table-cols-container")) {
			showTableColumnsDropdown = false;
		}
		if (!target.closest(".budgie-menu-container")) {
			showBudgieDropdown = false;
		}
		if (!target.closest(".profile-menu-container")) {
			showProfileDropdown = false;
		}
	}

	onMount(() => {
		/** @param {KeyboardEvent} e */
		const handleGlobalKeydown = (e) => {
			const isCmdCtrl = e.metaKey || e.ctrlKey;
			if (isCmdCtrl && e.key.toLowerCase() === "s") {
				const isUnnamed = !deckStore.name || deckStore.name === "Untitled Deck";
				if (isUnnamed) {
					e.preventDefault();
					showDeckOptionsModal = true;
				}
			}
		};
		window.addEventListener("keydown", handleGlobalKeydown);
		return () => {
			window.removeEventListener("keydown", handleGlobalKeydown);
		};
	});
</script>

<svelte:window onclick={handleDocumentClick} />

<div class="deck-header" class:is-top-bar={isTopBar}>
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
			title="Click to edit deck options"
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
							<Image size={18} class="placeholder-icon" />
						</div>
					{/if}
				</div>
			</div>

			<div class="name-and-meta-column">
				<div class="deck-title-wrapper" title={deckStore.name || "Untitled Deck"}>
					{#if !deckStore.name || deckStore.name === "Untitled Deck"}
						<h2 class="unnamed-prompt">Untitled Deck</h2>
						<span class="draft-badge">Draft</span>
					{:else}
						<h2 class="deck-title-text">{deckStore.name}</h2>
					{/if}
				</div>

				<div class="deck-meta-row">
					{#if colorIdentity().length > 0}
						<div class="deck-colors">
							{#each colorIdentity() as col}
								<ManaSymbol
									symbol={col}
									size="16px"
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
							<span class="board-label">
								{deckStore.currentBoardCount} Card {boards.find((b) => b.id === deckStore.activeBoard)?.label}
							</span>
							<ChevronDown size={13} class="chevron {showBoardDropdown ? 'open' : ''}" />
						</button>

						{#if showBoardDropdown}
							<div class="board-dropdown-menu" transition:fly={{ y: 4, duration: 150 }}>
								{#each boards as board}
									<button
										class="dropdown-item"
										class:active={deckStore.activeBoard === board.id}
										onclick={(e) => {
											e.stopPropagation();
											selectBoard(board.id);
										}}
									>
										<span class="item-label">{board.label}</span>
										<span class="item-count">
											{board.id === "mainboard"
												? deckStore.mainboard.length + deckStore.commander.length + deckStore.companion.length
												: deckStore[board.id].length}
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					{#if deckStore.activeBoard === 'maybeboard' && deckStore.maybeboard.length >= 80}
						<button
							class="maybeboard-warning-btn"
							class:full={deckStore.maybeboard.length === 100}
							onclick={(e) => {
								e.stopPropagation();
								interactionStore.maybeboardCleanupModal.isOpen = true;
							}}
							title="Maybeboard is near or at limit. Click to clean up."
						>
							<span class="warning-icon">⚠️</span>
							<span class="warning-text">{deckStore.maybeboard.length}/100</span>
						</button>
					{/if}

					{#if authStore.isAuthenticated && (deckStore.syncState.isSyncing || deckStore.syncState.error)}
						<div class="sync-indicator-container">
							{#if deckStore.syncState.isSyncing}
								<span class="sync-status is-syncing" title="Syncing with cloud...">
									<RefreshCw size={11} class="icon animate-spin" />
								</span>
							{:else if deckStore.syncState.error}
								<span class="sync-status has-error" title={deckStore.syncState.error}>
									<CloudOff size={11} class="icon" />
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

	<div class="deck-controls-right">
		{#if settingsStore.deckViewMode === "list" && deckStore.isImportDirty}
			<div class="import-mode-actions">
				<Button
					variant="outline"
					size="sm"
					class="cancel-btn"
					onclick={() => deckStore.cancelImport()}
				>
					Cancel
				</Button>
				<Button
					variant="default"
					size="sm"
					class="save-btn"
					onclick={() => deckStore.saveImport()}
				>
					Save Changes
				</Button>
			</div>
		{:else}
			<!-- View Mode Segmented Controls -->
			<div class="view-mode-group">
				<Button
					variant={settingsStore.deckViewMode === "stacks" ? "toggle-active" : "ghost"}
					size="icon"
					class="view-toggle-btn"
					onclick={() => (settingsStore.deckViewMode = "stacks")}
					title="Stacks View"
				>
					<Layers size={15} />
				</Button>
				<Button
					variant={settingsStore.deckViewMode === "list" ? "toggle-active" : "ghost"}
					size="icon"
					class="view-toggle-btn"
					onclick={() => (settingsStore.deckViewMode = "list")}
					title="List / Text View"
				>
					<List size={15} />
				</Button>
				<Button
					variant={settingsStore.deckViewMode === "spoiler" ? "toggle-active" : "ghost"}
					size="icon"
					class="view-toggle-btn"
					onclick={() => (settingsStore.deckViewMode = "spoiler")}
					title="Spoiler View"
				>
					<Image size={15} />
				</Button>
				<Button
					variant={settingsStore.deckViewMode === "table" ? "toggle-active" : "ghost"}
					size="icon"
					class="view-toggle-btn"
					onclick={() => (settingsStore.deckViewMode = "table")}
					title="Table View"
				>
					<Table size={15} />
				</Button>
				<Button
					variant={settingsStore.deckViewMode === "stats" ? "toggle-active" : "ghost"}
					size="icon"
					class="view-toggle-btn"
					onclick={() => (settingsStore.deckViewMode = "stats")}
					title="Stats View"
				>
					<BarChart2 size={15} />
				</Button>
				<Button
					variant={settingsStore.deckViewMode === "settings" ? "toggle-active" : "ghost"}
					size="icon"
					class="view-toggle-btn"
					onclick={() => (settingsStore.deckViewMode = "settings")}
					title="Settings"
				>
					<Settings size={15} />
				</Button>
			</div>

			<!-- Grouping Dropdown -->
			{#if settingsStore.deckViewMode !== "settings" && settingsStore.deckViewMode !== "list" && settingsStore.deckViewMode !== "stats"}
				<div class="grouping-container">
					<button
						class="header-select-trigger"
						onclick={(e) => {
							e.stopPropagation();
							showColumnsDropdown = !showColumnsDropdown;
						}}
						aria-expanded={showColumnsDropdown}
						aria-haspopup="listbox"
						title="Group cards by"
					>
						<span class="trigger-value full-label">{curGroupingCol?.label || "Grouping"}</span>
						<span class="trigger-value short-label">{curGroupingCol?.shortLabel || curGroupingCol?.label || "Grouping"}</span>
						<ChevronDown size={13} class="chevron {showColumnsDropdown ? 'open' : ''}" />
					</button>

					{#if showColumnsDropdown}
						<div class="header-select-menu" transition:fly={{ y: 4, duration: 150 }}>
							{#each visibleGroupings as col}
								<button
									class="select-item"
									class:active={deckStore.grouping === col.id}
									onclick={(e) => {
										e.stopPropagation();
										selectGrouping(col.id);
									}}
								>
									{col.label}
								</button>
							{/each}
						</div>
					{/if}
				</div>

				<!-- Split View Modifier Button -->
				{#if (settingsStore.deckViewMode === "stacks" && deckStore.grouping !== "freeform") || settingsStore.deckViewMode === "spoiler"}
					<Button
						variant={deckStore.splitView ? "toggle-active" : "ghost"}
						size="icon"
						class="modifier-btn {deckStore.splitView ? 'bg-secondary' : ''}"
						onclick={() => (deckStore.splitView = !deckStore.splitView)}
						title={settingsStore.deckViewMode === "spoiler"
							? "Toggle Category Dividers"
							: deckStore.grouping === "type"
								? "Toggle Type Split View (Creatures / Non-Creatures)"
								: "Toggle Spell / Land Row Split View"}
					>
						{#if settingsStore.deckViewMode === "spoiler"}
							<StretchHorizontal size={15} />
						{:else if deckStore.grouping === "type"}
							<StretchVertical size={15} />
						{:else}
							<StretchHorizontal size={15} />
						{/if}
					</Button>
				{/if}

				<!-- Table Columns Multi-select -->
				{#if settingsStore.deckViewMode === "table"}
					<div class="table-cols-container">
						<button
							class="header-select-trigger"
							onclick={(e) => {
								e.stopPropagation();
								showTableColumnsDropdown = !showTableColumnsDropdown;
							}}
							aria-expanded={showTableColumnsDropdown}
							aria-haspopup="listbox"
							title="Toggle visible columns"
						>
							<span class="trigger-value">
								{settingsStore.visibleColumns.length === 8
									? "All Cols"
									: `${settingsStore.visibleColumns.length} Cols`}
							</span>
							<ChevronDown size={13} class="chevron {showTableColumnsDropdown ? 'open' : ''}" />
						</button>

						{#if showTableColumnsDropdown}
							<div class="header-select-menu" transition:fly={{ y: 4, duration: 150 }}>
								{#each toggleableColumns as col}
									<button
										class="select-item multi-select-item"
										class:active={settingsStore.visibleColumns.includes(col.id)}
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
				{/if}

				<!-- View Options Modal Trigger -->
				<div class="view-options-container">
					<Button
						variant={showViewOptionsModal ? "toggle-active" : "ghost"}
						size="icon"
						class="modifier-btn"
						bind:el={viewOptionsBtn}
						onclick={(/** @type {MouseEvent} */ e) => {
							e.stopPropagation();
							showViewOptionsModal = true;
						}}
						title="View Options"
					>
						<MoreVertical size={15} />
					</Button>
					<ViewOptionsModal
						bind:isOpen={showViewOptionsModal}
						triggerElement={viewOptionsBtn}
					/>
				</div>
			{/if}

			{#if settingsStore.deckViewMode === "stats"}
				<div class="stats-subtabs-group">
					<Button
						variant={settingsStore.statsSubTab === "dashboard" ? "toggle-active" : "ghost"}
						onclick={() => (settingsStore.statsSubTab = "dashboard")}
						size="sm"
						class="stats-tab-btn"
					>
						Dashboard
					</Button>
					<Button
						variant={settingsStore.statsSubTab === "sample-hand" ? "toggle-active" : "ghost"}
						onclick={() => (settingsStore.statsSubTab = "sample-hand")}
						size="sm"
						class="stats-tab-btn"
					>
						Sample Hand
					</Button>
					<Button
						variant={settingsStore.statsSubTab === "tokens" ? "toggle-active" : "ghost"}
						onclick={() => (settingsStore.statsSubTab = "tokens")}
						size="sm"
						class="stats-tab-btn"
					>
						Tokens
					</Button>
					<Button
						variant={settingsStore.statsSubTab === "combos" ? "toggle-active" : "ghost"}
						onclick={() => (settingsStore.statsSubTab = "combos")}
						size="sm"
						class="stats-tab-btn"
					>
						Combos
					</Button>
				</div>
			{/if}
		{/if}

		<!-- Global Top-Bar Items (Rendered when this is the top bar) -->
		{#if isTopBar}
			<div class="global-nav-group">
				<!-- Budgie Dropdown -->
				<div class="budgie-menu-container">
					<button
						class="nav-dropdown-trigger"
						onclick={(e) => {
							e.stopPropagation();
							showBudgieDropdown = !showBudgieDropdown;
						}}
						aria-expanded={showBudgieDropdown}
						aria-haspopup="menu"
						title="Budgie Menu"
					>
						<span class="brand-text">Budgie</span>
						<ChevronDown size={13} class="chevron {showBudgieDropdown ? 'open' : ''}" />
					</button>

					{#if showBudgieDropdown}
						<div class="nav-dropdown-menu" transition:fade={{ duration: 120 }}>
							<a href="/decks" class="menu-item nav-link" onclick={() => (showBudgieDropdown = false)}>
								<FolderOpen size={14} />
								<span>Browse Decks</span>
							</a>
							<a href="/gallery" class="menu-item nav-link" onclick={() => (showBudgieDropdown = false)}>
								<Palette size={14} />
								<span>Art Gallery</span>
							</a>
							<button class="menu-item" onclick={() => { showAboutModal = true; showBudgieDropdown = false; }}>
								<HelpCircle size={14} />
								<span>About Budgie</span>
							</button>
							<a
								href="https://scryfall.com/docs/syntax"
								target="_blank"
								rel="noopener noreferrer"
								class="menu-item nav-link"
								onclick={() => (showBudgieDropdown = false)}
							>
								<HelpCircle size={14} />
								<span>Syntax Help</span>
							</a>
						</div>
					{/if}
				</div>

				<!-- User Profile Dropdown -->
				<div class="profile-menu-container">
					{#if authStore.isAuthenticated && authStore.user}
						<button
							class="nav-dropdown-trigger user-trigger"
							onclick={(e) => {
								e.stopPropagation();
								showProfileDropdown = !showProfileDropdown;
							}}
							aria-expanded={showProfileDropdown}
							aria-haspopup="menu"
							aria-label="User menu"
							title={authStore.user.email}
						>
							<span class="user-name nav-label">
								{authStore.user.user_metadata?.display_name || authStore.user.email?.split("@")[0]}
							</span>
							<ChevronDown size={13} class="chevron {showProfileDropdown ? 'open' : ''}" />
						</button>

						{#if showProfileDropdown}
							<div class="nav-dropdown-menu profile-menu" transition:fade={{ duration: 120 }}>
								<div class="dropdown-header">
									<span class="dropdown-email">{authStore.user.email}</span>
								</div>
								<div class="menu-divider"></div>
								<button class="menu-item" onclick={handleNewDeck}>
									<PlusCircle size={14} />
									<span>New Deck</span>
								</button>
								<a href="/decks" class="menu-item nav-link" onclick={() => (showProfileDropdown = false)}>
									<FolderOpen size={14} />
									<span>Your Decks</span>
								</a>
								<button class="menu-item" onclick={() => { showProfileDropdown = false; goto("/settings"); }}>
									<SettingsIcon size={14} />
									<span>Settings</span>
								</button>
								<div class="menu-divider"></div>
								<button class="menu-item destructive" onclick={handleSignOut}>
									<LogOut size={14} />
									<span>Log Out</span>
								</button>
							</div>
						{/if}
					{:else}
						<a
							href="/login?redirectTo={encodeURIComponent($page.url.pathname)}"
							class="nav-dropdown-trigger font-semibold"
							style="text-decoration: none;"
							aria-label="Log In"
						>
							<span class="user-name">Log In</span>
						</a>
					{/if}
				</div>

				<!-- Search Trigger Button -->
				<button
					class="search-trigger-btn"
					onclick={() => searchStore.openSearch()}
					aria-label="Card search (⌘/ or /)"
					title="Card Search (⌘/ or /)"
				>
					<div class="search-trigger-left">
						<Search size={14} class="search-trigger-icon" />
						<span class="search-trigger-text">Card Search</span>
					</div>
					<div class="shortcut-keycaps">
						<kbd class="key-cap">⌘</kbd>
						<kbd class="key-cap">/</kbd>
					</div>
				</button>
			</div>
		{/if}
	</div>
</div>

{#if showAboutModal}
	<div
		class="about-backdrop"
		onclick={(e) => { if (e.target === e.currentTarget) showAboutModal = false; }}
		role="presentation"
		transition:fade={{ duration: 150 }}
	>
		<div class="about-card" transition:fly={{ y: 10, duration: 200 }}>
			<div class="about-header">
				<h3>About Budgie</h3>
				<button class="close-btn" onclick={() => (showAboutModal = false)}>
					&times;
				</button>
			</div>
			<div class="about-body">
				<p><strong>Budgie</strong> is a fast, beautiful Magic: The Gathering deckbuilder built for rapid brewing and gorgeous visual sorting.</p>
				<p>Syncs seamlessly with cloud storage and local database caching.</p>
				<div class="about-footer">
					<span>Version 1.0.0</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.deck-header {
		height: 96px;
		background: transparent;
		border-bottom: 1px solid hsl(var(--border) / 0.6);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px;
		position: relative;
		z-index: 20;
		box-sizing: border-box;
		user-select: none;
	}

	.deck-header.is-top-bar {
		height: 96px;
		background: transparent;
		backdrop-filter: none;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
	}

	.deck-info-wrapper {
		display: flex;
		align-items: center;
		min-width: 0;
		flex-shrink: 1;
	}

	.deck-info {
		display: flex;
		align-items: center;
		gap: 0.875rem;
		padding: 8px;
		margin: 0;
		border-radius: var(--radius-lg, 8px);
		cursor: pointer;
		transition: background-color 0.15s ease;
		min-width: 0;
	}

	.deck-info:hover {
		background-color: hsl(var(--muted) / 0.4);
	}

	.deck-art-drop-zone {
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 6px;
		transition: all 0.2s ease;
		flex-shrink: 0;
	}

	.deck-art-drop-zone.drag-over {
		background: hsl(var(--primary) / 0.2);
	}

	.card-preview-slot {
		width: 88px;
		height: 56px;
		position: relative;
		border-radius: 6px;
		overflow: hidden;
		box-shadow: 0 3px 10px rgba(0, 0, 0, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.12);
		background: hsl(var(--muted) / 0.2);
		pointer-events: none;
	}

	.deck-art {
		width: 100%;
		height: 100%;
		border-radius: 6px;
		object-fit: cover;
		pointer-events: none;
	}

	.deck-art-placeholder {
		width: 100%;
		height: 100%;
		background: #18181b;
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground) / 0.4);
	}

	.name-and-meta-column {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}

	.deck-title-wrapper {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		min-width: 0;
	}

	.deck-title-text, .unnamed-prompt {
		margin: 0;
		font-size: 16px;
		font-weight: 600;
		line-height: 1.25;
		color: hsl(var(--foreground));
		letter-spacing: -0.015em;
		max-width: 280px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.unnamed-prompt {
		color: hsl(var(--foreground) / 0.5);
	}

	.draft-badge {
		font-size: 0.6rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		background: hsl(35 92% 50% / 0.15);
		color: hsl(35 92% 65%);
		border: 1px solid hsl(35 92% 50% / 0.3);
		padding: 0.05rem 0.25rem;
		border-radius: 3px;
		font-weight: 600;
		line-height: 1;
	}

	.deck-meta-row {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		white-space: nowrap;
	}

	.deck-colors {
		display: inline-flex;
		align-items: center;
		gap: 0.15rem;
	}

	:global(.color-identity-dot) {
		font-size: 0.8125rem;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		box-shadow: 0 1px 2px rgba(0, 0, 0, 0.4);
	}

	.board-dropdown-container {
		position: relative;
	}

	.board-dropdown-trigger {
		background: none;
		border: none;
		padding: 0.15rem 0.3rem;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		border-radius: var(--radius-sm);
		transition: all 0.15s ease;
	}

	.board-dropdown-trigger:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted) / 0.4);
	}

	.board-dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		width: 170px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
		padding: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.dropdown-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 6px 10px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.dropdown-item:hover {
		background: hsl(var(--primary));
		color: white;
	}

	.dropdown-item.active {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.item-count {
		font-size: 0.75rem;
		opacity: 0.8;
	}

	.maybeboard-warning-btn {
		display: inline-flex;
		align-items: center;
		gap: 0.2rem;
		background: hsl(35 92% 50% / 0.15);
		color: hsl(35 92% 65%);
		border: 1px solid hsl(35 92% 50% / 0.3);
		padding: 0.1rem 0.35rem;
		border-radius: 4px;
		font-size: 0.75rem;
		cursor: pointer;
	}

	.sync-indicator-container {
		display: inline-flex;
		align-items: center;
		color: hsl(var(--muted-foreground));
	}

	.deck-controls-right {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex-shrink: 0;
	}

	.view-mode-group {
		display: inline-flex;
		align-items: center;
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-md);
		padding: 2px;
		gap: 1px;
		height: 36px;
		box-sizing: border-box;
	}

	:global(.view-toggle-btn) {
		height: 30px !important;
		width: 30px !important;
		padding: 0 !important;
		border-radius: 4px !important;
		color: hsl(var(--muted-foreground)) !important;
	}

	:global(.view-toggle-btn:hover) {
		color: hsl(var(--foreground)) !important;
		background: hsl(var(--muted) / 0.5) !important;
	}

	.grouping-container,
	.table-cols-container,
	.view-options-container {
		position: relative;
	}

	.header-select-trigger {
		height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 0.75rem;
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-md);
		color: hsl(var(--foreground) / 0.85);
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.header-select-trigger:hover {
		background: hsl(var(--muted) / 0.5);
		color: hsl(var(--foreground));
	}

	.header-select-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 150px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.45);
		padding: 4px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.select-item {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		font-size: 0.8125rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.select-item:hover {
		background: hsl(var(--primary));
		color: white;
	}

	.select-item.active {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.checkbox-indicator {
		width: 14px;
		height: 14px;
		border: 1px solid hsl(var(--border));
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: hsl(var(--background));
	}

	:global(.modifier-btn) {
		height: 36px !important;
		width: 36px !important;
		padding: 0 !important;
		border-radius: var(--radius-md) !important;
		color: hsl(var(--muted-foreground)) !important;
		border: 1px solid hsl(var(--border) / 0.5) !important;
		background: hsl(var(--muted) / 0.3) !important;
		box-sizing: border-box !important;
	}

	:global(.modifier-btn:hover) {
		color: hsl(var(--foreground)) !important;
		background: hsl(var(--muted) / 0.5) !important;
	}

	.global-nav-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-left: 0.25rem;
		padding-left: 0.5rem;
		border-left: 1px solid hsl(var(--border) / 0.5);
	}

	.budgie-menu-container,
	.profile-menu-container {
		position: relative;
	}

	.nav-dropdown-trigger {
		height: 36px;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0 0.65rem;
		border-radius: var(--radius-md);
		color: hsl(var(--foreground) / 0.85);
		font-size: 13px;
		font-weight: 600;
		transition: background-color 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.nav-dropdown-trigger:hover {
		background-color: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
	}

	.brand-text {
		font-weight: 700;
		letter-spacing: -0.02em;
	}

	.nav-dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		width: 190px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-md);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
		padding: 4px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.dropdown-header {
		padding: 6px 10px;
	}

	.dropdown-email {
		font-size: 0.75rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		display: block;
	}

	.menu-item {
		width: 100%;
		text-align: left;
		padding: 6px 10px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s ease;
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
	}

	.menu-item:hover {
		background: hsl(var(--primary));
		color: white !important;
	}

	.menu-item.destructive {
		color: #f87171;
	}

	.menu-item.destructive:hover {
		background: #ef4444 !important;
		color: white !important;
	}

	.menu-divider {
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin: 3px 6px;
	}

	.search-trigger-btn {
		height: 36px;
		min-width: 175px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.85rem;
		background: hsl(var(--muted) / 0.65);
		border: 1px solid hsl(var(--border) / 0.95);
		color: hsl(var(--muted-foreground));
		padding: 0 0.65rem 0 0.85rem;
		border-radius: 9999px;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	.search-trigger-btn:hover {
		background: hsl(var(--muted) / 0.9);
		border-color: hsl(var(--foreground) / 0.25);
		color: hsl(var(--foreground));
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.search-trigger-left {
		display: inline-flex;
		align-items: center;
		gap: 0.45rem;
	}

	:global(.search-trigger-icon) {
		color: hsl(var(--muted-foreground));
		transition: color 0.15s ease;
	}

	.search-trigger-btn:hover :global(.search-trigger-icon) {
		color: hsl(var(--foreground));
	}

	.search-trigger-text {
		font-size: 13px;
		font-weight: 500;
		color: inherit;
		letter-spacing: -0.01em;
	}

	.shortcut-keycaps {
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	.key-cap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 16px;
		height: 16px;
		padding: 0 3px;
		font-family: inherit;
		font-size: 10px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--background) / 0.7);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius-sm, 4px);
		box-shadow: 0 1px 1px rgba(0, 0, 0, 0.15), inset 0 1px 0 rgba(255, 255, 255, 0.05);
		line-height: 1;
		user-select: none;
		transition: all 0.15s ease;
	}

	.search-trigger-btn:hover .key-cap {
		border-color: hsl(var(--border));
		color: hsl(var(--foreground));
		background: hsl(var(--background));
	}

	.stats-subtabs-group {
		display: inline-flex;
		gap: 2px;
	}

	:global(.stats-tab-btn) {
		height: 36px !important;
		font-size: 0.8125rem !important;
		padding: 0 0.75rem !important;
	}

	:global(.chevron) {
		opacity: 0.6;
		transition: transform 0.15s ease;
	}

	:global(.chevron.open) {
		transform: rotate(180deg);
	}

	/* Responsive Breakpoint Adaptations */
	@media (max-width: 1250px) {
		.full-label { display: none; }
		.short-label { display: inline; }
		.deck-title-text { max-width: 150px; }
	}

	@media (min-width: 1251px) {
		.full-label { display: inline; }
		.short-label { display: none; }
	}

	@media (max-width: 1100px) {
		.nav-label { display: none; }
		.search-trigger-kbd { display: none; }
		.deck-title-text { max-width: 120px; }
	}

	@media (max-width: 950px) {
		.search-trigger-text { display: none; }
		.search-trigger-btn { padding: 0.35rem 0.45rem; }
		.board-label { display: none; }
	}

	/* About Modal */
	.about-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10000;
	}

	.about-card {
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 380px;
		padding: 1.5rem;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.about-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		padding-bottom: 0.5rem;
	}

	.about-header h3 {
		margin: 0;
		font-size: 1.125rem;
		font-weight: 700;
	}

	.about-header .close-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		font-size: 1.25rem;
		padding: 2px 6px;
		border-radius: var(--radius-sm);
	}

	.about-body {
		font-size: 0.875rem;
		line-height: 1.6;
		color: hsl(var(--foreground));
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.about-footer {
		margin-top: 0.5rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-align: right;
	}
</style>
