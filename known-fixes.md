# Autonomous Error Correction & Learning Protocol

Living list of solutions to code errors.

## Svelte 5 Native Set/Map Reactivity
- **Error Signature:** Mutating a native `Set` or `Map` inside a Svelte 5 `$state` object does not trigger component updates / reactivity.
- **Fix Pattern:** Always reassign the `Set` or `Map` property after calling mutating methods (like `.add()`, `.delete()`, `.clear()`), e.g., `state.selectedCells = new Set(state.selectedCells);`, or use Svelte 5's `SvelteSet` or `SvelteMap` from `svelte/reactivity`.

## JSDoc Implicit any[] Array Initialization
- **Error Signature:** Variable 'X' implicitly has type 'any[]' in some locations where its type cannot be determined.
- **Fix Pattern:** Annotate the array initialization explicitly with `/** @type {any[]} */` or the specific element type directly above the variable declaration.

## JSDoc Inner Function Parameter Implicit Any
- **Error Signature:** Parameter 'X' implicitly has an 'any' type.
- **Fix Pattern:** Annotate the helper function's parameters with standard JSDoc `/** @param {type} X */` directly above the function declaration.
- **Logic:** In JSDoc-checked files, inner arrow functions or parameters missing explicit types default to `any`, triggering strict compiler check errors. Explicit annotation overrides the fallback.