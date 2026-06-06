<script>
	import { fade, scale } from "svelte/transition";
	import { X, Settings, Loader, Check } from "lucide-svelte";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import Button from "./ui/Button.svelte";
	import Input from "./ui/Input.svelte";
	import { onMount } from "svelte";

	/** @type {{ isOpen: boolean }} */
	let { isOpen = $bindable(false) } = $props();

	let displayName = $state("");
	/** @type {string[]} */
	let favoriteFormats = $state([]);
	let defaultLand = $state("Plains");
	let defaultView = $state("stacks");

	let isSubmitting = $state(false);
	let error = $state("");
	let success = $state(false);

	const formats = [
		"Commander",
		"Standard",
		"Modern",
		"Pioneer",
		"Legacy",
		"Vintage",
		"Pauper",
		"Brawl"
	];

	const views = [
		{ id: "stacks", label: "Stacks View" },
		{ id: "table", label: "Table View" },
		{ id: "list", label: "List View" },
		{ id: "spoiler", label: "Spoiler View" }
	];

	const lands = [
		"Plains",
		"Island",
		"Swamp",
		"Mountain",
		"Forest"
	];

	// Initialize form on open
	$effect(() => {
		if (isOpen && authStore.user) {
			const meta = authStore.user.user_metadata || {};
			displayName = meta.display_name || authStore.user.email?.split("@")[0] || "";
			favoriteFormats = meta.favorite_formats || [];
			defaultLand = meta.default_land || "Plains";
			defaultView = meta.default_view || "stacks";
			error = "";
			success = false;
		}
	});

	function close() {
		isOpen = false;
	}

	/** @param {string} format */
	function toggleFormat(format) {
		if (favoriteFormats.includes(format)) {
			favoriteFormats = favoriteFormats.filter(f => f !== format);
		} else {
			favoriteFormats = [...favoriteFormats, format];
		}
	}

	async function handleSave(/** @type {SubmitEvent} */ e) {
		e.preventDefault();
		const trimmedName = displayName.trim();
		if (!trimmedName) {
			error = "Display name cannot be empty.";
			return;
		}

		isSubmitting = true;
		error = "";
		success = false;

		try {
			const { error: updateError } = await authStore.updateUserSettings({
				displayName: trimmedName,
				favoriteFormats,
				defaultLand,
				defaultView
			});

			if (updateError) throw updateError;
			success = true;
			
			// Auto close modal after successful save
			setTimeout(() => {
				if (success) close();
			}, 1000);
		} catch (err) {
			console.error("Failed to save settings:", err);
			error = "Failed to save settings. Please try again.";
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

	/** @param {KeyboardEvent} e */
	function handleKeydown(e) {
		if (e.key === "Escape") {
			e.stopPropagation();
			close();
		}
	}

	onMount(() => {
		window.addEventListener("keydown", handleKeydown, { capture: true });
		return () => {
			window.removeEventListener("keydown", handleKeydown, { capture: true });
		};
	});
</script>

{#if isOpen}
	<div use:portal class="modal-portal-wrapper">
		<div
			class="modal-backdrop"
			role="presentation"
			onclick={close}
			in:fade={{ duration: 200 }}
			out:fade={{ duration: 150 }}
		></div>

		<div
			class="modal-content"
			role="dialog"
			aria-modal="true"
			aria-labelledby="settings-title"
			tabindex="-1"
			in:scale={{ duration: 250, start: 0.95 }}
			out:scale={{ duration: 200, start: 0.95 }}
		>
			<header class="modal-header">
				<div class="title-area">
					<Settings class="header-icon" size={20} />
					<h2 id="settings-title">User Settings</h2>
				</div>
				<button class="close-btn" onclick={close} aria-label="Close dialog">
					<X size={18} />
				</button>
			</header>

			<div class="modal-body">
				<form onsubmit={handleSave} class="settings-form">
					{#if error}
						<div class="alert alert-error">{error}</div>
					{/if}
					{#if success}
						<div class="alert alert-success">Settings saved successfully!</div>
					{/if}

					<!-- Section: Profile -->
					<div class="section-title">Profile Settings</div>
					<div class="form-group">
						<label for="display-name">Display Name</label>
						<Input
							type="text"
							id="display-name"
							bind:value={displayName}
							disabled={isSubmitting}
							required
							maxlength="40"
						/>
					</div>

					<!-- Section: Deckbuilder Defaults -->
					<div class="section-title">Deckbuilder Defaults</div>
					
					<div class="grid-2-col">
						<div class="form-group">
							<label for="default-land-select">Default Basic Land</label>
							<div class="select-wrapper">
								<select 
									id="default-land-select" 
									bind:value={defaultLand} 
									disabled={isSubmitting}
									class="custom-select"
								>
									{#each lands as land}
										<option value={land}>{land}</option>
									{/each}
								</select>
							</div>
						</div>

						<div class="form-group">
							<label for="default-view-select">Default View Mode</label>
							<div class="select-wrapper">
								<select 
									id="default-view-select" 
									bind:value={defaultView} 
									disabled={isSubmitting}
									class="custom-select"
								>
									{#each views as view}
										<option value={view.id}>{view.label}</option>
									{/each}
								</select>
							</div>
						</div>
					</div>

					<!-- Section: Favorites -->
					<div class="section-title">Favorite Formats</div>
					<div class="formats-checkbox-grid">
						{#each formats as format}
							<button
								type="button"
								class="format-checkbox-card"
								class:selected={favoriteFormats.includes(format)}
								onclick={() => toggleFormat(format)}
								disabled={isSubmitting}
							>
								<div class="checkbox-circle" class:checked={favoriteFormats.includes(format)}>
									{#if favoriteFormats.includes(format)}
										<Check size={12} class="check-icon" />
									{/if}
								</div>
								<span>{format}</span>
							</button>
						{/each}
					</div>

					<div class="actions-row">
						<Button type="button" variant="outline" onclick={close} disabled={isSubmitting}>
							Cancel
						</Button>
						<Button type="submit" variant="default" class="submit-btn" disabled={isSubmitting}>
							{#if isSubmitting}
								<Loader class="spinner animate-spin" size={16} />
								<span>Saving...</span>
							{:else}
								<span>Save Settings</span>
							{/if}
						</Button>
					</div>
				</form>
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
		z-index: 10000;
	}

	.modal-backdrop {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(8px);
	}

	.modal-content {
		position: relative;
		background: hsl(var(--popover) / 0.95);
		backdrop-filter: blur(20px);
		border: 1px solid hsl(var(--border) / 0.6);
		border-radius: var(--radius-lg);
		width: 90%;
		max-width: 500px;
		max-height: 85vh;
		display: flex;
		flex-direction: column;
		box-shadow: 
			0 30px 60px rgba(0, 0, 0, 0.6),
			0 0 0 1px hsl(var(--border) / 0.3);
		outline: none;
		overflow: hidden;
	}

	.modal-header {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		display: flex;
		align-items: center;
		justify-content: space-between;
		background: hsl(var(--muted) / 0.15);
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.header-icon {
		color: hsl(var(--primary));
	}

	.modal-header h2 {
		font-size: 1.125rem;
		font-weight: 700;
		margin: 0;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	.close-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.25rem;
		border-radius: var(--radius-sm);
		transition: all 0.15s;
	}

	.close-btn:hover {
		background: hsl(var(--muted) / 0.4);
		color: hsl(var(--foreground));
	}

	.modal-body {
		padding: 1.5rem;
		overflow-y: auto;
		flex: 1;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.section-title {
		font-size: 0.8125rem;
		font-weight: 700;
		color: hsl(var(--primary));
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		padding-bottom: 0.375rem;
		margin-top: 0.25rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
	}

	.grid-2-col {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1rem;
	}

	/* Select styling */
	.select-wrapper {
		position: relative;
		width: 100%;
	}

	.custom-select {
		width: 100%;
		height: 2.5rem;
		padding: 0 1rem;
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: var(--radius-md);
		color: #ffffff;
		font-size: 0.875rem;
		cursor: pointer;
		outline: none;
		transition: all 0.2s;
		appearance: none;
	}

	.custom-select:focus {
		border-color: hsl(var(--primary));
		background-color: rgba(0, 0, 0, 0.4);
		box-shadow: 0 0 0 3px hsl(var(--primary) / 0.15);
	}

	.select-wrapper::after {
		content: "▼";
		font-size: 0.625rem;
		color: hsl(var(--muted-foreground));
		position: absolute;
		right: 1rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
	}

	/* Checkboxes Grid */
	.formats-checkbox-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	.format-checkbox-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-md);
		padding: 0.625rem 0.875rem;
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
		transition: all 0.15s;
		text-align: left;
		color: hsl(var(--muted-foreground));
	}

	.format-checkbox-card:hover {
		background: rgba(255, 255, 255, 0.04);
		border-color: rgba(255, 255, 255, 0.1);
		color: #ffffff;
	}

	.format-checkbox-card.selected {
		background: hsl(var(--primary) / 0.05);
		border-color: hsl(var(--primary) / 0.4);
		color: #ffffff;
	}

	.checkbox-circle {
		width: 16px;
		height: 16px;
		border-radius: 50%;
		border: 1.5px solid rgba(255, 255, 255, 0.2);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s;
		flex-shrink: 0;
	}

	.checkbox-circle.checked {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
	}

	.check-icon {
		color: white;
	}

	/* Alerts */
	.alert {
		padding: 0.75rem 1rem;
		border-radius: var(--radius-md);
		font-weight: 500;
		font-size: 0.8125rem;
		text-align: center;
	}

	.alert-error {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}

	.alert-success {
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid rgba(16, 185, 129, 0.2);
		color: #a7f3d0;
	}

	/* Actions */
	.actions-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.5rem;
		border-top: 1px solid hsl(var(--border) / 0.4);
		padding-top: 1rem;
	}

	:global(.actions-row button) {
		height: 2.5rem !important;
		padding: 0 1.25rem !important;
		font-size: 0.875rem !important;
	}

	.spinner {
		animation: spin 1s linear infinite;
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
