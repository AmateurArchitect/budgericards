<script>
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";
	import { deckStore, generateId } from "$lib/stores/deck.svelte.js";

	// Helper to create a URL-safe slug
	/** @param {string} name */
	function slugify(name) {
		if (!name) return "new-deck";
		return name
			.toLowerCase()
			.trim()
			.replace(/[^\w\s-]/g, "")
			.replace(/[\s_-]+/g, "-")
			.replace(/^-+|-+$/g, "");
	}

	onMount(() => {
		let activeId = sessionStorage.getItem('budgericards_active_deck_id');
		if (!activeId) {
			activeId = generateId();
			sessionStorage.setItem('budgericards_active_deck_id', activeId);
		}
		// Select the deck ID to boot up the store
		deckStore.selectDeckId(activeId);
		
		const slug = slugify(deckStore.name);
		goto(`/decks/${activeId}/${slug}`, { replaceState: true });
	});
</script>

<div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: hsl(var(--background)); color: hsl(var(--muted-foreground)); font-family: var(--font-sans), sans-serif;">
	Redirecting to deckbuilder...
</div>
