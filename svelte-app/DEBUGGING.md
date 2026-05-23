# 🛠️ Budgericards Debugging Guide

This guide covers both **Browser Console** commands (for managing live app state) and **Terminal** commands (for managing the development environment).

---

## 🌐 Browser Console Commands
**Where to run:** Open Chrome DevTools (`F12` or `Cmd+Option+I`), click the **Console** tab, and type these directly.

## 🚀 Emergency Controls

### Kill All Network Requests
If the app is spamming Scryfall or behaving erratically, run this to immediately block all outgoing requests.
```javascript
BUDGIE_STOP()
```

### Toggle Mock Mode
Simulate a working network without actually hitting Scryfall's servers. Great for testing UI animations without wasting API quota.
```javascript
BUDGIE_MOCK(true)  // Activate
BUDGIE_MOCK(false) // Deactivate
```

---

## 🧹 State Management

### Clear Cache (Soft Reset)
Wipes the global card cache and the current deck's metadata. This forces the app to re-fetch all card details (images, costs) while **keeping your card list intact**.
```javascript
BUDGIE_CLEAR_CACHE()
```

### Full Factory Reset
Wipes **everything** from LocalStorage (Deck names, quantities, cache, settings) and reloads the page.
```javascript
BUDGIE_RESET_DECK()
```

---

## 📊 Diagnostics

### Check Health Stats
View the current status of the request queue, deduplicator, and circuit breaker.
```javascript
BUDGIE_STATS()
```

### Monitor Network
Check the **Network Tab** in DevTools. All Scryfall requests should be spaced at least **100ms** apart. Cached requests will show a custom header: `X-From-Cache: true`.

---

## 💻 Terminal Commands
**Where to run:** Inside the `svelte-app` directory in your VS Code terminal.

### Start Development Server
```bash
npm run dev
```

### Run UI & Accessibility Audit
```bash
/rams src/lib/components/SearchPanel.svelte
```

### Install New Dependencies
```bash
npm install <package-name>
```

---

## 📝 Development Notes

### Freeform Column View (v1 - Ephemeral)
The current Freeform column view is a **rudimentary first pass** intentionally scoped to be non-persistent.

- **No persistence**: The freeform layout (card-to-column mapping and column order) lives only in local component state. Switching away from Freeform and back will reset the layout to the inherited grouping.
- **Inherited structure**: When entering Freeform, the column set and card distribution are inherited from whatever the previous grouping was (CMC, Type, or Color).
- **Future work needed**: 
  - Persist freeform layout per-deck to localStorage (requires a dedicated schema in deckStore)
  - Richer UX for column creation/reordering (e.g. a column palette, drag handles on headers)
  - Support for saving named "presets" of freeform layouts
  - Undo/redo integration for in-freeform moves without triggering the deck history
