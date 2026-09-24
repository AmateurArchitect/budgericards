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
		MoreHorizontal,
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
		ArrowDownWideNarrow,
		LayoutGrid,
	} from "lucide-svelte";
	import Button from "./ui/Button.svelte";
	import ManaSymbol from "./ui/ManaSymbol.svelte";
	import DeckOptionsModal from "./DeckOptionsModal.svelte";
	import ViewOptionsModal from "./ViewOptionsModal.svelte";
	import MultiSortModal from "./MultiSortModal.svelte";
	import { fade, fly } from "svelte/transition";
	import { horizontalSlide } from "$lib/utils/transitions.js";

	/** @type {{ isTopBar?: boolean }} */
	let { isTopBar = false } = $props();

	let showDeckOptionsModal = $state(false);
	let showViewOptionsModal = $state(false);
	let showAboutModal = $state(false);
	let showDisplaySort = $state(false);

	const isCustomDeckSortActive = $derived(() => {
		return Boolean(
			deckStore.activeSorts && deckStore.activeSorts.length > 0,
		);
	});

	const searchHints = ["Lightning Bolt", "t:creature cmc<=2", "is:commander"];
	let placeholderIndex = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			placeholderIndex = (placeholderIndex + 1) % searchHints.length;
		}, 6000);
		return () => clearInterval(interval);
	});

	/** @type {HTMLElement | null} */
	let viewOptionsBtn = $state(null);
	/** @type {HTMLElement | null} */
	let deckInfoBtn = $state(null);
	/** @type {HTMLElement | null} */
	let headerEl = $state(null);
	let isScrolled = $state(false);

	$effect(() => {
		if (typeof window === "undefined") return;

		const handleScroll = (/** @type {Event} */ e) => {
			const target = /** @type {HTMLElement} */ (e.target);
			if (
				target &&
				headerEl?.parentElement &&
				headerEl.parentElement.contains(target) &&
				target !== headerEl
			) {
				isScrolled = target.scrollTop > 2;
			}
		};

		window.addEventListener("scroll", handleScroll, {
			capture: true,
			passive: true,
		});
		return () => {
			window.removeEventListener("scroll", handleScroll, {
				capture: true,
			});
		};
	});

	$effect(() => {
		// Track viewMode and board changes to reset or update scroll state
		const _mode = settingsStore.deckViewMode;
		const _board = deckStore.activeBoard;

		requestAnimationFrame(() => {
			if (!headerEl?.parentElement) return;
			const elements = headerEl.parentElement.querySelectorAll("*");
			let scrolled = false;
			for (const el of elements) {
				if (
					el !== headerEl &&
					!headerEl.contains(el) &&
					el.scrollTop > 2
				) {
					scrolled = true;
					break;
				}
			}
			isScrolled = scrolled;
		});
	});

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

	let deckImageError = $state(false);
	$effect(() => {
		const _ = deckImage();
		deckImageError = false;
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

		const internalData = e.dataTransfer.getData(
			"application/x-budgericard",
		);
		if (internalData) {
			try {
				const data = JSON.parse(internalData);
				const meta =
					deckStore.metadata[data.name.toLowerCase()] || data.card;
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
		{
			id: "creature",
			label: "Creature/Non-Creature",
			shortLabel: "Creature",
		},
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
		columns.find((c) => c.id === deckStore.grouping),
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
				deckStore.sorting = sortIds.includes("color")
					? "color"
					: sortIds[0];
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

	const basicSortOptions = [
		{ id: "cmc", label: "Mana Value" },
		{ id: "color-cat", label: "Color" },
		{ id: "type", label: "Type" },
		{ id: "price", label: "Price" },
		{ id: "rarity", label: "Rarity" },
		{ id: "name", label: "Alphabetical" },
		{ id: "added", label: "Recently Added" },
	];

	/** @type {Record<string, string>} */
	const sortLabelMap = {
		cmc: "Mana Value",
		"color-cat": "Color",
		color: "Color",
		"color-id": "Color",
		type: "Type",
		price: "Price",
		rarity: "Rarity",
		name: "Alphabetical",
		added: "Recently Added",
	};

	const isDefaultSort = $derived(
		!deckStore.activeSorts || deckStore.activeSorts.length === 0,
	);

	const isMultiSort = $derived(
		Boolean(deckStore.activeSorts && deckStore.activeSorts.length > 1),
	);

	const currentSortLabel = $derived.by(() => {
		if (!deckStore.activeSorts || deckStore.activeSorts.length === 0) {
			return "Default";
		}
		const topSort = deckStore.activeSorts[0];
		return sortLabelMap[topSort.type] || topSort.type;
	});

	/** @param {string} id */
	function isSingleSortActive(id) {
		if (!deckStore.activeSorts || deckStore.activeSorts.length !== 1)
			return false;
		const s = deckStore.activeSorts[0];
		if (id === "color-cat") {
			return (
				s.type === "color-cat" ||
				s.type === "color" ||
				s.type === "color-id"
			);
		}
		return s.type === id;
	}

	/** @param {string} id */
	function selectSortOption(id) {
		if (id === "default") {
			deckStore.activeSorts = [];
			deckStore.sorting = "color";
		} else {
			deckStore.activeSorts = [{ type: id, direction: "default" }];
			deckStore.sorting = id === "color-cat" ? "color" : id;
		}
		showSortDropdown = false;
	}

	function openAdvancedSort() {
		showSortDropdown = false;
		showDisplaySort = true;
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

	/** @param {string} except */
	function closeAllDropdowns(except = "") {
		if (except !== "board") showBoardDropdown = false;
		if (except !== "grouping") showColumnsDropdown = false;
		if (except !== "sort") showSortDropdown = false;
		if (except !== "tableCols") showTableColumnsDropdown = false;
	}

	/** @param {HTMLElement} node */
	function smartAlign(node) {
		function align() {
			node.style.left = "0";
			node.style.right = "auto";
			const rect = node.getBoundingClientRect();
			if (rect.right > window.innerWidth - 10) {
				node.style.left = "auto";
				node.style.right = "0";
			}
		}
		align();
		window.addEventListener("resize", align);
		return {
			destroy() {
				window.removeEventListener("resize", align);
			},
		};
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
	}

	onMount(() => {
		/** @param {KeyboardEvent} e */
		const handleGlobalKeydown = (e) => {
			const isCmdCtrl = e.metaKey || e.ctrlKey;
			if (isCmdCtrl && e.key.toLowerCase() === "s") {
				const isUnnamed =
					!deckStore.name || deckStore.name === "Untitled Deck";
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

<div
	class="deck-header"
	class:is-top-bar={isTopBar}
	class:is-scrolled={isScrolled}
	bind:this={headerEl}
>
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
					{#if deckImage() && !deckImageError}
						<img
							src={deckImage()}
							alt="Deck Preview"
							class="deck-art"
							onerror={() => {
								deckImageError = true;
							}}
						/>
					{:else}
						<div class="deck-art-placeholder">
							<Image size={18} class="placeholder-icon" />
						</div>
					{/if}
				</div>
			</div>

			<div class="name-and-meta-column">
				<div
					class="deck-title-wrapper"
					title={deckStore.name || "Untitled Deck"}
				>
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
								if (showBoardDropdown)
									closeAllDropdowns("board");
							}}
							aria-expanded={showBoardDropdown}
							aria-haspopup="listbox"
						>
							<span class="board-label">
								{deckStore.currentBoardCount} Card {boards.find(
									(b) => b.id === deckStore.activeBoard,
								)?.label}
							</span>
							<ChevronDown size={13} class="chevron" />
						</button>

						{#if showBoardDropdown}
							<div
								class="board-dropdown-menu"
								use:smartAlign
								transition:fly={{ y: 4, duration: 150 }}
							>
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
										<span class="item-count">
											{board.id === "mainboard"
												? deckStore.mainboard.length +
													deckStore.commander.length +
													deckStore.companion.length
												: deckStore[board.id].length}
										</span>
									</button>
								{/each}
							</div>
						{/if}
					</div>

					{#if deckStore.activeBoard === "maybeboard" && deckStore.maybeboard.length >= 80}
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
							<span class="warning-text"
								>{deckStore.maybeboard.length}/100</span
							>
						</button>
					{/if}

					{#if authStore.isAuthenticated && (deckStore.syncState.isSyncing || deckStore.syncState.error)}
						<div class="sync-indicator-container">
							{#if deckStore.syncState.isSyncing}
								<span
									class="sync-status is-syncing"
									title="Syncing with cloud..."
								>
									<RefreshCw
										size={11}
										class="icon animate-spin"
									/>
								</span>
							{:else if deckStore.syncState.error}
								<span
									class="sync-status has-error"
									title={deckStore.syncState.error}
								>
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
			<!-- Display Column with DISPLAY eyebrow -->
			<div class="control-column">
				<span class="eyebrow-label">DISPLAY</span>
				<div
					class="view-mode-group"
					role="radiogroup"
					aria-label="Deck View Mode"
				>
					<button
						type="button"
						role="radio"
						aria-checked={settingsStore.deckViewMode === "stacks"}
						class="view-toggle-btn"
						class:active={settingsStore.deckViewMode === "stacks"}
						onclick={() => (settingsStore.deckViewMode = "stacks")}
						title="Stacks View"
						aria-label="Stacks View"
					>
						<Layers size={15} />
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={settingsStore.deckViewMode === "list"}
						class="view-toggle-btn"
						class:active={settingsStore.deckViewMode === "list"}
						onclick={() => (settingsStore.deckViewMode = "list")}
						title="List / Text View"
						aria-label="List / Text View"
					>
						<List size={15} />
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={settingsStore.deckViewMode === "spoiler"}
						class="view-toggle-btn"
						class:active={settingsStore.deckViewMode === "spoiler"}
						onclick={() => (settingsStore.deckViewMode = "spoiler")}
						title="Spoiler View"
						aria-label="Spoiler View"
					>
						<Image size={15} />
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={settingsStore.deckViewMode === "table"}
						class="view-toggle-btn"
						class:active={settingsStore.deckViewMode === "table"}
						onclick={() => (settingsStore.deckViewMode = "table")}
						title="Table View"
						aria-label="Table View"
					>
						<Table size={15} />
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={settingsStore.deckViewMode === "stats"}
						class="view-toggle-btn"
						class:active={settingsStore.deckViewMode === "stats"}
						onclick={() => (settingsStore.deckViewMode = "stats")}
						title="Stats View"
						aria-label="Stats View"
					>
						<BarChart2 size={15} />
					</button>
					<button
						type="button"
						role="radio"
						aria-checked={settingsStore.deckViewMode === "more"}
						class="view-toggle-btn"
						class:active={settingsStore.deckViewMode === "more"}
						onclick={() =>
							(settingsStore.deckViewMode = "more")}
						title="More Tools (Sample Hand, Tokens, Combos)"
						aria-label="More Tools"
					>
						<MoreHorizontal size={15} />
					</button>
				</div>
			</div>

			<!-- Grouping Column with GROUPING eyebrow -->
			{#if !["list", "stats", "more", "settings"].includes(settingsStore.deckViewMode)}
				<div class="control-column">
					<span class="eyebrow-label">GROUPING</span>
					<div class="grouping-controls-row">
						<!-- Grouping Dropdown -->
						<div class="grouping-container">
							<button
								class="header-select-trigger grouping-trigger"
								class:active={showColumnsDropdown}
								onclick={(e) => {
									e.stopPropagation();
									showColumnsDropdown = !showColumnsDropdown;
									if (showColumnsDropdown)
										closeAllDropdowns("grouping");
								}}
								aria-expanded={showColumnsDropdown}
								aria-haspopup="listbox"
								title="Group cards by"
							>
								<span class="trigger-value full-label"
									>{curGroupingCol?.label || "Grouping"}</span
								>
								<span class="trigger-value short-label"
									>{curGroupingCol?.shortLabel ||
										curGroupingCol?.label ||
										"Grouping"}</span
								>
								<ChevronDown size={13} class="chevron" />
							</button>

							{#if showColumnsDropdown}
								<div
									class="header-select-menu"
									use:smartAlign
									transition:fly={{ y: 4, duration: 150 }}
								>
									{#each visibleGroupings as col}
										<button
											class="select-item"
											class:active={deckStore.grouping ===
												col.id}
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
						{#if settingsStore.deckViewMode === "stacks" && deckStore.grouping !== "freeform"}
							<Button
								variant={deckStore.splitView
									? "toggle-active"
									: "ghost"}
								size="icon"
								class="modifier-btn {deckStore.splitView
									? 'bg-secondary'
									: ''}"
								onclick={() =>
									(deckStore.splitView =
										!deckStore.splitView)}
								title={deckStore.grouping === "type"
									? "Toggle Type Split View (Creatures / Non-Creatures)"
									: "Toggle Spell / Land Row Split View"}
							>
								{#if deckStore.grouping === "type"}
									<StretchVertical size={15} />
								{:else}
									<StretchHorizontal size={15} />
								{/if}
							</Button>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Table Columns Column with COLUMNS eyebrow -->
			{#if settingsStore.deckViewMode === "table"}
				<div class="control-column">
					<span class="eyebrow-label">COLUMNS</span>
					<div class="table-cols-container">
						<button
							class="header-select-trigger"
							class:active={showTableColumnsDropdown}
							onclick={(e) => {
								e.stopPropagation();
								showTableColumnsDropdown =
									!showTableColumnsDropdown;
								if (showTableColumnsDropdown)
									closeAllDropdowns("tableCols");
							}}
							aria-expanded={showTableColumnsDropdown}
							aria-haspopup="listbox"
							title="Toggle visible columns"
						>
							<span class="trigger-value">
								{settingsStore.visibleColumns.length === 8
									? "All"
									: `${settingsStore.visibleColumns.length} Cols`}
							</span>
							<ChevronDown size={13} class="chevron" />
						</button>

						{#if showTableColumnsDropdown}
							<div
								class="header-select-menu"
								use:smartAlign
								transition:fly={{ y: 4, duration: 150 }}
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

			<!-- Sort Column with SORT eyebrow -->
			{#if ["stacks", "spoiler", "table"].includes(settingsStore.deckViewMode)}
				<div class="control-column">
					<span class="eyebrow-label">SORT</span>
					<div class="sort-container">
						<button
							class="header-select-trigger sort-trigger"
							class:active={showSortDropdown}
							onclick={(e) => {
								e.stopPropagation();
								showSortDropdown = !showSortDropdown;
								if (showSortDropdown) closeAllDropdowns("sort");
							}}
							aria-expanded={showSortDropdown}
							aria-haspopup="listbox"
							title={isMultiSort
								? `${deckStore.activeSorts.length} sort levels active (click to configure)`
								: "Sort cards by"}
						>
							<span class="trigger-value">
								{currentSortLabel}
								{#if isMultiSort}
									<span class="sort-plus-badge">+</span>
								{/if}
							</span>
							<ChevronDown size={13} class="chevron" />
						</button>

						{#if showSortDropdown}
							<div
								class="header-select-menu"
								use:smartAlign
								transition:fly={{ y: 4, duration: 150 }}
							>
								<button
									class="select-item"
									class:active={isDefaultSort}
									onclick={(e) => {
										e.stopPropagation();
										selectSortOption("default");
									}}
								>
									Default
								</button>
								{#each basicSortOptions as opt}
									<button
										class="select-item"
										class:active={isSingleSortActive(
											opt.id,
										)}
										onclick={(e) => {
											e.stopPropagation();
											selectSortOption(opt.id);
										}}
									>
										{opt.label}
									</button>
								{/each}
								<div class="menu-divider"></div>
								<button
									class="select-item advanced-item"
									class:active={isMultiSort}
									onclick={(e) => {
										e.stopPropagation();
										openAdvancedSort();
									}}
								>
									<span>Advanced...</span>
									{#if isMultiSort}
										<span class="advanced-count-pill"
											>{deckStore.activeSorts
												.length}</span
										>
									{/if}
								</button>
							</div>
						{/if}
					</div>
				</div>

				<MultiSortModal bind:isOpen={showDisplaySort} target="deck" />

				<!-- View Options Modal Trigger -->
				<div class="view-options-container">
					<Button
						variant={showViewOptionsModal
							? "toggle-active"
							: "ghost"}
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
				<div class="control-column">
					<span class="eyebrow-label">SECTIONS</span>
					<div
						class="stats-subtabs-group"
						role="radiogroup"
						aria-label="Stats Sections"
					>
						{#each [
							{ id: "overview", label: "Overview" },
							{ id: "mana-curve", label: "Mana Curve" },
							{ id: "card-types", label: "Card Types" },
							{ id: "colors", label: "Colors" },
							{ id: "budget", label: "Budget" }
						] as sec}
							<button
								type="button"
								role="radio"
								aria-checked={settingsStore.statsSection === sec.id}
								class="stats-tab-btn"
								class:active={settingsStore.statsSection === sec.id}
								onclick={() => {
									settingsStore.statsSection = sec.id;
									const el = document.getElementById(`stats-${sec.id}`);
									if (el) {
										el.scrollIntoView({ behavior: "smooth", block: "start" });
									}
								}}
							>
								{sec.label}
							</button>
						{/each}
					</div>
				</div>
			{/if}

			{#if settingsStore.deckViewMode === "more"}
				<div class="control-column">
					<span class="eyebrow-label">SECTIONS</span>
					<div
						class="stats-subtabs-group"
						role="radiogroup"
						aria-label="More Tools Sub-tab"
					>
						<button
							type="button"
							role="radio"
							aria-checked={settingsStore.statsSubTab === "sample-hand"}
							class="stats-tab-btn"
							class:active={settingsStore.statsSubTab === "sample-hand"}
							onclick={() => (settingsStore.statsSubTab = "sample-hand")}
						>
							Sample Hand
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={settingsStore.statsSubTab === "tokens"}
							class="stats-tab-btn"
							class:active={settingsStore.statsSubTab === "tokens"}
							onclick={() => (settingsStore.statsSubTab = "tokens")}
						>
							Tokens
						</button>
						<button
							type="button"
							role="radio"
							aria-checked={settingsStore.statsSubTab === "combos"}
							class="stats-tab-btn"
							class:active={settingsStore.statsSubTab === "combos"}
							onclick={() => (settingsStore.statsSubTab = "combos")}
						>
							Combos
						</button>
					</div>
				</div>
			{/if}

			<!-- Card Search Column with CARD SEARCH eyebrow -->
			{#if settingsStore.deckViewMode === "stacks" || settingsStore.deckViewMode === "spoiler"}
				<div class="control-column search-column">
					<span class="eyebrow-label">CARD SEARCH</span>
					<button
						class="deck-search-btn"
						onclick={() => {
							if (searchStore.isOpen) {
								searchStore.closeSearch();
							} else {
								searchStore.openSearch();
								setTimeout(() => {
									const inputEl =
										document.querySelector(
											".header-search-input input",
										) ||
										document.querySelector(
											".header-search-input",
										);
									/** @type {HTMLElement | null} */ (
										inputEl
									)?.focus();
								}, 50);
							}
						}}
						aria-label="Card search (⌘/ or /)"
						title="Card Search (⌘/ or /)"
					>
						<div class="deck-search-left">
							<Search size={14} class="deck-search-icon" />
							{#key placeholderIndex}
								<span
									class="deck-search-text"
									in:fade={{ duration: 160 }}
								>
									{searchHints[placeholderIndex]}
								</span>
							{/key}
						</div>
						<div class="shortcut-keycaps">
							<kbd class="key-cap">⌘</kbd>
							<kbd class="key-cap">/</kbd>
						</div>
					</button>
				</div>
			{/if}
		{/if}
	</div>
</div>

{#if showAboutModal}
	<div
		class="about-backdrop"
		onclick={(e) => {
			if (e.target === e.currentTarget) showAboutModal = false;
		}}
		role="presentation"
		transition:fade={{ duration: 150 }}
	>
		<div class="about-card" transition:fly={{ y: 10, duration: 200 }}>
			<div class="about-header">
				<h3>About Budgie</h3>
				<button
					class="close-btn"
					onclick={() => (showAboutModal = false)}
				>
					&times;
				</button>
			</div>
			<div class="about-body">
				<p>
					<strong>Budgie</strong> is a fast, beautiful Magic: The Gathering
					deckbuilder built for rapid brewing and gorgeous visual sorting.
				</p>
				<p>
					Syncs seamlessly with cloud storage and local database
					caching.
				</p>
				<div class="about-footer">
					<span>Version 1.0.0</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.deck-header {
		min-height: 82px;
		height: auto;
		background: #0f1219;
		border-top-left-radius: 11px;
		border-top-right-radius: 11px;
		border-bottom: 1px solid transparent;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 12px 20px;
		position: relative;
		z-index: 20;
		box-sizing: border-box;
		user-select: none;
		transition:
			border-bottom-color 0.2s ease,
			box-shadow 0.2s ease,
			border-radius 0.24s cubic-bezier(0.16, 1, 0.3, 1);
	}

	:global(.top-nav-hidden) .deck-header {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}


	.deck-header.is-scrolled {
		border-bottom-color: rgba(255, 255, 255, 0.08);
		box-shadow:
			0 6px 20px -2px rgba(0, 0, 0, 0.5),
			0 2px 6px rgba(0, 0, 0, 0.3);
	}

	.deck-header.is-top-bar {
		min-height: 82px;
		height: auto;
		background: #0f1219;
		backdrop-filter: none;
		border-bottom: 1px solid transparent;
		box-shadow: 0 4px 16px rgba(0, 0, 0, 0);
	}

	.deck-header.is-top-bar.is-scrolled {
		border-bottom-color: rgba(255, 255, 255, 0.08);
		box-shadow:
			0 6px 20px -2px rgba(0, 0, 0, 0.5),
			0 2px 6px rgba(0, 0, 0, 0.3);
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
		margin: 0 0 0 -8px;
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
		box-shadow:
			0 3px 10px rgba(0, 0, 0, 0.45),
			inset 0 0 0 1px rgba(255, 255, 255, 0.12);
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

	.deck-title-text,
	.unnamed-prompt {
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
		align-items: flex-end;
		gap: 1.15rem;
		flex-shrink: 0;
	}

	.control-column {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.eyebrow-label {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.03em;
		color: #94a3b8;
		text-transform: uppercase;
		line-height: 1;
		user-select: none;
		white-space: nowrap;
	}

	.grouping-controls-row {
		display: flex;
		align-items: center;
		gap: 6px;
	}

	.deck-search-btn {
		display: inline-flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.65rem;
		height: 36px;
		width: 215px;
		min-width: 215px;
		padding: 0 10px 0 14px;
		border-radius: 9999px;
		color: #94a3b8;
		border: 1px solid rgba(255, 255, 255, 0.08);
		background: #080b11;
		box-sizing: border-box;
		cursor: pointer;
		transition: all 0.15s ease;
		outline: none;
		white-space: nowrap;
	}

	.deck-search-btn:hover {
		color: #f8fafc;
		background: #141923;
		border-color: rgba(255, 255, 255, 0.14);
	}

	.deck-search-btn:hover :global(.deck-search-icon),
	.deck-search-btn:hover .deck-search-text {
		color: #e2e8f0;
	}

	.deck-search-btn:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -1px;
	}

	.deck-search-left {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
		flex: 1;
		overflow: hidden;
	}

	:global(.deck-search-icon) {
		color: #94a3b8;
		flex-shrink: 0;
		transition: color 0.15s ease;
	}

	.deck-search-text {
		font-size: 13px;
		font-weight: 400;
		color: #94a3b8;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		transition: color 0.15s ease;
	}

	.shortcut-keycaps {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.key-cap {
		font-size: 10px;
		padding: 1px 3.5px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 3px;
		color: #94a3b8;
		line-height: 1;
		font-family: inherit;
	}

	.view-mode-group {
		display: inline-flex;
		align-items: center;
		background: #080b11;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md, 6px);
		padding: 2px;
		gap: 2px;
		height: 36px;
		box-sizing: border-box;
	}

	.view-toggle-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 30px;
		width: 30px;
		padding: 0;
		border: none;
		background: transparent;
		border-radius: var(--radius-sm, 3px);
		color: #94a3b8;
		cursor: pointer;
		transition: all 0.15s ease;
		outline: none;
		margin: 0;
		box-sizing: border-box;
	}

	.view-toggle-btn:hover:not(.active) {
		color: #f8fafc;
		background: rgba(255, 255, 255, 0.06);
	}

	.view-toggle-btn:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -1px;
	}

	.view-toggle-btn.active {
		background: #252b3b;
		color: #ffffff;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.14) inset,
			0 1px 3px rgba(0, 0, 0, 0.4);
	}

	.grouping-container,
	.sort-container,
	.table-cols-container,
	.view-options-container {
		position: relative;
	}

	.header-select-trigger {
		height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0 12px;
		background: #080b11;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md, 6px);
		color: #cbd5e1;
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
		outline: none;
	}

	.header-select-trigger:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -1px;
	}

	.grouping-trigger {
		min-width: 125px;
		padding: 0 12px;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.sort-trigger {
		min-width: 110px;
		padding: 0 12px;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.sort-plus-badge {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 700;
		color: hsl(var(--primary));
		background: hsl(var(--primary) / 0.16);
		border-radius: 3px;
		padding: 0 4px;
		margin-left: 5px;
		line-height: 1.2;
		vertical-align: middle;
	}

	.menu-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.08);
		margin: 3px 6px;
	}

	.advanced-item {
		display: flex;
		align-items: center;
		justify-content: space-between;
		font-weight: 500;
	}

	.advanced-count-pill {
		font-size: 10px;
		font-weight: 700;
		background: hsl(var(--primary) / 0.2);
		color: hsl(var(--primary));
		border-radius: 9999px;
		padding: 1px 6px;
		line-height: 1.2;
	}

	:global(.grouping-icon) {
		color: #94a3b8;
		flex-shrink: 0;
		transition: color 0.15s ease;
	}

	.grouping-trigger:hover :global(.grouping-icon),
	.grouping-trigger.active :global(.grouping-icon) {
		color: #f8fafc;
	}

	.table-cols-container .header-select-trigger {
		min-width: 95px;
		padding: 0 12px;
		justify-content: space-between;
	}

	.header-select-trigger:hover {
		background: #141923;
		color: #f8fafc;
		border-color: rgba(255, 255, 255, 0.14);
	}

	.header-select-trigger.active {
		background: #1c2230;
		color: #f8fafc;
		border-color: rgba(255, 255, 255, 0.16);
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.08) inset;
	}

	.header-select-menu {
		position: absolute;
		top: calc(100% + 4px);
		right: 0;
		min-width: 150px;
		background: #0f1219;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: var(--radius-md, 6px);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
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
		color: #94a3b8;
		background: none;
		border: none;
		border-radius: var(--radius-sm, 3px);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.select-item:hover {
		background: rgba(255, 255, 255, 0.08);
		color: #f8fafc;
	}

	.select-item.active {
		background: rgba(99, 102, 241, 0.15);
		color: #a5b4fc;
		font-weight: 600;
	}

	.checkbox-indicator {
		width: 14px;
		height: 14px;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 3px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #080b11;
	}

	:global(.modifier-btn) {
		height: 36px !important;
		width: 36px !important;
		padding: 0 !important;
		border-radius: var(--radius-md, 6px) !important;
		color: #94a3b8 !important;
		border: 1px solid rgba(255, 255, 255, 0.08) !important;
		background: #080b11 !important;
		box-sizing: border-box !important;
		transition: all 0.15s ease !important;
	}

	:global(.modifier-btn:hover) {
		color: #f8fafc !important;
		background: #141923 !important;
		border-color: rgba(255, 255, 255, 0.14) !important;
	}

	:global(.modifier-btn.custom-sort-active),
	:global(button.variant-toggle-active.modifier-btn) {
		background: #1c2230 !important;
		color: #f8fafc !important;
		border-color: rgba(255, 255, 255, 0.16) !important;
		box-shadow:
			0 1px 3px rgba(0, 0, 0, 0.4),
			0 0 0 1px rgba(255, 255, 255, 0.08) inset !important;
	}

	:global(.modifier-btn.custom-sort-active) {
		color: #818cf8 !important;
	}

	:global(.modifier-btn.custom-sort-active:hover) {
		background: #242c3d !important;
		border-color: rgba(99, 102, 241, 0.4) !important;
	}

	.stats-subtabs-group {
		display: inline-flex;
		align-items: center;
		background: #080b11;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md, 6px);
		padding: 2px;
		gap: 2px;
		height: 36px;
		box-sizing: border-box;
	}

	.stats-tab-btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 30px;
		padding: 0 12px;
		font-size: 13px;
		font-weight: 500;
		color: #94a3b8;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm, 3px);
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		outline: none;
		box-sizing: border-box;
	}

	.stats-tab-btn:hover:not(.active) {
		color: #f8fafc;
		background: rgba(255, 255, 255, 0.06);
	}

	.stats-tab-btn:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -1px;
	}

	.stats-tab-btn.active {
		background: #252b3b;
		color: #ffffff;
		font-weight: 600;
		box-shadow:
			0 0 0 1px rgba(255, 255, 255, 0.14) inset,
			0 1px 3px rgba(0, 0, 0, 0.4);
	}

	:global(.chevron) {
		opacity: 0.6;
	}

	/* Responsive Breakpoint Adaptations */
	@media (max-width: 1250px) {
		.full-label {
			display: none;
		}
		.short-label {
			display: inline;
		}
		.deck-title-text {
			max-width: 150px;
		}
	}

	@media (min-width: 1251px) {
		.full-label {
			display: inline;
		}
		.short-label {
			display: none;
		}
	}

	@media (max-width: 1100px) {
		.shortcut-keycaps {
			display: none;
		}
		.deck-title-text {
			max-width: 120px;
		}
	}

	@media (max-width: 950px) {
		.deck-search-text {
			display: none;
		}
		.deck-search-btn {
			padding: 0 8px;
			width: auto;
			min-width: auto;
		}
		.board-label {
			display: none;
		}
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
