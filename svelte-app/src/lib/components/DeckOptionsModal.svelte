<script>
	import { fade, fly } from 'svelte/transition';
	import { ChevronDown, ChevronRight } from 'lucide-svelte';
	import { deckStore } from '$lib/stores/deck.svelte.js';
	import Input from '$lib/components/ui/Input.svelte';
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
		const modalRect = modalElement?.getBoundingClientRect() || { width: 440, height: 120 };
		
		const padding = 20;
		const gap = 8;
		
		const spaceBelow = window.innerHeight - rect.bottom - padding - gap;
		const spaceAbove = rect.top - padding - gap;
		
		let nextTop = rect.bottom + gap;
		let nextLeft = rect.left;

		// Adaptive Flip: Only flip if space is very tight and above is significantly better
		if (spaceBelow < 150 && spaceAbove > spaceBelow) {
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
	/** @type {any} */
	let closeTimer = null;

	function close() {
		isOpen = false;
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

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (isOpen && e.key === 'Escape') {
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
							placeholder="Name & Save Your Deck"
							onkeydown={handleInputKeydown}
							autofocus
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
			</div>
		</div>
	</div>
{/if}

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
		width: 440px;
		box-shadow: 
			0 20px 50px rgba(0, 0, 0, 0.5), 
			0 0 0 1px hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		outline: none;
		pointer-events: auto;
	}

	.modal-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
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
		width: 140px;
		position: relative;
	}

	label {
		display: block;
		font-size: 0.75rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: hsl(var(--muted-foreground));
		margin-bottom: 0.5rem;
	}

	/* Custom Dropdown Styling */
	.custom-dropdown {
		position: relative;
		width: 100%;
	}

	.dropdown-trigger {
		width: 100%;
		height: 40px;
		padding: 0 0.85rem;
		background: hsl(var(--input) / 0.4);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius-md);
		color: hsl(var(--foreground));
		font-size: 0.9rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
	}

	.dropdown-trigger:hover {
		background: hsl(var(--input) / 0.6);
		border-color: hsl(var(--border));
	}

	.chevron-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		color: hsl(var(--muted-foreground));
		transition: transform 0.2s ease;
	}

	.chevron-wrapper.open {
		transform: rotate(180deg);
	}

	.dropdown-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		z-index: 1000;
	}

	.dropdown-menu {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		width: 100%;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: 1001;
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.dropdown-item {
		width: 100%;
		padding: 0.5rem 0.75rem;
		font-size: 0.85rem;
		color: hsl(var(--foreground));
		background: transparent;
		border: none;
		border-radius: var(--radius-sm);
		cursor: pointer;
		text-align: left;
		transition: background 0.15s ease;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.dropdown-item:hover, .dropdown-item.active-parent {
		background: hsl(var(--accent));
		color: hsl(var(--accent-foreground));
	}

	.dropdown-item.active {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		font-weight: 500;
	}

	.nested-menu-container {
		position: relative;
		width: 100%;
	}

	.nested-menu {
		position: absolute;
		top: 0;
		left: calc(100% + 4px);
		width: 130px;
		background: hsl(var(--popover));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		z-index: 1002;
		padding: 0.25rem;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.chevron-right {
		display: flex;
		align-items: center;
		color: hsl(var(--muted-foreground));
	}
</style>
