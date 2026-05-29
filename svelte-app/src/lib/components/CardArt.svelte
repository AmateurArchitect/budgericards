<script>
	import { RefreshCw, RotateCw } from "lucide-svelte";

	/** @type {{
	 * card: any,
	 * price: number | null,
	 * isFlipped?: boolean,
	 * isRotated?: boolean,
	 * showPrice?: boolean,
	 * loading?: boolean,
	 * toggleFlip?: (e: MouseEvent) => void,
	 * toggleRotate?: (e: MouseEvent) => void,
	 * showLegalityLabel?: boolean,
	 * hideControlsUntilHover?: boolean,
	 * class?: string
	 * }} */
	let {
		card,
		price,
		isFlipped = false,
		isRotated = false,
		showPrice = true,
		loading = false,
		toggleFlip,
		toggleRotate,
		showLegalityLabel = false,
		hideControlsUntilHover = false,
		class: className = "",
	} = $props();

	const isDfc = $derived(
		card?.card_faces &&
			card.card_faces.length > 1 &&
			card.card_faces[0].image_uris,
	);
	const isFlip = $derived(card?.layout === "flip");

	const frontImgUrl = $derived(
		isDfc
			? card.card_faces[0].image_uris.normal
			: card?.image_uris?.normal || card?.image || "",
	);
	const backImgUrl = $derived(
		isDfc ? card.card_faces[1].image_uris.normal : "",
	);

	import { checkLegality } from "$lib/utils/legality.js";

	const priceDisplay = $derived(
		price !== null ? `$${Number(price).toFixed(2)}` : "Illegal",
	);

	const legality = $derived(checkLegality(card));
	const isIllegal = $derived(!legality.isLegal);

	/** @typedef {{ src: string, card: any, loading?: boolean }} CardImageProps */
</script>

