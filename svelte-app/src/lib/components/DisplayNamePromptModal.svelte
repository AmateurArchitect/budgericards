<script>
	import { fade, scale } from "svelte/transition";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import Button from "./ui/Button.svelte";
	import Input from "./ui/Input.svelte";
	import { User, Loader } from "lucide-svelte";
	import { onMount } from "svelte";

	const needsPrompt = $derived(
		authStore.isAuthenticated &&
		!authStore.isLoading &&
		!authStore.user?.user_metadata?.display_name
	);

	let name = $state("");
	let isSubmitting = $state(false);
	let error = $state("");

	$effect(() => {
		if (needsPrompt && authStore.user && !name) {
			const meta = authStore.user.user_metadata || {};
			name = meta.full_name || meta.user_name || meta.name || authStore.user.email?.split('@')[0] || "";
		}
	});

	async function handleSubmit(/** @type {SubmitEvent} */ e) {
		e.preventDefault();
		const trimmedName = name.trim();
		if (!trimmedName) {
			error = "Display name cannot be empty.";
			return;
		}

		isSubmitting = true;
		error = "";
		try {
			const { error: updateError } = await authStore.updateDisplayName(trimmedName);
			if (updateError) throw updateError;
		} catch (err) {
			console.error("Failed to update display name:", err);
			error = "Failed to update display name. Please try again.";
		} finally {
			isSubmitting = false;
		}
	}

	/** @param {HTMLElement} node */
	function portal(node) {
		document.body.appendChild(node);
		return {
			destroy() {
				if (node.parentNode) node.parentNode.removeChild(node);
			}
		};
	}
</script>

{#if needsPrompt}
	<div use:portal class="modal-portal-wrapper">
		<div
			class="modal-backdrop"
			role="presentation"
			in:fade={{ duration: 250 }}
			out:fade={{ duration: 200 }}
		></div>

		<div
			class="modal-content"
			role="dialog"
			aria-modal="true"
			aria-labelledby="prompt-title"
			tabindex="-1"
			in:scale={{ duration: 250, start: 0.95 }}
			out:scale={{ duration: 200, start: 0.95 }}
		>
			<div class="logo-circle">
				<User size={28} />
			</div>

			<h2 id="prompt-title">Choose your Display Name</h2>
			<p class="description">
				Welcome to Budgie! Choose a display name that other builders will see. We've prefilled this using your account profile.
			</p>

			<form onsubmit={handleSubmit} class="prompt-form">
				{#if error}
					<div class="error-alert">{error}</div>
				{/if}

				<div class="form-group">
					<Input
						type="text"
						id="display-name-input"
						placeholder="E.g. JaceBeleren"
						bind:value={name}
						required
						disabled={isSubmitting}
						maxlength="40"
						autocomplete="off"
					/>
				</div>

				<Button type="submit" variant="default" class="submit-btn" disabled={isSubmitting}>
					{#if isSubmitting}
						<Loader class="spinner animate-spin" size={16} />
						<span>Saving...</span>
					{:else}
						<span>Save and Continue</span>
					{/if}
				</Button>
			</form>
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
		z-index: 11000;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.75);
		backdrop-filter: blur(12px);
	}

	.modal-content {
		position: relative;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(24px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 420px;
		padding: 2.25rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		box-shadow: 
			0 40px 80px rgba(0, 0, 0, 0.7),
			0 0 0 1px hsl(var(--border) / 0.3);
		outline: none;
		overflow: hidden;
	}

	.logo-circle {
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: hsl(var(--primary) / 0.15);
		color: hsl(var(--primary));
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.25rem;
		border: 1px solid hsl(var(--primary) / 0.3);
	}

	.modal-content h2 {
		font-size: 1.25rem;
		font-weight: 700;
		margin: 0 0 0.75rem 0;
		color: #ffffff;
		letter-spacing: -0.019em;
	}

	.description {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.5;
		margin: 0 0 1.75rem 0;
	}

	.prompt-form {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-group {
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	:global(.form-group .ui-input) {
		text-align: center !important;
		height: 2.75rem !important;
		font-size: 0.9375rem !important;
		background: rgba(255, 255, 255, 0.03) !important;
		border-color: rgba(255, 255, 255, 0.08) !important;
	}

	:global(.form-group .ui-input:focus-visible) {
		border-color: hsl(var(--primary)) !important;
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15) !important;
		background: rgba(0, 0, 0, 0.3) !important;
	}

	.error-alert {
		font-size: 0.8125rem;
		color: #fca5a5;
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		border-radius: var(--radius);
		padding: 0.625rem;
		text-align: center;
	}

	:global(.prompt-form .submit-btn) {
		width: 100%;
		height: 2.75rem !important;
		font-weight: 600 !important;
		background-color: hsl(var(--primary)) !important;
		color: white !important;
		border-radius: var(--radius-md) !important;
		transition: all 0.2s !important;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	:global(.prompt-form .submit-btn:hover:not(:disabled)) {
		background-color: hsl(var(--primary-dark)) !important;
		box-shadow: 0 0 16px hsl(var(--primary) / 0.2);
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
