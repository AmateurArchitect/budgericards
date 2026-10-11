<script>
	import { Search, PanelLeft, Undo2, Redo2, HelpCircle } from "lucide-svelte";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import { fade, fly } from "svelte/transition";

	/** @type {{ onHelpClick?: () => void }} */
	let { onHelpClick = undefined } = $props();

	function handleSearchClick() {
		if (searchStore.isOpen) {
			searchStore.closeSearch();
		} else {
			searchStore.openSearch();
			setTimeout(() => {
				const inputEl =
					document.querySelector(".search-panel-input input") ||
					document.querySelector(".header-search-input input");
				/** @type {HTMLElement | null} */ (inputEl)?.focus();
			}, 60);
		}
	}
</script>

<nav 
	class="bottom-toolbar-container"
	aria-label="Deck workspace tools"
	in:fly={{ y: 20, duration: 250 }}
>
	<div class="toolbar-pill">
		<!-- Deck Quick Actions / Sidebar Toggle -->
		<button
			type="button"
			class="toolbar-btn"
			class:active={interactionStore.deckSidebarOpen}
			onclick={() => interactionStore.toggleDeckSidebar()}
			aria-label="Deck Quick Actions"
			title="Deck Actions & Info (⌘S)"
		>
			<PanelLeft size={16} class="btn-icon" />
			<span class="btn-label">Deck</span>
		</button>

		<div class="toolbar-divider" aria-hidden="true"></div>

		<!-- Card Search Button (Primary Focus) -->
		<button
			type="button"
			class="toolbar-btn search-trigger-btn"
			class:active={searchStore.isOpen}
			onclick={handleSearchClick}
			aria-label="Card search (⌘/ or /)"
			title="Card Search (⌘/ or /)"
		>
			<Search size={15} class="btn-icon" />
			<span class="btn-label font-semibold">Card Search</span>
			<div class="keycap-pill" aria-hidden="true">
				<span>⌘/</span>
			</div>
		</button>

		<div class="toolbar-divider" aria-hidden="true"></div>

		<!-- History: Undo & Redo -->
		<div class="history-group">
			<button
				type="button"
				class="toolbar-btn icon-only-btn"
				disabled={!deckStore.canUndo}
				onclick={() => deckStore.undo()}
				aria-label="Undo"
				title={deckStore.canUndo ? "Undo (⌘Z)" : "Nothing to undo"}
			>
				<Undo2 size={15} class="btn-icon" />
			</button>

			<button
				type="button"
				class="toolbar-btn icon-only-btn"
				disabled={!deckStore.canRedo}
				onclick={() => deckStore.redo()}
				aria-label="Redo"
				title={deckStore.canRedo ? "Redo (⌘⇧Z)" : "Nothing to redo"}
			>
				<Redo2 size={15} class="btn-icon" />
			</button>
		</div>

		<div class="toolbar-divider" aria-hidden="true"></div>

		<!-- Help / Shortcuts Modal Button -->
		<button
			type="button"
			class="toolbar-btn icon-only-btn"
			onclick={onHelpClick}
			aria-label="Shortcuts and Help"
			title="Shortcuts & About (?)"
		>
			<HelpCircle size={15} class="btn-icon" />
		</button>
	</div>
</nav>

<style>
	.bottom-toolbar-container {
		position: fixed;
		bottom: 1.25rem;
		left: 50%;
		transform: translateX(-50%);
		z-index: 1000;
		pointer-events: auto;
		user-select: none;
	}

	.toolbar-pill {
		display: flex;
		align-items: center;
		gap: 4px;
		padding: 6px;
		background: rgba(15, 18, 25, 0.88);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 9999px;
		box-shadow:
			0 12px 36px -4px rgba(0, 0, 0, 0.7),
			0 2px 8px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.1);
		transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.toolbar-pill:hover {
		border-color: rgba(255, 255, 255, 0.2);
		box-shadow:
			0 16px 44px -4px rgba(0, 0, 0, 0.8),
			0 4px 12px rgba(0, 0, 0, 0.4),
			inset 0 1px 0 rgba(255, 255, 255, 0.15);
	}

	.toolbar-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		height: 34px;
		padding: 0 12px;
		background: transparent;
		border: 1px solid transparent;
		border-radius: 9999px;
		color: hsl(var(--foreground));
		font-size: 0.82rem;
		font-weight: 500;
		cursor: pointer;
		outline: none;
		transition: all 0.15s ease;
		white-space: nowrap;
		box-sizing: border-box;
	}

	.toolbar-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.08);
		color: #ffffff;
	}

	.toolbar-btn:active:not(:disabled) {
		transform: scale(0.96);
		background: rgba(255, 255, 255, 0.12);
	}

	.toolbar-btn.active {
		background: rgba(255, 255, 255, 0.14);
		color: #ffffff;
		border-color: rgba(255, 255, 255, 0.2);
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	/* Card Search Button Prominence (Blue Primary) */
	.toolbar-btn.search-trigger-btn {
		background: hsl(var(--primary));
		border: 1px solid hsl(var(--primary));
		color: #ffffff;
		font-weight: 600;
		padding: 0 14px;
		box-shadow: 0 2px 14px hsl(var(--primary) / 0.4);
	}

	.toolbar-btn.search-trigger-btn:hover {
		background: hsl(var(--primary-light, 217 88% 68%));
		border-color: hsl(var(--primary-light, 217 88% 68%));
		box-shadow: 0 4px 18px hsl(var(--primary) / 0.55);
		color: #ffffff;
	}

	.toolbar-btn.search-trigger-btn.active {
		background: hsl(var(--primary-dark, 217 75% 51%));
		border-color: hsl(var(--primary-dark, 217 75% 51%));
		color: #ffffff;
		box-shadow: 0 2px 10px hsl(var(--primary) / 0.6), inset 0 1px 2px rgba(0, 0, 0, 0.2);
	}

	.toolbar-btn.search-trigger-btn :global(.btn-icon) {
		color: #ffffff;
	}

	.toolbar-btn.search-trigger-btn.active :global(.btn-icon) {
		color: #ffffff;
	}

	.toolbar-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}

	.icon-only-btn {
		padding: 0;
		width: 34px;
		justify-content: center;
	}

	.history-group {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.toolbar-divider {
		width: 1px;
		height: 18px;
		background: rgba(255, 255, 255, 0.12);
		margin: 0 2px;
	}

	.keycap-pill {
		display: flex;
		align-items: center;
		padding: 2px 6px;
		background: rgba(255, 255, 255, 0.08);
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 9999px;
		font-size: 0.68rem;
		font-family: var(--font-mono, monospace);
		color: hsl(var(--muted-foreground));
		margin-left: 2px;
	}

	.toolbar-btn.search-trigger-btn .keycap-pill {
		background: rgba(0, 0, 0, 0.22);
		border-color: rgba(255, 255, 255, 0.25);
		color: #ffffff;
	}

	.toolbar-btn.search-trigger-btn.active .keycap-pill {
		background: rgba(0, 0, 0, 0.35);
		border-color: rgba(255, 255, 255, 0.2);
		color: #ffffff;
	}

	@media (max-width: 640px) {
		.btn-label {
			display: none;
		}
		.toolbar-btn {
			padding: 0;
			width: 34px;
			justify-content: center;
		}
		.keycap-pill {
			display: none;
		}
	}
</style>
