<script>
	import { fade, fly } from "svelte/transition";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { onMount, tick } from "svelte";

	/** @type {{ isOpen: boolean, triggerElement: HTMLElement | null }} */
	let { isOpen = $bindable(false), triggerElement = null } = $props();

	/** @type {HTMLElement | null} */
	let modalElement = $state(null);
	let top = $state(0);
	let left = $state(0);

	async function updatePosition() {
		if (!isOpen || !triggerElement) return;
		await tick();

		const rect = triggerElement.getBoundingClientRect();
		const modalRect = modalElement?.getBoundingClientRect() || {
			width: 240,
			height: 450,
		};

		const padding = 12;
		const gap = 8;

		// Calculate available space
		const spaceBelow = window.innerHeight - rect.bottom - padding - gap;
		const spaceAbove = rect.top - padding - gap;

		let nextTop = rect.bottom + gap;
		let nextLeft = rect.right - modalRect.width;

		// Only flip if space below is tiny AND space above is significantly larger
		if (spaceBelow < 200 && spaceAbove > spaceBelow) {
			nextTop = rect.top - modalRect.height - gap;
		}

		// Viewport Safety: Right/Left
		nextLeft = Math.max(
			padding,
			Math.min(nextLeft, window.innerWidth - modalRect.width - padding),
		);

		// Viewport Safety: Top/Bottom clamping
		// If it's still overflowing the bottom after our flip logic, the max-height CSS will handle the scrollbar
		nextTop = Math.max(
			padding,
			Math.min(nextTop, window.innerHeight - modalRect.height - padding),
		);

		top = nextTop;
		left = nextLeft;
	}

	$effect(() => {
		if (isOpen) {
			updatePosition();
			window.addEventListener("resize", updatePosition);
			window.addEventListener("scroll", updatePosition, true);
		}
		return () => {
			window.removeEventListener("resize", updatePosition);
			window.removeEventListener("scroll", updatePosition, true);
		};
	});

	function close() {
		isOpen = false;
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	}

	onMount(() => {
		window.addEventListener("keydown", handleKeydown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeydown, {
				capture: true,
			});
		};
	});

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			},
		};
	}

	let sliderProgress = $derived(((settingsStore.spoilerCardSize - 0.30) / (0.85 - 0.30)) * 100);
</script>

