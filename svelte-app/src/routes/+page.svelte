<script>
	import { onMount } from "svelte";
	import { goto } from "$app/navigation";

	onMount(() => {
		goto("/decks", { replaceState: true });
	});
</script>

<div style="display: flex; align-items: center; justify-content: center; height: 100vh; background: hsl(var(--background)); color: hsl(var(--muted-foreground)); font-family: var(--font-sans), sans-serif;">
	Redirecting to deck library...
</div>

