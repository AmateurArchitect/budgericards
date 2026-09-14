<script>
import { RefreshCw, RotateCw, Layers } from "lucide-svelte";
import ManaSymbol from "$lib/components/ui/ManaSymbol.svelte";
import { parseManaCost } from "$lib/layouts/grouping.svelte.js";

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
	 * flipBelowNameBar?: boolean,
	 * lazy?: boolean,
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
		flipBelowNameBar = false,
		lazy = true,
		class: className = "",
	} = $props();

	const actualCard = $derived(card?._metadata || card);

	const isDfc = $derived(
		actualCard?.card_faces &&
			actualCard.card_faces.length > 1 &&
			actualCard.card_faces[0].image_uris,
	);
	const isFlip = $derived(actualCard?.layout === "flip");

	const frontLowResUrl = $derived(
		isDfc
			? (actualCard.card_faces[0].image_uris.small || actualCard.card_faces[0].image_uris.normal)
			: actualCard?.image_uris?.small || actualCard?.image_uris?.normal || actualCard?.image || "",
	);
	const frontHighResUrl = $derived(
		isDfc
			? actualCard.card_faces[0].image_uris.normal
			: actualCard?.image_uris?.normal || actualCard?.image || "",
	);

	const backLowResUrl = $derived(
		isDfc ? (actualCard.card_faces[1].image_uris.small || actualCard.card_faces[1].image_uris.normal) : "",
	);
	const backHighResUrl = $derived(
		isDfc ? actualCard.card_faces[1].image_uris.normal : "",
	);

	import { checkLegality } from "$lib/utils/legality.js";

	const priceDisplay = $derived(
		price !== null ? `$${Number(price).toFixed(2)}` : "Illegal",
	);

	const legality = $derived(checkLegality(actualCard));
	const isIllegal = $derived(!legality.isLegal);

	let frontLowResLoaded = $state(false);
	let backLowResLoaded = $state(false);
	let frontHighResLoaded = $state(false);
	let backHighResLoaded = $state(false);
	let frontImageError = $state(false);
	let backImageError = $state(false);

	// Handle front image loading states and failsafe timeout
	$effect(() => {
		if (frontLowResUrl) {
			frontImageError = false;
			if (frontHighResUrl) {
				const img = new Image();
				img.src = frontHighResUrl;
				if (img.complete) {
					frontLowResLoaded = true;
					frontHighResLoaded = true;
					return;
				}
			}

			frontLowResLoaded = false;
			frontHighResLoaded = false;

			// Failsafe: start loading high-res if low-res takes longer than 2 seconds
			const timer = setTimeout(() => {
				frontLowResLoaded = true;
			}, 2000);

			return () => clearTimeout(timer);
		}
	});

	// Preload front high-res image when low-res is loaded/timed out
	$effect(() => {
		if (frontLowResLoaded && frontHighResUrl && !frontHighResLoaded) {
			const img = new Image();
			img.src = frontHighResUrl;
			img.onload = () => {
				frontHighResLoaded = true;
			};
			img.onerror = () => {
				// If high-res fails, unblur the low-res image
				frontHighResLoaded = false;
			};
		}
	});

	// Handle back image loading states and failsafe timeout
	$effect(() => {
		if (backLowResUrl) {
			backImageError = false;
			if (backHighResUrl) {
				const img = new Image();
				img.src = backHighResUrl;
				if (img.complete) {
					backLowResLoaded = true;
					backHighResLoaded = true;
					return;
				}
			}

			backLowResLoaded = false;
			backHighResLoaded = false;

			const timer = setTimeout(() => {
				backLowResLoaded = true;
			}, 2000);

			return () => clearTimeout(timer);
		}
	});

	// Preload back high-res image when low-res is loaded/timed out
	$effect(() => {
		if (backLowResLoaded && backHighResUrl && !backHighResLoaded) {
			const img = new Image();
			img.src = backHighResUrl;
			img.onload = () => {
				backHighResLoaded = true;
			};
			img.onerror = () => {
				backHighResLoaded = false;
			};
		}
	});

	/**
	 * Svelte action to handle image loading and prevent race conditions with cached images
	 * @param {HTMLImageElement} node
	 * @param {{ onLoad: () => void, onError?: () => void }} callbacks
	 */
	function handleImageLoad(node, callbacks) {
		const check = () => {
			if (node.complete) {
				if (node.naturalWidth === 0 && node.src) {
					callbacks.onError?.();
				} else {
					callbacks.onLoad?.();
				}
			}
		};
		const onL = () => callbacks.onLoad?.();
		const onE = () => callbacks.onError?.();

		node.addEventListener('load', onL);
		node.addEventListener('error', onE);
		
		check();

		return {
			/** @param {{ onLoad: () => void, onError?: () => void }} newCallbacks */
			update(newCallbacks) {
				node.removeEventListener('load', onL);
				node.removeEventListener('error', onE);
				callbacks = newCallbacks;
				node.addEventListener('load', onL);
				node.addEventListener('error', onE);
				check();
			},
			destroy() {
				node.removeEventListener('load', onL);
				node.removeEventListener('error', onE);
			}
		};
	}

	/** @typedef {{ lowSrc: string, highSrc: string, isLoaded: boolean, card: any, onLowResLoad: () => void, onImageError?: () => void, hasError?: boolean, loading?: boolean }} CardImageProps */
