<svelte:options />

<script>
	import { fade, fly } from "svelte/transition";
	import { onMount, tick } from "svelte";

	/** @typedef {Object} MenuItem
	 * @property {string} [label]
	 * @property {string[]} [shortcuts]
	 * @property {function} [action]
	 * @property {boolean} [divider]
	 * @property {boolean} [danger]
	 */

	/** @type {{
	 *   isOpen: boolean,
	 *   x: number,
	 *   y: number,
	 *   items: MenuItem[],
	 *   onClose: () => void
	 * }} */
	let {
		isOpen = $bindable(false),
		x = $bindable(0),
		y = $bindable(0),
		items = [],
		onClose,
	} = $props();

	/** @type {HTMLElement | null} */
	let menuElement = $state(null);
	let menuTop = $state(0);
	let menuLeft = $state(0);
	let shortcutIndex = $state(0);

	// Multi-shortcut toggle interval
	/** @type {ReturnType<typeof setInterval> | undefined} */
	let interval = $state();
	onMount(() => {
		interval = setInterval(() => {
			shortcutIndex = (shortcutIndex + 1) % 10; // High enough mod to handle any reasonable amount of shortcuts
		}, 3000);
		return () => clearInterval(interval);
	});

	async function updatePosition() {
		if (!isOpen) return;
		await tick();
		if (!menuElement) return;

		const menuRect = menuElement.getBoundingClientRect();
		const padding = 10;

		let nextTop = y;
		let nextLeft = x;

		// Boundary detection
		if (nextLeft + menuRect.width > window.innerWidth - padding) {
			nextLeft = x - menuRect.width;
		}
		if (nextTop + menuRect.height > window.innerHeight - padding) {
			nextTop = y - menuRect.height;
		}

		// Ensure it doesn't go off the top/left either
		nextLeft = Math.max(padding, nextLeft);
		nextTop = Math.max(padding, nextTop);

		menuTop = nextTop;
		menuLeft = nextLeft;
	}

	$effect(() => {
		if (isOpen) {
			shortcutIndex = 0;
			updatePosition();
		}
	});

	function close() {
		isOpen = false;
		if (onClose) onClose();
	}

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			},
		};
	}

	/** @param {string} shortcut */
	function getShortcutParts(shortcut) {
		const isMac =
			typeof navigator !== "undefined" &&
			/Mac|iPod|iPhone|iPad/.test(navigator.platform);

		if (shortcut.includes("Click")) {
			// Mouse actions are treated as a single descriptive label
			let label = shortcut;
			if (isMac) {
				label = label
					.replace("Shift", "⇧")
					.replace("Control", "⌃")
					.replace("Option", "⌥")
					.replace("Alt", "⌥")
					.replace("Command", "⌘")
					.replace("Meta", "⌘");
			}
			return [{ type: "text", value: label }];
		}

		// Split by + and trim
		const keys = shortcut.split("+").map((k) => k.trim());
		return keys.map((key) => {
			let value = key;
			if (isMac) {
				value = value
					.replace("Shift", "⇧")
					.replace("Control", "⌃")
					.replace("Option", "⌥")
					.replace("Alt", "⌥")
					.replace("Command", "⌘")
					.replace("Meta", "⌘")
					.replace("Delete", "⌫")
					.replace("Backspace", "⌫")
					.replace("Escape", "⎋")
					.replace("Enter", "↵")
					.replace("Return", "↵");
			} else {
				value = value
					.replace("Delete", "Del")
					.replace("Backspace", "Bksp")
					.replace("Enter", "Enter");
			}
			return { type: "key", value };
		});
	}

	/** @param {MenuItem} item */
	function handleAction(item) {
		if (item.action) item.action();
		close();
	}

	onMount(() => {
		/** @param {MouseEvent} e */
		const handleWindowClick = (e) => {
			if (!isOpen) return;
			const target = /** @type {HTMLElement} */ (e.target);
			if (menuElement && !menuElement.contains(target)) {
				close();
			}
		};

		/** @param {KeyboardEvent} e */
		const handleWindowKeydown = (e) => {
			if (e.key === "Escape") close();
		};

		window.addEventListener("click", handleWindowClick, { capture: true });
		window.addEventListener("contextmenu", handleWindowClick, {
			capture: true,
		});
		window.addEventListener("keydown", handleWindowKeydown);

		return () => {
			window.removeEventListener("click", handleWindowClick, {
				capture: true,
			});
			window.removeEventListener("contextmenu", handleWindowClick, {
				capture: true,
			});
			window.removeEventListener("keydown", handleWindowKeydown);
		};
	});
