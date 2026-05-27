<script>
	import { onMount, tick } from "svelte";
	import { fade, scale } from "svelte/transition";
	import { RESOLVED_ART } from "$lib/constants/resolved-art.js";
	import selectedArtList from "$lib/constants/selected-art.json";
	import { Search, X, ChevronLeft, ChevronRight, Eye, Check, Image as ImageIcon } from "lucide-svelte";

	// Filter state
	let searchQuery = $state("");
	let selectedCategory = $state("All");

	// Selection state
	let selectedUrls = $state(selectedArtList || []);

	/**
	 * @param {MouseEvent} e
	 * @param {string} url
	 */
	async function toggleSelect(e, url) {
		e.stopPropagation();

		// Store scroll position of the main gallery container
		const main = document.querySelector('.gallery-main');
		const scrollTop = main ? main.scrollTop : 0;

		// Move focus to the container to prevent focus loss scroll jumps
		if (main instanceof HTMLElement) {
			main.focus({ preventScroll: true });
		}

		if (selectedUrls.includes(url)) {
			selectedUrls = selectedUrls.filter(u => u !== url);
		} else {
			selectedUrls = [...selectedUrls, url];
		}
		
		// Send payload to local API
		fetch('/api/save-selection', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(selectedUrls)
		}).catch(err => console.error('Failed to save selection:', err));

		// Restore scroll position after the browser completes the layout reflow
		setTimeout(() => {
			if (main) {
				main.scrollTop = scrollTop;
			}
		}, 0);
	}

	// Category lists
	const categories = ["All", "Landscapes", "Sagas", "Objects", "Creatures"];

	// Filter the artworks reactively based on category and search query
	let filteredArt = $derived(
		RESOLVED_ART.filter((art) => {
			const matchesCategory = selectedCategory === "All" || art.category === selectedCategory;
			const matchesSearch =
				art.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
				art.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
				art.setCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
				(art.set && art.set.toLowerCase().includes(searchQuery.toLowerCase()));
			return matchesCategory && matchesSearch;
		})
	);

	// Separate checked and unchecked lists reactively
	let checkedArt = $derived(filteredArt.filter(art => selectedUrls.includes(art.url)));
	let uncheckedArt = $derived(filteredArt.filter(art => !selectedUrls.includes(art.url)));

	// Lightbox state
	let activeIndex = $state(-1);
	let lightboxListType = $state("checked"); // "checked" or "unchecked"
	let activeList = $derived(lightboxListType === "checked" ? checkedArt : uncheckedArt);
	let selectedArt = $derived(activeIndex >= 0 ? activeList[activeIndex] : null);

	// Reset lightbox index if filtered list changes and exceeds length
	$effect(() => {
		if (activeIndex >= activeList.length) {
			activeIndex = -1;
		}
	});

	// Image load states to handle smooth fade-ins
	/** @type {Record<string, boolean>} */
	let loadedImages = $state({});

	/** @param {string} url */
	function handleImageLoad(url) {
		loadedImages = { ...loadedImages, [url]: true };
	}

	// Lightbox navigation
	/** 
	 * @param {number} index 
	 * @param {string} type
	 */
	function openLightbox(index, type) {
		lightboxListType = type;
		activeIndex = index;
	}

	function closeLightbox() {
		activeIndex = -1;
	}

	/** @param {MouseEvent} [e] */
	function nextImage(e) {
		if (e) e.stopPropagation();
		if (activeList.length === 0) return;
		activeIndex = (activeIndex + 1) % activeList.length;
	}

	/** @param {MouseEvent} [e] */
	function prevImage(e) {
		if (e) e.stopPropagation();
		if (activeList.length === 0) return;
		activeIndex = (activeIndex - 1 + activeList.length) % activeList.length;
	}

	// Keyboard accessibility
	/** @param {KeyboardEvent} e */
	function handleKeyDown(e) {
		if (activeIndex === -1) return;
		if (e.key === "ArrowRight") {
			nextImage();
		} else if (e.key === "ArrowLeft") {
			prevImage();
		} else if (e.key === "Escape") {
			closeLightbox();
		}
	}

	// Reactive aspect ratio calculations for the active lightbox image
	let lightboxW = $state(580);
	let lightboxH = $state(600);

	$effect(() => {
		if (selectedArt) {
			const img = new Image();
			img.referrerPolicy = "no-referrer";
			img.src = selectedArt.url;
			img.onload = () => {
				const aspect = img.naturalWidth / img.naturalHeight;
				
				// Set maximum bounding box sizes for the image pane on desktop
				const W_max = 680;
				const H_max = 650;
				
				if (W_max / H_max > aspect) {
					// Bounding box is wider than image aspect ratio (constraint is height)
					lightboxH = H_max;
					lightboxW = Math.round(H_max * aspect);
				} else {
					// Bounding box is taller than image aspect ratio (constraint is width)
					lightboxW = W_max;
					lightboxH = Math.round(W_max / aspect);
				}
			};
		}
	});

	onMount(() => {
		window.addEventListener("keydown", handleKeyDown);
		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	});