</script>

{#snippet CardImage(/** @type {CardImageProps} */ { lowSrc, highSrc, isLoaded, card, onLowResLoad, onImageError, hasError = false, loading = false })}
	{#if hasError || (!lowSrc && !loading)}
		{@const manaCostStr = card.mana_cost || card.mana || ""}
		{@const manaSymbols = parseManaCost(manaCostStr)}
		{@const hasPt = card.power !== undefined && card.toughness !== undefined && card.power !== null && card.toughness !== null}
		<div class="card-fallback-face">
			<div class="fallback-card-header">
				<span class="fallback-card-name" title={card.name}>{card.name || 'Unknown Card'}</span>
				{#if manaSymbols.length > 0}
					<div class="fallback-mana-cost">
						{#each manaSymbols as sym}
							{#if sym === "//"}
								<span class="fallback-mana-slash">//</span>
							{:else}
								<ManaSymbol symbol={sym} size="12px" />
							{/if}
						{/each}
					</div>
				{/if}
			</div>
			<div class="fallback-art-box">
				<div class="fallback-art-watermark">
					<Layers size={24} strokeWidth={1.5} />
					<span class="fallback-art-label">Art Unavailable</span>
				</div>
			</div>
			<div class="fallback-card-type">
				<span>{card.type_line || card.type || 'Card'}</span>
			</div>
			<div class="fallback-card-body" class:has-pt={hasPt}>
				{#if card.oracle_text || card.text}
					<div class="fallback-card-text">
						{card.oracle_text || card.text}
					</div>
				{/if}
				{#if hasPt}
					<div class="fallback-pt-box">
						{card.power}/{card.toughness}
					</div>
				{:else if card.loyalty}
					<div class="fallback-pt-box loyalty">
						[{card.loyalty}]
					</div>
				{/if}
			</div>
		</div>
	{:else if lowSrc}
		<div class="image-wrapper" style="position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: inherit;">
			<img
				src={lowSrc}
				use:handleImageLoad={{ onLoad: onLowResLoad, onError: onImageError }}
				class="card-image low-res"
				class:blur-placeholder={!isLoaded}
				alt={card.name}
				loading={lazy ? "lazy" : "eager"}
				draggable="false"
				style="width: 100%; height: 100%; object-fit: cover;"
			/>
			{#if highSrc && isLoaded}
				<img
					src={highSrc}
					class="card-image high-res fade-in-art"
					alt={card.name}
					draggable="false"
					style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: 1;"
				/>
			{/if}
		</div>
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
				{@render CardImage({
					lowSrc: frontLowResUrl,
					highSrc: frontHighResUrl,
					isLoaded: frontHighResLoaded,
					card: actualCard?.card_faces?.[0] || actualCard,
					onLowResLoad: () => { frontLowResLoaded = true; },
					onImageError: () => { frontImageError = true; },
					hasError: frontImageError,
					loading
				})}
			</div>
			{#if isDfc}
				<div class="flip-back">
					{@render CardImage({
						lowSrc: backLowResUrl,
						highSrc: backHighResUrl,
						isLoaded: backHighResLoaded,
						card: actualCard?.card_faces?.[1] || actualCard,
						onLowResLoad: () => { backLowResLoaded = true; },
						onImageError: () => { backImageError = true; },
						hasError: backImageError
					})}
				</div>
			{/if}
		</div>
	{:else}
		{@render CardImage({
			lowSrc: frontLowResUrl,
			highSrc: frontHighResUrl,
			isLoaded: frontHighResLoaded,
			card: actualCard,
			onLowResLoad: () => { frontLowResLoaded = true; },
			onImageError: () => { frontImageError = true; },
			hasError: frontImageError,
			loading
		})}
	{/if}

	<!-- Flip Button for DFCs -->
		{#if isDfc && toggleFlip}
			<button class="flip-btn" class:hover-only={hideControlsUntilHover} class:below-name-bar={flipBelowNameBar} onclick={toggleFlip} title="Flip Card">
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

	.card-art:hover .hover-legality-label {
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

	.flip-btn.below-name-bar {
		top: 11.2%;
	}

	.flip-btn:hover {
		background: rgba(0, 0, 0, 0.8);
		transform: scale(1.15) rotate(45deg);
		border-color: var(--primary);
		box-shadow: 0 0 15px hsl(var(--primary) / 0.4);
		opacity: 1;
	}
	
	.flip-btn.hover-only {
		opacity: 0;
		transform: scale(0.8);
	}

	.card-art:hover .flip-btn.hover-only {
		opacity: 0.7;
		transform: scale(1);
	}

	.card-art:hover .flip-btn.hover-only:hover {
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

	.fade-in-art {
		animation: art-fade-in 180ms ease-out forwards;
	}

	@keyframes art-fade-in {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.low-res.blur-placeholder {
		/* No artificial blur or scale to keep low-res image as clear as possible */
		transition: opacity 0.35s ease;
	}

	.card-fallback-face {
		width: 100%;
		height: 100%;
		background: #111317;
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: inherit;
		display: flex;
		flex-direction: column;
		padding: 7px 7px 8px 7px;
		box-sizing: border-box;
		user-select: none;
		overflow: hidden;
		gap: 5px;
	}

	.fallback-card-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		background: rgba(255, 255, 255, 0.08);
		padding: 3px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.1);
		min-height: 22px;
		box-sizing: border-box;
		gap: 4px;
	}

	.fallback-card-name {
		font-size: 11px;
		font-weight: 700;
		color: #f8f9fa;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		flex: 1;
		min-width: 0;
	}

	.fallback-mana-cost {
		display: flex;
		align-items: center;
		gap: 2px;
		flex-shrink: 0;
	}

	.fallback-mana-slash {
		font-size: 10px;
		color: rgba(255, 255, 255, 0.5);
		margin: 0 1px;
	}

	.fallback-art-box {
		height: 44%;
		background: radial-gradient(ellipse at center, rgba(35, 40, 50, 0.7) 0%, rgba(12, 14, 18, 0.95) 100%);
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.06);
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		position: relative;
	}

	.fallback-art-watermark {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 6px;
		color: rgba(255, 255, 255, 0.2);
	}

	.fallback-art-label {
		font-size: 8.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 600;
		color: rgba(255, 255, 255, 0.25);
	}

	.fallback-card-type {
		background: rgba(255, 255, 255, 0.07);
		padding: 3px 6px;
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.08);
		font-size: 9.5px;
		font-weight: 600;
		color: #d1d5db;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		min-height: 20px;
		box-sizing: border-box;
		display: flex;
		align-items: center;
	}

	.fallback-card-body {
		flex: 1;
		background: rgba(0, 0, 0, 0.35);
		border-radius: 4px;
		border: 1px solid rgba(255, 255, 255, 0.05);
		padding: 6px 8px;
		display: flex;
		flex-direction: column;
		position: relative;
		overflow: hidden;
		box-sizing: border-box;
		min-height: 0;
	}

	.fallback-card-body.has-pt {
		padding-bottom: 20px;
	}

	.fallback-card-text {
		font-size: 9px;
		line-height: 1.35;
		color: #cbd5e1;
		white-space: pre-line;
		word-break: break-word;
		overflow-y: auto;
		scrollbar-width: none;
		flex: 1;
	}

	.fallback-card-text::-webkit-scrollbar {
		display: none;
	}

	.fallback-pt-box {
		position: absolute;
		bottom: 3px;
		right: 4px;
		background: #181b22;
		border: 1.5px solid rgba(255, 255, 255, 0.25);
		border-radius: 4px;
		padding: 1px 6px;
		font-size: 11px;
		font-weight: 800;
		color: #f8fafc;
		box-shadow: 0 2px 5px rgba(0, 0, 0, 0.5);
		line-height: 1.2;
		z-index: 2;
	}

	.fallback-pt-box.loyalty {
		background: #2b2316;
		border-color: rgba(245, 158, 11, 0.5);
		color: #fef3c7;
	}
</style>
