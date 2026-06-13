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

## Svelte 5 Derived Variable Declaration Order
- **Error Signature:** `Block-scoped variable 'X' used before its declaration` or `Variable 'X' is used before being assigned` when referencing a `$derived` variable in other derived state computations or hooks declared earlier in the script tag.
- **Fix Pattern:** Ensure that all source/dependent `$derived` expressions are declared chronologically from top-to-bottom relative to their reference hierarchy.

## Strict Null Checking in Template Bindings
- **Error Signature:** `'X' is possibly 'null'` inside template class bindings or attribute expressions (e.g. `class:active={hasCondition && idx >= X}`).
- **Fix Pattern:** Add an explicit null guard (`X !== null`) directly in the template condition expression (e.g., `class:active={hasCondition && X !== null && idx >= X}`).

## TypeScript Permissions Query API Validation
- **Error Signature:** `Type '"X"' is not assignable to type 'PermissionName'` (e.g. `'clipboard-read'`).
- **Fix Pattern:** Cast the non-standard or newer permission name string using JSDoc type casting to `any`: `/** @type {any} */ ('clipboard-read')`.
- **Logic:** TypeScript's standard browser definition libraries (`lib.dom.d.ts`) may not include all permissions (such as clipboard read/write actions) in the `PermissionName` type definition union. Casting the string to `any` bypasses this strict typing warning while letting the underlying browser API execute correctly.