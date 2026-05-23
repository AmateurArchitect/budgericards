<script>
	import { fade, fly } from "svelte/transition";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
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
			height: 300,
		};

		const padding = 12;
		const gap = 8;

		let nextTop = rect.bottom + gap;
		let nextLeft = rect.right - modalRect.width;

		// Viewport Safety: Right/Left
		nextLeft = Math.max(
			padding,
			Math.min(nextLeft, window.innerWidth - modalRect.width - padding),
		);

		// Viewport Safety: Bottom clamping
		if (nextTop + modalRect.height > window.innerHeight - padding) {
			nextTop = rect.top - modalRect.height - gap;
		}

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
			in:fade={{ duration: 150 }}
			out:fade={{ duration: 150 }}
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
			in:fly={{ y: 8, duration: 200 }}
			out:fly={{ y: 8, duration: 150 }}
		>
			<div class="modal-body">
				<div class="form-group toggle-group">
					<label for="show-prices-search" class="toggle-label"
						>Show Prices</label
					>
					<label class="switch">
						<input
							type="checkbox"
							id="show-prices-search"
							bind:checked={settingsStore.showPrices}
						/>
						<span class="slider"></span>
					</label>
				</div>
				<div class="form-group toggle-group">
					<label for="use-color-id-search" class="toggle-label"
						>Use Color Identity</label
					>
					<label class="switch">
						<input
							type="checkbox"
							id="use-color-id-search"
							bind:checked={settingsStore.useColorIdentity}
						/>
						<span class="slider"></span>
					</label>
				</div>
				{#if deckStore.commander.length > 0}
					<div
						class="form-group toggle-group"
						transition:fade={{ duration: 150 }}
					>
						<label for="match-identity" class="toggle-label"
							>Use Commander ID</label
						>
						<label class="switch">
							<input
								type="checkbox"
								id="match-identity"
								bind:checked={settingsStore.useCommanderColors}
							/>
							<span class="slider"></span>
						</label>
					</div>
				{/if}
				{#if deckStore.companion.length > 0}
					<div
						class="form-group toggle-group"
						transition:fade={{ duration: 150 }}
					>
						<label for="match-companion" class="toggle-label"
							>Companion Legal</label
						>
						<label class="switch">
							<input
								type="checkbox"
								id="match-companion"
								bind:checked={settingsStore.matchCompanion}
							/>
							<span class="slider"></span>
						</label>
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
		width: 220px;
		box-shadow:
			0 20px 50px rgba(0, 0, 0, 0.4),
			0 0 0 1px hsl(var(--border) / 0.3);
		display: flex;
		flex-direction: column;
		outline: none;
		pointer-events: auto;
	}

	.modal-body {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
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

	.toggle-label {
		font-size: 0.8125rem;
		color: hsl(var(--foreground));
		font-weight: 500;
	}

	/* Switch component (shared with ViewOptionsModal) */
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
</style>
