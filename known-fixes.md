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

## TS Import Extension allowedImportingTsExtensions
- **Error Signature:** `An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.`
- **Fix Pattern:** Omit the `.ts` extension or replace it with `.js` in the import statement, e.g., `import { x } from "./file"` instead of `import { x } from "./file.ts"`.
- **Logic:** TypeScript and Svelte compilation tools (like Vite) do not allow importing files with the `.ts` extension directly, requiring extension-less or `.js` extension paths that are resolved to `.ts` files during compilation.

## TypeScript Object Indexing with String (No Index Signature)
- **Error Signature:** `Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'X'.`
- **Fix Pattern:** Cast the object to `any` before indexing, or declare a typed variable: `const castedObject = /** @type {any} */ (object);`
- **Logic:** When using TypeScript/JSDoc with strict mode, objects without an explicit index signature cannot be dynamically indexed with a variable of type `string`. Casting the object to `any` tells the compiler to allow dynamic indexing.

## Svelte 5 Unsafe State Mutation in Tracking Contexts
- **Error Signature:** `Uncaught Error: https://svelte.dev/e/state_unsafe_mutation` (State mutated unsafe).
- **Fix Pattern:** Wrap state mutations occurring inside `$effect` or tracking contexts (or functions called synchronously by them) in Svelte's `untrack(() => { ... })`.
- **Logic:** Svelte 5 strictly prevents mutating state variables inside active tracking contexts (like `$derived` or `$effect`) to avoid infinite update loops. Using `untrack` suspends the reactive context during the mutations.

## Avoid TypeScript Syntax in Plain JS Scripts
- **Error Signature:** Syntax error or crash when using non-null assertions (`!`) or TS types in a standard JavaScript `<script>` block.
- **Fix Pattern:** Use runtime guards (e.g. `if (entry)`) or JSDoc if needed, instead of TS syntax like `!`.
- **Logic:** Svelte components use standard JavaScript unless marked `lang="ts"`. Applying TypeScript syntax like `!` to plain JS scripts causes immediate syntax errors and crashes the AST validation.

## Svelte 5 Dynamic Component Deprecation in Runes Mode
- **Error Signature:** `<svelte:component> is deprecated in runes mode — components are dynamic by default https://svelte.dev/e/svelte_component_deprecated`
- **Fix Pattern:** Assign the dynamic component expression to a capitalized variable via `{@const Component = item.icon}` or in script, then render directly with `<Component ... />` instead of `<svelte:component this={...} />`.
- **Logic:** Svelte 5 runes mode natively supports capitalized component variables as dynamic tags, deprecating the legacy `<svelte:component>` element.

## JSDoc Optional Parameter with Null Default
- **Error Signature:** `Argument of type 'T[]' is not assignable to parameter of type 'null | undefined'.`
- **Fix Pattern:** Add an explicit JSDoc `@param {T[] | null} [paramName]` annotation above the function definition.
- **Logic:** When a JavaScript function specifies a default value of `= null` without an accompanying JSDoc `@param` tag, TypeScript's type checker infers the parameter's type strictly as `null` rather than a nullable union. Explicitly annotating the type informs the compiler of the accepted values.

## deckStore Active Deck Name & Board Arrays
- **Error Signature:** `Property 'cards' does not exist on type ...` or `Property 'activeDeck' does not exist on type ...` when querying deck metadata from `deckStore`.
- **Fix Pattern:** Access the active deck name directly via `deckStore.name`, and card arrays via their board getters: `deckStore.mainboard`, `deckStore.sideboard`, `deckStore.maybeboard`, `deckStore.commander` (or `deckStore.currentBoardCards`).
- **Logic:** `deckStore` encapsulates active deck state and exposes direct top-level getters (`name`, `format`, `mainboard`, etc.) rather than an `.activeDeck` wrapper or a flat `.cards` array.

## Supabase Edge Function Deno URL Imports
- **Error Signature:** `Cannot find module 'https://deno.land/...' or its corresponding type declarations.`
- **Fix Pattern:** Place `// @ts-ignore` directly above the `https://` module import in the Edge Function file (e.g. `supabase/functions/*/index.ts`).
- **Logic:** Supabase Edge Functions run in the Deno runtime where HTTPS imports are resolved natively at runtime. In workspaces configured for standard Node/web TypeScript without Deno language tooling active, TypeScript compiler checks flag remote URL imports as non-existent local modules. Adding `// @ts-ignore` suppresses the language server error without affecting Deno's runtime execution.

## Nested Button Elements (Hydration Mismatch)
- **Error Signature:** `<button> cannot be a descendant of <button>`. When rendering this component on the server, the resulting HTML will be modified by the browser (by moving, removing, or inserting elements), likely resulting in a `hydration_mismatch` warning.
- **Fix Pattern:** Replace the parent interactive container `<button>` with a `<div role="option" tabindex="-1">` (or appropriate ARIA role) and keep the child `<button>` elements intact.
- **Logic:** HTML5 specifications disallow `<button>` elements as descendants of other `<button>` elements. Browsers automatically restructure the DOM on hydration by ejecting or closing the parent `<button>`, causing SSR hydration mismatches. Using an outer `<div>` with ARIA roles ensures a valid DOM structure while preserving full interactivity.