{#snippet CardImage(/** @type {CardImageProps} */ { src, card, loading = false })}
	{#if src}
		<img
			{src}
			class="card-image loaded"
			alt={card.name}
			draggable="false"
		/>
	{:else if loading}
		<div class="image-placeholder loading">
			<span>Metadata Loading...</span>
		</div>
	{:else}
		<div class="image-placeholder">No Image Available</div>
	{/if}
{/snippet}

<div 
	class="card-art {className}"
	class:is-dfc={isDfc}
	class:flipped={isFlipped}
	class:rotated={isRotated}
	class:shimmering={loading}
	class:illegal={isIllegal}
>
	{#if isDfc || isFlip}
		<div class="flip-container">
			<div class="flip-front">
				{@render CardImage({ src: frontImgUrl, card, loading })}
			</div>
			{#if isDfc}
				<div class="flip-back">
					{@render CardImage({ src: backImgUrl, card })}
				</div>
			{/if}
		</div>
	{:else}
		{@render CardImage({ src: frontImgUrl, card, loading })}
	{/if}

	<!-- Flip Button for DFCs -->
		{#if isDfc && toggleFlip}
			<button class="flip-btn" class:hover-only={hideControlsUntilHover} onclick={toggleFlip} title="Flip Card">
				<RefreshCw size={14} />
			</button>
		{/if}

		<!-- Rotation Button for Flip Cards -->
		{#if isFlip && toggleRotate}
			<button class="flip-btn" class:hover-only={hideControlsUntilHover} onclick={toggleRotate} title="Rotate 180°">
				<RotateCw size={14} />
			</button>
		{/if}

		<!-- Price Pill Overlay -->
		{#if showPrice && price !== null}
			<div class="price-pill" class:illegal={price === null}>
				{priceDisplay}
			</div>
		{/if}

		<!-- Hover Legality Label (used when tooltips are off) -->
		{#if showLegalityLabel && isIllegal}
			<div class="hover-legality-label">
				{#each legality.reasons as reason}
					<div class="reason">{reason}</div>
				{/each}
			</div>
		{/if}
</div>

<style>
	.card-art {
		width: 100%;
		position: relative;
		aspect-ratio: 2.5 / 3.5;
		background: #111; /* Darker fallback */
		perspective: 1000px;
		overflow: hidden; /* This clips the image corners */
		border-radius: 4.75% / 3.5%; /* Standard MTG Card Radius */
	}

	.card-art.illegal::after {
		content: "";
		position: absolute;
		inset: 0;
		background: rgba(255, 0, 0, 0.15);
		box-shadow: inset 0 0 0 2px rgba(255, 0, 0, 0.4);
		pointer-events: none;
		z-index: 2;
		border-radius: inherit;
	}

	.shimmering::before {
		content: "";
		position: absolute;
		inset: 0;
		background: linear-gradient(
			90deg,
			rgba(255, 255, 255, 0) 0%,
			rgba(255, 255, 255, 0.05) 50%,
			rgba(255, 255, 255, 0) 100%
		);
		background-size: 200% 100%;
		animation: shimmer 1.5s infinite;
		z-index: 10;
	}

	@keyframes shimmer {
		0% {
			background-position: 200% 0;
		}
		100% {
			background-position: -200% 0;
		}
	}

	.card-image {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.card-image.loaded {
		opacity: 1;
	}

	.price-pill {
		position: absolute;
		bottom: 8px;
		left: 8px;
		background: rgba(0, 0, 0, 0.7);
		backdrop-filter: blur(4px);
		color: var(--success);
		padding: 2px 8px;
		border-radius: var(--radius-sm);
		font-size: var(--font-xs);
		font-weight: 700;
		font-family: inherit;
		border: 1px solid rgba(255, 255, 255, 0.1);
		z-index: 5;
	}

	.price-pill.illegal {
		color: var(--danger);
	}

	.hover-legality-label {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%) scale(0.9);
		background: rgba(180, 0, 0, 0.9);
		backdrop-filter: blur(12px);
		display: flex;
		flex-direction: column;
		justify-content: center;
		align-items: center;
		padding: 12px 16px;
		text-align: center;
		color: white;
		font-size: var(--font-xs);
		font-weight: 700;
		line-height: 1.2;
		opacity: 0;
		transition:
			opacity 0.2s ease,
			transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
		z-index: 20;
		pointer-events: none;
		border-radius: var(--radius-md);
		gap: 12px;
		width: 85%;
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
		border: 1px solid rgba(255, 255, 255, 0.2);
	}

	.card-image-container:hover .hover-legality-label {
		opacity: 1;
		transform: translate(-50%, -50%) scale(1);
	}

	.hover-legality-label .reason {
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
	}

	.flip-container {
		width: 100%;
		height: 100%;
		position: relative;
		transition: transform 0.6s;
		transform-style: preserve-3d;
		border-radius: inherit;
	}

	.card-art.flipped .flip-container {
		transform: rotateY(180deg);
	}

	.card-art.rotated .flip-container {
		transform: rotate(180deg);
	}

	.flip-front,
	.flip-back {
		width: 100%;
		height: 100%;
		position: absolute;
		backface-visibility: hidden;
	}

	.flip-front::after,
	.flip-back::after {
		content: "";
		position: absolute;
		inset: 0;
		box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.5);
		pointer-events: none;
		z-index: 1;
	}

	.flip-back {
		transform: rotateY(180deg);
	}

	.flip-btn {
		position: absolute;
		top: 10px;
		right: 10px;
		width: 32px;
		height: 32px;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(8px);
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: white;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		z-index: 10;
		transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
		opacity: 0.7;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	.flip-btn:hover {
		background: rgba(0, 0, 0, 0.8);
		transform: scale(1.15) rotate(45deg);
		border-color: var(--primary);
		box-shadow: 0 0 15px hsla(var(--primary-hsl), 0.4);
		opacity: 1;
	}
	
	.flip-btn.hover-only {
		opacity: 0;
		transform: scale(0.8);
	}

	.card-image-container:hover .flip-btn.hover-only {
		opacity: 0.7;
		transform: scale(1);
	}

	.card-image-container:hover .flip-btn.hover-only:hover {
		opacity: 1;
		transform: scale(1.15) rotate(45deg);
	}

	.image-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--bg-input);
		color: var(--text-muted);
		font-size: 10px;
		text-align: center;
		padding: 20px;
	}
</style>