{#if isOpen}
	<div use:portal class="modal-portal-wrapper" style="z-index: 10000;">
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={(e) => {
				if (e.target === e.currentTarget) close();
			}}
			onkeydown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					if (e.target === e.currentTarget) close();
				}
			}}
			in:fade={{ duration: 300 }}
			out:fade={{ duration: 300 }}
		></div>

		<div
			bind:this={modalElement}
			class="modal-content"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			style="top: {top}px; left: {left}px;"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
			in:fly={{ y: 8, duration: 400 }}
			out:fly={{ y: 8, duration: 300 }}
		>
			<div class="modal-body">
				<!-- SECTION 1: PRICE TOGGLES -->
				{#if settingsStore.deckViewMode === "stacks" || settingsStore.deckViewMode === "spoiler"}
					<!-- Show Prices option -->
					<div class="form-group toggle-group">
						<label for="show-prices-view" class="toggle-label"
							>Show Prices</label
						>
						<label class="switch">
							<input
								type="checkbox"
								id="show-prices-view"
								bind:checked={settingsStore.showPrices}
							/>
							<span class="slider"></span>
						</label>
					</div>
				{/if}

				{#if settingsStore.deckViewMode === "table"}
					<!-- Show Total Price option -->
					<div class="form-group toggle-group">
						<label for="show-total-price-view" class="toggle-label"
							>Show Total Price</label
						>
						<label class="switch">
							<input
								type="checkbox"
								id="show-total-price-view"
								bind:checked={settingsStore.showTotalPrice}
							/>
							<span class="slider"></span>
						</label>
					</div>
				{/if}

				<!-- Use Color Identity option (common to all views) -->
				<div class="form-group toggle-group" style="margin-top: 0.5rem;">
					<label for="use-color-id-view" class="toggle-label"
						>Use Color Identity</label
					>
					<label class="switch">
						<input
							type="checkbox"
							id="use-color-id-view"
							bind:checked={settingsStore.useColorIdentity}
						/>
						<span class="slider"></span>
					</label>
				</div>

				<div class="divider"></div>

				<!-- SECTION 2: CMC GROUPING OPTIONS (common to all views when grouping is CMC) -->
				{#if deckStore.grouping === "cmc"}
					<div class="form-group toggle-group">
						<label for="combine-01-view" class="toggle-label"
							>Combine 0 & 1-Drops</label
						>
						<label class="switch">
							<input
								type="checkbox"
								id="combine-01-view"
								bind:checked={settingsStore.combine01Drops}
							/>
							<span class="slider"></span>
						</label>
					</div>

					<div class="form-group toggle-group" style="margin-top: 0.5rem;">
						<label for="combine-6plus-view" class="toggle-label"
							>Combine 6+ Drops</label
						>
						<label class="switch">
							<input
								type="checkbox"
								id="combine-6plus-view"
								bind:checked={settingsStore.combine6PlusDrops}
							/>
							<span class="slider"></span>
						</label>
					</div>

					<div class="divider"></div>
				{/if}

				<!-- SECTION 3: STACKS-EXCLUSIVE DROPDOWNS -->
				{#if settingsStore.deckViewMode === "stacks"}
					<!-- Combine Duplicates option -->
					<div class="form-group">
						<span class="group-label">Combine Duplicates</span>
						<div class="radio-group">
							<label class="radio-label">
								<input
									type="radio"
									name="combine-duplicates"
									value="auto"
									bind:group={settingsStore.combineDuplicates}
								/>
								<span>Auto</span>
							</label>
							<label class="radio-label">
								<input
									type="radio"
									name="combine-duplicates"
									value="always"
									bind:group={settingsStore.combineDuplicates}
								/>
								<span>Always</span>
							</label>
							<label class="radio-label">
								<input
									type="radio"
									name="combine-duplicates"
									value="never"
									bind:group={settingsStore.combineDuplicates}
								/>
								<span>Never</span>
							</label>
						</div>
					</div>
				{/if}

				{#if settingsStore.deckViewMode === "stacks" || settingsStore.deckViewMode === "table"}
					{#if settingsStore.deckViewMode === "stacks"}
						<div class="divider"></div>
					{/if}

					<!-- Changing the spacing between compact, spacious, and auto -->
					<div class="form-group">
						<span class="group-label">Spacing</span>
						<div class="radio-group">
							<label class="radio-label">
								<input
									type="radio"
									name="spacing"
									value="auto"
									bind:group={settingsStore.curveSpacing}
								/>
								<span>Auto</span>
							</label>
							<label class="radio-label">
								<input
									type="radio"
									name="spacing"
									value="compact"
									bind:group={settingsStore.curveSpacing}
								/>
								<span>Compact</span>
							</label>
							<label class="radio-label">
								<input
									type="radio"
									name="spacing"
									value="spacious"
									bind:group={settingsStore.curveSpacing}
								/>
								<span>Spacious</span>
							</label>
						</div>
					</div>
				{/if}

				{#if settingsStore.deckViewMode === "spoiler"}
					<!-- Changing the card size with a premium minimal range slider featuring elegant stop-indicators below the track -->
					<div class="form-group">
						<span class="group-label">Card Size</span>
						<div class="minimal-slider-container">
							<div class="slider-track-wrapper">
								<!-- Inset track with dynamic blue/cyan gradient -->
								<input
									type="range"
									min="0.30"
									max="0.85"
									step="0.05"
									id="spoiler-card-size-slider"
									class="premium-slider"
									style="--slider-progress: {sliderProgress}%;"
									bind:value={settingsStore.spoilerCardSize}
								/>
							</div>

							<!-- Micro Stop Indicators below the track (50% and 75%) -->
							<div class="slider-stops">
								<div 
									class="slider-stop-indicator" 
									class:active={Math.round(settingsStore.spoilerCardSize * 100) === 50} 
									style="left: calc(8px + (100% - 16px) * 0.3636);"
								>
									<span class="stop-line"></span>
									<span class="stop-label">50%</span>
								</div>
								<div 
									class="slider-stop-indicator" 
									class:active={Math.round(settingsStore.spoilerCardSize * 100) === 75} 
									style="left: calc(8px + (100% - 16px) * 0.8182);"
								>
									<span class="stop-line"></span>
									<span class="stop-label">75%</span>
								</div>
							</div>
						</div>
					</div>
				{/if}
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
		background: transparent;
		pointer-events: auto;
	}

	.modal-content {
		position: fixed;
		z-index: 10001;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(16px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 240px;
		box-shadow:
			0 20px 50px rgba(0, 0, 0, 0.4),
			0 0 0 1px hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		max-height: calc(100vh - 40px);
		overflow: hidden;
		outline: none;
		pointer-events: auto;
	}

	.modal-body {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.divider {
		height: 1px;
		background: hsl(var(--border) / 0.4);
		margin: 0.25rem 0;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.toggle-group {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
	}

	.form-group label,
	.group-label {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.toggle-label {
		text-transform: none !important;
		letter-spacing: normal !important;
		font-size: 0.8125rem !important;
		color: hsl(var(--foreground)) !important;
		font-weight: 500 !important;
	}

	/* Switch component */
	.switch {
		position: relative;
		display: inline-block;
		width: 32px;
		height: 18px;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: hsl(var(--muted));
		transition: 0.2s;
		border-radius: var(--radius-lg);
		border: 1px solid hsl(var(--border));
	}

	.slider:before {
		position: absolute;
		content: "";
		height: 12px;
		width: 12px;
		left: 2px;
		bottom: 2px;
		background-color: hsl(var(--muted-foreground));
		transition: 0.2s;
		border-radius: 50%;
	}

	input:checked + .slider {
		background-color: hsl(var(--primary) / 0.2);
		border-color: hsl(var(--primary) / 0.5);
	}

	input:checked + .slider:before {
		transform: translateX(14px);
		background-color: hsl(var(--primary));
	}

	.radio-group {
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.radio-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.8125rem !important;
		color: hsl(var(--foreground)) !important;
		text-transform: none !important;
		letter-spacing: normal !important;
		font-weight: 500 !important;
		cursor: pointer;
		padding: 0.25rem 0;
	}

	.radio-label input[type="radio"] {
		accent-color: hsl(var(--primary));
		margin: 0;
	}

	/* Premium Minimalist Range Slider styling with Micro Stop Ticks */
	.minimal-slider-container {
		display: flex;
		flex-direction: column;
		padding: 0.25rem 0;
	}

	.slider-track-wrapper {
		position: relative;
		width: 100%;
		display: flex;
		align-items: center;
		height: 16px; /* Precise height for track overlay */
	}

	.premium-slider {
		-webkit-appearance: none;
		appearance: none;
		width: 100%;
		height: 6px; /* Pristine, sleek track */
		border-radius: 9999px;
		background: linear-gradient(
			to right,
			#00d2ff 0%,
			#0066ff var(--slider-progress),
			#e2e8f0 var(--slider-progress),
			#e2e8f0 100%
		);
		box-shadow: 
			inset 0 1.5px 3px rgba(0, 0, 0, 0.12),
			inset 0 0.5px 1px rgba(0, 0, 0, 0.08);
		outline: none;
		border: none;
		transition: background 0.1s ease;
		cursor: pointer;
		margin: 0;
		position: relative;
		z-index: 1;
	}

	.premium-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 16px; /* Precise 16px white thumb puck */
		height: 16px;
		border-radius: 50%;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		cursor: pointer;
		box-shadow: 
			0 2px 5px rgba(0, 0, 0, 0.14),
			0 1px 2px rgba(0, 0, 0, 0.08),
			inset 0 1px 1px #ffffff,
			inset 0 -0.5px 1px rgba(0, 0, 0, 0.05);
		transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
		z-index: 3;
	}

	.premium-slider::-webkit-slider-thumb:hover {
		transform: scale(1.15);
	}

	.premium-slider::-moz-range-thumb {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background: #ffffff;
		border: 1px solid rgba(0, 0, 0, 0.08);
		cursor: pointer;
		box-shadow: 
			0 2px 5px rgba(0, 0, 0, 0.14),
			0 1px 2px rgba(0, 0, 0, 0.08),
			inset 0 1px 1px #ffffff,
			inset 0 -0.5px 1px rgba(0, 0, 0, 0.05);
		transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
		position: relative;
		z-index: 3;
	}

	.premium-slider::-moz-range-thumb:hover {
		transform: scale(1.15);
	}

	/* Instrument-style micro stops under the track */
	.slider-stops {
		position: relative;
		width: 100%;
		height: 24px;
		margin-top: 2px;
	}

	.slider-stop-indicator {
		position: absolute;
		display: flex;
		flex-direction: column;
		align-items: center;
		transform: translateX(-50%);
		pointer-events: none;
	}

	.stop-line {
		width: 1.5px;
		height: 5px;
		background: hsl(var(--muted-foreground) / 0.3);
		border-radius: 99px;
		transition: all 0.15s ease;
	}

	.stop-label {
		font-size: 10px;
		font-weight: 600;
		color: hsl(var(--muted-foreground) / 0.4);
		transition: all 0.15s ease;
		margin-top: 2px;
		white-space: nowrap;
	}

	.slider-stop-indicator.active .stop-line {
		background: #0066ff;
		height: 6px;
	}

	.slider-stop-indicator.active .stop-label {
		color: #0066ff;
		font-weight: 700;
	}
</style>
