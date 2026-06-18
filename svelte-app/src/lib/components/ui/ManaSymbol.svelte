<script>
	/**
	 * @typedef {Object} Props
	 * @property {string} symbol - The clean symbol string (e.g. "w", "3", "wu", "t")
	 * @property {string} [size="1.1em"] - The size of the symbol
	 * @property {string} [className=""] - Optional custom class name
	 */

	/** @type {Props} */
	let { symbol, size = "1.1em", className = "" } = $props();

	// Clean the symbol just in case braces or slashes are still present
	const sym = $derived(
		symbol.toLowerCase().replace(/[{}]/g, "").replace("/", ""),
	);

	// Map clean symbol keys to the custom SVG filenames (with parentheses/capitalization)
	/** @type {Record<string, string>} */
	const customMap = {
		w: "(W)",
		u: "(U)",
		b: "(B)",
		r: "(R)",
		g: "(G)",
		c: "(C)",
		l: "(L)",
	};

	const filename = $derived(customMap[sym] ? customMap[sym] : sym);
</script>

<span
	class="mana-symbol {className}"
	style="width: {size}; height: calc({size} * 1.015); background-image: url('/mana/{filename}.svg');"
	role="img"
	aria-label={symbol.toUpperCase()}
></span>

<style>
	.mana-symbol {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		vertical-align: middle;
		border-radius: 50%;
		flex-shrink: 0;
		background-size: 100% 100%;
		background-repeat: no-repeat;
		background-position: center;
		box-shadow:
			inset 0 0.08em 0.03em rgba(255, 255, 255, 0.5),
			inset 0 -0.06em 0.03em rgba(0, 0, 0, 0.25),
			0 0.06em 0.1em rgba(0, 0, 0, 1);
		user-select: none;
		will-change: transform;
		transform: translate3d(
			0,
			0,
			0
		); /* Enable hardware-accelerated subpixel anti-aliasing */
	}
</style>
