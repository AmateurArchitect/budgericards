<script>
	import { onMount } from "svelte";
	import { interactionStore } from "$lib/stores/interaction.svelte.js";
	import CardArt from "../CardArt.svelte";

	const dragState = $derived(interactionStore.cardDragState);
	const isDragging = $derived(dragState.active && !!dragState.card);
	const selectedCount = $derived(
		dragState.selectedCards && dragState.selectedCards.length > 1
			? dragState.selectedCards.length
			: 1
	);

	/** @type {HTMLElement | undefined} */
	let containerEl = $state();

	// Physics state: spring-damper model for tactile card physics
	let posX = 0;
	let posY = 0;
	let targetX = 0;
	let targetY = 0;

	let rotX = 0;
	let rotY = 0;
	let rotZ = 0;

	let rotVelX = 0;
	let rotVelY = 0;
	let rotVelZ = 0;

	let animFrameId = 0;

	/**
	 * @param {number} val
	 * @param {number} min
	 * @param {number} max
	 * @returns {number}
	 */
	function clamp(val, min, max) {
		return Math.max(min, Math.min(max, val));
	}

	/**
	 * @param {number} start
	 * @param {number} end
	 * @param {number} factor
	 * @returns {number}
	 */
	function lerp(start, end, factor) {
		return start + (end - start) * factor;
	}

	/**
	 * @param {number} time
	 */
	function updatePhysics(time) {
		if (!isDragging) {
			return;
		}

		// Target coordinates from mouse and click grab offset
		targetX = dragState.cursorX - dragState.grabOffsetX;
		targetY = dragState.cursorY - dragState.grabOffsetY;

		// Smooth position tracking (card lags slightly behind cursor to create realistic weight)
		posX = lerp(posX, targetX, 0.22);
		posY = lerp(posY, targetY, 0.22);

		// Displacement / Lag creates natural 3D tilt & banking
		const lagX = targetX - posX;
		const lagY = targetY - posY;

		// Dynamic 3D Euler angles (pronounced MTG Arena banking & pitch)
		const targetRotY = clamp(lagX * 2.8, -35, 35);
		const targetRotX = clamp(-lagY * 2.5, -30, 30);
		const targetRotZ = clamp(lagX * 0.9, -15, 15);

		// Spring-damper physics with elastic bounce/overshoot
		const springStiffness = 0.25;
		const damping = 0.78;

		rotVelX = (rotVelX + (targetRotX - rotX) * springStiffness) * damping;
		rotX += rotVelX;

		rotVelY = (rotVelY + (targetRotY - rotY) * springStiffness) * damping;
		rotY += rotVelY;

		rotVelZ = (rotVelZ + (targetRotZ - rotZ) * springStiffness) * damping;
		rotZ += rotVelZ;

		// Directly apply GPU-accelerated 3D transforms
		if (containerEl) {
			const sheenAngle = 115 + rotY * 2.0;
			const sheenOpacity = clamp(0.12 + (Math.abs(rotY) + Math.abs(rotX)) * 0.012, 0.08, 0.45);
			const shadowOffsetX = (-rotY * 1.6).toFixed(1);
			const shadowOffsetY = (28 + rotX * 1.1).toFixed(1);

			containerEl.style.transform = `translate3d(${posX.toFixed(1)}px, ${posY.toFixed(1)}px, 0) perspective(600px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) rotateZ(${rotZ.toFixed(2)}deg) scale3d(1.08, 1.08, 1.08)`;
			containerEl.style.setProperty("--sheen-angle", `${sheenAngle.toFixed(1)}deg`);
			containerEl.style.setProperty("--sheen-opacity", `${sheenOpacity.toFixed(2)}`);
			containerEl.style.setProperty("--shadow-x", `${shadowOffsetX}px`);
			containerEl.style.setProperty("--shadow-y", `${shadowOffsetY}px`);
		}

		animFrameId = requestAnimationFrame(updatePhysics);
	}

	$effect(() => {
		if (isDragging) {
			// Initialize position to mouse position on start
			posX = dragState.cursorX - dragState.grabOffsetX;
			posY = dragState.cursorY - dragState.grabOffsetY;
			targetX = posX;
			targetY = posY;
			rotX = 0;
			rotY = 0;
			rotZ = 0;
			rotVelX = 0;
			rotVelY = 0;
			rotVelZ = 0;

			cancelAnimationFrame(animFrameId);
			animFrameId = requestAnimationFrame(updatePhysics);
		} else {
			cancelAnimationFrame(animFrameId);
		}

		return () => {
			cancelAnimationFrame(animFrameId);
		};
	});

	onMount(() => {
		/** @param {DragEvent | MouseEvent | PointerEvent} e */
		const handleDragMove = (e) => {
			if (!interactionStore.isDraggingCard) return;
			// Filter out invalid (0, 0) coordinates sent by some browsers on drag lifecycle events
			if (e.clientX === 0 && e.clientY === 0) return;
			interactionStore.updateCardDragPosition(e.clientX, e.clientY);
		};

		const handleDragEnd = () => {
			if (interactionStore.isDraggingCard) {
				interactionStore.endCardDrag();
			}
		};

		// Capture dragover on document to guarantee high-frequency events without throttling
		document.addEventListener("dragover", handleDragMove, { capture: true, passive: true });
		document.addEventListener("drag", handleDragMove, { capture: true, passive: true });
		window.addEventListener("pointermove", handleDragMove, { capture: true, passive: true });
		window.addEventListener("dragend", handleDragEnd);
		window.addEventListener("drop", handleDragEnd);

		return () => {
			document.removeEventListener("dragover", handleDragMove, { capture: true });
			document.removeEventListener("drag", handleDragMove, { capture: true });
			window.removeEventListener("pointermove", handleDragMove, { capture: true });
			window.removeEventListener("dragend", handleDragEnd);
			window.removeEventListener("drop", handleDragEnd);
			cancelAnimationFrame(animFrameId);
		};
	});
