<script>
	import { slide, fade, fly } from "svelte/transition";
	import {
		ChevronDown,
		ChevronUp,
		Search,
		HelpCircle,
		SlidersHorizontal,
		X,
		LogOut,
		Palette,
		Settings as SettingsIcon,
		ArrowDownWideNarrow,
		PanelLeft,
	} from "lucide-svelte";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { toastStore } from "$lib/stores/toast.svelte.js";
	import { isCommanderFormat } from "$lib/constants/formats.js";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";

	import Input from "./ui/Input.svelte";
	import SearchOptionsModal from "./SearchOptionsModal.svelte";
	import ViewOptionsModal from "./ViewOptionsModal.svelte";
	import DisplayNamePromptModal from "./DisplayNamePromptModal.svelte";
	import ConfirmModal from "./ConfirmModal.svelte";
	import MultiSortModal from "./MultiSortModal.svelte";

	let showCollectionDropdown = $state(false);
	let showSearchOptions = $state(false);
	/** @type {HTMLElement | null} */
	let searchSettingsBtn = $state(null);
	let showProfileDropdown = $state(false);
	let showBudgieDropdown = $state(false);
	let showViewOptionsModal = $state(false);
	let showAboutModal = $state(false);
	let showSearchSort = $state(false);
	let isVerticalLayout = $state(false);
	let collectionWidth = $state(0);
	let sortBtnWidth = $state(0);

	const curvedPathD = $derived(() => {
		const w = collectionWidth || 150;
		const cutX = Math.round((w - 19.23) * 100) / 100;
		return `M 6 0.5 L ${cutX} 0.5 A 26 26 0 0 0 ${cutX} 35.5 L 6 35.5 A 5.5 5.5 0 0 1 0.5 30 L 0.5 6 A 5.5 5.5 0 0 1 6 0.5 Z`;
	});

	const rightCurvedPathD = $derived(() => {
		const w = sortBtnWidth || 58;
		return `M 19.23 0.5 L ${w - 6} 0.5 A 5.5 5.5 0 0 1 ${w - 0.5} 6 L ${w - 0.5} 30 A 5.5 5.5 0 0 1 ${w - 6} 35.5 L 19.23 35.5 A 26 26 0 0 0 19.23 0.5 Z`;
	});

	const isCustomSearchSortActive = $derived(() => {
		return Boolean(
			searchStore.activeSorts && searchStore.activeSorts.length > 0,
		);
	});

	const searchPlaceholders = ["Lightning Bolt", "is:commander id=gw"];
	let placeholderIndex = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			placeholderIndex =
				(placeholderIndex + 1) % searchPlaceholders.length;
		}, 4000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (searchStore.isOpen) {
			setTimeout(() => {
				const inputEl =
					document.querySelector(".header-search-input input") ||
					document.querySelector(".header-search-input");
				/** @type {HTMLElement | null} */ (inputEl)?.focus();
			}, 60);
		}
	});

	const isDeckPage = $derived(
		Boolean($page.params.id) && $page.url.pathname.startsWith("/decks/"),
	);

	const isAutoHideActive = $derived(
		isDeckPage && settingsStore.autoHideDeckbuilderNav
	);

	let isNearTop = $state(false);
	let isHeaderHovered = $state(false);
	let isFocusedWithin = $state(false);
	/** @type {ReturnType<typeof setTimeout> | null} */
	let leaveTimer = null;

	const isHeaderRevealed = $derived(
		!isAutoHideActive ||
		searchStore.isOpen ||
		isNearTop ||
		isHeaderHovered ||
		isFocusedWithin ||
		showBudgieDropdown ||
		showProfileDropdown ||
		showAboutModal ||
		showSearchOptions ||
		showViewOptionsModal ||
		showSearchSort
	);

	function handleTriggerMouseEnter() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
		isNearTop = true;
	}

	function handleHeaderMouseEnter() {
		if (leaveTimer) {
			clearTimeout(leaveTimer);
			leaveTimer = null;
		}
		isHeaderHovered = true;
	}

	function handleHeaderMouseLeave() {
		isHeaderHovered = false;
		if (leaveTimer) clearTimeout(leaveTimer);
		leaveTimer = setTimeout(() => {
			isNearTop = false;
			leaveTimer = null;
		}, 250);
	}

	function handleHeaderFocusIn() {
		isFocusedWithin = true;
	}

	/** @param {FocusEvent} e */
	function handleHeaderFocusOut(e) {
		const currentTarget = /** @type {HTMLElement} */ (e.currentTarget);
		if (!currentTarget.contains(/** @type {Node | null} */ (e.relatedTarget))) {
			isFocusedWithin = false;
		}
	}

	/** @param {MouseEvent} e */
	function handleWindowMouseMove(e) {
		if (!isAutoHideActive || searchStore.isOpen) return;
		if (e.clientY <= 12) {
			if (leaveTimer) {
				clearTimeout(leaveTimer);
				leaveTimer = null;
			}
			isNearTop = true;
		} else if (e.clientY > 54 && !isHeaderHovered && isNearTop) {
			if (!leaveTimer) {
				leaveTimer = setTimeout(() => {
					isNearTop = false;
					leaveTimer = null;
				}, 220);
			}
		}
	}

	function handleNewDeck() {
		showBudgieDropdown = false;
		showProfileDropdown = false;
		if (typeof window !== "undefined") {
			window.open("/decks/new", "_blank");
		}
	}

	async function handleSignOut() {
		showProfileDropdown = false;
		await authStore.signOut();
	}

	const collections = [
		{ id: "scryfall", label: "All Cards (Scryfall)" },
		{ id: "collection", label: "My Collection (Empty)", disabled: true },
		{ divider: true },
		{ id: "sideboard", label: "Deck Sideboard" },
		{ id: "maybeboard", label: "Deck Maybeboard" },
		{ divider: true },
		{ id: "budget-edh-26.2", label: "Budget EDH 26.2" },
		{ id: "budget-staples", label: "Budget Staples" },
		{ divider: true },
		{ id: "new", label: "Create New+" },
	];

	const activeCollection = $derived(
		collections.find((c) => c.id === searchStore.collection) ||
			collections[0],
	);

	const activeLabel = $derived(activeCollection?.label || "Collection");
	const activeShortLabel = $derived(activeLabel.split(" (")[0]);

	const collectionButtonText = $derived(
		["sideboard", "maybeboard"].includes(searchStore.collection)
			? `Browse ${activeShortLabel}`
			: `Search ${activeShortLabel}`,
	);

	const showHelpIcon = $derived(
		searchStore.isFocused && searchStore.query === "",
	);

	/** @param {string} id */
	function selectCollection(id) {
		if (id === "new") {
			alert("Create new collection functionality coming soon!");
			showCollectionDropdown = false;
			return;
		}
		searchStore.collection = id;
		showCollectionDropdown = false;
	}

	/** @param {string} except */
	function closeAllDropdowns(except = "") {
		if (except !== "collection") showCollectionDropdown = false;
		if (except !== "profile") showProfileDropdown = false;
		if (except !== "budgie") showBudgieDropdown = false;
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
	function handleClickOutside(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target.closest(".collection-selector")) {
			showCollectionDropdown = false;
		}
		if (!target.closest(".profile-menu-container")) {
			showProfileDropdown = false;
		}
		if (!target.closest(".budgie-menu-container")) {
			showBudgieDropdown = false;
		}
	}

	/** @param {any} card */
	function addSearchCard(card) {
		if (!card) return;
		const isLocalBoard = ["sideboard", "maybeboard"].includes(
			searchStore.collection,
		);
		const currentBoard = searchStore.collection;
		const price =
			searchStore.collection === "scryfall"
				? card.prices?.usd
					? parseFloat(card.prices.usd)
					: null
				: priceStore.getPrice(card.name);

		if (isLocalBoard) {
			deckStore.moveCard(
				card.name,
				currentBoard,
				deckStore.activeBoard,
				card.id,
				price,
			);
		} else {
			let targetBoard = deckStore.activeBoard;
			const meta = card.type_line
				? card
				: deckStore.metadata[card.name?.toLowerCase()] || card;
			const typeLine = (meta.type_line || "").toLowerCase();
			const oracle = (meta.oracle_text || "").toLowerCase();
			const facesOracle = (meta.card_faces || [])
				.map((/** @type {any} */ f) =>
					(f.oracle_text || "").toLowerCase(),
				)
				.join(" ");
			const isLegendaryCreature =
				typeLine.includes("legendary") && typeLine.includes("creature");
			const isPlaneswalker = typeLine.includes("planeswalker");
			const canBeCommander =
				oracle.includes("can be your commander") ||
				facesOracle.includes("can be your commander");
			const isCompanion =
				oracle.includes("companion —") ||
				facesOracle.includes("companion —");
			const isCommander = isCommanderFormat(deckStore.format);

			const isCommanderCandidate =
				isLegendaryCreature ||
				canBeCommander ||
				(deckStore.format === "Brawl" && isPlaneswalker);

			const isDeckEmpty = deckStore.totalCount === 0;
			const isFormatUnset =
				!deckStore.format ||
				deckStore.format === "List" ||
				deckStore.format === "None" ||
				deckStore.format === "Draft";

			if (isDeckEmpty && isFormatUnset && isCommanderCandidate) {
				deckStore.format = "Commander";
				targetBoard = "commander";
				toastStore.show(
					`Set format to Commander with ${card.name} as your commander.`,
				);
			} else if (
				isCommander &&
				deckStore.commander.length === 0 &&
				isCommanderCandidate
			) {
				targetBoard = "commander";
			} else if (isCompanion && deckStore.companion.length === 0) {
				targetBoard = "companion";
			}
			deckStore.addCard(card.name, targetBoard, price, card);
		}
	}

	/** @param {KeyboardEvent} e */
	function handleGlobalKeyDown(e) {
		const isCmdOrCtrl = e.metaKey || e.ctrlKey;
		const target = /** @type {HTMLElement | null} */ (
			document.activeElement
		);
		const isInput =
			["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "") ||
			target?.isContentEditable;
		const isModalOpen =
			document.querySelector(
				".modal-backdrop, .about-backdrop, [role='dialog']",
			) !== null;

		// Primary: Cmd + / or Ctrl + / (and Cmd + K / Cmd + Space as secondary fallbacks)
		if (
			isCmdOrCtrl &&
			(e.key === "/" || e.key.toLowerCase() === "k" || e.key === " ")
		) {
			e.preventDefault();
			if (searchStore.isOpen) {
				searchStore.closeSearch();
			} else {
				searchStore.openSearch();
				setTimeout(() => {
					const inputEl =
						document.querySelector(".header-search-input input") ||
						document.querySelector(".header-search-input");
					/** @type {HTMLElement | null} */ (inputEl)?.focus();
				}, 50);
			}
			return;
		}

		// Fallback: '/' shortcut when NOT typing inside any input and NOT inside an open modal
		if (e.key === "/" && !isInput && !isCmdOrCtrl && !isModalOpen) {
			e.preventDefault();
			if (!searchStore.isOpen) {
				searchStore.openSearch();
			}
			setTimeout(() => {
				const inputEl =
					document.querySelector(".header-search-input input") ||
					document.querySelector(".header-search-input");
				/** @type {HTMLElement | null} */ (inputEl)?.focus();
			}, 50);
			return;
		}

		// Escape closes search when search is open
		if (e.key === "Escape" && searchStore.isOpen) {
			searchStore.closeSearch();
		}
	}
</script>

<svelte:window
	onclick={handleClickOutside}
	onkeydown={handleGlobalKeyDown}
	onmousemove={handleWindowMouseMove}
/>

{#if isAutoHideActive && !searchStore.isOpen}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="top-nav-trigger-zone"
		onmouseenter={handleTriggerMouseEnter}
		aria-hidden="true"
	></div>
{/if}

<!-- Thin Global Header Bar -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<header
	class="global-header-bar"
	class:on-deck-page={isDeckPage}
	class:is-auto-hide={isAutoHideActive && !searchStore.isOpen}
	class:is-revealed={isHeaderRevealed}
	onmouseenter={handleHeaderMouseEnter}
	onmouseleave={handleHeaderMouseLeave}
	onfocusin={handleHeaderFocusIn}
	onfocusout={handleHeaderFocusOut}
>
	<div class="global-header-left">
		<div class="budgie-menu-container">
			<button
				type="button"
				class="global-nav-link dropdown-trigger"
				class:active={showBudgieDropdown}
				onclick={(e) => {
					e.stopPropagation();
					showBudgieDropdown = !showBudgieDropdown;
					if (showBudgieDropdown) closeAllDropdowns("budgie");
				}}
				aria-expanded={showBudgieDropdown}
				aria-haspopup="menu"
				aria-label="Budgie menu"
			>
				<span>Budgie</span>
				<ChevronDown size={12} class="nav-chevron" />
			</button>

			{#if showBudgieDropdown}
				<div
					class="budgie-dropdown"
					transition:fade={{ duration: 120 }}
				>
					<a
						href="/browse"
						class="menu-item nav-link"
						onclick={() => (showBudgieDropdown = false)}
					>
						<Search size={14} />
						<span>Explore Decks</span>
					</a>
					<a
						href="/gallery"
						class="menu-item nav-link"
						onclick={() => (showBudgieDropdown = false)}
					>
						<Palette size={14} />
						<span>Art Gallery</span>
					</a>
					<div class="menu-divider"></div>
					<button
						type="button"
						class="menu-item"
						onclick={() => {
							showBudgieDropdown = false;
							showAboutModal = true;
						}}
					>
						<HelpCircle size={14} />
						<span>About Budgie</span>
					</button>
				</div>
			{/if}
		</div>
	</div>

	<div class="global-header-right">
		<nav class="global-nav">
			<a
				href="/decks"
				class="global-nav-link"
				class:active={$page.url.pathname === "/decks"}
			>
				Your Decks
			</a>

			<button
				type="button"
				class="global-nav-link"
				onclick={handleNewDeck}
			>
				New Deck
			</button>

			<!-- AmateurArchitect / User Profile Item -->
			<div class="user-menu-wrapper">
				{#if authStore.isLoading}
					<div class="auth-loading-spinner spinner"></div>
				{:else if authStore.isAuthenticated && authStore.user}
					<div class="profile-menu-container">
						<button
							type="button"
							class="global-nav-link dropdown-trigger"
							class:active={showProfileDropdown}
							onclick={(e) => {
								e.stopPropagation();
								showProfileDropdown = !showProfileDropdown;
								if (showProfileDropdown)
									closeAllDropdowns("profile");
							}}
							aria-expanded={showProfileDropdown}
							aria-haspopup="menu"
							aria-label="User menu"
						>
							<span class="user-display-name">
								{authStore.user.user_metadata?.display_name ||
									authStore.user.email?.split("@")[0] ||
									"AmateurArchitect"}
							</span>
							<ChevronDown size={12} class="nav-chevron" />
						</button>

						{#if showProfileDropdown}
							<div
								class="profile-dropdown"
								use:smartAlign
								transition:fade={{ duration: 120 }}
							>
								<div class="dropdown-header">
									<span class="dropdown-email"
										>{authStore.user.email}</span
									>
								</div>
								<div class="menu-divider"></div>
								<button
									type="button"
									class="menu-item"
									onclick={() => {
										showProfileDropdown = false;
										goto("/settings");
									}}
								>
									<SettingsIcon size={14} />
									<span>Settings</span>
								</button>
								<div class="menu-divider"></div>
								<button
									type="button"
									class="menu-item destructive"
									onclick={handleSignOut}
								>
									<LogOut size={14} />
									<span>Log Out</span>
								</button>
							</div>
						{/if}
					</div>
				{:else}
					<a
						href="/login?redirectTo={encodeURIComponent(
							$page.url.pathname,
						)}"
						class="global-nav-link"
						aria-label="Log In"
					>
						Log In
					</a>
				{/if}
			</div>
		</nav>
	</div>
</header>

<!-- Search Input Drawer (when Search is Open) -->
{#if searchStore.isOpen}
	<div class="search-drawer" transition:slide={{ duration: 180 }}>
		<div class="search-drawer-inner">
			<!-- Switch to Vertical Layout Button -->
			<button
				class="search-tool-btn"
				class:active={isVerticalLayout}
				onclick={() => (isVerticalLayout = !isVerticalLayout)}
				aria-label="Switch to vertical layout"
				title="Switch to vertical layout"
			>
				<PanelLeft size={15} />
			</button>

			<!-- Interlocking Curved Search Container (3-piece matching system) -->
			<div class="search-input-combo">
				<div class="collection-selector">
					<button
						class="collection-trigger"
						bind:clientWidth={collectionWidth}
						onclick={(e) => {
							e.stopPropagation();
							showCollectionDropdown = !showCollectionDropdown;
							if (showCollectionDropdown)
								closeAllDropdowns("collection");
						}}
						aria-expanded={showCollectionDropdown}
						aria-haspopup="listbox"
					>
						<svg
							class="curved-bg"
							viewBox="0 0 {collectionWidth || 150} 36"
							preserveAspectRatio="none"
						>
							<path d={curvedPathD()} />
						</svg>
						<span class="value-text">{collectionButtonText}</span>
						<ChevronDown size={13} class="chevron" />
					</button>

					{#if showCollectionDropdown}
						<div
							class="collection-menu"
							use:smartAlign
							transition:fly={{ y: 4, duration: 150 }}
						>
							{#each collections as item}
								{#if item.divider}
									<div class="menu-divider"></div>
								{:else}
									<button
										class="menu-item"
										class:active={searchStore.collection ===
											item.id}
										class:disabled={item.disabled}
										onclick={() =>
											!item.disabled &&
											item.id &&
											selectCollection(item.id)}
										disabled={item.disabled}
									>
										{item.label}
									</button>
								{/if}
							{/each}
						</div>
					{/if}
				</div>

				<!-- Rounded Pill Search Input -->
				<div
					class="search-input-group"
					class:is-focused={searchStore.isFocused}
				>
					<Search size={14} class="search-icon" />
					<div class="search-input-wrapper">
						<Input
							placeholder={searchPlaceholders[placeholderIndex]}
							class="header-search-input"
							bind:value={searchStore.query}
							onfocus={() => searchStore.setFocus(true)}
							onblur={() => searchStore.setFocus(false)}
							onkeydown={(/** @type {KeyboardEvent} */ e) => {
								if (e.key === "Escape") {
									searchStore.closeSearch();
									return;
								}
								if (e.key === "Tab") {
									const results = searchStore.results;
									if (
										!searchStore.isSearching &&
										results.length > 0 &&
										results.length <= 8 &&
										searchStore.query.trim().length > 0
									) {
										e.preventDefault();
										searchStore.cycleHighlight(
											e.shiftKey ? -1 : 1,
										);
									}
									return;
								}
								if (
									e.key === "Enter" &&
									!e.shiftKey &&
									!e.metaKey &&
									!e.ctrlKey &&
									!e.altKey
								) {
									const results = searchStore.results;
									if (
										!searchStore.isSearching &&
										results.length > 0 &&
										results.length <= 8 &&
										searchStore.query.trim().length > 0
									) {
										e.preventDefault();
										const targetIndex = Math.min(
											searchStore.highlightedIndex,
											results.length - 1,
										);
										const targetCard =
											results[targetIndex] || results[0];
										addSearchCard(targetCard);
										const inputEl =
											/** @type {HTMLInputElement | null} */ (
												e.target
											);
										inputEl?.select();
									}
								}
							}}
						/>
						{#if searchStore.query !== ""}
							<button
								class="search-action-btn"
								title="Clear search"
								onclick={() => (searchStore.query = "")}
								onmousedown={(e) => e.preventDefault()}
								transition:fade={{ duration: 150 }}
							>
								<X size={14} />
							</button>
						{:else if showHelpIcon}
							<a
								href="https://scryfall.com/docs/syntax"
								target="_blank"
								rel="noopener noreferrer"
								class="search-action-btn"
								title="Scryfall Search Syntax Guide"
								onmousedown={(e) => e.preventDefault()}
								transition:fade={{ duration: 150 }}
							>
								<HelpCircle size={14} />
							</a>
						{/if}
					</div>
				</div>

				<!-- Sort Search Results Tool Button with Left Concave Cutout -->
				<button
					class="search-sort-btn"
					class:active={showSearchSort || isCustomSearchSortActive()}
					bind:clientWidth={sortBtnWidth}
					onclick={() => (showSearchSort = !showSearchSort)}
					aria-label="Sort search results"
					title={isCustomSearchSortActive()
						? "Custom sorting active (click to configure)"
						: "Sort search results"}
				>
					<svg
						class="curved-bg"
						viewBox="0 0 {sortBtnWidth || 54} 36"
						preserveAspectRatio="none"
					>
						<path d={rightCurvedPathD()} />
					</svg>
					<ArrowDownWideNarrow size={14} />
				</button>
			</div>

			<!-- Search Settings / Options Tool Button (Outside search container) -->
			<button
				bind:this={searchSettingsBtn}
				class="search-tool-btn"
				class:active={showSearchOptions}
				onclick={() => (showSearchOptions = !showSearchOptions)}
				aria-label="Search Settings"
				title="Search Settings"
			>
				<SlidersHorizontal size={15} />
			</button>

			<!-- Collapse Search Button (Right side) -->
			<button
				class="close-search-btn"
				onclick={() => searchStore.closeSearch()}
				aria-label="Close search (Esc)"
				title="Close search (Esc)"
			>
				<ChevronUp size={16} />
			</button>
		</div>

		<SearchOptionsModal
			bind:isOpen={showSearchOptions}
			triggerElement={searchSettingsBtn}
		/>

		<MultiSortModal bind:isOpen={showSearchSort} target="search" />
	</div>
{/if}

<ViewOptionsModal bind:isOpen={showViewOptionsModal} triggerElement={null} />
<DisplayNamePromptModal />
<ConfirmModal />

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
					<X size={16} />
				</button>
			</div>
			<div class="about-body">
				<p>
					<strong>Budgie</strong> is a premium, high-fidelity Magic: The
					Gathering deckbuilder designed for rapid construction, visual
					pricing analysis, and gorgeous organization.
				</p>
				<p>
					Built using Svelte 5 and Supabase, Budgie syncs your decks
					seamlessly across all your devices.
				</p>
				<div class="about-footer">
					<span>Version 1.0.0</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.top-nav-trigger-zone {
		position: fixed;
		top: 0;
		left: 0;
		width: calc(100vw - var(--right-sidebar-width, 0px));
		height: 12px;
		z-index: 999;
		pointer-events: auto;
	}

	.global-header-bar {
		height: 48px;
		background: #000000;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0 12px;
		z-index: 1000;
		user-select: none;
		box-sizing: border-box;
		position: relative;
	}

	.global-header-bar.on-deck-page {
		border-bottom: none;
	}

	.global-header-bar.is-auto-hide {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		width: 100%;
		z-index: 1000;
		transform: translateY(-100%);
		transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease;
		box-shadow: none;
		border-bottom: 1px solid rgba(255, 255, 255, 0.12);
		pointer-events: none;
	}

	.global-header-bar.is-auto-hide.is-revealed {
		transform: translateY(0);
		pointer-events: auto;
		box-shadow: 0 6px 24px rgba(0, 0, 0, 0.75), 0 2px 6px rgba(0, 0, 0, 0.5);
	}

	.global-header-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.global-nav {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		min-width: 0;
	}

	.global-nav-link {
		font-size: 13.5px;
		font-weight: 500;
		color: #94a3b8;
		text-decoration: none;
		background: transparent;
		border: none;
		padding: 5px 10px;
		border-radius: 6px;
		cursor: pointer;
		transition:
			color 0.15s ease,
			background-color 0.15s ease;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		line-height: 1;
		outline: none;
		white-space: nowrap;
		user-select: none;
	}

	.global-nav-link:hover {
		color: #f8fafc;
		background-color: rgba(255, 255, 255, 0.08);
	}

	.global-nav-link.active {
		color: #f8fafc;
		background-color: rgba(255, 255, 255, 0.08);
	}

	.global-nav-link:focus-visible {
		outline: 2px solid hsl(var(--primary));
		outline-offset: -1px;
	}

	:global(.nav-chevron) {
		color: #94a3b8;
		transition:
			transform 0.15s ease,
			color 0.15s ease;
		flex-shrink: 0;
	}

	.global-nav-link:hover :global(.nav-chevron),
	.global-nav-link.active :global(.nav-chevron) {
		color: #f8fafc;
	}

	.global-nav-link.active :global(.nav-chevron) {
		transform: rotate(180deg);
	}

	.budgie-menu-container,
	.profile-menu-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.budgie-dropdown,
	.profile-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		background: #0f1219;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6);
		padding: 4px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.budgie-dropdown {
		left: 0;
		right: auto;
		width: 190px;
	}

	.profile-dropdown {
		right: 0;
		left: auto;
		width: 200px;
	}

	.user-menu-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.global-header-right {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex-shrink: 0;
	}

	.search-drawer {
		background: #0b0e16;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		padding: 8px 16px;
		z-index: 990;
		box-sizing: border-box;
	}

	.search-drawer-inner {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		width: 100%;
	}

	.close-search-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius);
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.close-search-btn:hover {
		background: hsl(var(--muted) / 0.8);
		color: hsl(var(--foreground));
	}

	.search-input-combo {
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 200px;
	}

	.collection-selector {
		position: relative;
		z-index: 1;
		flex-shrink: 0;
	}

	.collection-trigger {
		position: relative;
		height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 1.85rem 0 1.05rem;
		background: transparent;
		border: none;
		color: hsl(var(--foreground));
		font-size: 13px;
		font-weight: 500;
		cursor: pointer;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.curved-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: -1;
		overflow: visible;
	}

	.curved-bg path {
		fill: hsl(var(--muted) / 0.5);
		stroke: hsl(var(--border));
		stroke-width: 1;
		transition:
			fill 0.15s ease,
			stroke 0.15s ease;
	}

	.collection-trigger:hover .curved-bg path {
		fill: hsl(var(--muted) / 0.8);
	}

	.collection-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		width: 220px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
		padding: 4px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 2px;
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
	}

	.menu-item.active {
		background: hsla(var(--primary-hsl), 0.1);
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.menu-item:hover:not(.disabled) {
		background: hsl(var(--primary));
		color: white !important;
	}

	.menu-item.disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.menu-divider {
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin: 3px 6px;
	}

	.search-input-group {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		flex: 1;
		margin-left: -18px;
		height: 36px;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: 9999px;
		padding: 0 0.75rem 0 0.85rem;
		gap: 0.4rem;
		transition: all 0.2s ease;
		box-sizing: border-box;
	}

	.search-input-group:hover:not(.is-focused) {
		background: hsl(var(--muted) / 0.8);
	}

	.search-input-group.is-focused {
		background: hsl(var(--muted) / 0.85);
		border-color: hsl(var(--foreground) / 0.3);
		z-index: 3;
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	:global(.search-icon) {
		color: hsl(var(--muted-foreground));
		flex-shrink: 0;
		transition: color 0.15s ease;
	}

	.is-focused :global(.search-icon) {
		color: hsl(var(--foreground));
	}

	:global(.header-search-input) {
		padding: 0 1.6rem 0 0 !important;
		background-color: transparent !important;
		border: none !important;
		border-radius: 0 !important;
		height: 34px !important;
		font-size: 13px !important;
		font-weight: 500 !important;
		color: hsl(var(--foreground)) !important;
		box-shadow: none !important;
	}

	.search-action-btn {
		position: absolute;
		right: 0.25rem;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		z-index: 20;
		cursor: pointer;
		background: none;
		border: none;
		padding: 0;
	}

	.search-action-btn:hover {
		color: hsl(var(--foreground));
	}

	.search-sort-btn {
		position: relative;
		z-index: 1;
		height: 36px;
		width: 58px;
		margin-left: -18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.6rem 0 1.85rem;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: color 0.15s ease;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.search-sort-btn:hover {
		color: hsl(var(--foreground));
	}

	.search-sort-btn:hover .curved-bg path {
		fill: hsl(var(--muted) / 0.8);
	}

	.search-sort-btn.active {
		color: hsl(var(--primary));
	}

	.search-sort-btn.active .curved-bg path {
		fill: hsl(var(--primary) / 0.15);
		stroke: hsl(var(--primary));
	}

	.search-tool-btn {
		height: 36px;
		width: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
		box-sizing: border-box;
		flex-shrink: 0;
	}

	.search-tool-btn:hover {
		background: hsl(var(--muted) / 0.8);
		color: hsl(var(--foreground));
	}

	.search-tool-btn.active {
		background: hsl(var(--primary) / 0.15);
		border-color: hsl(var(--primary));
		color: hsl(var(--primary));
	}

	.dropdown-header {
		padding: 8px 12px;
		display: flex;
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
	}

	.dropdown-email {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
	}

	.nav-link {
		text-decoration: none;
		color: hsl(var(--muted-foreground));
	}

	.menu-item.destructive {
		color: #f87171;
	}

	.menu-item.destructive:hover {
		background: #ef4444 !important;
		color: white !important;
	}

	.auth-loading-spinner {
		margin: 0 1rem;
		width: 16px;
		height: 16px;
		border-width: 2px;
	}

	/* About Modal */
	.about-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.5);
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
		padding: 2px;
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
