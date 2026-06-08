<script>
	import { Settings, Loader, Check } from "lucide-svelte";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";

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

	// Initialize form on mount/update
	$effect(() => {
		if (authStore.user && !displayName && !isSubmitting && !success) {
			const meta = authStore.user.user_metadata || {};
			displayName = meta.display_name || authStore.user.email?.split("@")[0] || "";
			favoriteFormats = meta.favorite_formats || [];
			defaultLand = meta.default_land || "Plains";
			defaultView = meta.default_view || "stacks";
		}
	});

	$effect(() => {
		if (!authStore.isLoading && !authStore.isAuthenticated) {
			goto("/login?redirectTo=/settings");
		}
	});

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
		} catch (err) {
			console.error("Failed to save settings:", err);
			error = "Failed to save settings. Please try again.";
		} finally {
			isSubmitting = false;
		}
	}
</script>

<div class="settings-page-wrapper">
<div class="settings-page-container">
	<header class="page-header">
		<div class="title-area">
			<Settings class="header-icon" size={24} />
			<h1>User Settings</h1>
		</div>
	</header>

	<main class="page-body">
		{#if authStore.isLoading}
			<div class="loading-state">
				<Loader class="spinner" size={36} />
				<p>Loading settings...</p>
			</div>
		{:else}
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
					<a href="/" class="cancel-link">Cancel</a>
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
		{/if}
	</main>
</div>
</div>

<style>
	.settings-page-wrapper {
		width: 100%;
		height: 100%;
		overflow-y: auto;
		background: hsl(var(--background));
	}

	.settings-page-container {
		width: 100%;
		max-width: 600px;
		margin: 0 auto;
		padding: 3rem 1.5rem;
		min-height: 100%;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	.page-header {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		margin-bottom: 2.5rem;
		border-bottom: 1px solid hsl(var(--border) / 0.5);
		padding-bottom: 1.5rem;
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	:global(.header-icon) {
		color: hsl(var(--primary));
	}

	.page-header h1 {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
		font-size: 2rem;
		font-style: italic;
		font-weight: 500;
		margin: 0;
		color: hsl(var(--foreground));
		letter-spacing: -0.01em;
	}

	.page-body {
		flex: 1;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.section-title {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
		font-size: 1rem;
		font-style: italic;
		font-weight: 500;
		color: hsl(var(--primary));
		border-bottom: 1px solid hsl(var(--border) / 0.4);
		padding-bottom: 0.5rem;
		margin-top: 0.5rem;
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

	.settings-form :global(.form-group .ui-input) {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif !important;
		font-style: italic !important;
		font-size: 1.125rem !important;
		height: 2.75rem !important;
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

	.settings-form :global(.form-group .ui-input:focus-visible) {
		border-color: transparent !important;
		border-bottom-color: hsl(var(--primary)) !important;
		background: transparent !important;
		box-shadow: none !important;
		outline: none !important;
	}

	.grid-2-col {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.5rem;
	}

	/* Select styling */
	.select-wrapper {
		position: relative;
		width: 100%;
	}

	.custom-select {
		width: 100%;
		height: 2.75rem;
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
		gap: 0.75rem;
	}

	.format-checkbox-card {
		background: rgba(255, 255, 255, 0.02);
		border: 1px solid rgba(255, 255, 255, 0.06);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
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

	:global(.checkbox-circle .check-icon) {
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
		gap: 1.25rem;
		margin-top: 1rem;
		border-top: 1px solid hsl(var(--border) / 0.4);
		padding-top: 1.5rem;
	}

	.cancel-link {
		color: hsl(var(--muted-foreground));
		text-decoration: none;
		font-size: 0.875rem;
		font-weight: 500;
		transition: color 0.15s ease;
	}

	.cancel-link:hover {
		color: hsl(var(--foreground));
	}

	:global(.actions-row .submit-btn) {
		height: 2.75rem !important;
		padding: 0 1.5rem !important;
		font-size: 0.875rem !important;
		font-weight: 600 !important;
	}

	/* Loading */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 6rem 1.5rem;
		gap: 1rem;
		color: hsl(var(--muted-foreground));
	}

	:global(.loading-state .spinner) {
		animation: spin 1s linear infinite;
		color: hsl(var(--primary));
	}

	@keyframes spin {
		from { transform: rotate(0deg); }
		to { transform: rotate(360deg); }
	}
</style>