</script>

{#if isDragging && dragState.card}
	<div class="card-drag-overlay-root">
		<div
			bind:this={containerEl}
			class="dragged-card-container"
			style="width: {dragState.width}px; height: {dragState.height}px;"
		>
			<!-- Multi-card stack shadow layers underneath if multiple cards selected -->
			{#if selectedCount > 1}
				<div class="stack-card stack-card-under-2"></div>
				<div class="stack-card stack-card-under-1"></div>
			{/if}

			<!-- Primary picked up card -->
			<div class="dragged-card-surface">
				<CardArt
					card={dragState.card}
					price={dragState.price}
					isFlipped={dragState.isFlipped}
					isRotated={dragState.isRotated}
					showPrice={false}
					hideControlsUntilHover={true}
					lazy={false}
				/>

				<!-- Dynamic Specular Gloss Sheen -->
				<div class="gloss-sheen"></div>

				<!-- Multi-card badge count indicator -->
				{#if selectedCount > 1}
					<div class="multi-count-badge">
						{selectedCount} cards
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.card-drag-overlay-root {
		position: fixed;
		inset: 0;
		pointer-events: none;
		z-index: 999999;
		overflow: visible;
		perspective: 600px;
	}

	.dragged-card-container {
		position: absolute;
		top: 0;
		left: 0;
		transform-origin: center center;
		will-change: transform;
		transform-style: preserve-3d;
		pointer-events: none;
		--sheen-angle: 120deg;
		--sheen-opacity: 0.15;
		--shadow-x: 0px;
		--shadow-y: 28px;
	}

	.dragged-card-surface {
		width: 100%;
		height: 100%;
		position: relative;
		border-radius: 4.75% / 3.5%;
		overflow: hidden;
		background: #111;
		/* Lush multi-tier elevated dynamic directional drop shadow */
		box-shadow:
			var(--shadow-x) var(--shadow-y) 56px -10px rgba(0, 0, 0, 0.85),
			0 14px 28px -6px rgba(0, 0, 0, 0.6),
			0 0 0 1px rgba(255, 255, 255, 0.22),
			0 0 24px 2px rgba(0, 0, 0, 0.45);
		transform-style: preserve-3d;
	}

	/* Stack under-cards for multi-card dragging */
	.stack-card {
		position: absolute;
		inset: 0;
		border-radius: 4.75% / 3.5%;
		background: #1a1a1a;
		border: 1px solid rgba(255, 255, 255, 0.15);
		box-shadow: 0 16px 32px -8px rgba(0, 0, 0, 0.7);
		pointer-events: none;
	}

	.stack-card-under-2 {
		transform: translate3d(-6px, 8px, -20px) rotateZ(-4deg);
		opacity: 0.85;
	}

	.stack-card-under-1 {
		transform: translate3d(5px, 4px, -10px) rotateZ(3.5deg);
		opacity: 0.92;
	}

	/* Specular reflection gradient that shifts with 3D rotation */
	.gloss-sheen {
		position: absolute;
		inset: 0;
		pointer-events: none;
		border-radius: inherit;
		background: linear-gradient(
			var(--sheen-angle),
			rgba(255, 255, 255, 0) 25%,
			rgba(255, 255, 255, var(--sheen-opacity)) 50%,
			rgba(255, 255, 255, 0) 75%
		);
		mix-blend-mode: overlay;
		z-index: 20;
	}

	.multi-count-badge {
		position: absolute;
		top: 8px;
		left: 8px;
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground, 0 0% 100%));
		font-size: 11px;
		font-weight: 700;
		padding: 3px 8px;
		border-radius: 9999px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.6);
		letter-spacing: 0.02em;
		z-index: 25;
	}
</style>
