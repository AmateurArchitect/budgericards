<script>
	import { fade, scale } from "svelte/transition";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import Button from "./ui/Button.svelte";
	import Input from "./ui/Input.svelte";
	import { Loader } from "lucide-svelte";
	import { onMount } from "svelte";

	const needsPrompt = $derived(
		authStore.isAuthenticated &&
		!authStore.isLoading &&
		!authStore.user?.user_metadata?.display_name
	);

	let name = $state("");
	let isSubmitting = $state(false);
	let error = $state("");

	const artUrls = [
		"https://www.mtgpics.com/pics/art/13c/207.jpg",
		"https://www.mtgpics.com/pics/art/16c/003.jpg",
		"https://www.mtgpics.com/pics/art/stx/082.jpg"
	];
	let selectedArt = $state(artUrls[0]);

	const themes = {
		"https://www.mtgpics.com/pics/art/13c/207.jpg": {
			// Cool Colors - Rubinia Soulsinger (Green/Blue/Teal)
			text: "linear-gradient(135deg, #34d399, #60a5fa)",
			buttonBg: "linear-gradient(135deg, #059669, #2563eb)",
			buttonHover: "linear-gradient(135deg, #047857, #1d4ed8)",
			glow: "rgba(59, 130, 246, 0.4)",
			borderFocus: "#3b82f6"
		},
		"https://www.mtgpics.com/pics/art/16c/003.jpg": {
			// Warm Colors - Orzhov Advokist (Amber/Gold)
			text: "linear-gradient(135deg, #fbbf24, #f59e0b)",
			buttonBg: "linear-gradient(135deg, #d97706, #b45309)",
			buttonHover: "linear-gradient(135deg, #b45309, #92400e)",
			glow: "rgba(217, 119, 6, 0.4)",
			borderFocus: "#f59e0b"
		},
		"https://www.mtgpics.com/pics/art/stx/082.jpg": {
			// Warm Colors - Poet's Quill (Rose/Crimson)
			text: "linear-gradient(135deg, #f472b6, #fb7185)",
			buttonBg: "linear-gradient(135deg, #db2777, #e11d48)",
			buttonHover: "linear-gradient(135deg, #be185d, #be123c)",
			glow: "rgba(244, 63, 94, 0.4)",
			borderFocus: "#f43f5e"
		}
	};

	const currentTheme = $derived(themes[selectedArt] || themes[artUrls[0]]);

	onMount(() => {
		selectedArt = artUrls[Math.floor(Math.random() * artUrls.length)];
	});

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

		<div class="spacer-top"></div>

		<div
			class="modal-content"
			role="dialog"
			aria-modal="true"
			aria-labelledby="prompt-title"
			tabindex="-1"
			in:scale={{ duration: 250, start: 0.95 }}
			out:scale={{ duration: 200, start: 0.95 }}
			style="
				--theme-text: {currentTheme.text};
				--theme-button-bg: {currentTheme.buttonBg};
				--theme-button-hover: {currentTheme.buttonHover};
				--theme-glow: {currentTheme.glow};
				--theme-border-focus: {currentTheme.borderFocus};
			"
		>
			<div class="key-art-container">
				<img src={selectedArt} alt="Magic: The Gathering Key Art" class="key-art" />
			</div>

			<div class="modal-body">
				<h2 id="prompt-title">Choose your Display Name</h2>

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
							autofocus
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

		<div class="spacer-bottom"></div>
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
		flex-direction: column;
		align-items: center;
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

	.spacer-top {
		flex: 1;
	}

	.spacer-bottom {
		flex: 2;
	}

	.modal-content {
		position: relative;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(24px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 420px;
		padding: 0;
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

	.key-art-container {
		width: 100%;
		aspect-ratio: 4 / 3;
		overflow: hidden;
		position: relative;
		border-bottom: 1px solid hsl(var(--border) / 0.6);
	}

	.key-art {
		width: 100%;
		height: 100%;
		object-fit: cover;
		object-position: center;
	}

	.modal-body {
		width: 100%;
		padding: 1.75rem 2rem 2.25rem 2rem;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.modal-content h2 {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
		font-size: 1.5rem;
		font-style: italic;
		font-weight: 500;
		margin: 0 0 1.5rem 0;
		background: var(--theme-text);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		letter-spacing: -0.01em;
	}

	.prompt-form {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		width: 100%;
		display: flex;
		flex-direction: column;
	}

	:global(.form-group .ui-input) {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif !important;
		font-style: italic !important;
		font-size: 1.125rem !important;
		height: 3.25rem !important;
		background: transparent !important;
		border-top: none !important;
		border-left: none !important;
		border-right: none !important;
		border-bottom: 2px solid hsl(var(--border) / 0.8) !important;
		border-radius: 0 !important;
		padding: 0.5rem 0 !important;
		text-align: left !important;
		color: #ffffff !important;
		box-shadow: none !important;
		transition: border-bottom-color 0.2s ease !important;
	}

	:global(.form-group .ui-input:focus-visible) {
		border-color: transparent !important;
		border-bottom-color: var(--theme-border-focus) !important;
		background: transparent !important;
		box-shadow: none !important;
		outline: none !important;
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
		background: var(--theme-button-bg) !important;
		color: white !important;
		border-radius: var(--radius-md) !important;
		border: none !important;
		transition: all 0.2s !important;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	:global(.prompt-form .submit-btn:hover:not(:disabled)) {
		background: var(--theme-button-hover) !important;
		box-shadow: 0 0 16px var(--theme-glow) !important;
	}

	:global(.spinner) {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