</script>

{#if isOpen}
	<div
		use:portal
		class="context-menu-wrapper"
	>
		<div
			bind:this={menuElement}
			class="context-menu"
			role="menu"
			tabindex="-1"
			style="top: {menuTop}px; left: {menuLeft}px;"
			onkeydown={(e) => {
				if (e.key === "Escape") close();
				e.stopPropagation();
			}}
			onclick={(e) => e.stopPropagation()}
			oncontextmenu={(e) => {
				e.preventDefault();
				e.stopPropagation();
			}}
			in:fly={{ y: 5, duration: 150 }}
			out:fade={{ duration: 100 }}
		>
			<div class="menu-items">
				{#each items as item}
					{#if item.divider}
						<div class="divider"></div>
					{:else}
						<button
							class="menu-item"
							class:danger={item.danger}
							onclick={() => handleAction(item)}
						>
							<span class="item-label">{item.label}</span>
							{#if item.shortcuts && item.shortcuts.length > 0}
								<div class="shortcut-container">
									{#each item.shortcuts as sc, i}
										{#if i === shortcutIndex % item.shortcuts.length}
											<div
												class="shortcut-wrapper"
												in:fade={{ duration: 400 }}
												out:fade={{ duration: 400 }}
											>
												{#each getShortcutParts(sc) as part}
													{#if part.type === "key"}
														<kbd class="key-cap"
															>{part.value}</kbd
														>
													{:else}
														<span class="key-text"
															>{part.value}</span
														>
													{/if}
												{/each}
											</div>
										{/if}
									{/each}
								</div>
							{/if}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.context-menu-wrapper {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		pointer-events: none;
		z-index: 20000;
	}

	.context-menu {
		position: absolute;
		min-width: 200px;
		background: hsla(var(--popover) / 0.85);
		backdrop-filter: blur(20px) saturate(180%);
		-webkit-backdrop-filter: blur(20px) saturate(180%);
		border: 1px solid hsla(var(--border) / 0.6);
		border-radius: var(--radius);
		padding: 5px;
		box-shadow:
			0 15px 35px -5px rgba(0, 0, 0, 0.5),
			0 0 0 1px hsla(255, 100%, 100%, 0.04);
		pointer-events: auto;
		outline: none;
		overflow: hidden;
	}

	.menu-items {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}

	.menu-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 4px 8px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: var(--text-primary);
		font-size: 0.875rem;
		text-align: left;
		cursor: pointer;
		width: 100%;
		gap: 20px;
		transition: none;
	}

	.menu-item:hover {
		background: hsl(var(--primary) / 0.9);
		color: white;
		transition: none;
	}

	.menu-item.danger:hover {
		background: hsla(0, 70%, 50%, 0.9);
		color: white;
		transition: none;
	}

	.item-label {
		font-weight: 500;
		letter-spacing: -0.01em;
	}

	.shortcut-container {
		display: flex;
		position: relative;
		height: 1.25rem;
		min-width: 40px;
		justify-content: flex-end;
		align-items: center;
	}

	.shortcut-wrapper {
		position: absolute;
		right: 0;
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.key-cap {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-width: 1.125rem;
		height: 1.125rem;
		padding: 0 4px;
		font-family:
			system-ui,
			-apple-system,
			sans-serif;
		font-size: 0.7rem;
		font-weight: 600;
		color: var(--text-secondary);
		background: hsla(var(--muted) / 0.3);
		border: 1px solid hsla(var(--border) / 0.5);
		border-radius: var(--radius-sm);
		box-shadow:
			0 1px 0 hsla(var(--border) / 0.6),
			inset 0 1px 0 hsla(255, 100%, 100%, 0.02);
		line-height: 1;
		user-select: none;
		transition: all 0.1s ease;
	}

	.key-text {
		font-size: 0.65rem;
		font-weight: 500;
		color: var(--text-muted);
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.menu-item:hover .key-cap {
		border-color: hsla(0, 0%, 100%, 0.4);
		color: white;
		background: hsla(0, 0%, 100%, 0.15);
	}

	.menu-item:hover .key-text {
		color: white;
		opacity: 0.9;
	}

	.divider {
		height: 1px;
		background: hsla(var(--border) / 0.3);
		margin: 4px 6px;
	}
</style>
