# Autonomous Error Correction & Learning Protocol

Living list of solutions to code errors.

## Svelte 5 Native Set/Map Reactivity
- **Error Signature:** Mutating a native `Set` or `Map` inside a Svelte 5 `$state` object does not trigger component updates / reactivity.
- **Fix Pattern:** Always reassign the `Set` or `Map` property after calling mutating methods (like `.add()`, `.delete()`, `.clear()`), e.g., `state.selectedCells = new Set(state.selectedCells);`, or use Svelte 5's `SvelteSet` or `SvelteMap` from `svelte/reactivity`.