</script>

<div class="gallery-wrapper">
	<!-- Top Navigation & Header -->
	<header class="gallery-header">
		<div class="header-top-row">
			<div class="title-section">
				<div class="title-row">
					<h1 class="gallery-title">Artwork Collection</h1>
					<span class="results-count">{filteredArt.length} / {RESOLVED_ART.length} Artworks</span>
				</div>
				<p class="gallery-subtitle">A curation of high-fidelity illustrations and card arts</p>
			</div>

			<a href="/" class="back-link">
				<span>← Back to deckbuilder</span>
			</a>
		</div>

		<!-- Toolbar: Categories and Search -->
		<div class="gallery-toolbar">
			<div class="categories-bar">
				{#each categories as category}
					<button
						type="button"
						class="category-tab"
						class:active={selectedCategory === category}
						onclick={() => selectedCategory = category}
					>
						{category}
					</button>
				{/each}
			</div>

			<div class="search-box">
				<Search size={16} class="search-icon" />
				<input
					type="text"
					placeholder="Search by name, artist, set..."
					bind:value={searchQuery}
					class="search-input"
				/>
				{#if searchQuery}
					<button type="button" class="clear-search" onclick={() => searchQuery = ""}>
						<X size={14} />
					</button>
				{/if}
			</div>
		</div>
	</header>

	<!-- Gallery Sections Container -->
	<main class="gallery-main" tabindex="-1">
		{#if filteredArt.length === 0}
			<div class="empty-state" transition:fade>
				<ImageIcon size={48} class="empty-icon" />
				<p>No artworks match your search or filter criteria.</p>
				<button type="button" class="reset-btn" onclick={() => { searchQuery = ""; selectedCategory = "All"; }}>
					Reset Filters
				</button>
			</div>
		{:else}
			<!-- Checked Section -->
			<section class="gallery-section">
				<div class="section-header">
					<div class="section-title-group">
						<span class="section-indicator checked-dot"></span>
						<h2 class="section-title">Checked Backgrounds</h2>
						<span class="section-badge">{checkedArt.length}</span>
					</div>
					<p class="section-subtitle">These artworks will rotate on the login screen background</p>
				</div>

				{#if checkedArt.length === 0}
					<div class="section-empty-state" transition:fade>
						<p class="empty-text">No backgrounds are checked. The login screen will automatically fallback to rotating all artworks.</p>
					</div>
				{:else}
					<div class="masonry-grid">
						{#each checkedArt as art, index (art.url)}
							<div class="masonry-item">
								<div class="art-card-wrapper">
									<button 
										type="button"
										class="art-container" 
										onclick={() => openLightbox(index, "checked")}
										aria-label="View large version of {art.name}"
									>
										<div class="image-wrapper">
											{#if !loadedImages[art.url]}
												<div class="image-skeleton">
													<div class="skeleton-shimmer"></div>
												</div>
											{/if}

											<img
												src={art.url}
												alt={art.name}
												class="art-image"
												class:loaded={loadedImages[art.url]}
												onload={() => handleImageLoad(art.url)}
												loading="lazy"
												referrerpolicy="no-referrer"
											/>
										</div>

										<div class="art-badge">
											{art.setCode}
										</div>

										<div class="art-overlay">
											<div class="art-details">
												<h3 class="art-name">{art.name}</h3>
												<p class="art-artist">Art by {art.artist}</p>
												{#if art.set}
													<p class="art-set">{art.set} · #{art.collectorNumber}</p>
												{/if}
											</div>
											<div class="view-indicator">
												<Eye size={16} />
											</div>
										</div>
									</button>

									<button
										type="button"
										class="select-toggle-btn selected"
										onclick={(e) => toggleSelect(e, art.url)}
										aria-label="Deselect artwork"
									>
										<Check size={12} class="check-icon" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>

			<!-- Separator -->
			<div class="section-divider"></div>

			<!-- Unchecked Section -->
			<section class="gallery-section">
				<div class="section-header">
					<div class="section-title-group">
						<span class="section-indicator unchecked-dot"></span>
						<h2 class="section-title">Unchecked Artworks</h2>
						<span class="section-badge">{uncheckedArt.length}</span>
					</div>
					<p class="section-subtitle">Artworks excluded from rotating on the login screen</p>
				</div>

				{#if uncheckedArt.length === 0}
					<div class="section-empty-state" transition:fade>
						<p class="empty-text">All artworks are checked as active backgrounds.</p>
					</div>
				{:else}
					<div class="masonry-grid">
						{#each uncheckedArt as art, index (art.url)}
							<div class="masonry-item">
								<div class="art-card-wrapper">
									<button 
										type="button"
										class="art-container" 
										onclick={() => openLightbox(index, "unchecked")}
										aria-label="View large version of {art.name}"
									>
										<div class="image-wrapper">
											{#if !loadedImages[art.url]}
												<div class="image-skeleton">
													<div class="skeleton-shimmer"></div>
												</div>
											{/if}

											<img
												src={art.url}
												alt={art.name}
												class="art-image"
												class:loaded={loadedImages[art.url]}
												onload={() => handleImageLoad(art.url)}
												loading="lazy"
												referrerpolicy="no-referrer"
											/>
										</div>

										<div class="art-badge">
											{art.setCode}
										</div>

										<div class="art-overlay text-muted-overlay">
											<div class="art-details">
												<h3 class="art-name">{art.name}</h3>
												<p class="art-artist">Art by {art.artist}</p>
												{#if art.set}
													<p class="art-set">{art.set} · #{art.collectorNumber}</p>
												{/if}
											</div>
											<div class="view-indicator">
												<Eye size={16} />
											</div>
										</div>
									</button>

									<button
										type="button"
										class="select-toggle-btn"
										onclick={(e) => toggleSelect(e, art.url)}
										aria-label="Select artwork"
									>
										<Check size={12} class="check-icon" />
									</button>
								</div>
							</div>
						{/each}
					</div>
				{/if}
			</section>
		{/if}
	</main>

	<!-- Lightbox / Fullscreen details modal -->
	{#if selectedArt}
		<!-- Modal Backdrop -->
		<div 
			class="lightbox-backdrop" 
			transition:fade={{ duration: 250 }} 
			onclick={closeLightbox}
			role="presentation"
		>
			<button 
				type="button" 
				class="lightbox-close" 
				onclick={closeLightbox} 
				aria-label="Close details"
			>
				<X size={20} />
			</button>

			<!-- Left arrow -->
			{#if activeList.length > 1}
				<button 
					type="button" 
					class="nav-btn prev-btn" 
					onclick={prevImage} 
					aria-label="Previous artwork"
				>
					<ChevronLeft size={24} />
				</button>
			{/if}

			<!-- Lightbox Content Panel -->
			<div 
				class="lightbox-content" 
				style="--img-w: {lightboxW}px; --img-h: {lightboxH}px;"
				transition:scale={{ duration: 250, start: 0.95 }}
				onclick={(e) => e.stopPropagation()}
				role="presentation"
			>
				<div class="lightbox-image-pane">
					<img
						src={selectedArt.url}
						alt={selectedArt.name}
						class="lightbox-image"
						referrerpolicy="no-referrer"
					/>
				</div>
				
				<div class="lightbox-info-pane">
					<div class="lightbox-meta">
						<span class="lightbox-category">{selectedArt.category}</span>
						<span class="lightbox-set-badge">{selectedArt.setCode} · #{selectedArt.collectorNumber}</span>
					</div>
					
					<h2 class="lightbox-title">{selectedArt.name}</h2>
					
					<div class="lightbox-divider"></div>
					
					<div class="info-group">
						<span class="info-label">Artist</span>
						<span class="info-value artist-name">{selectedArt.artist}</span>
					</div>

					{#if selectedArt.set}
						<div class="info-group">
							<span class="info-label">Set Name</span>
							<span class="info-value">{selectedArt.set}</span>
						</div>
					{/if}

					<div class="info-group">
						<span class="info-label">Source</span>
						<a 
							href={selectedArt.url} 
							target="_blank" 
							rel="noreferrer" 
							class="info-value source-link"
						>
							View Original Image URL ↗
						</a>
					</div>
				</div>
			</div>

			<!-- Right arrow -->
			{#if activeList.length > 1}
				<button 
					type="button" 
					class="nav-btn next-btn" 
					onclick={nextImage} 
					aria-label="Next artwork"
				>
					<ChevronRight size={24} />
				</button>
			{/if}
		</div>
	{/if}
</div>

<style>
	.gallery-wrapper {
		display: flex;
		flex-direction: column;
		width: 100vw;
		height: 100vh;
		background-color: #0d0d0f;
		color: #ffffff;
		overflow: hidden;
		box-sizing: border-box;
	}

	/* Header styling */
	.gallery-header {
		padding: 1.25rem 2.5rem;
		background: linear-gradient(to bottom, #09090b 0%, rgba(13, 13, 15, 0.95) 100%);
		border-bottom: 1px solid rgba(255, 255, 255, 0.05);
		display: flex;
		flex-direction: column;
		gap: 1rem;
		position: relative;
	}

	.header-top-row {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		width: 100%;
	}

	.title-row {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.results-count {
		font-size: 0.6875rem;
		font-weight: 700;
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.05);
		padding: 0.125rem 0.625rem;
		border-radius: 9999px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		color: var(--text-muted);
		text-decoration: none;
		font-size: 0.8125rem;
		font-weight: 600;
		transition: color 0.15s;
		margin-top: 0.25rem;
	}

	.back-link:hover {
		color: var(--text-primary);
	}

	.title-section {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.gallery-title {
		font-size: 1.5rem;
		font-weight: 700;
		letter-spacing: -0.02em;
		background: linear-gradient(135deg, #a78bfa 0%, #60a5fa 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
		line-height: 1.2;
	}

	.gallery-subtitle {
		font-size: 0.75rem;
		color: var(--text-secondary);
	}

	/* Toolbar grid */
	.gallery-toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		width: 100%;
	}

	.categories-bar {
		display: flex;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-md);
		padding: 4px;
		gap: 2px;
	}

	.category-tab {
		background: none;
		border: none;
		color: var(--text-secondary);
		font-size: 0.8125rem;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-sm);
		cursor: pointer;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.category-tab:hover {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.04);
	}

	.category-tab.active {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
	}

	/* Search Input Box */
	.search-box {
		position: relative;
		display: flex;
		align-items: center;
		min-width: 280px;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		padding: 0 0.75rem;
		height: 2.5rem;
		transition: var(--transition);
	}

	.search-box:focus-within {
		border-color: hsl(var(--primary));
		background: rgba(0, 0, 0, 0.4);
		box-shadow: 0 0 0 3px hsla(var(--primary-hsl), 0.15);
	}

	:global(.search-box .search-icon) {
		color: var(--text-muted);
		margin-right: 0.5rem;
		flex-shrink: 0;
	}

	.search-input {
		background: none;
		border: none;
		outline: none;
		color: #ffffff;
		font-size: 0.875rem;
		width: 100%;
		height: 100%;
	}

	.search-input::placeholder {
		color: var(--text-muted);
	}

	.clear-search {
		background: none;
		border: none;
		color: var(--text-muted);
		cursor: pointer;
		display: flex;
		align-items: center;
		padding: 2px;
		border-radius: 50%;
	}

	.clear-search:hover {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.1);
	}



	/* Main section with custom scrollbar */
	.gallery-main {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem 2.5rem 2.5rem 2.5rem;
	}

	/* Gallery sections */
	.gallery-section {
		margin-bottom: 2.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.section-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-bottom: 1px solid rgba(255, 255, 255, 0.04);
		padding-bottom: 0.75rem;
	}

	.section-title-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.section-indicator {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		flex-shrink: 0;
	}

	.checked-dot {
		background-color: #10b981;
		box-shadow: 0 0 8px rgba(16, 185, 129, 0.5);
	}

	.unchecked-dot {
		background-color: #6b7280;
	}

	.section-title {
		font-size: 1.125rem;
		font-weight: 600;
		color: #ffffff;
		letter-spacing: -0.01em;
		margin: 0;
	}

	.section-badge {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--text-secondary);
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.06);
		padding: 0.125rem 0.5rem;
		border-radius: 9999px;
	}

	.section-subtitle {
		font-size: 0.75rem;
		color: var(--text-muted);
		margin: 0;
	}

	.section-divider {
		height: 1px;
		background: linear-gradient(to right, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.02) 50%, transparent);
		margin-bottom: 2.5rem;
	}

	.section-empty-state {
		padding: 2.5rem;
		text-align: center;
		background: rgba(255, 255, 255, 0.01);
		border: 1px dashed rgba(255, 255, 255, 0.04);
		border-radius: var(--radius-md);
	}

	.empty-text {
		font-size: 0.8125rem;
		color: var(--text-muted);
		margin: 0;
	}

	.text-muted-overlay {
		background: linear-gradient(to top, rgba(0, 0, 0, 0.9) 0%, rgba(0, 0, 0, 0.4) 100%) !important;
	}

	.text-muted-overlay .art-name {
		color: rgba(255, 255, 255, 0.7) !important;
	}

	.text-muted-overlay .art-artist {
		color: rgba(255, 255, 255, 0.5) !important;
	}

	/* CSS column masonry layout */
	.masonry-grid {
		column-count: 1;
		column-gap: 0.75rem;
		width: 100%;
	}

	@media (min-width: 640px) {
		.masonry-grid {
			column-count: 2;
		}
	}

	@media (min-width: 1024px) {
		.masonry-grid {
			column-count: 3;
		}
	}

	@media (min-width: 1440px) {
		.masonry-grid {
			column-count: 4;
		}
	}

	.masonry-item {
		break-inside: avoid;
		margin-bottom: 0.75rem;
	}

	/* Art container with same styles as login page */
	.art-container {
		display: block;
		position: relative;
		width: 100%;
		border-radius: 6px;
		overflow: hidden;
		background-color: #0c0c0e;
		box-shadow: 0 4px 20px -8px rgba(0, 0, 0, 0.8);
		border: none;
		padding: 0;
		cursor: pointer;
		transition: transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), box-shadow 0.3s;
		text-align: left;
	}

	.art-container::after {
		content: "";
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		border-radius: 6px;
		pointer-events: none;
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
		z-index: 5;
		transition: box-shadow 0.3s;
	}

	.art-container:hover {
		transform: translateY(-2px);
		box-shadow: 0 12px 32px -12px rgba(96, 165, 250, 0.25), 0 4px 20px rgba(0, 0, 0, 0.5);
	}

	.art-container:hover::after {
		box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
	}

	.image-wrapper {
		position: relative;
		width: 100%;
		overflow: hidden;
		background-color: #08080a;
	}

	.art-image {
		display: block;
		width: 100%;
		height: auto;
		object-fit: cover;
		opacity: 0;
		transition: opacity 0.5s ease, transform 0.5s cubic-bezier(0.25, 1, 0.5, 1);
	}

	.art-image.loaded {
		opacity: 1;
	}

	.art-container:hover .art-image {
		transform: scale(1.03);
	}

	/* Image shimmer skeleton */
	.image-skeleton {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(255, 255, 255, 0.02);
		min-height: 200px;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.skeleton-shimmer {
		width: 100%;
		height: 100%;
		background: linear-gradient(
			90deg,
			transparent 0%,
			rgba(255, 255, 255, 0.03) 50%,
			transparent 100%
		);
		animation: shimmer 1.5s infinite;
	}

	@keyframes shimmer {
		0% {
			transform: translateX(-100%);
		}
		100% {
			transform: translateX(100%);
		}
	}

	/* Subtle metadata badge */
	.art-badge {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: rgba(12, 12, 14, 0.7);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.06);
		color: rgba(255, 255, 255, 0.7);
		font-size: 0.625rem;
		font-weight: 700;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		letter-spacing: 0.05em;
		z-index: 10;
		transition: opacity 0.2s;
	}

	/* Hover overlay for details */
	.art-overlay {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(
			to top,
			rgba(8, 8, 10, 0.95) 0%,
			rgba(8, 8, 10, 0.7) 60%,
			transparent 100%
		);
		padding: 1.5rem 1rem 1rem 1rem;
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		opacity: 0;
		transform: translateY(4px);
		transition: opacity 0.3s cubic-bezier(0.25, 1, 0.5, 1), transform 0.3s cubic-bezier(0.25, 1, 0.5, 1);
		z-index: 6;
	}

	.art-container:hover .art-overlay {
		opacity: 1;
		transform: translateY(0);
	}

	.art-details {
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 80%;
	}

	.art-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: #ffffff;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.art-artist {
		font-size: 0.75rem;
		font-weight: 500;
		color: rgba(255, 255, 255, 0.6);
	}

	.art-set {
		font-size: 0.6875rem;
		color: var(--text-muted);
	}

	.view-indicator {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	/* Empty state */
	.empty-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 6rem 2rem;
		color: var(--text-secondary);
		gap: 1rem;
	}

	:global(.empty-icon) {
		color: var(--text-muted);
		animation: pulse 2s infinite;
	}

	@keyframes pulse {
		0%, 100% {
			opacity: 0.6;
		}
		50% {
			opacity: 0.3;
		}
	}

	.reset-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #ffffff;
		padding: 0.5rem 1.25rem;
		font-size: 0.8125rem;
		font-weight: 600;
		border-radius: var(--radius-md);
		cursor: pointer;
		transition: var(--transition);
	}

	.reset-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
	}

	/* Lightbox styling */
	.lightbox-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: rgba(6, 6, 8, 0.85);
		backdrop-filter: blur(16px);
		z-index: 100;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 2rem;
	}

	.lightbox-close {
		position: absolute;
		top: 2rem;
		right: 2rem;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #ffffff;
		width: 2.75rem;
		height: 2.75rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: var(--transition);
		z-index: 110;
	}

	.lightbox-close:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.05);
	}

	.nav-btn {
		position: absolute;
		background: rgba(255, 255, 255, 0.04);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #ffffff;
		width: 3rem;
		height: 3rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: var(--transition);
		z-index: 105;
		top: 50%;
		transform: translateY(-50%);
	}

	.nav-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.2);
		transform: translateY(-50%) scale(1.05);
	}

	.prev-btn {
		left: 2rem;
	}

	.next-btn {
		right: 2rem;
	}

	/* Lightbox contents card */
	.lightbox-content {
		position: relative;
		display: flex;
		flex-direction: column;
		width: 100%;
		max-width: 900px;
		max-height: 85vh;
		background: #09090b;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		overflow: hidden;
		box-shadow: 0 24px 64px -16px rgba(0, 0, 0, 0.9);
	}

	@media (min-width: 768px) {
		.lightbox-content {
			flex-direction: row;
			width: calc(var(--img-w, 580px) + 320px);
			height: var(--img-h, 600px);
			max-width: 95vw;
			max-height: 90vh;
			transition: width 0.3s cubic-bezier(0.25, 1, 0.5, 1), height 0.3s cubic-bezier(0.25, 1, 0.5, 1);
		}
	}

	.lightbox-image-pane {
		background: #040405;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		min-height: 300px;
		height: 100%;
	}

	@media (min-width: 768px) {
		.lightbox-image-pane {
			width: var(--img-w, 580px);
			height: var(--img-h, 600px);
			flex: none;
			transition: width 0.3s cubic-bezier(0.25, 1, 0.5, 1), height 0.3s cubic-bezier(0.25, 1, 0.5, 1);
		}
	}

	.lightbox-image {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.lightbox-info-pane {
		width: 100%;
		background: #0c0c0e;
		border-top: 1px solid rgba(255, 255, 255, 0.05);
		padding: 2rem;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	@media (min-width: 768px) {
		.lightbox-info-pane {
			width: 320px;
			border-top: none;
			border-left: 1px solid rgba(255, 255, 255, 0.05);
		}
	}

	.lightbox-meta {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 1rem;
		flex-wrap: wrap;
	}

	.lightbox-category {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: #a78bfa;
		background: rgba(167, 139, 250, 0.1);
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
	}

	.lightbox-set-badge {
		font-size: 0.625rem;
		font-weight: 700;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgba(255, 255, 255, 0.6);
		background: rgba(255, 255, 255, 0.05);
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm);
		border: 1px solid rgba(255, 255, 255, 0.05);
	}

	.lightbox-title {
		font-size: 1.375rem;
		font-weight: 600;
		color: #ffffff;
		line-height: 1.25;
		letter-spacing: -0.02em;
		margin-bottom: 1.5rem;
	}

	.lightbox-divider {
		height: 1px;
		background: rgba(255, 255, 255, 0.06);
		margin-bottom: 1.5rem;
		width: 100%;
	}

	.info-group {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 1.25rem;
	}

	.info-label {
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.info-value {
		font-size: 0.875rem;
		color: rgba(255, 255, 255, 0.85);
		font-weight: 500;
	}

	.artist-name {
		font-size: 1rem;
		color: #ffffff;
		font-weight: 600;
	}

	.source-link {
		color: #60a5fa;
		text-decoration: none;
		display: inline-block;
		transition: color 0.15s;
		font-size: 0.8125rem;
	}

	.source-link:hover {
		color: #93c5fd;
		text-decoration: underline;
	}

	.art-card-wrapper {
		position: relative;
		width: 100%;
		border-radius: 6px;
	}

	.select-toggle-btn {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		z-index: 15;
		background: rgba(12, 12, 14, 0.6);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: rgba(255, 255, 255, 0.6);
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
	}

	.art-card-wrapper:hover .select-toggle-btn,
	.select-toggle-btn.selected {
		opacity: 1;
	}

	.select-toggle-btn:hover {
		background: rgba(255, 255, 255, 0.12);
		color: #ffffff;
		transform: scale(1.05);
	}

	.select-toggle-btn.selected {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
		color: #ffffff;
		box-shadow: 0 0 12px hsla(var(--primary-hsl), 0.5);
	}
</style>
