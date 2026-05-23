## Overview

What are we doing?
 - Shifting away from localhost to a fully hosted online platform
 - Replacing most of our Scryfall queries with a local first database and custom parser

 Moving away from Scryfall queries allows us to have lightning fast response times for card search/filtering, and more importantly allows us to perform searches for more than 175 cards per 500ms. This is essential for an MTG Arena style deckbuilder where you can browse a massive list of cards in real time.

 The card price data allows budget commander players to select a point in time to source prices. This kind of price stability is the impetus for creating the deck builder in the first place.

## How it will work

This blueprint outlines the technical architecture of your local-first, timeline-budget deckbuilder. By combining automated data restructuring, zero-egress file hosting, and local client-side processing, this setup eliminates network bottlenecks entirely, enabling rapid "search-as-you-type" functionality.

### 1. The Data Automation Pipeline

Instead of running an expensive, persistent backend server, a serverless automation pipeline handles the continuous extraction, transformation, and distribution of Magic card data.

**The Cron Trigger –** A GitHub Action is configured to run automatically every week using a standard cron job.

**Card Data Extraction Slimming –** The script runs a custom Node.js (or Bun) data utility. It programmatically downloads Scryfall's latest 514MB `default-cards.json` bulk data asset. It groups all printing objects by their unique `oracle_id` to eliminate duplicates, creating a single clean entry per card name. During this loop, the utility selects a canonical display printing based on your specific visual constraints (prioritizing the 2015 frame design). It strips out administrative metadata, digital-only prints (`digital: true`), auxiliary card layouts (tokens, art series), and secondary site IDs. It compresses the format legalities into simple arrays, creating a highly optimized, flat card schema.

**The Price Snapshot Separation –** The script calculates the absolute lowest price across all available printings for each unique card. It isolates this financial data from the static card rules, saving the data into a uniquely timestamped file like `prices_YYYY_MM_DD.json`. This approach creates a running weekly archive of historical market snapshots, allowing users to select different eras for budget compliance checks.

**The Storage Matrix –** The execution utility applies Brotli compression to the files. The streamlined rules block shrinks down to a ~25MB payload, and each weekly pricing file shrinks to roughly 400KB. The script assigns an updated timestamp ID and pushes these files to a public **Cloudflare R2** bucket, alongside an updated system routing map named `manifest.json`.

---

### 2. Infrastructure & Hosting Ecosystem

This layer is designed to handle thousands of active users without incurring high bandwidth fees or data-transfer penalties.

**Frontend Layer –** Your static Svelte user interface is hosted directly on **Cloudflare Pages**. It links directly to your production GitHub branches, executing a continuous integration and deployment pass on every git push.

**Asset Delivery Network –** Your data files are distributed through **Cloudflare R2**. Because R2 maintains a strict zero-egress fee model, users can pull card data files free of data-transfer charges.

**User State Database –** Supabase manages cloud storage and persistent user records. When a user connects via integrated OAuth providers (such as Google or Discord), their saved decklists are synchronized to a standard PostgreSQL database as highly optimized `jsonb` payloads. Rather than just storing simple ID-to-quantity pairs, this flexible schema records optional card-level metadata objects. This allows users to save personalized card overrides—such as a custom printing choice, alternate mana values, or custom color identities—directly inside individual deck workspaces. Because core search querying and budget evaluation continue to execute entirely client-side against the browser's IndexedDB instance, these custom text properties travel cleanly during cloud syncing without adding latency to the main application search loop.

---

### 3. Client-Side Architecture

The browser serves as the primary search engine, running complex card validations locally to bypass network latency.

**Persistent Storage –** The browser organizes local tables using **Dexie.js**, a lightweight developer wrapper built over the native **IndexedDB** engine. The local schema splits data into distinct stores:

* A static `cards` store holding card rules, names, and text attributes.
* A dynamic `prices` lookup table populated based on the active timeframe selected by the user.

