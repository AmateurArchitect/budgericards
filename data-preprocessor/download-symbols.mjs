import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const OUTPUT_DIR = path.join(__dirname, '../svelte-app/static/mana');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function downloadSvg(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  const text = await response.text();
  fs.writeFileSync(filePath, text);
}

// Convert Scryfall symbol markup to clean local filename
// e.g. "{W}" -> "w", "{10}" -> "10", "{W/U}" -> "wu", "{W/P}" -> "wp"
function cleanSymbolName(symbol) {
  return symbol
    .toLowerCase()
    .replace(/[{}]/g, '') // remove curly braces
    .replace(/\//g, '');  // remove slashes
}

async function main() {
  console.log('Fetching symbols registry from Scryfall...');
  const registryResponse = await fetch('https://api.scryfall.com/symbology');
  if (!registryResponse.ok) {
    throw new Error(`Failed to fetch symbology registry: ${registryResponse.statusText}`);
  }

  const registry = await registryResponse.json();
  const symbols = registry.data || [];

  console.log(`Found ${symbols.length} symbols. Starting download...`);

  let count = 0;
  for (const sym of symbols) {
    const rawSymbol = sym.symbol; // e.g. "{W}"
    const cleanName = cleanSymbolName(rawSymbol);
    const svgUrl = sym.svg_uri;

    if (!svgUrl) {
      console.log(`Skipping ${rawSymbol} (no SVG URI found)`);
      continue;
    }

    const outputFilename = `${cleanName}.svg`;
    const outputPath = path.join(OUTPUT_DIR, outputFilename);

    console.log(`[${++count}/${symbols.length}] Downloading ${rawSymbol} -> ${outputFilename}...`);
    try {
      await downloadSvg(svgUrl, outputPath);
      // Wait 100ms between requests to respect Scryfall's rate limits
      await delay(100);
    } catch (err) {
      console.error(`Error downloading ${rawSymbol}:`, err.message);
    }
  }

  console.log('All symbols downloaded successfully!');
}

main().catch(console.error);
