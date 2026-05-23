import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import StreamArray from 'stream-json/streamers/stream-array.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../default-cards-20260506211251.json');
const OUTPUT_FILE = path.join(__dirname, 'sandbox-default-cards.json');

const TARGET_QUOTAS = {
  normal: 20,
  split: 10,
  adventure: 10,
  modal_dfc: 10,
  transform: 10,
  flip: 5,
  saga: 5,
  class: 5,
  case: 5,
  leveler: 5,
  mutate: 5,
  meld: 5,
  battle: 5,
  no_mana: 5,
  color_indicator: 5,
  colorless: 10,
  planeswalker: 10,
  missing_prices: 5,
  high_volume: 5,
  random: 100 // A smattering of random cards
};

const currentCounts = { ...TARGET_QUOTAS };
Object.keys(currentCounts).forEach(k => currentCounts[k] = 0);

const targetOracleIds = new Set();
// Added Mox Jet and Worship to explicitly test the bugs mentioned
const highVolumeNames = new Set(["Lightning Bolt", "Sol Ring", "Island", "Forest", "Mountain", "Counterspell", "Mox Jet", "Worship"]);

// Explicitly banned layouts
const BANNED_LAYOUTS = new Set([
  'planar', 'scheme', 'vanguard', 'token', 'double_faced_token', 
  'emblem', 'augment', 'host', 'art_series', 'reversible_card'
]);

function isCardAllowed(card) {
  if (card.lang !== 'en') return false;
  if (card.digital) return false;
  if (BANNED_LAYOUTS.has(card.layout)) return false;
  
  if (card.set_type === 'token' || (card.type_line && card.type_line.includes('Token'))) return false;
  
  // The List & Unknown Event exclusions
  if (card.set === 'unk' || card.set === 'plst' || card.set === 'plist' || card.set_type === 'memorabilia') return false;
  
  return true;
}

function getCategories(card) {
  const categories = [];
  
  if (card.layout === 'normal' && !card.type_line?.includes('Planeswalker') && card.mana_cost) categories.push('normal');
  if (card.layout === 'split') categories.push('split');
  if (card.layout === 'adventure') categories.push('adventure');
  if (card.layout === 'modal_dfc') categories.push('modal_dfc');
  if (card.layout === 'transform') categories.push('transform');
  if (card.layout === 'flip') categories.push('flip');
  if (card.layout === 'saga' || card.type_line?.includes('Saga')) categories.push('saga');
  if (card.layout === 'class' || card.type_line?.includes('Class')) categories.push('class');
  if (card.layout === 'case' || card.type_line?.includes('Case')) categories.push('case');
  if (card.layout === 'leveler') categories.push('leveler');
  if (card.layout === 'mutate' || card.oracle_text?.includes('Mutate')) categories.push('mutate');
  if (card.layout === 'meld') categories.push('meld');
  if (card.layout === 'battle' || card.type_line?.includes('Battle')) categories.push('battle');
  
  if (card.mana_cost === '' || card.mana_cost === undefined) categories.push('no_mana');
  if (card.color_indicator) categories.push('color_indicator');
  if (card.colors && card.colors.length === 0 && !card.type_line?.includes('Land')) categories.push('colorless');
  if (card.type_line?.includes('Planeswalker')) categories.push('planeswalker');
  
  if (!card.prices?.usd && !card.prices?.usd_foil) categories.push('missing_prices');
  if (highVolumeNames.has(card.name)) categories.push('high_volume');
  
  if (Math.random() < 0.05) categories.push('random');
  
  return categories;
}

function checkQuotasFulfilled() {
  for (const key of Object.keys(TARGET_QUOTAS)) {
    if (currentCounts[key] < TARGET_QUOTAS[key]) {
      return false;
    }
  }
  return true;
}

async function runPass1() {
  console.log("Starting Pass 1: Discovering oracle_ids...");
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(INPUT_FILE);
    const pipeline = fileStream.pipe(StreamArray.withParserAsStream());
    
    let resolved = false;

    pipeline.on('data', data => {
      const card = data.value;
      if (!card.oracle_id) return;
      if (!isCardAllowed(card)) return;
      
      if (targetOracleIds.has(card.oracle_id)) return;
      
      const cats = getCategories(card);
      let added = false;
      for (const cat of cats) {
        if (currentCounts[cat] < TARGET_QUOTAS[cat]) {
          currentCounts[cat]++;
          added = true;
        }
      }
      
      if (added) {
        targetOracleIds.add(card.oracle_id);
      }
      
      if (checkQuotasFulfilled() && !resolved) {
        resolved = true;
        console.log("All quotas fulfilled! Ending Pass 1.");
        fileStream.destroy();
        resolve();
      }
    });
    
    pipeline.on('end', () => {
      if (!resolved) {
        resolved = true;
        console.log("Pass 1 finished reading entire file.");
        resolve();
      }
    });
    
    fileStream.on('error', (err) => {
      if (resolved) return;
      reject(err);
    });
  });
}

async function runPass2() {
  console.log(`Starting Pass 2: Extracting all printings for ${targetOracleIds.size} oracle_ids...`);
  const collectedCards = [];
  
  return new Promise((resolve, reject) => {
    const fileStream = fs.createReadStream(INPUT_FILE);
    const pipeline = fileStream.pipe(StreamArray.withParserAsStream());
      
    pipeline.on('data', data => {
      const card = data.value;
      if (!card.oracle_id) return;
      if (!isCardAllowed(card)) return;
      
      if (targetOracleIds.has(card.oracle_id)) {
        collectedCards.push(card);
      }
    });
    
    pipeline.on('end', () => {
      console.log(`Pass 2 finished. Collected ${collectedCards.length} total printings.`);
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collectedCards, null, 2));
      console.log(`Wrote sandbox to ${OUTPUT_FILE}`);
      resolve();
    });
    
    fileStream.on('error', reject);
  });
}

async function main() {
  await runPass1();
  console.log("Final category counts for Pass 1:", currentCounts);
  await runPass2();
}

main().catch(console.error);
