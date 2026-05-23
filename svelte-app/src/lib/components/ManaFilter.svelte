<script>
	import { searchStore } from "$lib/stores/search.svelte.js";
	import { cn } from "$lib/utils";

	const colors = [
		{ id: "W", name: "white", label: "White" },
		{ id: "U", name: "blue", label: "Blue" },
		{ id: "B", name: "black", label: "Black" },
		{ id: "R", name: "red", label: "Red" },
		{ id: "G", name: "green", label: "Green" },
		{ id: "C", name: "colorless", label: "Colorless" },
		{ id: "M", name: "gold", label: "Multi" },
		{ id: "L", name: "land", label: "Land" },
	];

	function toggleColor(/** @type {string} */ id) {
		searchStore.toggleColor(id);
	}

	function getIconPath(
		/** @type {string} */ name,
		/** @type {boolean} */ active,
	) {
		const state = active ? "selected" : "unselected";
		return `/mana/${name}-${state}-dark.svg`;
	}
</script>

<div class="mana-filter">
	{#each colors as { id, name, label }}
		{@const active = searchStore.filters.colors.includes(id)}
		<button
			class="color-btn color-{name}"
			class:active
			onclick={() => toggleColor(id)}
			title={label}
			aria-label="Filter by {label}"
		>
			<img
				src={getIconPath(name, active)}
				alt={label}
				class="mana-icon"
			/>
		</button>
	{/each}
</div>

<style>
	.mana-filter {
		display: flex;
		gap: 0.25rem;
		align-items: center;
	}

	.color-btn {
		width: 28px;
		height: 28px;
		border-radius: 50%;
		border: none;
		background: none;
		padding: 0;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.65;
		transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease, filter 0.2s ease;
		position: relative;
		overflow: visible;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}

	.color-btn:hover {
		transform: scale(1.1);
		opacity: 0.95;
	}

	.color-btn.active {
		opacity: 1;
	}

	.color-btn.active:hover {
		opacity: 1;
	}

	.mana-icon {
		width: 100%;
		height: 100%;
		display: block;
		object-fit: contain;
		will-change: transform;
		transform: translate3d(0, 0, 0); /* Enable hardware-accelerated subpixel anti-aliasing */
	}

	/* Color-specific glow effects for active states */
	.color-btn.active.color-white {
		filter: drop-shadow(0 0 4px rgba(255, 251, 213, 0.65));
	}
	.color-btn.active.color-blue {
		filter: drop-shadow(0 0 4px rgba(139, 228, 255, 0.65));
	}
	.color-btn.active.color-black {
		filter: drop-shadow(0 0 4px rgba(160, 140, 190, 0.5));
	}
	.color-btn.active.color-red {
		filter: drop-shadow(0 0 4px rgba(255, 130, 100, 0.65));
	}
	.color-btn.active.color-green {
		filter: drop-shadow(0 0 4px rgba(130, 220, 140, 0.65));
	}
	.color-btn.active.color-gold {
		filter: drop-shadow(0 0 4px rgba(251, 146, 60, 0.65));
	}
	.color-btn.active.color-land {
		filter: drop-shadow(0 0 4px rgba(167, 243, 208, 0.65));
	}
	.color-btn.active.color-colorless {
		filter: drop-shadow(0 0 4px rgba(200, 200, 200, 0.5));
	}

	.color-btn:active {
		transform: scale(0.95);
	}
</style>
