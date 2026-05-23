import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import StreamArray from 'stream-json/streamers/stream-array.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, '../default-cards-20260506211251.json');
const OUTPUT_CARDS = path.join(__dirname, 'cards.json');
const dateString = new Date().toISOString().split('T')[0].replace(/-/g, '_');
const OUTPUT_PRICES = path.join(__dirname, `prices_${dateString}.json`);

const BANNED_LAYOUTS = new Set([
  'planar', 'scheme', 'vanguard', 'token', 'double_faced_token', 
  'emblem', 'augment', 'host', 'art_series', 'reversible_card', 'contraption', 'attraction'
]);

function isCardAllowed(card) {
  if (card.lang !== 'en') return false;
  if (card.digital) return false;
  if (BANNED_LAYOUTS.has(card.layout)) return false;
  
  if (card.set_type === 'token' || (card.type_line && card.type_line.includes('Token'))) return false;
  if (card.type_line && (card.type_line.includes('Stickers') || card.type_line.includes('Contraption') || card.type_line.includes('Attraction'))) return false;
  if (card.type_line === 'Card') return false;
  if (card.security_stamp === 'acorn') return false;
  
  const standardBackId = '0aeebaf5-8c7d-4636-9e82-8c27447861f7';
  if (card.card_back_id && card.card_back_id !== standardBackId) {
    const isDFC = ['transform', 'modal_dfc', 'reversible_card', 'meld', 'art_series'].includes(card.layout);
    if (!isDFC) return false;
  }
  
  if (card.set === 'unk' || card.set === 'plst' || card.set === 'plist' || card.set_type === 'memorabilia') return false;
  
  return true;
}

function isDefaultFrame(card) {
  if (!['1993', '1997', '2003', '2015'].includes(card.frame)) return false;
  if (card.border_color !== 'black') return false;
  
  const effects = card.frame_effects || [];
  if (effects.includes('showcase') || effects.includes('colorshifted') || effects.includes('futureshifted') || effects.includes('inverted') || effects.includes('extendedart')) return false;
  
  if (card.full_art === true || card.textless === true || card.oversized === true || card.promo === true) return false;
  if (card.set_type === 'masterpiece') return false;
  if (card.set === 'sld' || card.set_type === 'box' || card.set_type === 'arsenal' || card.set_type === 'treasure_chest') return false;
  
  const pTypes = card.promo_types || [];
  const badPromoTypes = [
    'masterpiece', 'invocation', 'invention', 'expedition', 
    'borderless', 'extendedart', 'neonink', 'gilded', 'stepandcompleat', 
    'halo', 'surgefoil', 'textured', 'thick', 'retro', 'playpromo', 
    'wizardsplaynetwork', 'judgegift', 'buyabox', 'boosterfun',
    'prerelease', 'datestamped', 'promopack', 'stamped'
  ];
  if (pTypes.some(pt => badPromoTypes.includes(pt))) return false;
  
  if (card.watermark && ['wotc', 'fnm', 'dci', 'arena', 'wizards'].includes(card.watermark)) return false;
  
  return true;
}

function getImageUrl(card) {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces && card.card_faces[0]?.image_uris?.normal) return card.card_faces[0].image_uris.normal;
  return "";
}

function pickBestImage(printings) {
  const sorted = [...printings].sort((a, b) => {
    const aIsBasicCore = a.type_line && a.type_line.includes('Basic Land') && a.set_type === 'core';
    const bIsBasicCore = b.type_line && b.type_line.includes('Basic Land') && b.set_type === 'core';
    if (aIsBasicCore && !bIsBasicCore) return 1;
    if (!aIsBasicCore && bIsBasicCore) return -1;
    
    const timeDiff = new Date(a.released_at) - new Date(b.released_at);
    if (timeDiff !== 0) return timeDiff;
    const aIsNonFoil = a.finishes && a.finishes.includes('nonfoil');
    const bIsNonFoil = b.finishes && b.finishes.includes('nonfoil');
    if (aIsNonFoil && !bIsNonFoil) return 1;
    if (!aIsNonFoil && bIsNonFoil) return -1;
    return 0;
  });
  const defaults = sorted.filter(isDefaultFrame);
  
  if (defaults.length === 0) {
    return getImageUrl(sorted[sorted.length - 1]);
  }
  
  const veryFirstPrinting = sorted[0];
  if (veryFirstPrinting.frame === '2015') {
    return getImageUrl(defaults[0]);
  } else {
    return getImageUrl(defaults[defaults.length - 1]);
  }
}