```typescript
// Core Dexie.js local database initialization schema
import Dexie, { type Table } from 'dexie';

class DeckbuilderDatabase extends Dexie {
  cards!: Table<CleanCard, string>; // Keyed by oracle_id
  prices!: Table<{ oracle_id: string; price: number }, string>;

  constructor() {
    super('DeckbuilderCache');
    this.version(1).stores({
      cards: 'id, name, type_line, *colors, *formats',
      prices: 'oracle_id, price'
    });
  }
}

```

**The Synchronization Loop –** When your Svelte app mounts, a local initialization check queries your public R2 bucket's `manifest.json`. If the user's cache is empty, it downloads the compressed 25MB core rules snapshot and stores it locally. When a user changes the compliance timeline via the UI dropdown, the app quickly pulls down the corresponding 400KB timestamped price snapshot file from R2 and overwrites the local lookup table.

**The Local Query Lifecycle –** Your text field captures input strings and passes them to the **`@sillvva/search`** parser engine inside a reactive Svelte block. The library converts the query into a predictable token structure (Abstract Syntax Tree).

Your app then executes a quick query pass across IndexedDB using the most restrictive index available (like `type_line`), and filters the final records directly in memory using standard JavaScript array conditions. This setup delivers fast, responsive search results without a single external loading spinner.

## Implementation Plan

### 1. Overhauling the Data Preprocessor

The preprocessor is a standalone script executed in a Node.js or Bun environment. It reads Scryfall's raw dataset as a stream to avoid overflowing system memory, then transforms it into two distinct outputs.

Before we tackle the pre-processor itself, we need to generate a robust but small JSON card file in the same format as the scryfall default cards for testing purposes.

Here is the revised blueprint for Step 1, rewritten to position your agent code companion as the primary engine for creating a robust development sandbox.

---

#### 1. Building the Sandbox and Overhauling the Data Preprocessor

The data preprocessor must be written inside a local environment using a streaming parser to ensure it doesn't overrun system memory when handling Scryfall's massive 514MB file. Before writing the production extraction script, your first priority is to build a representative development sandbox file.

**Task 1A: Cultivating a Diverse Testing Sandbox –** Instruct your agent to write a targeted selection script that builds a compact `sandbox-default-cards.json` containing roughly 500 distinct records. To ensure your processing engine accounts for every strange layout rule in Magic's history, do not just pull a string of consecutive cards from the top of the file or use raw random selection. Your utility script should actively crawl the dataset and ensure the final sandbox file includes:

