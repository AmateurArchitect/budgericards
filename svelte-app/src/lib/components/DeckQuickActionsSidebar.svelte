<script>
	import { fade, fly } from 'svelte/transition';
	import { X, ChevronDown, ChevronRight, Image as ImageIcon, Trash2, FileText, Sparkles, Layers, DollarSign } from 'lucide-svelte';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import { interactionStore } from '$lib/stores/interaction.svelte.js';
	import { settingsStore } from '$lib/stores/settings.svelte.js';
	import { priceStore } from '$lib/stores/prices.svelte.js';
	import Input from '$lib/components/ui/Input.svelte';
	import ManaSymbol from '$lib/components/ui/ManaSymbol.svelte';
	import { ALL_FORMATS } from '$lib/constants/formats.js';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { syncService } from '$lib/syncService';

	let showFormatDropdown = $state(false);
	let isMoreFormatsVisible = $state(false);
	let isDragOverArt = $state(false);
	let deckImageError = $state(false);
	/** @type {any} */
	let closeTimer = null;

	const primaryFormats = [
		'Commander',
		'Standard',
		'Modern',
		'Pioneer',
		'Brawl',
		'List'
	];

	const moreFormats = ALL_FORMATS.filter(f => !primaryFormats.includes(f));

	const deckImage = $derived(() => {
		if (deckStore.coverArt) return deckStore.coverArt;
		if (deckStore.commander && deckStore.commander.length > 0) {
			const c = deckStore.commander[0];
			const meta = deckStore.metadata[c.name.toLowerCase()];
			return (
				meta?.image_uris?.art_crop ||
				meta?.card_faces?.[0]?.image_uris?.art_crop ||
				null
			);
		}
		return null;
	});

	const colorIdentity = $derived(() => {
		const cols = new Set();
		const list = [
			...(deckStore.commander || []),
			...(deckStore.mainboard || []),
		];
		for (const c of list) {
			const meta = deckStore.metadata[c.name.toLowerCase()];
			if (meta?.color_identity) {
				for (const col of meta.color_identity) {
					cols.add(col);
				}
			}
		}
		const wubrg = ["W", "U", "B", "R", "G"];
		return wubrg.filter((c) => cols.has(c));
	});

	const totalCardCount = $derived(
		deckStore.mainboard.length +
		deckStore.commander.length +
		deckStore.companion.length
	);

	const estimatedPrice = $derived.by(() => {
		let total = 0;
		for (const card of deckStore.mainboard) {
			const p = priceStore.getPrice(card.name);
			if (p) total += p;
		}
		for (const card of deckStore.commander) {
			const p = priceStore.getPrice(card.name);
			if (p) total += p;
		}
		return total > 0 ? `$${total.toFixed(2)}` : null;
	});

	function close() {
		interactionStore.setDeckSidebarOpen(false);
		showFormatDropdown = false;
		isMoreFormatsVisible = false;
	}

	function showMore() {
		clearTimeout(closeTimer);
		isMoreFormatsVisible = true;
	}

	function hideMore() {
		closeTimer = setTimeout(() => {
			isMoreFormatsVisible = false;
		}, 300);
	}

	/** @param {string} format */
	function selectFormat(format) {
		deckStore.format = format;
		showFormatDropdown = false;
		isMoreFormatsVisible = false;
	}

	/** @param {DragEvent} e */
	function handleArtDragOver(e) {
		e.preventDefault();
		isDragOverArt = true;
		if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
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

	async function handleDelete() {
		if (!confirm("Are you sure you want to delete this deck? This cannot be undone.")) {
			return;
		}

		const id = deckStore.id;
		close();

		// 1. Delete from local drafts
		let drafts = JSON.parse(localStorage.getItem("budgericards_local_drafts") || "[]");
		drafts = drafts.filter(/** @param {any} d */ (d) => d.id !== id);
		localStorage.setItem("budgericards_local_drafts", JSON.stringify(drafts));

		// 2. Delete from cached decks
		const cached = JSON.parse(localStorage.getItem("budgericards_cached_decks") || "{}");
		delete cached[id];
		localStorage.setItem("budgericards_cached_decks", JSON.stringify(cached));

		// 3. Delete from Supabase cloud
		await syncService.deleteDeck(id);

		// Clear active deck state
		deckStore.clearMetadataAndCards();
		sessionStorage.removeItem("budgericards_active_deck_id");

		goto("/decks");
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (interactionStore.deckSidebarOpen && e.key === 'Escape') {
			e.stopPropagation();
			close();
		}
	}

	onMount(() => {
		window.addEventListener('keydown', handleKeydown, { capture: true });
		return () => {
			window.removeEventListener('keydown', handleKeydown, { capture: true });
		};
	});
</script>

{#if interactionStore.deckSidebarOpen}
	<!-- Frosted Backdrop overlay -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div 
		class="sidebar-backdrop" 
		role="presentation" 
		onclick={close}
		in:fade={{ duration: 180 }}
		out:fade={{ duration: 150 }}
	></div>

	<!-- Left Slide-over Sidebar Panel -->
	<div 
		class="quick-actions-sidebar"
		role="dialog"
		aria-modal="true"
		aria-label="Deck Quick Actions"
		in:fly={{ x: -380, duration: 240, opacity: 1 }}
		out:fly={{ x: -380, duration: 180, opacity: 1 }}
	>
		<!-- Sidebar Header -->
		<div class="sidebar-header">
			<div class="header-title-row">
				<div class="title-with-badge">
					<Layers size={18} class="title-icon" />
					<h2 class="sidebar-title">Deck Actions</h2>
				</div>
				<button 
					type="button" 
					class="close-button" 
					onclick={close}
					aria-label="Close sidebar"
					title="Close (Esc)"
				>
					<X size={18} />
				</button>
			</div>
		</div>

		<!-- Sidebar Scrollable Body -->
		<div class="sidebar-body">
			<!-- Cover Art Banner & Drop Zone -->
			<div 
				class="cover-art-zone"
				class:drag-over={isDragOverArt}
				ondragover={handleArtDragOver}
				ondragleave={handleArtDragLeave}
				ondrop={handleArtDrop}
				role="region"
				aria-label="Deck Cover Art"
			>
				{#if deckImage() && !deckImageError}
					<img 
						src={deckImage()} 
						alt="Deck Art" 
						class="cover-art-image" 
						onerror={() => { deckImageError = true; }}
					/>
				{:else}
					<div class="cover-art-empty">
						<ImageIcon size={28} />
						<span>Drop card art here to set cover</span>
					</div>
				{/if}
				<div class="art-overlay-gradient"></div>
				<div class="art-badge-hint">
					<span>Drag & drop card here to update cover</span>
				</div>
			</div>

			<!-- Deck Identity Fields -->
			<div class="section-group">
				<div class="form-group">
					<label for="deck-sidebar-name">Deck Name</label>
					<Input 
						id="deck-sidebar-name" 
						bind:value={deckStore.name} 
						placeholder="Untitled Deck"
					/>
				</div>

				<div class="form-group">
					<label for="deck-sidebar-format">Format</label>
					<div class="custom-dropdown">
						<button 
							id="deck-sidebar-format"
							type="button"
							class="dropdown-trigger" 
							onclick={() => showFormatDropdown = !showFormatDropdown}
							aria-expanded={showFormatDropdown}
						>
							<span class="current-value">{deckStore.format || 'None'}</span>
							<span class="chevron-wrapper" class:open={showFormatDropdown}>
								<ChevronDown size={14} />
							</span>
						</button>

						{#if showFormatDropdown}
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<div 
								class="dropdown-backdrop" 
								role="presentation" 
								onclick={() => showFormatDropdown = false}
							></div>
							<div class="dropdown-menu" in:fade={{ duration: 100 }}>
								{#each primaryFormats as format}
									<button 
										type="button"
										class="dropdown-item" 
										class:active={deckStore.format === format}
										onclick={() => selectFormat(format)}
										onmouseenter={() => isMoreFormatsVisible = false}
									>
										{format}
									</button>
								{/each}

								<div 
									class="nested-menu-container"
									onmouseenter={showMore}
									onmouseleave={hideMore}
									role="presentation"
								>
									<div class="dropdown-item has-nested" class:active-parent={isMoreFormatsVisible}>
										<span>More formats...</span>
										<ChevronRight size={14} />
									</div>
									
									{#if isMoreFormatsVisible}
										<div class="nested-menu" in:fade={{ duration: 100 }}>
											{#each moreFormats as format}
												<button 
													type="button"
													class="dropdown-item" 
													class:active={deckStore.format === format}
													onclick={() => selectFormat(format)}
												>
													{format}
												</button>
											{/each}
										</div>
									{/if}
								</div>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Quick Deck Stats Card -->
			<div class="stats-summary-card">
				<div class="stats-header">
					<span class="stats-label">OVERVIEW</span>
					{#if colorIdentity().length > 0}
						<div class="color-dots">
							{#each colorIdentity() as col}
								<ManaSymbol symbol={col} size="15px" />
							{/each}
						</div>
					{/if}
				</div>
				<div class="stats-metrics-grid">
					<div class="metric-box">
						<span class="metric-value">{totalCardCount}</span>
						<span class="metric-title">Main Cards</span>
					</div>
					<div class="metric-box">
						<span class="metric-value">{deckStore.sideboard.length}</span>
						<span class="metric-title">Sideboard</span>
					</div>
					<div class="metric-box">
						<span class="metric-value">{deckStore.maybeboard.length}</span>
						<span class="metric-title">Maybeboard</span>
					</div>
					{#if estimatedPrice}
						<div class="metric-box price-box">
							<span class="metric-value">{estimatedPrice}</span>
							<span class="metric-title">Est. Price</span>
						</div>
					{/if}
				</div>
			</div>

			<!-- Preferences Section -->
			<div class="section-group">
				<h3 class="section-title">Preferences</h3>
				<div class="form-group">
					<label for="deck-sidebar-visibility">Visibility</label>
					<select id="deck-sidebar-visibility" bind:value={deckStore.visibility} class="styled-select">
						<option value="public">🌍 Public (Searchable & Shareable)</option>
						<option value="private">🔒 Private (Only visible to you)</option>
					</select>
				</div>

				<div class="form-group">
					<label for="deck-sidebar-maybeboard">When Removing Cards</label>
					<select id="deck-sidebar-maybeboard" bind:value={deckStore.moveToMaybeboardOnDelete} class="styled-select">
						<option value="default">🌐 Follow Global Setting</option>
						<option value="true">✔️ Send to Maybeboard</option>
						<option value="false">❌ Delete Immediately</option>
					</select>
				</div>
			</div>

			<!-- Quick Action Shortcuts -->
			<div class="section-group">
				<h3 class="section-title">Quick Actions</h3>
				<div class="quick-links-list">
					<button 
						type="button" 
						class="quick-action-button"
						onclick={() => {
							settingsStore.deckViewMode = 'list';
							close();
						}}
					>
						<FileText size={16} />
						<div class="action-btn-text">
							<span class="action-btn-title">Paste & Import Decklist</span>
							<span class="action-btn-desc">Switch to full-text list editor</span>
						</div>
					</button>

					{#if deckStore.maybeboard.length > 0}
						<button 
							type="button" 
							class="quick-action-button"
							onclick={() => {
								close();
								interactionStore.maybeboardCleanupModal.isOpen = true;
							}}
						>
							<Sparkles size={16} />
							<div class="action-btn-text">
								<span class="action-btn-title">Clean up Maybeboard</span>
								<span class="action-btn-desc">{deckStore.maybeboard.length} cards in maybeboard</span>
							</div>
						</button>
					{/if}
				</div>
			</div>

			<!-- Danger Zone -->
			<div class="section-group danger-group">
				<h3 class="section-title danger-title">Danger Zone</h3>
				<button type="button" class="btn-delete" onclick={handleDelete}>
					<Trash2 size={16} />
					<span>Delete Deck</span>
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.sidebar-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		backdrop-filter: blur(4px);
		z-index: 1200;
	}

	.quick-actions-sidebar {
		position: fixed;
		top: 0;
		left: 0;
		bottom: 0;
		width: 360px;
		max-width: 90vw;
		background: #0f1219;
		border-right: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 16px 0 48px rgba(0, 0, 0, 0.7);
		z-index: 1210;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		user-select: none;
	}

	.sidebar-header {
		padding: 16px 20px;
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
		background: rgba(15, 18, 25, 0.95);
		backdrop-filter: blur(12px);
	}

	.header-title-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.title-with-badge {
		display: flex;
		align-items: center;
		gap: 8px;
		color: hsl(var(--foreground));
	}

	:global(.title-icon) {
		color: hsl(var(--primary));
	}

	.sidebar-title {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 700;
		letter-spacing: -0.01em;
	}

	.close-button {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.close-button:hover {
		background: rgba(255, 255, 255, 0.08);
		color: hsl(var(--foreground));
	}

	.sidebar-body {
		flex: 1;
		overflow-y: auto;
		padding: 20px;
		display: flex;
		flex-direction: column;
		gap: 20px;
	}

	/* Cover Art Area */
	.cover-art-zone {
		position: relative;
		width: 100%;
		height: 128px;
		border-radius: var(--radius-md);
		border: 1px solid rgba(255, 255, 255, 0.12);
		overflow: hidden;
		background: #090c10;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.2s ease;
	}

	.cover-art-zone.drag-over {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.3);
		transform: scale(1.02);
	}

	.cover-art-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}

	.cover-art-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
		color: hsl(var(--muted-foreground));
		font-size: 0.78rem;
		text-align: center;
		padding: 12px;
	}

	.art-overlay-gradient {
		position: absolute;
		inset: 0;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.75) 0%, transparent 60%);
		pointer-events: none;
	}

	.art-badge-hint {
		position: absolute;
		bottom: 8px;
		left: 10px;
		right: 10px;
		font-size: 0.72rem;
		color: rgba(255, 255, 255, 0.75);
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
		pointer-events: none;
	}

	/* Section Groups */
	.section-group {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.section-title {
		margin: 0;
		font-size: 0.75rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.form-group label {
		font-size: 0.8rem;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	/* Dropdown / Select */
	.styled-select {
		width: 100%;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: 0.85rem;
		outline: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.styled-select:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.custom-dropdown {
		position: relative;
		width: 100%;
	}

	.dropdown-trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 8px 12px;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: 0.85rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.dropdown-trigger:hover {
		background: rgba(255, 255, 255, 0.08);
	}

	.chevron-wrapper {
		display: flex;
		align-items: center;
		transition: transform 0.2s ease;
	}

	.chevron-wrapper.open {
		transform: rotate(180deg);
	}

	.dropdown-backdrop {
		position: fixed;
		inset: 0;
		z-index: 1220;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		right: 0;
		background: #161b26;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-sm);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		z-index: 1225;
		max-height: 240px;
		overflow-y: auto;
		padding: 4px;
	}

	.dropdown-item {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 7px 10px;
		border: none;
		background: transparent;
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: 0.82rem;
		text-align: left;
		cursor: pointer;
		transition: background 0.15s ease;
	}

	.dropdown-item:hover, .dropdown-item.active-parent {
		background: rgba(255, 255, 255, 0.08);
	}

	.dropdown-item.active {
		background: hsl(var(--primary));
		color: white;
	}

	.nested-menu-container {
		position: relative;
	}

	.nested-menu {
		position: absolute;
		top: 0;
		left: calc(100% + 4px);
		background: #161b26;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: var(--radius-sm);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
		padding: 4px;
		min-width: 140px;
		max-height: 200px;
		overflow-y: auto;
		z-index: 1230;
	}

	/* Stats Summary Card */
	.stats-summary-card {
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		padding: 12px 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.stats-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.stats-label {
		font-size: 0.72rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
	}

	.color-dots {
		display: flex;
		gap: 3px;
	}

	.stats-metrics-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 8px;
	}

	.metric-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 8px 4px;
		background: rgba(0, 0, 0, 0.25);
		border-radius: var(--radius-sm);
		border: 1px solid rgba(255, 255, 255, 0.04);
	}

	.metric-box.price-box {
		grid-column: span 3;
		flex-direction: row;
		justify-content: space-between;
		padding: 8px 12px;
	}

	.metric-value {
		font-size: 1rem;
		font-weight: 700;
		color: hsl(var(--foreground));
	}

	.metric-title {
		font-size: 0.68rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}

	/* Quick Links */
	.quick-links-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}

	.quick-action-button {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		cursor: pointer;
		text-align: left;
		transition: all 0.15s ease;
	}

	.quick-action-button:hover {
		background: rgba(255, 255, 255, 0.07);
		border-color: rgba(255, 255, 255, 0.15);
		transform: translateX(2px);
	}

	.action-btn-text {
		display: flex;
		flex-direction: column;
	}

	.action-btn-title {
		font-size: 0.82rem;
		font-weight: 600;
	}

	.action-btn-desc {
		font-size: 0.72rem;
		color: hsl(var(--muted-foreground));
	}

	/* Danger Zone */
	.danger-group {
		margin-top: auto;
		padding-top: 12px;
		border-top: 1px solid rgba(239, 68, 68, 0.2);
	}

	.danger-title {
		color: hsl(var(--destructive));
	}

	.btn-delete {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		padding: 9px 12px;
		background: hsl(var(--destructive) / 0.15);
		border: 1px solid hsl(var(--destructive) / 0.4);
		border-radius: var(--radius-sm);
		color: hsl(var(--destructive));
		font-size: 0.82rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.btn-delete:hover {
		background: hsl(var(--destructive));
		color: white;
	}
</style>
