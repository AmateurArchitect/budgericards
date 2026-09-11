import fs from 'fs';
import readline from 'readline';

const SANDBOX_FILE = './data-preprocessor/sandbox-default-cards.jsonl';

function parseCollectorNumber(cn) {
  if (!cn) return { num: 99999, hasSuffix: true };
  const str = String(cn).trim();
  const match = str.match(/^(\d+)([a-zA-Z★]+)?$/);
  if (match) {
    return {
      num: parseInt(match[1], 10),
      hasSuffix: !!match[2]
    };
  }
  const parsed = parseInt(str, 10);
  return {
    num: isNaN(parsed) ? 99999 : parsed,
    hasSuffix: true
  };
}

function isBasePrinting(card) {
  // Border color check
  if (!['black', 'white'].includes(card.border_color)) return false;
  
  // Basic attributes check
  if (card.full_art === true || card.textless === true || card.oversized === true) return false;
  
  // Set exclusions
  if (card.set === 'sld' || card.set === 'plist' || card.set === 'plst' || card.set === 'unk') return false;
  if (['masterpiece', 'box', 'arsenal', 'treasure_chest', 'memorabilia'].includes(card.set_type)) return false;

  // Frame effects check
  const effects = card.frame_effects || [];
  const badEffects = ['showcase', 'colorshifted', 'futureshifted', 'inverted', 'extendedart'];
  if (effects.some(e => badEffects.includes(e))) return false;
  
  // Promo types check
  const pTypes = card.promo_types || [];
  const badPromoTypes = [
    'masterpiece', 'invocation', 'invention', 'expedition', 
    'borderless', 'extendedart', 'neonink', 'gilded', 'stepandcompleat', 
    'halo', 'surgefoil', 'textured', 'thick', 'retro', 'playpromo', 
    'wizardsplaynetwork', 'judgegift', 'buyabox', 'boosterfun',
    'prerelease', 'datestamped', 'promopack', 'stamped', 'serialized'
  ];
  if (pTypes.some(pt => badPromoTypes.includes(pt))) return false;
  
  // Promo check (if promo flag is true, check if it's just UB marker or real promo)
  if (card.promo) {
    // If card.promo is true, but promo_types is empty or only contains universesbeyond, it might still be ok if no non-promo exists, but generally promo: true means non-booster promo.
    if (!pTypes.every(pt => pt === 'universesbeyond')) return false;
  }

  // Security stamp
  if (card.security_stamp === 'triangle') return false;

  // Watermarks
  if (card.watermark && ['wotc', 'fnm', 'dci', 'arena', 'wizards'].includes(card.watermark)) return false;

  return true;
}

function getPrintingScore(card) {
  const { num, hasSuffix } = parseCollectorNumber(card.collector_number);
  
  let score = 0;
  
  // Base printing bonus
  if (isBasePrinting(card)) score += 1000;
  
  // Preferred set types
  if (['expansion', 'core', 'masters', 'draft_innovation'].includes(card.set_type)) score += 200;
  else if (card.set_type === 'commander') score += 100;
  
  // Non-foil bonus
  if (card.finishes && card.finishes.includes('nonfoil')) score += 50;

  // Lower collector number bonus (within a set, base set numbers are typically < 350)
  if (!hasSuffix) score += 30;
  if (num < 350) score += 20;

  return score;
}

function pickBestImage(printings) {
  if (!printings || printings.length === 0) return "";
  
  // Sort candidates by score descending, then by release date ascending, then collector number ascending
  const sorted = [...printings].sort((a, b) => {
    // 1. Prefer Basic Core sets for Basic Lands
    const aIsBasicCore = a.type_line && a.type_line.includes('Basic Land') && a.set_type === 'core';
    const bIsBasicCore = b.type_line && b.type_line.includes('Basic Land') && b.set_type === 'core';
    if (aIsBasicCore && !bIsBasicCore) return -1;
    if (!aIsBasicCore && bIsBasicCore) return 1;

    // 2. Base printing score
    const scoreA = getPrintingScore(a);
    const scoreB = getPrintingScore(b);
    if (scoreA !== scoreB) return scoreB - scoreA;

    // 3. Release date ascending (oldest first for original art determination)
    const timeDiff = new Date(a.released_at) - new Date(b.released_at);
    if (timeDiff !== 0) return timeDiff;

    // 4. Collector number ascending
    const numA = parseCollectorNumber(a.collector_number).num;
    const numB = parseCollectorNumber(b.collector_number).num;
    if (numA !== numB) return numA - numB;

    return 0;
  });

  const best = sorted[0];
  return best?.image_uris?.normal || best?.card_faces?.[0]?.image_uris?.normal || "";
}

async function runTest() {
  const rl = readline.createInterface({
    input: fs.createReadStream(SANDBOX_FILE),
    crlfDelay: Infinity
  });

  const buckets = new Map();
  for await (const line of rl) {
    if (!line.trim()) continue;
    const card = JSON.parse(line.trim());
    if (!buckets.has(card.oracle_id)) buckets.set(card.oracle_id, []);
    buckets.get(card.oracle_id).push(card);
  }

  console.log(`Checking ${buckets.size} cards...`);
  
  const testNames = ["Sol Ring", "Skullclamp", "Worn Powerstone", "Forest", "Mountain", "Talisman of Curiosity", "Solitude", "Arcane Signet"];
  
  for (const [id, printings] of buckets.entries()) {
    const name = printings[0].name;
    if (testNames.includes(name)) {
      console.log(`\nCard: ${name}`);
      const best = [...printings].sort((a, b) => getPrintingScore(b) - getPrintingScore(a) || (parseCollectorNumber(a.collector_number).num - parseCollectorNumber(b.collector_number).num))[0];
      console.log(`  Selected Printing: set:${best.set} cn:${best.collector_number} frame:${best.frame} set_type:${best.set_type}`);
      console.log(`  All candidates count: ${printings.length}`);
      for (const p of printings) {
        console.log(`    set:${p.set.padEnd(5)} cn:${String(p.collector_number).padEnd(6)} score:${getPrintingScore(p)} frame:${p.frame} effects:${JSON.stringify(p.frame_effects||[])}`);
      }
    }
  }
}

runTest();
