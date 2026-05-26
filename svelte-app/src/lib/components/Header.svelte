<script>
	import { slide, fade } from "svelte/transition";
	import { backOut } from "svelte/easing";
	import { horizontalSlide } from "$lib/utils/transitions.js";
	import {
		ChevronDown,
		Search,
		MoreHorizontal,
		HelpCircle,
		SlidersHorizontal,
		Compass,
		PlusCircle,
		User,
		Menu,
		X,
		LogOut,
	} from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { priceStore } from "$lib/stores/prices.svelte.js";
	import { authStore } from "$lib/stores/auth.svelte.js";

	import Button from "./ui/Button.svelte";
	import Input from "./ui/Input.svelte";

	import ManaFilter from "./ManaFilter.svelte";
	import SearchOptionsModal from "./SearchOptionsModal.svelte";

	let {} = $props();
	let showCollectionDropdown = $state(false);
	let showSearchOptions = $state(false);
	/** @type {HTMLElement | null} */
	let searchSettingsBtn = $state(null);
	let showProfileDropdown = $state(false);

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
		{ id: "deleted", label: "Recently Deleted Cards" },
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
		["sideboard", "maybeboard", "deleted"].includes(searchStore.collection)
			? `Browse ${activeShortLabel}`
			: `Search ${activeShortLabel}`,
	);

	const showHelpIcon = $derived(
		searchStore.isFocused && searchStore.query === "",
	);

	/** @param {string} id */
	function selectCollection(id) {
		if (id === "new") {
			// Handle create new
			alert("Create new collection functionality coming soon!");
			showCollectionDropdown = false;
			return;
		}
		searchStore.collection = id;
		showCollectionDropdown = false;
	}

	// Click outside to close
	/** @param {MouseEvent} e */
	function handleClickOutside(e) {
		const target = /** @type {HTMLElement} */ (e.target);
		if (!target.closest(".collection-selector")) {
			showCollectionDropdown = false;
		}
		if (!target.closest(".profile-menu-container")) {
			showProfileDropdown = false;
		}
	}

	let isHoveringFilters = $state(false);
	let isManaFilterVisible = $state(false);
	/** @type {any} */
	let hideTimer = null;

	const isFocusedMode = $derived(
		searchStore.isFocused || searchStore.isExpanded,
	);

	$effect(() => {
		const shouldBeVisible =
			searchStore.isFocused ||
			searchStore.isExpanded ||
			isHoveringFilters;

		if (shouldBeVisible) {
			if (hideTimer) {
				clearTimeout(hideTimer);
				hideTimer = null;
			}
			isManaFilterVisible = true;
		} else {
			if (isManaFilterVisible && !hideTimer) {
				hideTimer = setTimeout(() => {
					isManaFilterVisible = false;
					hideTimer = null;
				}, 3000);
			}
		}
	});
</script>

<svelte:window onclick={handleClickOutside} />

