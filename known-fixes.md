# Autonomous Error Correction & Learning Protocol - Known Fixes

This file tracks recurring technical patterns and their approved fix patterns to ensure visual stability and codebase health.

## Type Safety & Nullability

### Error Signature: "Argument of type 'string | null' is not assignable to parameter of type 'string'"
**Fix Pattern**: Provide a fallback value using the `||` operator or a null check.
**Logic**: Many store methods expect strict strings, but interaction states often use `null` for "none" or "default".

```javascript
// Before
store.method(state.maybeNull);
// After
store.method(state.maybeNull || 'fallback-value');
```

## Svelte Type Safety

### Error Signature: "Property 'focus' does not exist on type 'never'" or "Type 'HTMLInputElement' is not assignable to type 'null'"
**Fix Pattern**: Use explicit JSDoc casting for `$state` initializers.
**Logic**: Svelte's type inference sometimes defaults to `never` or `null` only if not explicitly typed.

```javascript
let el = $state(/** @type {HTMLElement | null} */ (null));
```

### Error Signature: "Property 'X' does not exist on type 'EventTarget'."
**Fix Pattern**: Narrow the type of `e.currentTarget` (or `e.target`) using an `instanceof HTMLElement` check.
**Logic**: Svelte event handlers default the type of event targets to `EventTarget`, which does not contain HTML-specific properties or methods (like `blur()` or `focus()`). Checking if the target is an instance of `HTMLElement` allows the compiler to safely narrow its type.

```javascript
// Before
if (e.currentTarget) {
	e.currentTarget.blur();
}
// After
if (e.currentTarget instanceof HTMLElement) {
	e.currentTarget.blur();
}
```

### Error Signature: "Block-scoped variable 'X' used before its declaration." or "Variable 'X' is used before being assigned."
**Fix Pattern**: Reorder the declarations in the `<script>` tag so that dependent variables (like filtered lists or selections) are defined before they are referenced by other `$derived` or state variables.
**Logic**: Svelte 5 `$derived` and `$state` statements are compiled into standard block-scoped JS declarations. Referencing a variable declared further down in the file triggers block-scoping errors during TypeScript/static checking.


## JSDoc / Type Definitions

### Error Signature: "Property 'X' does not exist on type 'Y'"
**Fix Pattern**: Ensure all new properties added to a `$state` object are reflected in its corresponding `@typedef`.
**Logic**: TypeScript/IDE static analysis relies on these definitions even in JS files.

```javascript
/**
 * @typedef {Object} Y
 * @property {Type} X
 */
```

### Error Signature: "Parameter 'X' implicitly has an 'any' type."
**Fix Pattern**: Add JSDoc parameter type annotations above the function definition.
**Logic**: Svelte uses TypeScript under the hood for type checking. Parameters without explicit types default to `any`, which triggers errors in strict mode. Adding JSDoc comments resolves this.

```javascript
// Before
function myFunction(param) {}

// After
/** @param {string} param */
function myFunction(param) {}
```

### Error Signature: "Element implicitly has an 'any' type because expression of type 'string' can't be used to index type 'X'."
**Fix Pattern**: Annotate the dictionary/lookup object with JSDoc typing `/** @type {Record<string, ValueType>} */`.
**Logic**: TypeScript/Svelte-check prevents indexing object literals with generic string types unless they are explicitly typed as dictionaries with an index signature.

```javascript
// Before
const myMap = { a: 1, b: 2 };
const val = myMap[someStringKey];

// After
/** @type {Record<string, number>} */
const myMap = { a: 1, b: 2 };
const val = myMap[someStringKey];
```

## CSS / Svelte Layouts

### Error Signature: "Unused CSS selector 'X'"
**Fix Pattern**: Wrap the class selector inside a `:global()` modifier, optionally scoping it to a local parent element: `:global(.parent-class .X)`.
**Logic**: Svelte compiles CSS scoped to local elements. If a class name is passed down as a prop to a child component (e.g. `className="X"`), the static compiler cannot trace it and warns that the style is unused. `:global()` marks the rule as global so it is not optimized away or scoped.

```css
/* Before */
.ms-cost {
	font-size: 0.85em;
}

/* After */
:global(.mana-icons-cell .ms-cost) {
	font-size: 0.85em;
}
```

## TypeScript & SvelteKit Environment Types

### Error Signature: "Cannot find module '$env/static/public' or its corresponding type declarations." (or other `$env` modules)
**Fix Pattern**: Remove the explicit `"include"` block from the root `jsconfig.json` / `tsconfig.json` to allow full inheritance of SvelteKit's generated type files, or explicitly add SvelteKit's auto-generated definitions to the `"include"` array.
**Logic**: Specifying an `"include"` array in a child `tsconfig.json` / `jsconfig.json` overrides the `"include"` array in SvelteKit's base configuration (`./.svelte-kit/tsconfig.json`). This excludes SvelteKit's generated ambient types (such as `ambient.d.ts`), preventing `$env` imports from resolving.

```