function processCardBucket(id, bucket) {
  const printings = bucket.allPrintings;
  const sortedDesc = [...printings].sort((a, b) => new Date(b.released_at) - new Date(a.released_at));
  const baseCard = sortedDesc[0]; 

  let combinedText = baseCard.oracle_text || "";
  let combinedMana = baseCard.mana_cost || "";
  let combinedColors = baseCard.colors || [];

  if (baseCard.card_faces && baseCard.card_faces.length > 0) {
    const texts = [];
    const manas = [];
    let faceColors = new Set();
    
    for (const face of baseCard.card_faces) {
      if (face.oracle_text) texts.push(face.oracle_text);
      if (face.mana_cost) manas.push(face.mana_cost);
      if (face.colors) face.colors.forEach(c => faceColors.add(c));
    }
    
    if (texts.length > 0) combinedText = texts.join(" // ");
    if (manas.length > 0 && !baseCard.mana_cost) combinedMana = manas.join(" // ");
    if (!baseCard.colors && faceColors.size > 0) combinedColors = Array.from(faceColors);
  }
  
  const power = baseCard.power || undefined;
  const toughness = baseCard.toughness || undefined;
  const loyalty = baseCard.loyalty || undefined;
  const keywords = baseCard.keywords || [];

  const formatsSet = new Set();
  for (const print of printings) {
    if (print.legalities) {
      for (const [format, status] of Object.entries(print.legalities)) {
        if (status === 'legal' || status === 'restricted') {
          formatsSet.add(format);
        }
      }
    }
  }

  const image = pickBestImage(printings);

  const cleanCard = {
    id: baseCard.oracle_id,
    name: baseCard.name,
    mana: combinedMana,
    cmc: baseCard.cmc || 0,
    type: baseCard.type_line || "",
    text: combinedText,
    colors: combinedColors,
    identity: baseCard.color_identity || [],
    formats: Array.from(formatsSet),
    keywords: keywords,
    image: image
  };

  if (power !== undefined) cleanCard.power = power;
  if (toughness !== undefined) cleanCard.toughness = toughness;
  if (loyalty !== undefined) cleanCard.loyalty = loyalty;

  return cleanCard;
}

console.log("Streaming full bulk data...");
const processingMap = new Map();

const fileStream = fs.createReadStream(INPUT_FILE);
const pipeline = fileStream.pipe(StreamArray.withParserAsStream());

let cardsProcessed = 0;

pipeline.on('data', data => {
  const card = data.value;
  if (!card.oracle_id) return;
  if (!isCardAllowed(card)) return;
  
  const id = card.oracle_id;
  
  const usd = card.prices?.usd ? parseFloat(card.prices.usd) : Infinity;
  const usdFoil = card.prices?.usd_foil ? parseFloat(card.prices.usd_foil) : Infinity;
  
  let priceToConsider = Infinity;
  if (!card.oversized && card.border_color !== 'gold' && card.border_color !== 'silver' && card.games && card.games.includes('paper')) {
    priceToConsider = Math.min(usd, usdFoil);
  }

  // Optimize memory by stripping out properties we don't use before pushing to the array
  // This is vital to prevent running out of heap memory when processing 100,000 cards!
  const lightweightCard = {
    oracle_id: card.oracle_id,
    name: card.name,
    lang: card.lang,
    released_at: card.released_at,
    layout: card.layout,
    image_uris: card.image_uris,
    card_faces: card.card_faces,
    mana_cost: card.mana_cost,
    cmc: card.cmc,
    type_line: card.type_line,
    oracle_text: card.oracle_text,
    power: card.power,
    toughness: card.toughness,
    loyalty: card.loyalty,
    colors: card.colors,
    color_identity: card.color_identity,
    keywords: card.keywords,
    legalities: card.legalities,
    finishes: card.finishes,
    oversized: card.oversized,
    promo: card.promo,
    set_type: card.set_type,
    set: card.set,
    border_color: card.border_color,
    frame: card.frame,
    full_art: card.full_art,
    textless: card.textless,
    frame_effects: card.frame_effects,
    promo_types: card.promo_types,
    watermark: card.watermark,
    games: card.games
  };

  if (!processingMap.has(id)) {
    processingMap.set(id, { cheapestPrice: priceToConsider, allPrintings: [lightweightCard] });
  } else {
    const existing = processingMap.get(id);
    existing.allPrintings.push(lightweightCard);
    if (priceToConsider < existing.cheapestPrice) existing.cheapestPrice = priceToConsider;
  }
  
  cardsProcessed++;
  if (cardsProcessed % 10000 === 0) {
    console.log(`Processed ${cardsProcessed} valid prints...`);
  }
});

pipeline.on('end', () => {
  console.log(`Finished streaming. Grouped into ${processingMap.size} unique oracle_ids.`);
  
  const finalCards = [];
  const finalPricesMap = {};
  
  for (const [id, bucket] of processingMap.entries()) {
    const cleanCard = processCardBucket(id, bucket);
    finalCards.push(cleanCard);
    
    if (bucket.cheapestPrice !== Infinity) {
      finalPricesMap[id] = bucket.cheapestPrice;
    }
  }
  
  fs.writeFileSync(OUTPUT_CARDS, JSON.stringify(finalCards, null, 2));
  fs.writeFileSync(OUTPUT_PRICES, JSON.stringify(finalPricesMap, null, 2));
  
  console.log(`Successfully compiled ${finalCards.length} cards and ${Object.keys(finalPricesMap).length} price records.`);
  console.log(`Saved to cards.json and prices_${dateString}.json`);
});

pipeline.on('error', (err) => {
  console.error("Stream error:", err);
});
