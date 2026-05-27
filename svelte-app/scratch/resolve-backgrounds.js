import fs from 'fs';
import path from 'path';
import { BACKGROUNDS } from '../src/lib/constants/backgrounds.js';
import { RESOLVED_ART } from '../src/lib/constants/resolved-art.js';

const outputMarkdownPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/mtg-art-resolved.md';
const outputJsPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/resolved-art.js';

const BACKGROUND_OVERRIDES = {
    "https://www.artofmtg.com/wp-content/uploads/2021/02/Angel-Warrior-Token-Kaldheim-MtG-Art.jpg": {
        category: "Creatures",
        url: "https://www.artofmtg.com/wp-content/uploads/2021/02/Angel-Warrior-Token-Kaldheim-MtG-Art.jpg",
        name: "Angel Warrior",
        artist: "Alexander Mokhov",
        set: "Battle for Baldur's Gate Tokens",
        setCode: "TCLB",
        collectorNumber: "25"
    }
};

// Helper delay function
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log(`Loaded ${BACKGROUNDS.length} background entries and ${RESOLVED_ART.length} resolved gallery entries.`);

    // De-duplicate background URLs
    const uniqueBackgrounds = [];
    const bgUrls = new Set();
    BACKGROUNDS.forEach(bg => {
        if (!bgUrls.has(bg.url)) {
            bgUrls.add(bg.url);
            uniqueBackgrounds.push(bg);
        }
    });
    console.log(`Found ${uniqueBackgrounds.length} unique background URLs.`);

    // Filter out cards that are already fully resolved in the original RESOLVED_ART list
    // Wait, let's keep only the original 64 cards from mtg-art.md to avoid carrying over guess fallbacks
    // Let's filter RESOLVED_ART to only include those cards whose URLs start with 'https://www.mtgpics.com'
    const originalMtgPicsCards = RESOLVED_ART.filter(c => c.url.startsWith('https://www.mtgpics.com'));
    console.log(`Filtering to original ${originalMtgPicsCards.length} mtgpics cards.`);

    // Cache already resolved backgrounds with set info (avoiding UNK/0 fallback cards)
    const cachedResolutions = {};
    RESOLVED_ART.forEach(c => {
        if (c.url.startsWith('https://www.artofmtg.com') && c.setCode !== 'UNK') {
            cachedResolutions[c.url] = c;
        }
    });
    console.log(`Loaded ${Object.keys(cachedResolutions).length} cached resolutions for artofmtg background URLs.`);

    const newlyResolved = [];

    // Helper function to guess category from title
    function guessCategory(title) {
        const titleLower = title.toLowerCase();
        if (
            titleLower.includes("plains") ||
            titleLower.includes("swamp") ||
            titleLower.includes("mountain") ||
            titleLower.includes("forest") ||
            titleLower.includes("island") ||
            titleLower.includes("bridge") ||
            titleLower.includes("strand") ||
            titleLower.includes("vista") ||
            titleLower.includes("mine") ||
            titleLower.includes("guildgate") ||
            titleLower.includes("canopy") ||
            titleLower.includes("shores") ||
            titleLower.includes("room") ||
            titleLower.includes("stronghold") ||
            titleLower.includes("pathway")
        ) {
            return "Landscapes";
        }
        if (titleLower.includes("saga") || titleLower.includes("birth of meletis")) {
            return "Sagas";
        }
        if (
            titleLower.includes("token") ||
            titleLower.includes("tome") ||
            titleLower.includes("grindstone") ||
            titleLower.includes("manalith") ||
            titleLower.includes("ring")
        ) {
            return "Objects";
        }
        return "Creatures"; // Default fallback
    }

    let count = 0;
    for (const bg of uniqueBackgrounds) {
        count++;
        console.log(`[${count}/${uniqueBackgrounds.length}] Resolving: "${bg.title}"`);
        
        // Check manual overrides first
        if (BACKGROUND_OVERRIDES[bg.url]) {
            console.log(`  Resolved via manual override: "${BACKGROUND_OVERRIDES[bg.url].name}" by ${BACKGROUND_OVERRIDES[bg.url].artist}`);
            newlyResolved.push(BACKGROUND_OVERRIDES[bg.url]);
            continue;
        }

        // Check cache first
        if (cachedResolutions[bg.url]) {
            console.log(`  Cached resolution found: "${cachedResolutions[bg.url].name}" by ${cachedResolutions[bg.url].artist}`);
            newlyResolved.push(cachedResolutions[bg.url]);
            continue;
        }

        let cardData = null;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                await delay(300); // 300ms default rate limit delay
                const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(bg.title)}`;
                const res = await fetch(url);

                if (res.ok) {
                    cardData = await res.json();
                    break;
                } else if (res.status === 429) {
                    console.warn(`  Rate limited (429). Retrying attempt ${attempts}/${maxAttempts} after 5s...`);
                    await delay(5000);
                } else if (res.status === 404) {
                    // Try fuzzy search on 404
                    console.log(`  Named 404. Trying fuzzy search...`);
                    await delay(300);
                    const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(bg.title)}`);
                    if (fuzzyRes.ok) {
                        cardData = await fuzzyRes.json();
                    }
                    break;
                } else {
                    console.warn(`  Fetch returned status ${res.status}.`);
                    break;
                }
            } catch (err) {
                console.error(`  Fetch error:`, err.message);
                await delay(2000);
            }
        }

        if (cardData) {
            // Determine category from type line
            const type = (cardData.type_line || "").toLowerCase();
            let category = "Objects";
            if (type.includes("saga")) {
                category = "Sagas";
            } else if (type.includes("land")) {
                category = "Landscapes";
            } else if (type.includes("creature")) {
                category = "Creatures";
            } else {
                category = guessCategory(bg.title);
            }

            console.log(`  Resolved: "${cardData.name}" (${category}) -> set: ${cardData.set_name}, collector_number: ${cardData.collector_number}`);
            newlyResolved.push({
                category,
                url: bg.url,
                name: bg.title,
                artist: bg.artist,
                set: cardData.set_name,
                setCode: cardData.set.toUpperCase(),
                collectorNumber: cardData.collector_number
            });
        } else {
            // Fallback for custom/unresolvable tokens
            const category = guessCategory(bg.title);
            console.log(`  Unresolved fallback: "${bg.title}" (${category}) by ${bg.artist}`);
            newlyResolved.push({
                category,
                url: bg.url,
                name: bg.title,
                artist: bg.artist,
                set: bg.set || "Unknown Set",
                setCode: "UNK",
                collectorNumber: "0"
            });
        }
    }

    // Merge and deduplicate
    const merged = [...originalMtgPicsCards, ...newlyResolved];
    const grouped = {};
    const anomalies = [];

    merged.forEach(card => {
        // Group by Name + CollectorNumber
        const key = `${card.name.trim().toLowerCase()} || ${String(card.collectorNumber).trim().toLowerCase()}`;
        if (!grouped[key]) {
            grouped[key] = [];
        }
        grouped[key].push(card);
    });

    const finalGallery = [];
    for (const [key, cards] of Object.entries(grouped)) {
        if (cards.length === 1) {
            finalGallery.push(cards[0]);
        } else {
            // Check if artist matches
            const firstArtist = cards[0].artist;
            const allArtistsMatch = cards.every(c => c.artist === firstArtist);
            if (allArtistsMatch) {
                // Duplicates - keep the artofmtg.com version if available (for higher widescreen resolution backgrounds)
                const preferred = cards.find(c => c.url.includes('artofmtg.com')) || cards[0];
                console.log(`  Removing duplicate for key "${key}": keeping ${preferred.url}`);
                finalGallery.push(preferred);
            } else {
                // Anomaly check: if name & collector number match but artists differ
                // Skip if it's the UNK / 0 fallback cards
                if (cards[0].setCode === 'UNK' && cards[0].collectorNumber === '0') {
                    // Just append them all since they are different fallback cards
                    finalGallery.push(...cards);
                } else {
                    console.warn(`  [ANOMALY] Card and collector number match, but artist does not: "${key}"`);
                    cards.forEach(c => console.warn(`    - Set: "${c.setCode}", Artist: "${c.artist}" (URL: ${c.url})`));
                    anomalies.push({ key, cards });
                    // Keep the first one to resolve the duplicate in the gallery, but log it
                    finalGallery.push(cards[0]);
                }
            }
        }
    }

    if (anomalies.length > 0) {
        console.warn(`\nWARNING: Found ${anomalies.length} anomaly/anomalies where card & collector number match but artists differ!`);
    } else {
        console.log(`\nNo anomalies found (all card name + collector number matches have matching artists).`);
    }

    // Sort items by category, then by name
    finalGallery.sort((a, b) => {
        if (a.category !== b.category) {
            return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
    });

    console.log(`\nFinal gallery size: ${finalGallery.length} entries.`);

    // Write Markdown Output
    let mdOutput = "";
    const groupedResolved = {};
    finalGallery.forEach(c => {
        if (!groupedResolved[c.category]) groupedResolved[c.category] = [];
        groupedResolved[c.category].push(c);
    });

    // Write categories in standard order
    const catOrder = ["Landscapes", "Sagas", "Objects", "Creatures"];
    catOrder.forEach(cat => {
        const cards = groupedResolved[cat] || [];
        if (cards.length > 0) {
            mdOutput += `### ${cat}\n\n`;
            cards.forEach(c => {
                mdOutput += `###### ${c.name}\n`;
                mdOutput += `${c.url}\n`;
                mdOutput += `${c.artist}\n\n`;
            });
        }
    });

    fs.writeFileSync(outputMarkdownPath, mdOutput, 'utf-8');
    console.log(`Wrote markdown resolved file to: ${outputMarkdownPath}`);

    // Write JS Module Output
    const jsContent = `// Automatically generated resolved art metadata
export const RESOLVED_ART = ${JSON.stringify(finalGallery, null, 4)};\n`;

    fs.writeFileSync(outputJsPath, jsContent, 'utf-8');
    console.log(`Wrote JS module to: ${outputJsPath}`);
}

main().catch(console.error);
