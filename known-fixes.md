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
```