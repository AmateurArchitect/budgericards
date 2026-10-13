<script>
	import { fade, scale } from "svelte/transition";
	import { Trash2, AlertTriangle, X } from "lucide-svelte";
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
			const active = document.activeElement;
			if (active && active.tagName === "BUTTON" && active.classList.contains("cancel-btn")) {
				return;
			}
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
			in:fade={{ duration: 180 }}
			out:fade={{ duration: 140 }}
		></div>

		<div
			class="modal-content"
			class:is-destructive={confirmStore.variant === "destructive"}
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-title"
			tabindex="-1"
			in:scale={{ duration: 180, start: 0.95 }}
			out:scale={{ duration: 140, start: 0.95 }}
		>
			<button
				class="close-btn"
				onclick={() => confirmStore.cancel()}
				aria-label="Close dialog"
			>
				<X size={15} />
			</button>

			<div class="modal-body">
				<div class="modal-header">
					{#if confirmStore.variant === "destructive"}
						<div class="icon-badge destructive">
							<Trash2 size={18} />
						</div>
					{:else}
						<div class="icon-badge default">
							<AlertTriangle size={18} />
						</div>
					{/if}
					<div class="header-text">
						<h2 id="confirm-title">{confirmStore.title}</h2>
					</div>
				</div>

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

				{#if confirmStore.prompt}
					<p class="prompt">{confirmStore.prompt}</p>
				{/if}

				<div class="actions">
					<Button
						variant="outline"
						size="sm"
						onclick={() => confirmStore.cancel()}
						class="cancel-btn"
					>
						{confirmStore.cancelText}
					</Button>

					{#if confirmStore.variant === "destructive"}
						<button
							class="confirm-btn destructive"
							onclick={() => confirmStore.confirm()}
						>
							{confirmStore.confirmText}
						</button>
					{:else}
						<Button
							variant="default"
							size="sm"
							onclick={() => confirmStore.confirm()}
							class="confirm-btn default"
						>
							{confirmStore.confirmText}
						</Button>
					{/if}
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
		background: rgba(0, 0, 0, 0.72);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
	}

	.modal-content {
		position: relative;
		background: hsl(var(--popover) / 0.96);
		backdrop-filter: blur(28px);
		-webkit-backdrop-filter: blur(28px);
		border: 1px solid hsl(var(--border) / 0.65);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 420px;
		box-shadow: 
			0 30px 60px -15px rgba(0, 0, 0, 0.8),
			0 0 0 1px hsl(var(--border) / 0.25);
		outline: none;
		overflow: hidden;
		animation: modal-enter 0.18s cubic-bezier(0.16, 1, 0.3, 1);
	}

	.modal-content.is-destructive {
		border-top: 1px solid rgba(239, 68, 68, 0.4);
		box-shadow:
			0 30px 60px -15px rgba(0, 0, 0, 0.85),
			0 0 35px -10px rgba(220, 38, 38, 0.18),
			0 0 0 1px hsl(var(--border) / 0.3);
	}

	.close-btn {
		position: absolute;
		top: 1rem;
		right: 1rem;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-sm);
		border: none;
		background: transparent;
		color: hsl(var(--muted-foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition: background-color 0.15s, color 0.15s;
		z-index: 2;
	}

	.close-btn:hover {
		background: hsla(0, 0%, 100%, 0.08);
		color: hsl(var(--foreground));
	}

	.modal-body {
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.875rem;
	}

	.modal-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding-right: 1.5rem;
	}

	.icon-badge {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-md);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}

	.icon-badge.destructive {
		background: rgba(220, 38, 38, 0.14);
		color: #ef4444;
		border: 1px solid rgba(220, 38, 38, 0.25);
	}

	.icon-badge.default {
		background: hsl(var(--primary) / 0.12);
		color: hsl(var(--primary-light));
		border: 1px solid hsl(var(--primary) / 0.25);
	}

	.header-text {
		display: flex;
		flex-direction: column;
	}

	h2 {
		font-family: var(--font-sans), sans-serif;
		font-size: 1.15rem;
		font-weight: 600;
		letter-spacing: -0.01em;
		margin: 0;
		color: #ffffff;
	}

	.message {
		font-size: 0.875rem;
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
		font-size: 0.875rem;
		color: hsl(var(--foreground));
		font-weight: 500;
		margin: 0.15rem 0 0.25rem 0;
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 0.625rem;
		width: 100%;
		margin-top: 0.5rem;
	}

	:global(.actions button) {
		min-width: 76px;
	}

	.confirm-btn.destructive {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		height: 2rem;
		padding: 0 1rem;
		border-radius: var(--radius);
		font-size: 0.8125rem;
		font-weight: 500;
		font-family: inherit;
		border: 1px solid rgba(239, 68, 68, 0.4);
		background: #dc2626;
		color: #ffffff;
		cursor: pointer;
		transition: background-color 0.15s, border-color 0.15s, box-shadow 0.15s, transform 0.08s;
		box-shadow: 0 2px 8px rgba(220, 38, 38, 0.35);
		outline: none;
	}

	.confirm-btn.destructive:hover {
		background: #b91c1c;
		border-color: rgba(239, 68, 68, 0.6);
		box-shadow: 0 4px 12px rgba(220, 38, 38, 0.5);
	}

	.confirm-btn.destructive:active {
		transform: scale(0.98);
	}

	.confirm-btn.destructive:focus-visible {
		box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px rgba(239, 68, 68, 0.5);
	}

	:global(.actions .confirm-btn.default) {
		background-color: hsl(var(--primary-dark)) !important;
		color: white !important;
	}

	:global(.actions .confirm-btn.default:hover) {
		background-color: hsl(var(--primary)) !important;
	}
</style>
