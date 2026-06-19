<script>
	import { flip } from 'svelte/animate';
	import { fly, fade } from 'svelte/transition';
	import { toastStore } from '$lib/stores/toast.svelte.js';

	const toasts = $derived(toastStore.toasts);
</script>

<div class="toast-container" aria-live="polite">
	{#each toasts as toast (toast.id)}
		<div
			animate:flip={{ duration: 250 }}
			in:fly={{ x: 150, duration: 300 }}
			out:fade={{ duration: 150 }}
			class="toast-item {toast.type}"
		>
			<div class="toast-icon">
				{#if toast.type === 'success'}
					✨
				{:else if toast.type === 'warning'}
					⚠️
				{:else if toast.type === 'error'}
					🚨
				{:else}
					📋
				{/if}
			</div>
			<div class="toast-message">
				{toast.message}
			</div>
			<button
				class="toast-close"
				onclick={() => toastStore.dismiss(toast.id)}
				aria-label="Dismiss toast"
			>
				&times;
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		bottom: 24px;
		right: 24px;
		z-index: 999999;
		display: flex;
		flex-direction: column;
		gap: 10px;
		pointer-events: none;
		max-width: 380px;
		width: calc(100vw - 48px);
	}

	.toast-item {
		pointer-events: auto;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 12px 16px;
		border-radius: var(--radius, 8px);
		background: hsla(var(--background) / 0.85);
		backdrop-filter: blur(20px) saturate(190%);
		-webkit-backdrop-filter: blur(20px) saturate(190%);
		border: 1px solid hsla(var(--border) / 0.5);
		box-shadow: 
			0 12px 24px -10px rgba(0, 0, 0, 0.5),
			inset 0 1px 0 hsla(0, 0%, 100%, 0.05);
		color: var(--text-primary);
		font-family: inherit;
		font-size: 0.875rem;
		font-weight: 500;
		line-height: 1.4;
		position: relative;
		overflow: hidden;
	}

	/* Type Accents */
	.toast-item::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 4px;
	}

	.toast-item.info::before {
		background: hsl(var(--primary, 210, 100%, 50%));
	}

	.toast-item.success::before {
		background: #10b981; /* emerald-500 */
	}

	.toast-item.warning::before {
		background: #f59e0b; /* amber-500 */
	}

	.toast-item.error::before {
		background: #ef4444; /* red-500 */
	}

	.toast-icon {
		flex-shrink: 0;
		font-size: 1.125rem;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.toast-message {
		flex: 1;
		padding-right: 8px;
	}

	.toast-close {
		flex-shrink: 0;
		background: transparent;
		border: none;
		color: var(--text-muted, #94a3b8);
		cursor: pointer;
		font-size: 1.25rem;
		line-height: 1;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s;
		border-radius: 4px;
	}

	.toast-close:hover {
		color: var(--text-primary);
		background: hsla(var(--muted) / 0.3);
	}
</style>
