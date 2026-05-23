import { cubicOut } from "svelte/easing";

/**
 * A premium custom transition for horizontal sliding.
 * Dynamically animates width, padding, margins, and opacity,
 * allowing Flexbox layouts to naturally and smoothly slide adjacent buttons.
 * @param {HTMLElement} node
 * @param {{ duration?: number, delay?: number, easing?: (t: number) => number }} [params]
 */
export function horizontalSlide(node, { duration = 400, delay = 0, easing = cubicOut } = {}) {
	const style = getComputedStyle(node);
	const width = parseFloat(style.width) || 0;
	const paddingLeft = parseFloat(style.paddingLeft) || 0;
	const paddingRight = parseFloat(style.paddingRight) || 0;
	const marginLeft = parseFloat(style.marginLeft) || 0;
	const marginRight = parseFloat(style.marginRight) || 0;

	return {
		delay,
		duration,
		easing,
		css: (/** @type {number} */ t) => `
			width: ${t * width}px;
			padding-left: ${t * paddingLeft}px;
			padding-right: ${t * paddingRight}px;
			margin-left: ${t * marginLeft}px;
			margin-right: ${t * marginRight}px;
			opacity: ${t};
			transform: scale(${0.8 + t * 0.2});
			transform-origin: left center;
			overflow: hidden;
			white-space: nowrap;
		`
	};
}
