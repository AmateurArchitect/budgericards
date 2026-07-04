<script>
	import { fade, scale } from "svelte/transition";
	import { confirmStore } from "$lib/stores/confirm.svelte.js";
	import Button from "./ui/Button.svelte";

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (!confirmStore.isOpen) return;
		if (e.key === "Escape") {
			e.preventDefault();
			confirmStore.cancel();
		} else if (e.key === "Enter") {
			e.preventDefault();
			confirmStore.confirm();
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

{#if confirmStore.isOpen}
	<div use:portal class="modal-portal-wrapper">
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={() => confirmStore.cancel()}
			in:fade={{ duration: 200 }}
			out:fade={{ duration: 150 }}
		></div>

		<div
			class="modal-content"
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			tabindex="-1"
			in:scale={{ duration: 200, start: 0.96 }}
			out:scale={{ duration: 150, start: 0.96 }}
		>
			<div class="modal-body">
				<h2 id="confirm-title">{confirmStore.title}</h2>
				<p class="message">{confirmStore.message}</p>

				{#if confirmStore.list.length > 0}
					<ul class="unrecognized-list">
						{#each confirmStore.list.slice(0, 10) as item}
							<li>• {item}</li>
						{/each}
						{#if confirmStore.list.length > 10}
							<li class="more-items">...and {confirmStore.list.length - 10} more</li>
						{/if}
					</ul>
				{/if}

				<p class="prompt">Would you like to save the rest of the deck?</p>

				<div class="actions">
					<Button variant="outline" onclick={() => confirmStore.cancel()}>
						Cancel
					</Button>
					<Button variant="default" onclick={() => confirmStore.confirm()} class="confirm-btn">
						OK
					</Button>
				</div>
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
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 12000;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(10px);
	}

	.modal-content {
		position: relative;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(24px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 440px;
		box-shadow: 
			0 40px 80px rgba(0, 0, 0, 0.7),
			0 0 0 1px hsl(var(--border) / 0.3);
		outline: none;
		overflow: hidden;
	}

	.modal-body {
		padding: 1.75rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	h2 {
		font-family: var(--font-sans), sans-serif;
		font-size: 1.25rem;
		font-weight: 600;
		margin: 0;
		color: #ffffff;
	}

	.message {
		font-size: 0.9rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.5;
		margin: 0;
	}

	.unrecognized-list {
		list-style: none;
		padding: 0.65rem 0.85rem;
		margin: 0;
		background: hsl(var(--input) / 0.3);
		border: 1px solid hsl(var(--border) / 0.4);
		border-radius: var(--radius-md);
		max-height: 160px;
		overflow-y: auto;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.unrecognized-list li {
		font-size: 0.85rem;
		color: hsl(var(--foreground));
		font-family: var(--font-mono), monospace;
	}

	.unrecognized-list li.more-items {
		color: hsl(var(--muted-foreground));
		font-style: italic;
		font-family: var(--font-sans), sans-serif;
		margin-top: 0.15rem;
	}

	.prompt {
		font-size: 0.9rem;
		color: hsl(var(--foreground));
		font-weight: 500;
		margin: 0.25rem 0 0.5rem 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		width: 100%;
	}

	:global(.actions button) {
		min-width: 80px;
	}

	:global(.actions .confirm-btn) {
		background-color: hsl(var(--primary)) !important;
		color: white !important;
	}

	:global(.actions .confirm-btn:hover) {
		background-color: hsl(var(--primary-dark)) !important;
	}
</style>
