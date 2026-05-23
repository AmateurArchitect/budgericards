<script>
	import { fade, fly } from 'svelte/transition';
	import { X, Image as ImageIcon, Download, Upload, ChevronDown, ChevronRight, Copy } from 'lucide-svelte';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import Button from '$lib/components/ui/Button.svelte';
	import Input from '$lib/components/ui/Input.svelte';
	import ImportModal from '$lib/components/ImportModal.svelte';
	import { onMount, tick } from 'svelte';

	/** @type {{ isOpen: boolean, fallbackArt: string | null, triggerElement: HTMLElement | null }} */
	let { isOpen = $bindable(false), fallbackArt = null, triggerElement = null } = $props();
	/** @type {HTMLElement | null} */
	let modalElement = $state(null);
	let top = $state(0);
	let left = $state(0);

	async function updatePosition() {
		if (!isOpen || !triggerElement) return;
		await tick();
		
		const rect = triggerElement.getBoundingClientRect();
		const modalRect = modalElement?.getBoundingClientRect() || { width: 520, height: 400 };
		
		const padding = 20;
		const gap = 8;
		
		const spaceBelow = window.innerHeight - rect.bottom - padding - gap;
		const spaceAbove = rect.top - padding - gap;
		
		let nextTop = rect.bottom + gap;
		let nextLeft = rect.left;

		// Adaptive Flip: Only flip if space is very tight and above is significantly better
		if (spaceBelow < 350 && spaceAbove > spaceBelow) {
			nextTop = rect.top - modalRect.height - gap;
		}

		// Viewport Safety: Ensure we stay on screen
		nextLeft = Math.max(padding, Math.min(nextLeft, window.innerWidth - modalRect.width - padding));
		nextTop = Math.max(padding, Math.min(nextTop, window.innerHeight - modalRect.height - padding));

		top = nextTop;
		left = nextLeft;
	}

	$effect(() => {
		if (isOpen) {
			updatePosition();
			window.addEventListener('resize', updatePosition);
			window.addEventListener('scroll', updatePosition, true);
		}
		return () => {
			window.removeEventListener('resize', updatePosition);
			window.removeEventListener('scroll', updatePosition, true);
		};
	});

	let showFormatDropdown = $state(false);
	let isMoreFormatsVisible = $state(false);
	let isImportModalOpen = $state(false);
	/** @type {any} */
	let closeTimer = null;

	function close() {
		isOpen = false;
		showFormatDropdown = false;
		isMoreFormatsVisible = false;
	}

	let tempArt = $state('');
	let lastValidArt = $state('');

	// Keep local state in sync with external changes (like drag-and-drop or lead card changes)
	$effect(() => {
		const currentArt = deckStore.coverArt || fallbackArt || '';
		// We sync if deckStore.coverArt has changed OR if we're currently showing the fallback 
		// and the fallback itself has changed (e.g. new lead card)
		const isShowingFallback = !deckStore.coverArt;
		const shouldSync = deckStore.coverArt !== (lastValidArt === fallbackArt && !isShowingFallback ? null : lastValidArt) 
						 || (isShowingFallback && lastValidArt !== fallbackArt);

		if (shouldSync || !lastValidArt) {
			tempArt = currentArt;
			lastValidArt = currentArt;
		}
	});

	async function validateAndApplyArt() {
		const trimmed = tempArt.trim();
		
		// If empty, clear the art (forced empty state)
		if (trimmed === '') {
			deckStore.coverArt = '';
			lastValidArt = '';
			tempArt = '';
			return;
		}

		// Don't re-validate if it hasn't changed
		if (trimmed === lastValidArt) return;

		const isValid = await checkImage(trimmed);
		if (isValid) {
			deckStore.coverArt = trimmed;
			lastValidArt = trimmed;
		} else {
			// Revert to last valid
			tempArt = lastValidArt;
		}
	}

	/** @param {string} url */
	function checkImage(url) {
		return new Promise((resolve) => {
			const img = new Image();
			img.onload = () => resolve(true);
			img.onerror = () => resolve(false);
			img.src = url;
		});
	}

	/** @param {KeyboardEvent} e */
	async function handleArtKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			await validateAndApplyArt();
			close();
		}
	}

	function showMore() {
		clearTimeout(closeTimer);
		isMoreFormatsVisible = true;
	}

	function hideMore() {
		// Hysteresis: small delay to allow for diagonal mouse movement to the submenu
		closeTimer = setTimeout(() => {
			isMoreFormatsVisible = false;
		}, 300);
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === 'Escape') {
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

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	/** @param {KeyboardEvent} e */
	function handleInputKeydown(e) {
		if (e.key === 'Enter') {
			e.preventDefault();
			close();
		}
	}

	const primaryFormats = [
		'List',
		'Commander',
		'Standard',
		'Modern',
		'Pioneer'
	];

	const moreFormats = [
		'Pauper',
		'Legacy',
		'Vintage',
		'Brawl',
		'Oathbreaker',
		'Limited'
	];

	/** @param {string} format */
	function selectFormat(format) {
		deckStore.format = format;
		showFormatDropdown = false;
		isMoreFormatsVisible = false;
	}

	/** @param {number} timestamp */
	function timeAgo(timestamp) {
		if (!timestamp) return 'never';
		const seconds = Math.floor((Date.now() - timestamp) / 1000);
		if (seconds < 60) return 'just now';
		let interval = seconds / 31536000;
		if (interval > 1) return Math.floor(interval) + " years ago";
		interval = seconds / 2592000;
		if (interval > 1) return Math.floor(interval) + " months ago";
		interval = seconds / 86400;
		if (interval > 1) return Math.floor(interval) + " days ago";
		interval = seconds / 3600;
		if (interval > 1) return Math.floor(interval) + " hours ago";
		interval = seconds / 60;
		if (interval > 1) return Math.floor(interval) + " minutes ago";
		return Math.floor(seconds) + " seconds ago";
	}
</script>


{#if isOpen}
	<div 
		use:portal
		class="modal-portal-wrapper"
	>
		<div 
			class="modal-backdrop" 
			role="presentation" 
			onclick={(e) => {
				if (e.target === e.currentTarget) close();
			}}
			onkeydown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					if (e.target === e.currentTarget) close();
				}
			}}
			in:fade={{ duration: 150 }}
			out:fade={{ duration: 150 }}
		></div>

		<div 
			bind:this={modalElement}
			class="modal-content" 
			role="dialog" 
			aria-modal="true" 
			aria-labelledby="modal-title"
			tabindex="-1"
			style="top: {top}px; left: {left}px;"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			in:fly={{ y: 8, duration: 200 }}
			out:fly={{ y: 8, duration: 150 }}
		>
		<div class="modal-body">
			<div class="row top-row">
				<div class="form-group name-group">
					<label for="deck-name">Deck Name</label>
					<Input 
						id="deck-name" 
						bind:value={deckStore.name} 
						placeholder="Untitled Deck"
						onkeydown={handleInputKeydown}
					/>
				</div>

				<div class="form-group format-group">
					<label for="deck-format">Format</label>
					<div class="custom-dropdown">
						<button 
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
							<div 
								class="dropdown-backdrop" 
								role="presentation" 
								onclick={() => showFormatDropdown = false}
							></div>
							<div class="dropdown-menu" in:fade={{ duration: 100 }}>
								{#each primaryFormats as format}
									<button 
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
										<span class="chevron-right">
											<ChevronRight size={14} />
										</span>
									</div>
									
									{#if isMoreFormatsVisible}
										<div class="nested-menu" in:fade={{ duration: 100 }}>
											{#each moreFormats as format}
												<button 
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

			<div class="form-group art-group">
				<label for="deck-image">Cover Art URL</label>
				<div class="image-input-wrapper">
					<div class="input-icon">
						<ImageIcon size={16} />
					</div>
					<Input 
						id="deck-image" 
						bind:value={tempArt} 
						placeholder={fallbackArt || "https://..."}
						class="with-icon"
						onkeydown={handleArtKeydown}
						onblur={validateAndApplyArt}
					/>
				</div>
			</div>

			<div class="divider"></div>

			<div class="row action-row">
				<Button variant="outline" class="modal-action-btn">
					<Download size={16} class="btn-icon" />
					Export Deck
				</Button>
				<Button 
					variant={isImportModalOpen ? "default" : "outline"} 
					class="modal-action-btn" 
					onclick={() => isImportModalOpen = true}
				>
					<Upload size={16} class="btn-icon" />
					Import Cards
				</Button>
				<Button variant="outline" class="modal-action-btn">
					<Copy size={16} class="btn-icon" />
					Clone Deck
				</Button>
			</div>

			<div class="divider"></div>

			<div class="metadata-section">
				<p class="metadata-sentence">
					Created by <span class="highlight">{deckStore.metadata.createdBy}</span> {timeAgo(deckStore.metadata.createdAt)}. 
					Updated {timeAgo(deckStore.metadata.updatedAt)}.
				</p>
			</div>
		</div>
		</div>
	</div>
{/if}

<ImportModal bind:isOpen={isImportModalOpen} onSuccess={() => isOpen = false} />

<style>
	.modal-portal-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		pointer-events: none;
		z-index: 10000;
	}

	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.4);
		pointer-events: auto;
	}

	.modal-content {
		position: fixed;
		z-index: 10001;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 520px;
		box-shadow: 
			0 20px 50px rgba(0, 0, 0, 0.5), 
			0 0 0 1px hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 40px);
		outline: none;
		pointer-events: auto;
	}

	.modal-body {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		overflow-y: visible;
		flex: 1;
	}

	.row {
		display: flex;
		gap: 1rem;
		align-items: flex-end;
	}

	.name-group {
		flex: 1;
	}

	.format-group {
		width: 160px;
		position: relative;
	}

	.custom-dropdown {
		position: relative;
		width: 100%;
	}

	.dropdown-trigger {
		width: 100%;
		height: 36px;
		padding: 0 0.75rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: hsl(var(--muted) / 0.2);
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		cursor: pointer;
		transition: all 0.2s;
	}

	.chevron-wrapper {
		display: flex;
		align-items: center;
		transition: transform 0.2s;
		color: hsl(var(--muted-foreground));
	}

	.chevron-wrapper.open {
		transform: rotate(180deg);
	}

	.chevron-right {
		display: flex;
		align-items: center;
		color: hsl(var(--muted-foreground) / 0.7);
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		width: 180px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		box-shadow: 0 10px 25px rgba(0,0,0,0.4);
		padding: 4px;
		z-index: 10001;
	}

	.dropdown-item {
		width: 100%;
		height: 32px;
		padding: 0 0.75rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		color: hsl(var(--foreground));
		font-size: 0.8125rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
	}

	.dropdown-item:hover {
		background: hsl(var(--muted) / 0.4);
	}

	.dropdown-item.active {
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		font-weight: 600;
	}

	.dropdown-item.active-parent {
		background: hsl(var(--muted) / 0.4);
	}

	.nested-menu-container {
		position: relative;
	}

	.nested-menu {
		position: absolute;
		top: -4px;
		left: calc(100% + 4px);
		width: 160px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius);
		box-shadow: 0 10px 25px rgba(0,0,0,0.4);
		padding: 4px;
	}

	/* The Intent Bridge: 
	   Creates an invisible hit area between the parent and child 
	   to prevent closing during diagonal mouse movement. */
	.nested-menu::before {
		content: '';
		position: absolute;
		top: 0;
		left: -12px;
		width: 12px;
		height: 100%;
	}

	.dropdown-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 9999;
		background: transparent;
	}

	.divider {
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin: 0.25rem 0;
	}

	.action-row {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.image-input-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.input-icon {
		position: absolute;
		left: 0.75rem;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		pointer-events: none;
	}

	:global(.with-icon) {
		padding-left: 2.25rem !important;
	}

	.modal-action-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		height: 36px;
		font-size: 0.75rem;
		padding: 0 0.5rem;
	}

	.metadata-sentence {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.5;
		margin: 0;
		text-align: center;
	}

	.highlight {
		color: hsl(var(--foreground));
		font-weight: 600;
	}
</style>