<header class="app-header">
	<div class="header-left">
		<div class="logo">
			<span class="logo-text">Budgie</span>
			<span class="logo-sep">/</span>
			<span class="logo-sub">MTG Deckbuilder</span>
		</div>

		<div class="search-bar">
			<div
				class="search-input-group"
				class:is-focused={searchStore.isFocused}
			>
				<div class="collection-selector">
					<button
						class="collection-trigger"
						onclick={() =>
							(showCollectionDropdown = !showCollectionDropdown)}
						aria-expanded={showCollectionDropdown}
						aria-haspopup="listbox"
					>
						<div class="collection-value">
							<span class="value-text"
								>{collectionButtonText}</span
							>
							<ChevronDown
								size={14}
								class="chevron {showCollectionDropdown
									? 'open'
									: ''}"
							/>
						</div>
					</button>

					{#if showCollectionDropdown}
						<div class="collection-menu">
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

				<div class="search-input-wrapper">
					<Search size={14} class="search-icon" />
					<Input
						placeholder=""
						class="header-search-input"
						bind:value={searchStore.query}
						onfocus={() => searchStore.setFocus(true)}
						onblur={() => searchStore.setFocus(false)}
						onkeydown={(/** @type {KeyboardEvent} */ e) => {
							if (e.key === "Escape") {
								// @ts-ignore
								e.currentTarget.blur();
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

				<div class="search-divider"></div>

				<button
					bind:this={searchSettingsBtn}
					class="search-settings-btn"
					class:active={showSearchOptions}
					onclick={() => (showSearchOptions = !showSearchOptions)}
					aria-label="Search Settings"
					title="Search Settings"
				>
					<SlidersHorizontal size={15} />
				</button>
			</div>
		</div>

		<SearchOptionsModal
			bind:isOpen={showSearchOptions}
			triggerElement={searchSettingsBtn}
		/>

		{#if isManaFilterVisible}
			<div
				role="presentation"
				in:slide={{ axis: "x", duration: 200, delay: 150 }}
				out:slide={{ axis: "x", duration: 200 }}
				onmouseenter={() => (isHoveringFilters = true)}
				onmouseleave={() => (isHoveringFilters = false)}
				class="mana-filter-wrapper"
			>
				<div
					in:fade={{ duration: 100, delay: 250 }}
					out:fade={{ duration: 100 }}
				>
					<ManaFilter />
				</div>
			</div>
		{/if}
	</div>

	<div class="header-right">
		{#if isFocusedMode}
			<div
				class="collapsed-nav"
				in:horizontalSlide={{ duration: 400, delay: 200 }}
				out:horizontalSlide={{ duration: 200 }}
			>
				<button class="hamburger-btn" aria-label="Open Menu">
					<Menu size={20} />
				</button>
			</div>
		{:else}
			<nav
				class="main-nav"
				in:horizontalSlide={{ duration: 400, delay: 200 }}
				out:horizontalSlide={{ duration: 200 }}
			>
				<a href="/explore" class="nav-item">
					<Compass size={18} />
					<span>Explore Decks</span>
				</a>
				<a href="/new" class="nav-item">
					<PlusCircle size={18} />
					<span>Create New</span>
				</a>
				<a href="/help" class="nav-item">
					<HelpCircle size={18} />
					<span>Help</span>
				</a>
			</nav>
		{/if}

		<div class="user-auth-bug">
			{#if authStore.isLoading}
				<div class="auth-loading-spinner spinner"></div>
			{:else if authStore.isAuthenticated && authStore.user}
				<div class="profile-menu-container">
					<button 
						class="profile-trigger" 
						onclick={() => showProfileDropdown = !showProfileDropdown}
						aria-expanded={showProfileDropdown}
						aria-haspopup="menu"
						aria-label="User menu"
					>
						<div class="avatar-circle">
							{#if authStore.user.user_metadata?.avatar_url}
								<img src={authStore.user.user_metadata.avatar_url} alt="Avatar" class="avatar-img" />
							{:else}
								<span>{authStore.user.email?.charAt(0).toUpperCase()}</span>
							{/if}
						</div>
						<span class="user-name">{authStore.user.email?.split('@')[0]}</span>
						<ChevronDown size={14} class="chevron {showProfileDropdown ? 'open' : ''}" />
					</button>

					{#if showProfileDropdown}
						<div class="profile-dropdown" transition:fade={{ duration: 150 }}>
							<div class="dropdown-header">
								<span class="dropdown-email">{authStore.user.email}</span>
								{#if authStore.user.app_metadata?.provider}
									<span class="provider-badge">{authStore.user.app_metadata.provider}</span>
								{/if}
							</div>
							<div class="menu-divider"></div>
							<button class="menu-item destructive" onclick={handleSignOut}>
								<LogOut size={14} />
								<span>Sign Out</span>
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/login" class="profile-trigger font-semibold" style="text-decoration: none;" aria-label="Log In">
					<span class="user-name">Log In</span>
				</a>
			{/if}
		</div>
	</div>
</header>

<style>
	.app-header {
		height: 56px;
		padding: 0 1.25rem;
		background: var(--bg-panel);
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		display: flex;
		align-items: center;
		justify-content: space-between;
		z-index: 1000;
		backdrop-filter: blur(12px);
	}

	.header-left {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex: 1;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-weight: 700;
		font-size: 0.9375rem;
		white-space: nowrap;
		letter-spacing: -0.02em;
		margin-right: 1.25rem;
		flex-shrink: 0;
	}

	.logo-text {
		color: hsl(var(--foreground));
	}
	.logo-sep {
		color: hsl(var(--muted-foreground) / 0.3);
		font-weight: 400;
	}
	.logo-sub {
		color: hsl(var(--muted-foreground));
		font-weight: 500;
		font-size: 0.75rem;
		letter-spacing: 0;
	}

	.search-bar {
		flex: 1;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
		min-width: 0;
	}

	.search-input-group {
		display: flex;
		align-items: center;
		background-color: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius);
		height: 38px;
		transition: all 0.2s ease;
		padding: 2px;
	}

	.search-input-group.is-focused {
		background-color: hsl(var(--background));
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 4px hsl(var(--primary) / 0.1);
	}

	.collection-selector {
		position: relative;
		height: 100%;
		border-right: 1px solid hsl(var(--border) / 0.5);
		flex-shrink: 0;
	}

	.collection-trigger {
		height: 100%;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0 0.875rem;
		background: none;
		border: none;
		cursor: pointer;
		color: hsl(var(--foreground));
		transition: background-color 0.2s;
		border-radius: var(--radius) 0 0 var(--radius);
	}

	.collection-trigger:hover {
		background-color: hsl(var(--accent) / 0.4);
	}

	.collection-value {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}

	.collection-value :global(.chevron) {
		opacity: 0.5;
		transition: transform 0.2s;
	}

	.collection-value :global(.chevron.open) {
		transform: rotate(180deg);
	}

	.collection-menu {
		position: absolute;
		top: calc(100% + 6px);
		left: 0;
		width: 240px;
		background: hsl(var(--popover));
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
		padding: 6px;
		z-index: 100;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.menu-item {
		width: 100%;
		text-align: left;
		padding: 8px 12px;
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
		background: none;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.15s;
	}

	.menu-item.active {
		background: hsla(var(--primary-hsl), 0.1);
		color: hsl(var(--primary));
	}

	.menu-item:hover:not(.disabled) {
		background: hsl(var(--primary));
		color: white;
	}

	.menu-item.disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.menu-divider {
		height: 1px;
		background: hsla(var(--border) / 0.3);
		margin: 4px 8px;
	}

	.search-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
		flex: 1;
		min-width: 0;
	}

	:global(.search-icon) {
		position: absolute;
		left: 0.875rem;
		color: hsl(var(--muted-foreground));
		pointer-events: none;
		z-index: 10;
		transition: color 0.2s ease;
	}

	.is-focused :global(.search-icon) {
		color: hsl(var(--primary));
	}

	:global(.header-search-input) {
		padding-left: 2.5rem !important;
		padding-right: 2.5rem !important;
		background-color: transparent !important;
		border: none !important;
		border-radius: 0 !important;
		height: 34px !important;
		font-size: 0.875rem !important;
		font-weight: 500 !important;
		box-shadow: none !important;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.search-action-btn {
		position: absolute;
		right: 0.875rem;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s;
		z-index: 20;
		cursor: pointer;
		pointer-events: auto;
		background: none;
		border: none;
		padding: 0;
	}

	.search-action-btn:hover {
		color: hsl(var(--primary));
		transform: scale(1.1);
	}

	.search-action-btn:active {
		transform: scale(0.9);
	}

	.mana-filter-wrapper {
		display: flex;
		align-items: center;
		overflow: hidden;
		flex-shrink: 0;
		padding-left: 0.5rem;
		padding-top: 6px;
		padding-bottom: 6px;
	}

	.search-divider {
		width: 1px;
		height: 20px;
		background-color: hsl(var(--border) / 0.5);
		flex-shrink: 0;
	}

	.search-settings-btn {
		width: 36px;
		height: 36px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: none;
		border-radius: 0 var(--radius) var(--radius) 0;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s;
		flex-shrink: 0;
	}

	.search-settings-btn:hover,
	.search-settings-btn.active {
		background-color: hsl(var(--accent) / 0.5);
		color: hsl(var(--foreground));
	}

	.header-right {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding-left: 1.25rem;
	}

	.main-nav {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.nav-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 600;
		transition: color 0.2s;
		padding: 0.5rem 0;
		white-space: nowrap;
	}

	.nav-item:hover {
		color: hsl(var(--foreground));
	}

	.collapsed-nav {
		display: flex;
		align-items: center;
	}

	.hamburger-btn {
		width: 38px;
		height: 38px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s;
	}

	.hamburger-btn:hover {
		background-color: hsl(var(--accent) / 0.4);
		color: hsl(var(--foreground));
		border-color: hsl(var(--border));
	}

	.user-auth-bug {
		display: flex;
		align-items: center;
		padding-left: 1.25rem;
		border-left: 1px solid hsl(var(--border) / 0.5);
	}

	.profile-menu-container {
		position: relative;
		display: flex;
		align-items: center;
	}

	.profile-trigger {
		display: flex;
		align-items: center;
		gap: 0.625rem;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0.375rem 0.75rem;
		border-radius: var(--radius-md);
		transition: background-color 0.2s;
	}

	.profile-trigger:hover {
		background-color: hsl(var(--accent) / 0.4);
	}

	.avatar-circle {
		width: 24px;
		height: 24px;
		border-radius: 50%;
		background: hsl(var(--primary));
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 700;
		overflow: hidden;
		border: 1px solid rgba(255, 255, 255, 0.15);
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.profile-trigger :global(.chevron) {
		opacity: 0.5;
		transition: transform 0.2s;
	}

	.profile-trigger :global(.chevron.open) {
		transform: rotate(180deg);
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
		flex-direction: column;
		gap: 4px;
	}

	.dropdown-email {
		font-size: 0.75rem;
		font-weight: 500;
		color: var(--text-secondary);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.provider-badge {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-sm);
		padding: 1px 4px;
		width: max-content;
		color: var(--text-muted);
	}

	.menu-item.destructive {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.user-name {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
</style>
