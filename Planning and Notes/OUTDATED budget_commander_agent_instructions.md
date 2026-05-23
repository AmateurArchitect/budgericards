# Instructions for Antigravity AI Agent

You are tasked with building a modern, client-side web application and data utility for a $20 Magic: The Gathering Budget Commander League. This tool will replace an existing Python Tkinter desktop application and transition it into a fast, interactive, and serverless deckbuilder.


## Project Overview

The objective is to create a static, responsive single-page web application that allows league members to search for cards, build decks, and optimize their pricing based on a frozen, six-month-old price cache. Additionally, you will build a Node.js data-preprocessing utility that the league runner can use every six months to generate this pricing cache from Scryfall's bulk data.

To keep hosting costs at zero and maximize scalability, the web version must run entirely client-side. The local JSON price database will be loaded into browser memory, all live card searches will be made directly to Scryfall's CORS-enabled API, and active user drafts will persist using browser local storage.


## Core Pre-processing & Default Art Selection Rules

Before building the frontend, the data pre-processor utility must ingest Scryfall's raw bulk JSON and output a flattened, deduplicated "digested" JSON file. For each card name, the utility must determine the absolute cheapest print price (under $20, excluding basic lands) and resolve a "default" printing ID to fetch standard card art. Use these exact rules to select the default printing:

1. Exclude digital-only printings (where the `digital` flag is true).
2. Prefer standard frames over fancy borders (exclude any printing where `border_color === 'borderless'`, `full_art` is true, `textless` is true, or the `frame_effects` array contains showcase, extended art, etched, or inverted tags).
3. Prefer newer frame styles over legacy ones (rank frames as 2015 > 2003 > 1997 > 1993).
4. Prefer the original printing if it is available in the newest frame style found for that card.
5. If the original printing is not available in that newest frame style, choose the most recent standard printing instead.


## Key Architecture Choices

**1. Static Data Store (The Price Cache)**
* Do not build a backend database. Host the "digested" JSON price file (which maps card names/Scryfall IDs to the lowest USD price from the league's 6-month interval) statically.
* Load this JSON file into memory on application launch using the standard browser `fetch` API. Keep lookups fast ($O(1)$ complexity) by caching it as a JavaScript Map or key-value object.

**2. Live Search and API Throttling**
* Use Scryfall's public API endpoints directly from the client. Since Scryfall supports Cross-Origin Resource Sharing (CORS), no backend proxy is needed.
* Implement input debouncing of 250–300 milliseconds on the card search bar to prevent hitting Scryfall's rate limit of two requests per second.
* Cache search results in a temporary Javascript state so that deleting a character or navigating back-and-forth does not trigger unnecessary API requests.

**3. Direct CDN Rendering and Lazy Loading**
* Fetch card images directly from Scryfall's CDN (`*.scryfall.io`) instead of storing images locally.
* Construct the image CDN source URLs dynamically using the Scryfall IDs resolved during pre-processing to bypass unnecessary live search requests.
* Enforce native browser lazy-loading (`loading="lazy"`) and use a responsive CSS Grid to handle visual card grids without rendering lag.

**4. Offline CSV Processing**
* Replicate the original Python CSV processing logic locally. Use a lightweight parser like `PapaParse` to parse uploaded or pasted CSV decklists directly in the user's browser.
* Run the pricing calculations, basic land exclusions, and optimization sorting completely client-side.

**5. Client-Side Persistence**
* Save the active deck draft, configuration settings, and user choices automatically to `localStorage` or `IndexedDB`.
* Implement clean deck import/export tools, including clipboard copy-paste of optimized text decklists.


## Phase-by-Phase Implementation Plan

### Phase 0: The Pre-processing Data Utility
* Build a standalone Node.js utility script (`preprocess.js`) that runs in $O(N)$ single-pass time.
* Implement the default printing and frame selection rules to determine the exact Scryfall ID, set, and collector number to use for card art.
* Implement the lowest-price lookup across standard USD finishes (non-foil, foil, etched).
* Filter out basic lands, commander-illegal cards, and any card whose lowest price is equal to or greater than $20.00.
* Output a compact `prices.json` containing only the finalized card names, prices, and default printing IDs.

### Phase 1: Set Up the Base Environment and Load Price Cache
* Initialize a lightweight static web project (preferably using Svelte or vanilla HTML/JS/CSS).
* Set up a pipeline to fetch the custom `prices.json` generated in Phase 0.
* Build a fast JavaScript utility function to check if a given card name exists in the cache and return its locked price, set, and collector number.

### Phase 2: Implement Live Search with Rate-Limit Protection
* Create a search input component with auto-complete and full query capabilities.
* Implement a robust debounce wrapper to limit outgoing requests to Scryfall.
* Handle API errors gracefully (e.g., Scryfall 404s, 429 rate limit triggers) with clear, user-friendly UI notifications.
* Map search results instantly to the local price cache, showing the league-specific price next to the card name.

### Phase 3: Build the Interactive Deckbuilder State and UI
* Establish a reactive global state for the active deck (tracking Commander, mainboard, custom tags, and quantities).
* Build a beautiful visual workspace containing a searchable card gallery and a persistent deck panel showing the live budget calculation and statistics.
* Use CSS Grid and flexbox to implement clean responsive columns.
* Add CSS-based hover states and flip-cards to handle double-faced cards, replacing the original desktop app's buggy tooltip windows.

### Phase 4: Import, Export, and Optimization Utilities
* Add a CSV file upload boundary using `PapaParse` to extract card names and quantities.
* Implement the "Optimize Printings" logic to automatically matches each imported card name against its cheapest cached version.
* Generate a dual-output presentation: a readable price breakdown (with a checkbox to exclude basic lands from the final sum) and a clean, copy-pasteable text export of the optimized card list.
* Hook the active workspace to `localStorage` to save building state across page reloads.