* **Normal Cards –** Standard, single-face cards (like *Lightning Bolt*) to calibrate basic name, color, type, and rule text extraction strings.
* **Multi-Face Permutations –** At least 20 split cards (e.g., *Fire // Ice*), 20 adventure layouts (e.g., *Bonecrusher Giant*), and 20 modal double-faced cards (e.g., *Pathrazer of Lamia // Shatterskull Smashing*) to stress-test your nested `card_faces` array concatenation logic.
* **Frame Treatment Variations –** A mix of promotional printings, showcase borders, borderless treatments, and extended art variants alongside standard cards from identical `oracle_id` pools. This allows you to verify that your Chronological 2015 Frame-Picker properly drops loud visual assets and successfully falls back to clean, normal layouts.
* **Edge-Case Outliers –** Cards with missing text properties, empty price values, color-indicator fields (like *Ancestral Vision*), and colorless identities to confirm that your data normalizer handles `null` values and missing arrays gracefully.

**Task 1B: Prototyping the Transformation Engine –** Once your agent delivers this perfect 500-card sandbox file, use it to rapidly build and iterate on the core reduction utility without experiencing execution lag.

```typescript
// Core transformation prototype to run over your sandbox file
import { readFileSync, writeFileSync } from 'fs';

interface RawCard {
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  legalities: Record<string, string>;
  image_uris?: { normal: string };
  prices: { usd?: string; usd_foil?: string };
  frame: string;
  frame_effects?: string[];
  released_at: string;
  digital: boolean;
  layout: string;
  card_faces?: Array<{ name: string; mana_cost?: string; type_line: string; oracle_text?: string; image_uris?: { normal: string } }>;
}

const rawData: RawCard[] = JSON.parse(readFileSync('sandbox-default-cards.json', 'utf-8'));
const processingMap = new Map<string, { rules: RawCard; cheapestPrice: number; allPrintings: RawCard[] }>();

// Group cards by their common oracle identity string
for (const card of rawData) {
  if (card.digital || ['token', 'art_series', 'emblem'].includes(card.layout)) continue;
  
  const id = card.oracle_id;
  const price = Math.min(
    parseFloat(card.prices.usd ?? 'Infinity'),
    parseFloat(card.prices.usd_foil ?? 'Infinity')
  );

  if (!processingMap.has(id)) {
    processingMap.set(id, { rules: card, cheapestPrice: price, allPrintings: [card] });
  } else {
    const existing = processingMap.get(id)!;
    existing.allPrintings.push(card);
    if (price < existing.cheapestPrice) existing.cheapestPrice = price;
  }
}

```

**Task 1C: Rule Transformation and Compilation Specifications –** For each unique ID bucket inside your sandbox map, clean the attributes into your flat production schema targets:

* **Aesthetic Frame Selection –** Sort the printings array chronologically by `released_at`. Locate the first printing where `frame === "2015"` and no loud treatments exist inside `frame_effects` (exclude `showcase`, `borderless`, `extendedart`). If no 2015 frame design matches are found, reverse the chronological array and extract the newest printing matching standard historical modern frames (`2003`, `1997`). Extract `image_uris.normal` from that specific object.
* **Text Consolidation –** Extract game mechanics. If the item contains a `card_faces` array, concatenate their properties into a uniform root string block: `card.text = faceA.text + " // " + faceB.text`. Otherwise, default directly to the root `oracle_text` string.
* **Legality Compacting –** Loop through the keys of the `legalities` object. If a format value equals `"legal"` or `"restricted"`, push that format's name into a clean, flat string array: `formats: ["standard", "commander", "modern"]`.

**Output Verification –** Pointing your pipeline at this 500-card sandbox will instantly output your production file formats (`cards.json` and `prices_YYYY_MM_DD.json`) within milliseconds. Once your agent verifies that the text concatenation, frame choices, and pricing comparisons match your visual expectations perfectly inside your code editor, you can deploy this exact script to your automated weekly cloud pipeline with complete confidence.

---


**The Processing Engine Logic –** The pipeline script must execute a grouping and reduction strategy over the raw elements:

```typescript
// Conceptual processing pipeline loop
import { createReadStream } from 'fs';
import { Chain } from 'stream-chain'; // Useful for memory-safe processing

interface RawScryfallCard {
  oracle_id: string;
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  colors?: string[];
  color_identity: string[];
  legalities: Record<string, string>;
  image_uris?: { normal: string };
  prices: { usd?: string; usd_foil?: string };
  frame: string;
  frame_effects?: string[];
  released_at: string;
  digital: boolean;
  layout: string;
  card_faces?: Array<{ name: string; mana_cost?: string; type_line: string; oracle_text?: string }>;
}

// Memory map to hold grouped items during reduction pass
const processingMap = new Map<string, {
  rules: any;
  cheapestPrice: number;
  allPrintings: RawScryfallCard[];
}>();

function processIncomingCard(card: RawScryfallCard) {
  // Filter out invalid categories wholesale
  if (card.digital || ['token', 'art_series', 'emblem'].includes(card.layout)) return;
  
  const id = card.oracle_id;
  const currentPrice = Math.min(
    parseFloat(card.prices.usd ?? 'Infinity'),
    parseFloat(card.prices.usd_foil ?? 'Infinity')
  );

  if (!processingMap.has(id)) {
    processingMap.set(id, { rules: card, cheapestPrice: currentPrice, allPrintings: [card] });
    return;
  }

  const existing = processingMap.get(id)!;
  existing.allPrintings.push(card);
  if (currentPrice < existing.cheapestPrice) {
    existing.cheapestPrice = currentPrice;
  }
}

```

**Rule Transformation Specifications –** For each unique ID bucket inside your processing loop, clean the card attributes into your flat target format:

* **Aesthetic Selection –** Filter the bucket's printing history to extract the preferred display image. Sort the items chronologically by `released_at`. Locate the first printing where `frame === "2015"` and no loud styles exist in `frame_effects` (exclude `showcase`, `borderless`, `extendedart`). If no 2015 frame matches exist, reverse the array and take the newest printing matching standard legacy frames (`2003`, `1997`). Extract `image_uris.normal`.
* **Text Consolidation –** Extract game text. If the object contains a `card_faces` array, map over the elements and combine their parameters into your root string: `card.text = faceA.text + " // " + faceB.text`. Otherwise, use the standard `oracle_text` string.
* **Legality Compacting –** Loop through the keys of the `legalities` object. If a format value equals `"legal"` or `"restricted"`, push that format's name into a clean, flat string array: `formats: ["standard", "commander", "modern"]`.

**Output Compilation –** The script writes two files:

* `cards.json` – The complete array of all slimmed game rule objects (roughly 25,000 rows).
* `prices_YYYY_MM_DD.json` – A lightweight key-value lookup file pairing `oracle_id` strings directly with their calculated lowest numeric prices.

---

### 2. Setting Up the Automated Pipeline & Infrastructure

This phase establishes the zero-maintenance background workflow that keeps your distribution layers up to date.

**The Hosting Architecture –** You do not need a continuous backend server. All processed data files are hosted out of a public **Cloudflare R2** storage bucket named `mtg-deckbuilder-data`.

**The Automation Workflow –** Create a GitHub Action file inside your repository at `.github/workflows/sync-data.yml`. Configure it to run on a weekly cron schedule:

```yaml
name: Weekly Scryfall Sync
on:
  schedule:
    - cron: '0 0 * * 0' # Every Sunday at midnight
  workflow_dispatch: # Allows manual testing

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          
      - name: Fetch Scryfall Bulk Meta
        run: |
          BULK_URL=$(curl -s https://api.scryfall.com/bulk-data | jq -r '.data[] | select(.type=="default_cards") | .download_uri')
          curl -L -o raw-default-cards.json "$BULK_URL"
          
      - name: Run Preprocessor Utility
        run: node scripts/preprocess.js raw-default-cards.json
        
      - name: Compress Outputs
        run: |
          brotli -q 9 dist/cards.json
          brotli -q 9 dist/prices_*.json
          
      - name: Upload to Cloudflare R2
        uses: jakejarvis/s3-sync-action@master
        with:
          args: --acl public-read --follow-symlinks
        env:
          AWS_S3_BUCKET: 'mtg-deckbuilder-data'
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_S3_ENDPOINT: ${{ secrets.R2_ENDPOINT_URL }}
          SOURCE_DIR: 'dist'

```

**The Routing Manifest –** Your script must also generate and upload a tiny `manifest.json` file to the root of the bucket. This file lists the current production `cards_version` hash and an array of all historical price files currently sitting in the bucket, allowing your client app to know what timelines are available for selection.

---

### 3. Production Frontend & User Sync Deployment

This step connects your local development workspace to cloud environments for hosting assets and tracking user accounts.

**Client-Side Static Deployment –** Link your frontend GitHub repository to **Cloudflare Pages**. In the build settings, specify your build commands (e.g., `npm run build`) and output directory (e.g., `dist` or `.svelte-kit/output`). Cloudflare distributes your static application bundle across its global edge network.

**User State Database Configuration –** Initialize a project within **Supabase**. In the authentication module, enable OAuth providers like Google or Discord to manage user logins. Run the migration script in the Supabase SQL editor to spin up your relational tables:

```sql
create table public.decks (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade not null,
  name text not null,
  cards jsonb not null default '{}'::jsonb, 
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Turn on Row Level Security (RLS) to protect user data privacy
alter table public.decks enable row level security;

create policy "Users can modify their own decks" 
  on public.decks for all 
  using (auth.uid() = user_id);

```

---

### 4. Building the Local Search Engine Loop

This layer brings your components together inside the browser, routing the query syntax engine directly to local storage tables.

**Local Schema Integration –** Configure your local database wrapper file using **Dexie.js** to handle your flat object records:

```typescript
// src/lib/db.ts
import Dexie, { type Table } from 'dexie';

export interface CleanCard {
  id: string;
  name: string;
  mana: string;
  cmc: number;
  type: string;
  text: string;
  colors: string[];
  identity: string[];
  formats: string[];
  image: string;
}

export class LocalCardDatabase extends Dexie {
  cards!: Table<CleanCard, string>;
  prices!: Table<{ id: string; price: number }, string>;

  constructor() {
    super('LocalCardDatabase');
    this.version(1).stores({
      cards: 'id, name, type, *colors, *formats',
      prices: 'id, price'
    });
  }
}

export const db = new LocalCardDatabase();

```

**The Sync Manager –** Create a Svelte initialization service. On application startup, it fetches `manifest.json` from your R2 storage bucket. If the local `cards` table is unpopulated, it downloads the compressed ~25MB rules file, unpacks it, and populates IndexedDB. When a user selects a budget timeline from the UI, the service checks the manifest, fetches the corresponding 400KB pricing snapshot file, and updates the local `prices` table.

**The Tokenized Search Engine –** Integrate `@sillvva/search` to map user string text directly onto your database. Write your evaluation engine wrapper to intercept user keystrokes in real time:

```typescript
// src/lib/search.ts
import { QueryParser } from '@sillvva/search';
import { db } from './db';

const parser = new QueryParser({
  validKeys: ['t', 'type', 'o', 'oracle', 'c', 'color', 'cmc', 'mv', 'price'],
  defaultKey: 'name'
});

export async function runLocalSearch(inputString: string) {
  const parsed = parser.parse(inputString);
  if (parsed.metadata.hasErrors) return [];

  const conditions = parsed.astConditions;
  let collectionQuery = db.cards;

  // Optimize performance: use IndexedDB index for primary filtering if possible
  const typeCond = conditions.find(c => c.key === 't' || c.key === 'type');
  if (typeCond && !typeCond.isNegated) {
    collectionQuery = db.cards.where('type').equalsIgnoreCase(typeCond.value as string) as any;
  }

  const baseSet = await collectionQuery.toArray();

  // Run remaining filters and numeric price checks straight through memory
  const evaluationResults = [];
  for (const card of baseSet) {
    let matchesAll = true;

    for (const cond of conditions) {
      const key = cond.key || 'name';
      let isMatch = true;

      if (key === 'name') {
        isMatch = card.name.toLowerCase().includes(cond.value.toLowerCase());
      } else if (key === 'o' || key === 'oracle') {
        isMatch = card.text?.toLowerCase().includes(cond.value.toLowerCase()) ?? false;
      } else if (key === 'cmc' || key === 'mv') {
        isMatch = evalNumeric(card.cmc, cond.operator, Number(cond.value));
      } else if (key === 'price') {
        const priceRecord = await db.prices.get(card.id);
        const actualPrice = priceRecord ? priceRecord.price : Infinity;
        isMatch = evalNumeric(actualPrice, cond.operator, Number(cond.value));
      }

      if (cond.isNegated) isMatch = !isMatch;
      if (!isMatch) {
        matchesAll = false;
        break;
      }
    }

    if (matchesAll) evaluationResults.push(card);
  }

  return evaluationResults;
}

function evalNumeric(left: number, op: string, right: number): boolean {
  if (op === '>') return left > right;
  if (op === '<') return left < right;
  if (op === '>=') return left >= right;
  if (op === '<=') return left <= right;
  return left === right;
}

```

Connect this `runLocalSearch` function to a standard Svelte reactive statement (`$:`) linked to your search component's text input field. Use a virtual scrolling list component to render the cards smoothly, completing your high-performance, local-first search system.

