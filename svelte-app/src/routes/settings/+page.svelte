<script>
	import { Settings, Loader, Check } from "lucide-svelte";
	import { authStore } from "$lib/stores/auth.svelte.js";
	import { settingsStore } from "$lib/stores/settings.svelte.js";
	import Button from "$lib/components/ui/Button.svelte";
	import Input from "$lib/components/ui/Input.svelte";
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
				<Settings class="header-icon" size={20} />
				<h1>Settings</h1>
			</div>
			<p class="subtitle">Manage your profile details and deckbuilding preferences.</p>
		</header>

		<main class="page-body">
			{#if authStore.isLoading}
				<div class="loading-state">
					<Loader class="spinner" size={24} />
					<p>Loading your preferences...</p>
				</div>
			{:else}
				<form onsubmit={handleSave} class="settings-form">
					{#if error}
						<div class="alert alert-error">{error}</div>
					{/if}
					{#if success}
						<div class="alert alert-success">Preferences updated successfully.</div>
					{/if}

					<!-- Section: Profile Settings -->
					<section class="settings-section">
						<div class="section-header">
							<h2>Profile Settings</h2>
							<p>Customize how you appear in deck drafts and community features.</p>
						</div>
						<div class="section-content">
							<div class="form-group">
								<label for="display-name">Display Name</label>
								<Input
									type="text"
									id="display-name"
									bind:value={displayName}
									disabled={isSubmitting}
									required
									maxlength="40"
									placeholder="e.g. Planeswalker"
								/>
							</div>
						</div>
					</section>

					<!-- Section: Deckbuilder Defaults -->
					<section class="settings-section">
						<div class="section-header">
							<h2>Deckbuilder Defaults</h2>
							<p>Default preferences applied automatically when starting new brews.</p>
						</div>
						<div class="section-content grid-2-col">
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
					</section>

					<!-- Section: Favorite Formats -->
					<section class="settings-section">
						<div class="section-header">
							<h2>Favorite Formats</h2>
							<p>Select formats to prioritize layout recommendations and legality checkers.</p>
						</div>
						<div class="section-content">
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
												<Check size={10} class="check-icon" />
											{/if}
										</div>
										<span>{format}</span>
									</button>
								{/each}
							</div>
						</div>
					</section>

					<!-- Section: Privacy & Performance -->
					<section class="settings-section">
						<div class="section-header">
							<h2>Privacy & Performance</h2>
							<p>Manage performance optimizations and local permission policies.</p>
						</div>
						<div class="section-content">
							<div class="toggle-group-row">
								<div class="toggle-text-block">
									<label for="enable-clipboard-preload" class="toggle-label-main">Speculative Clipboard Preloading</label>
									<p class="toggle-description">
										Scans clipboard for MTG decklists when focusing this tab. Resolves card data and images locally for instant importing. Clipboard data never leaves your device.
									</p>
								</div>
								<label class="switch">
									<input
										type="checkbox"
										id="enable-clipboard-preload"
										bind:checked={settingsStore.enableClipboardPreload}
										disabled={isSubmitting}
									/>
									<span class="slider"></span>
								</label>
							</div>
						</div>
					</section>

					<div class="actions-row">
						<a href="/" class="cancel-link">Cancel</a>
						<Button type="submit" variant="default" class="submit-btn" disabled={isSubmitting}>
							{#if isSubmitting}
								<Loader class="spinner animate-spin" size={14} />
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
		padding: 3.5rem 1.5rem;
		min-height: 100%;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
	}

	/* Minimal Page Header */
	.page-header {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 2.75rem;
	}

	.title-area {
		display: flex;
		align-items: center;
		gap: 0.65rem;
	}

	:global(.header-icon) {
		color: hsl(var(--muted-foreground));
	}

	.page-header h1 {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
		font-size: 1.85rem;
		font-weight: 500;
		font-style: italic;
		color: hsl(var(--foreground));
		margin: 0;
		letter-spacing: -0.01em;
	}

	.subtitle {
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
	}

	.page-body {
		flex: 1;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 2.75rem;
	}

	/* Minimal Section Layout */
	.settings-section {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		padding-bottom: 2.25rem;
	}

	.settings-section:last-of-type {
		padding-bottom: 0.5rem;
	}

	.section-header {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.section-header h2 {
		font-family: "Charter", "Bitstream Charter", "Sitka Text", Cambria, Georgia, serif;
		font-size: 1.125rem;
		font-style: italic;
		font-weight: 500;
		color: hsl(var(--primary));
		margin: 0;
	}

	.section-header p {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		margin: 0;
		line-height: 1.4;
	}

	.section-content {
		width: 100%;
	}

	/* Form Fields & Typography */
	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
	}

	.form-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Inputs & Selects styled minimal */
	.settings-form :global(.ui-input) {
		font-size: 0.875rem !important;
		height: 2.5rem !important;
		background: hsl(var(--background)) !important;
		border: 1px solid hsl(var(--border)) !important;
		border-radius: var(--radius-md) !important;
		padding: 0 0.85rem !important;
		color: hsl(var(--foreground)) !important;
		transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
	}

	.settings-form :global(.ui-input:focus-visible) {
		border-color: hsl(var(--primary)) !important;
		outline: none !important;
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15) !important;
	}

	.grid-2-col {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 1.25rem;
	}

	@media (max-width: 480px) {
		.grid-2-col {
			grid-template-columns: 1fr;
		}
	}

	.select-wrapper {
		position: relative;
		width: 100%;
	}

	.custom-select {
		width: 100%;
		height: 2.5rem;
		padding: 0 2rem 0 0.85rem;
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		color: hsl(var(--foreground));
		font-size: 0.875rem;
		cursor: pointer;
		outline: none;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
		appearance: none;
	}

	.custom-select:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.15);
	}

	.select-wrapper::after {
		content: "▼";
		font-size: 0.55rem;
		color: hsl(var(--muted-foreground));
		position: absolute;
		right: 0.85rem;
		top: 50%;
		transform: translateY(-50%);
		pointer-events: none;
		opacity: 0.7;
	}

	/* Formats Badge Grid */
	.formats-checkbox-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.5rem;
	}

	@media (max-width: 480px) {
		.formats-checkbox-grid {
			grid-template-columns: 1fr;
		}
	}

	.format-checkbox-card {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: var(--radius-md);
		padding: 0.65rem 0.85rem;
		display: flex;
		align-items: center;
		gap: 0.65rem;
		cursor: pointer;
		transition: all 0.15s ease;
		text-align: left;
		color: hsl(var(--muted-foreground));
	}

	.format-checkbox-card:hover {
		border-color: hsl(var(--border) / 1.8);
		color: hsl(var(--foreground));
	}

	.format-checkbox-card.selected {
		background: hsl(var(--primary) / 0.05);
		border-color: hsl(var(--primary) / 0.5);
		color: hsl(var(--foreground));
	}

	.checkbox-circle {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		border: 1px solid hsl(var(--border) / 1.8);
		display: flex;
		align-items: center;
		justify-content: center;
		transition: all 0.15s ease;
		flex-shrink: 0;
	}

	.checkbox-circle.checked {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
	}

	:global(.checkbox-circle .check-icon) {
		color: white;
	}

	/* Toggle Row Layout */
	.toggle-group-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1.5rem;
	}

	.toggle-text-block {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
	}

	.toggle-label-main {
		font-size: 0.875rem;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.toggle-description {
		font-size: 0.8125rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.4;
		margin: 0;
	}

	/* Toggle Switch */
	.switch {
		position: relative;
		display: inline-block;
		width: 32px;
		height: 18px;
		flex-shrink: 0;
		margin-top: 2px;
	}

	.switch input {
		opacity: 0;
		width: 0;
		height: 0;
	}

	.slider {
		position: absolute;
		cursor: pointer;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background-color: hsl(var(--border));
		transition: 0.15s ease;
		border-radius: var(--radius-lg);
	}

	.slider:before {
		position: absolute;
		content: "";
		height: 12px;
		width: 12px;
		left: 2px;
		bottom: 2px;
		background-color: hsl(var(--muted-foreground));
		transition: 0.15s ease;
		border-radius: 50%;
	}

	input:checked + .slider {
		background-color: hsl(var(--primary) / 0.2);
	}

	input:checked + .slider:before {
		transform: translateX(14px);
		background-color: hsl(var(--primary));
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
		background: rgba(239, 68, 68, 0.08);
		border: 1px solid rgba(239, 68, 68, 0.2);
		color: #fca5a5;
	}

	.alert-success {
		background: rgba(16, 185, 129, 0.08);
		border: 1px solid rgba(16, 185, 129, 0.2);
		color: #a7f3d0;
	}

	/* Actions */
	.actions-row {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 1.25rem;
		margin-top: 0.75rem;
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
		height: 2.5rem !important;
		padding: 0 1.25rem !important;
		font-size: 0.875rem !important;
		font-weight: 600 !important;
		border-radius: var(--radius-md) !important;
	}

	/* Loading state styling */
	.loading-state {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 4rem 1.5rem;
		gap: 0.75rem;
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
