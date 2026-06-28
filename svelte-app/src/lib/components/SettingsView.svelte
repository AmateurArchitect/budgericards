<script>
	import { goto } from "$app/navigation";
	import { deckStore } from "$lib/stores/deck.svelte.js";
	import { syncService } from "$lib/syncService";

	const formats = [
		"Commander",
		"Modern",
		"Standard",
		"Pioneer",
		"Pauper",
		"Legacy",
		"Vintage",
		"Limited",
		"Oathbreaker"
	];

	async function handleDelete() {
		if (!confirm("Are you sure you want to delete this deck? This cannot be undone.")) {
			return;
		}

		const id = deckStore.id;

		// 1. Delete from local drafts
		let drafts = JSON.parse(localStorage.getItem("budgericards_local_drafts") || "[]");
		drafts = drafts.filter(/** @param {any} d */ d => d.id !== id);
		localStorage.setItem("budgericards_local_drafts", JSON.stringify(drafts));

		// 2. Delete from cached decks
		const cached = JSON.parse(localStorage.getItem("budgericards_cached_decks") || "{}");
		delete cached[id];
		localStorage.setItem("budgericards_cached_decks", JSON.stringify(cached));

		// 3. Delete from Supabase cloud
		await syncService.deleteDeck(id);

		// Clear active deck state
		deckStore.clearMetadataAndCards();
		sessionStorage.removeItem("budgericards_active_deck_id");

		// Redirect back to decks list
		goto("/decks");
	}
</script>

<div class="settings-view-container">
	<div class="settings-card">
		<h2>Deck Settings</h2>
		
		<div class="settings-form">
			<!-- Deck Name -->
			<div class="form-group">
				<label for="deck-name">Deck Name</label>
				<input 
					type="text" 
					id="deck-name" 
					bind:value={deckStore.name} 
					placeholder="Enter deck name..." 
					class="settings-input"
				/>
			</div>

			<!-- Format Selection -->
			<div class="form-group">
				<label for="deck-format">Format</label>
				<select id="deck-format" bind:value={deckStore.format} class="settings-select">
					{#each formats as fmt}
						<option value={fmt}>{fmt}</option>
					{/each}
				</select>
			</div>

			<!-- Visibility Selection -->
			<div class="form-group">
				<label for="deck-visibility">Visibility</label>
				<select id="deck-visibility" bind:value={deckStore.visibility} class="settings-select">
					<option value="public">🌍 Public (Visible to everyone and searchable)</option>
					<option value="private">🔒 Private (Only visible to you)</option>
				</select>
				<p class="help-text">
					Public decks can be searched in [Browse Decks] and shared directly via URL.
				</p>
			</div>

			<hr class="divider" />

			<!-- Danger Zone -->
			<div class="danger-zone">
				<h3>Danger Zone</h3>
				<p class="danger-text">Once you delete a deck, there is no going back. Please be certain.</p>
				<button onclick={handleDelete} class="btn-delete">
					Delete Deck
				</button>
			</div>
		</div>
	</div>
</div>

<style>
	.settings-view-container {
		flex: 1;
		overflow-y: auto;
		padding: 2rem;
		background: hsl(var(--background));
		font-family: var(--font-sans), sans-serif;
	}

	.settings-card {
		background: hsl(var(--card) / 0.45);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		border: 1px solid hsl(var(--border) / 0.5);
		border-radius: var(--radius-lg);
		padding: 2rem;
		max-width: 600px;
		margin: 0 auto;
	}

	h2 {
		margin: 0 0 1.5rem 0;
		font-size: 1.5rem;
		font-weight: 700;
		color: hsl(var(--foreground));
		letter-spacing: -0.02em;
	}

	.settings-form {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-size: 0.85rem;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	.settings-input, .settings-select {
		background: hsl(var(--input) / 0.2);
		border: 1px solid hsl(var(--border) / 0.8);
		border-radius: var(--radius-md);
		padding: 0.75rem 1rem;
		color: hsl(var(--foreground));
		font-size: 0.95rem;
		outline: none;
		transition: all 0.2s ease;
	}

	.settings-input:focus, .settings-select:focus {
		border-color: hsl(var(--primary));
		box-shadow: 0 0 0 2px hsl(var(--primary) / 0.2);
	}

	.help-text {
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
		margin: 0.25rem 0 0 0;
	}

	.divider {
		border: 0;
		height: 1px;
		background: hsl(var(--border) / 0.5);
		margin: 1rem 0;
	}

	.danger-zone {
		background: hsl(var(--destructive) / 0.05);
		border: 1px solid hsl(var(--destructive) / 0.2);
		border-radius: var(--radius-md);
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.75rem;
	}

	.danger-zone h3 {
		margin: 0;
		color: hsl(var(--destructive));
		font-size: 1rem;
		font-weight: 600;
	}

	.danger-text {
		margin: 0;
		font-size: 0.85rem;
		color: hsl(var(--muted-foreground));
	}

	.btn-delete {
		background: hsl(var(--destructive));
		color: white;
		border: none;
		border-radius: var(--radius-md);
		padding: 0.6rem 1.25rem;
		font-size: 0.9rem;
		font-weight: 600;
		cursor: pointer;
		transition: opacity 0.2s ease;
	}

	.btn-delete:hover {
		opacity: 0.9;
	}
</style>
