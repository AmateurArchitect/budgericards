<script>
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { deckStore, generateId } from "$lib/stores/deck.svelte.js";

	onMount(() => {
		const newId = generateId();
		sessionStorage.setItem("budgericards_active_deck_id", newId);
		sessionStorage.setItem("budgericards_is_new_draft", "true");

		// Initialize and select new deck ID
		deckStore.selectDeckId(newId);

		const shortId = newId.slice(0, 8);
		goto(`/decks/${shortId}/untitled-deck`, { replaceState: true });
	});
</script>

<div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: hsl(var(--background)); color: hsl(var(--muted-foreground)); font-family: var(--font-sans), sans-serif;">
	Creating new deck...
</div>
