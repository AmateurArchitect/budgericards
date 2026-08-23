<script>
	import { slide, fade, fly } from "svelte/transition";
	import {
		ChevronDown,
		ChevronUp,
		Search,
		HelpCircle,
		SlidersHorizontal,
		PlusCircle,
		X,
		LogOut,
		Palette,
		FolderOpen,
		Settings as SettingsIcon,
		ArrowDownWideNarrow,
		PanelLeft,
	} from "lucide-svelte";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { goto } from "$app/navigation";
	import { page } from "$app/stores";

	import Input from "./ui/Input.svelte";
	import SearchOptionsModal from "./SearchOptionsModal.svelte";
	import ViewOptionsModal from "./ViewOptionsModal.svelte";
	import DisplayNamePromptModal from "./DisplayNamePromptModal.svelte";
	import ConfirmModal from "./ConfirmModal.svelte";
	import DeckHeader from "./DeckHeader.svelte";

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
		const cutX = Math.round((w - 13.33) * 100) / 100;
		return `M 6 0.5 L ${cutX} 0.5 A 22 22 0 0 0 ${cutX} 35.5 L 6 35.5 A 5.5 5.5 0 0 1 0.5 30 L 0.5 6 A 5.5 5.5 0 0 1 6 0.5 Z`;
	});

	const rightCurvedPathD = $derived(() => {
		const w = sortBtnWidth || 54;
		return `M 13.33 0.5 L ${w - 6} 0.5 A 5.5 5.5 0 0 1 ${w - 0.5} 6 L ${w - 0.5} 30 A 5.5 5.5 0 0 1 ${w - 6} 35.5 L 13.33 35.5 A 22 22 0 0 0 13.33 0.5 Z`;
	});

	const searchPlaceholders = ["Lightning Bolt", "is:commander id=gw"];
	let placeholderIndex = $state(0);

	$effect(() => {
		const interval = setInterval(() => {
			placeholderIndex = (placeholderIndex + 1) % searchPlaceholders.length;
		}, 4000);
		return () => clearInterval(interval);
	});

	$effect(() => {
		if (searchStore.isOpen) {
			setTimeout(() => {
				const inputEl = document.querySelector(".header-search-input input") || document.querySelector(".header-search-input");
				/** @type {HTMLElement | null} */ (inputEl)?.focus();
			}, 60);
		}
	});

	const isDeckPage = $derived(
		($page.url.pathname.startsWith("/decks/") && Boolean($page.params.id)) ||
		$page.url.pathname === "/"
	);

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
		const isLocalBoard = ["sideboard", "maybeboard"].includes(searchStore.collection);
		const currentBoard = searchStore.collection;
		const price = searchStore.collection === "scryfall"
			? (card.prices?.usd ? parseFloat(card.prices.usd) : null)
			: priceStore.getPrice(card.name);

		if (isLocalBoard) {
			deckStore.moveCard(card.name, currentBoard, deckStore.activeBoard, card.id, price);
		} else {
			let targetBoard = deckStore.activeBoard;
			const meta = card.type_line ? card : (deckStore.metadata[card.name?.toLowerCase()] || card);
			const typeLine = (meta.type_line || "").toLowerCase();
			const oracle = (meta.oracle_text || "").toLowerCase();
			const facesOracle = (meta.card_faces || []).map((/** @type {any} */ f) => (f.oracle_text || "").toLowerCase()).join(" ");
			const isLegendaryCreature = typeLine.includes("legendary") && typeLine.includes("creature");
			const isPlaneswalker = typeLine.includes("planeswalker");
			const isCompanion = oracle.includes("companion —") || facesOracle.includes("companion —");
			const isCommanderFormat = ["Commander", "Brawl", "Oathbreaker"].includes(deckStore.format);

			if (isCommanderFormat && deckStore.commander.length === 0 && (isLegendaryCreature || (deckStore.format === "Brawl" && isPlaneswalker))) {
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
		const target = /** @type {HTMLElement | null} */ (document.activeElement);
		const isInput = ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName || "") || target?.isContentEditable;
		const isModalOpen = document.querySelector(".modal-backdrop, .about-backdrop, [role='dialog']") !== null;

		// Primary: Cmd + / or Ctrl + / (and Cmd + K / Cmd + Space as secondary fallbacks)
		if (isCmdOrCtrl && (e.key === "/" || e.key.toLowerCase() === "k" || e.key === " ")) {
			e.preventDefault();
			if (!searchStore.isOpen) {
				searchStore.openSearch();
			}
			setTimeout(() => {
				const inputEl = document.querySelector(".header-search-input input") || document.querySelector(".header-search-input");
				/** @type {HTMLElement | null} */ (inputEl)?.focus();
			}, 50);
			return;
		}

		// Fallback: '/' shortcut when NOT typing inside any input and NOT inside an open modal
		if (e.key === "/" && !isInput && !isCmdOrCtrl && !isModalOpen) {
			e.preventDefault();
			if (!searchStore.isOpen) {
				searchStore.openSearch();
			}
			setTimeout(() => {
				const inputEl = document.querySelector(".header-search-input input") || document.querySelector(".header-search-input");
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

<svelte:window onclick={handleClickOutside} onkeydown={handleGlobalKeyDown} />

{#if isDeckPage && !searchStore.isOpen}
	<!-- Single Unified Top Bar when Search is Closed -->
	<DeckHeader isTopBar={true} />
{:else}
	<!-- Search Bar Top Row (when Search is Open or on non-deck pages) -->
	<header class="app-header" class:search-open={isDeckPage && searchStore.isOpen}>
		<div class="header-left">
			<!-- Budgie Menu Container -->
			<div class="budgie-menu-container">
				<button
					class="budgie-trigger"
					onclick={() => (showBudgieDropdown = !showBudgieDropdown)}
					aria-expanded={showBudgieDropdown}
					aria-haspopup="menu"
				>
					<span class="logo-text">Budgie</span>
					<ChevronDown size={14} class="chevron {showBudgieDropdown ? 'open' : ''}" />
				</button>

				{#if showBudgieDropdown}
					<div class="budgie-dropdown" transition:fade={{ duration: 150 }}>
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
							<span>Help</span>
						</a>
					</div>
				{/if}
			</div>

			<!-- User Profile / Auth on Left when search is open -->
			{#if isDeckPage && searchStore.isOpen}
				<div class="user-auth-bug">
					{#if authStore.isLoading}
						<div class="auth-loading-spinner spinner"></div>
					{:else}
						{#if authStore.isAuthenticated && authStore.user}
							<div class="profile-menu-container">
								<button
									class="profile-trigger"
									onclick={() => (showProfileDropdown = !showProfileDropdown)}
									aria-expanded={showProfileDropdown}
									aria-haspopup="menu"
									aria-label="User menu"
								>
									<span class="user-name">
										{authStore.user.user_metadata?.display_name || authStore.user.email?.split("@")[0]}
									</span>
									<ChevronDown size={14} class="chevron {showProfileDropdown ? 'open' : ''}" />
								</button>

								{#if showProfileDropdown}
									<div class="profile-dropdown" transition:fade={{ duration: 150 }}>
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
							</div>
						{:else}
							<a
								href="/login?redirectTo={encodeURIComponent($page.url.pathname)}"
								class="profile-trigger font-semibold"
								style="text-decoration: none;"
								aria-label="Log In"
							>
								<span class="user-name">Log In</span>
							</a>
						{/if}
					{/if}
				</div>
			{:else}
				<nav class="nav-links">
					<a href="/decks" class="nav-item" class:active={$page.url.pathname === '/decks'}>Browse Decks</a>
					<a href="/gallery" class="nav-item" class:active={$page.url.pathname === '/gallery'}>Art Gallery</a>
				</nav>
			{/if}
		</div>

		<div class="header-right">
			{#if isDeckPage && searchStore.isOpen}
				<div class="search-bar">
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
								onclick={() => (showCollectionDropdown = !showCollectionDropdown)}
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
								<ChevronDown size={13} class="chevron {showCollectionDropdown ? 'open' : ''}" />
							</button>

							{#if showCollectionDropdown}
								<div class="collection-menu" transition:fly={{ y: 4, duration: 150 }}>
									{#each collections as item}
										{#if item.divider}
											<div class="menu-divider"></div>
										{:else}
											<button
												class="menu-item"
												class:active={searchStore.collection === item.id}
												class:disabled={item.disabled}
												onclick={() => !item.disabled && item.id && selectCollection(item.id)}
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
										if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
											const results = searchStore.results;
											if (!searchStore.isSearching && results.length > 0 && results.length <= 8 && searchStore.query.trim().length > 0) {
												e.preventDefault();
												const topCard = results[0];
												addSearchCard(topCard);
												const inputEl = /** @type {HTMLInputElement | null} */ (e.target);
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
							class:active={showSearchSort}
							bind:clientWidth={sortBtnWidth}
							onclick={() => (showSearchSort = !showSearchSort)}
							aria-label="Sort search results"
							title="Sort search results"
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
			{:else}
				<div class="user-auth-bug">
					{#if authStore.isLoading}
						<div class="auth-loading-spinner spinner"></div>
					{:else}
						{#if authStore.isAuthenticated && authStore.user}
							<div class="profile-menu-container">
								<button
									class="profile-trigger"
									onclick={() => (showProfileDropdown = !showProfileDropdown)}
									aria-expanded={showProfileDropdown}
									aria-haspopup="menu"
									aria-label="User menu"
								>
									<span class="user-name">
										{authStore.user.user_metadata?.display_name || authStore.user.email?.split("@")[0]}
									</span>
									<ChevronDown size={14} class="chevron {showProfileDropdown ? 'open' : ''}" />
								</button>

								{#if showProfileDropdown}
									<div class="profile-dropdown" transition:fade={{ duration: 150 }}>
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
							</div>
						{:else}
							<a
								href="/login?redirectTo={encodeURIComponent($page.url.pathname)}"
								class="profile-trigger font-semibold"
								style="text-decoration: none;"
								aria-label="Log In"
							>
								<span class="user-name">Log In</span>
							</a>
						{/if}
					{/if}
				</div>
			{/if}
		</div>
	</header>
{/if}

<ViewOptionsModal bind:isOpen={showViewOptionsModal} triggerElement={null} />
<DisplayNamePromptModal />
<ConfirmModal />

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
					<X size={16} />
				</button>
			</div>
			<div class="about-body">
				<p><strong>Budgie</strong> is a premium, high-fidelity Magic: The Gathering deckbuilder designed for rapid construction, visual pricing analysis, and gorgeous organization.</p>
				<p>Built using Svelte 5 and Supabase, Budgie syncs your decks seamlessly across all your devices.</p>
				<div class="about-footer">
					<span>Version 1.0.0</span>
				</div>
			</div>
		</div>
	</div>
{/if}

<style>
	.app-header {
		height: 76px;
		padding: 20px;
		background: transparent;
		border-bottom: 1px solid hsl(var(--border));
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 1000;
		user-select: none;
		box-sizing: border-box;
	}

	.app-header.search-open {
		border-bottom: none;
		padding: 20px 20px 0 20px;
		height: 56px;
	}

	.app-header.search-open .header-left {
		flex: 0 0 auto;
		gap: 0.5rem;
	}

	.app-header.search-open .header-right {
		flex: 1;
		display: flex;
		align-items: center;
		padding-left: 1.5rem;
		min-width: 0;
	}

	.header-left .budgie-dropdown,
	.header-left .profile-dropdown {
		left: 0;
		right: auto;
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		flex: 1;
		min-width: 0;
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

	.logo-text {
		color: hsl(var(--foreground));
	}

	.search-bar {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
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
		padding: 0 1.65rem 0 1.05rem;
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
		transition: fill 0.15s ease, stroke 0.15s ease;
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
		width: 54px;
		margin-left: -18px;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 0.5rem 0 1.65rem;
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
		fill: hsla(var(--primary-hsl), 0.15);
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

	.header-right {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-left: 0.75rem;
		flex-shrink: 0;
	}

	.budgie-menu-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.budgie-trigger,
	.profile-trigger,
	.login-link {
		height: 36px;
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0 9px 0 13px;
		background: hsl(var(--muted) / 0.5);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 13px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
		text-decoration: none;
	}

	.budgie-trigger:hover,
	.profile-trigger:hover,
	.login-link:hover {
		background: hsl(var(--muted) / 0.8);
		color: hsl(var(--foreground));
	}

	.logo-text {
		color: hsl(var(--foreground));
		font-weight: 700;
		font-size: 13px;
		white-space: nowrap;
		letter-spacing: -0.02em;
	}

	.budgie-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 200px;
		background: hsl(var(--popover));
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
		padding: 6px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.user-auth-bug {
		display: flex;
		align-items: center;
	}

	.profile-menu-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.profile-dropdown {
		position: absolute;
		top: calc(100% + 6px);
		right: 0;
		width: 220px;
		background: hsl(var(--popover));
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
		padding: 6px;
		z-index: 1000;
		display: flex;
		flex-direction: column;
		gap: 2px;
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

	.user-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	:global(.chevron) {
		opacity: 0.5;
		transition: transform 0.2s;
	}

	:global(.chevron.open) {
		transform: rotate(180deg);
	}

	.nav-links {
		display: flex;
		align-items: center;
		gap: 1.5rem;
		margin-left: 0.5rem;
	}

	.nav-item {
		color: hsl(var(--muted-foreground));
		font-size: 0.8125rem;
		font-weight: 600;
		text-decoration: none;
		transition: color 0.15s ease;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.25rem 0;
	}

	.nav-item:hover,
	.nav-item.active {
		color: hsl(var(--foreground));
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
