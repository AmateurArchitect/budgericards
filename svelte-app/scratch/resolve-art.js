import fs from 'fs';
import path from 'path';

// Known set code overrides where mtgpics uses a non-standard set code compared to Scryfall
const SET_OVERRIDES = {
    '17c': 'c17', // Commander 2017
    'vir': 'vis', // Visions
    'zex': 'exp', // Zendikar Expeditions
    'fin': 'fnm', // Friday Night Magic promos (fallback)
    'tdm': 'dmr', // Dominaria Remastered
    'fre': 'fem', // Fallen Empires
    'fic': 'c21', // Commander 2021
    'svc': 'ddf', // Duel Decks: Nissa vs. Ob Nixilis
    '11m': 'mma', // Modern Masters
    '10m': 'arc', // Archenemy
    '16c': 'c16', // Commander 2016
    '15c': 'c15', // Commander 2015
    'uni': 'ust', // Unstable
    'ulm': 'uma', // Ultimate Masters
};

// Hardcoded manual overrides for specific URLs that fail automated resolution
const MANUAL_OVERRIDES = {
    "https://www.mtgpics.com/pics/art/fre/005.jpg": {
        name: "Dryad Arbor",
        artist: "Eric Fortune",
        set: "Duskmourn: House of Horror Commander",
        setCode: "DSC",
        collectorNumber: "273"
    },
    "https://www.mtgpics.com/pics/art/fre/007.jpg": {
        name: "Glacial Chasm",
        artist: "Liz Danforth",
        set: "Masters Edition II",
        setCode: "ME2",
        collectorNumber: "229"
    },
    "https://www.mtgpics.com/pics/art/fic/391.jpg": {
        name: "Fetid Heath",
        artist: "Daarken",
        set: "Secrets of Strixhaven Commander",
        setCode: "soc",
        collectorNumber: "372"
    },
    "https://www.mtgpics.com/pics/art/zex/043.jpg": {
        name: "Strip Mine",
        artist: "Howard Lyon",
        set: "Zendikar Expeditions",
        setCode: "EXP",
        collectorNumber: "43"
    },
    "https://www.mtgpics.com/pics/art/znr/505.jpg": {
        name: "Needleverge Pathway // Pillarverge Pathway",
        artist: "Piotr Dura",
        set: "Zendikar Rising",
        setCode: "ZNR",
        collectorNumber: "263"
    },
    "https://www.mtgpics.com/pics/art/fin/278.jpg": {
        name: "Gohn, Town of Ruin",
        artist: "Salvatorre Zee Yazzie",
        set: "Final Fantasy",
        setCode: "FIN",
        collectorNumber: "278"
    },
    "https://www.mtgpics.com/pics/art/con/098.jpg": {
        name: "Apocalypse Hydra",
        artist: "Jason Chan",
        set: "Battlebond",
        setCode: "BBD",
        collectorNumber: "217"
    },
    "https://www.mtgpics.com/pics/art/dci/146.jpg": {
        name: "Sterling Grove",
        artist: "Seb McKinnon",
        set: "Judge Gift Cards 2020",
        setCode: "J20",
        collectorNumber: "9"
    },
    "https://www.mtgpics.com/pics/art/dci/136.jpg": {
        name: "Chalice of the Void",
        artist: "Seb McKinnon",
        set: "Judge Gift Cards 2019",
        setCode: "J19",
        collectorNumber: "7"
    },
    "https://www.mtgpics.com/pics/art/isd/205.jpg": {
        name: "Travel Preparations",
        artist: "Vincent Proce",
        set: "Innistrad",
        setCode: "ISD",
        collectorNumber: "206"
    },
    "https://www.mtgpics.com/pics/art/ths/189.jpg": {
        name: "Ashen Rider",
        artist: "Chris Rahn",
        set: "Theros",
        setCode: "THS",
        collectorNumber: "187"
    },
    "https://www.mtgpics.com/pics/art/11m/146.jpg": {
        name: "Inferno Titan",
        artist: "Kev Walker",
        set: "Magic 2011",
        setCode: "M11",
        collectorNumber: "146"
    },
    "https://www.mtgpics.com/pics/art/10m/068.jpg": {
        name: "Ponder",
        artist: "Dan Scott",
        set: "Magic 2010",
        setCode: "M10",
        collectorNumber: "68"
    }
};

const inputPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/mtg-art.md';
const outputMarkdownPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/mtg-art-resolved.md';
const outputJsPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/resolved-art.js';

// Helper delay function to adhere to Scryfall's rate limit guidelines (100ms between calls)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("Reading mtg-art.md...");
    const content = fs.readFileSync(inputPath, 'utf-8');
    const lines = content.split('\n');

    let currentCategory = "Uncategorized";
    const categories = {};
    const allUrls = new Set(); // to track global duplicates

    // Parse markdown and extract URLs categorized
    for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        if (line.startsWith('###')) {
            currentCategory = line.replace(/^###\s*/, '').trim();
            if (!categories[currentCategory]) {
                categories[currentCategory] = [];
            }
        } else if (line.startsWith('https://')) {
            if (!categories[currentCategory]) {
                categories[currentCategory] = [];
            }
            // De-duplicate URLs globally
            if (!allUrls.has(line)) {
                allUrls.add(line);
                categories[currentCategory].push(line);
            }
        }
    }

    console.log(`Parsed categories. Total unique URLs found: ${allUrls.size}`);
    for (const [cat, urls] of Object.entries(categories)) {
        console.log(`- ${cat}: ${urls.length} URLs`);
    }

    const resolvedCards = [];
    const failures = [];

    // Resolve details for each URL
    let count = 0;
    for (const [category, urls] of Object.entries(categories)) {
        for (const url of urls) {
            count++;
            console.log(`[${count}/${allUrls.size}] Resolving: ${url}`);

            // Check manual overrides first
            if (MANUAL_OVERRIDES[url]) {
                console.log(`  Resolved via manual override: "${MANUAL_OVERRIDES[url].name}" by ${MANUAL_OVERRIDES[url].artist}`);
                resolvedCards.push({
                    category,
                    url,
                    ...MANUAL_OVERRIDES[url]
                });
                continue;
            }

            // Parse set and collector number
            const match = url.match(/\/art\/([a-z0-9]+)\/([a-z0-9_]+)\.jpg/);
            if (!match) {
                console.warn(`  Could not parse URL format: ${url}`);
                failures.push({ url, reason: "URL format not matched" });
                continue;
            }

            let setCode = match[1].toLowerCase();
            let collectorNumberRaw = match[2].toLowerCase();

            // Apply set code overrides
            if (SET_OVERRIDES[setCode]) {
                setCode = SET_OVERRIDES[setCode];
            }

            let cardData = null;

            // Fetch function with retry/alternate logic
            async function fetchCard(set, num) {
                // Strip leading zeros for scryfall search if it's purely digits (or starts with digits)
                // e.g. "056" -> "56", "012" -> "12"
                let cleanNum = num;
                if (/^\d+/.test(num)) {
                    const digits = num.match(/^\d+/)[0];
                    const parsedDigits = parseInt(digits, 10).toString();
                    cleanNum = num.replace(/^\d+/, parsedDigits);
                }

                const apiUrl = `https://api.scryfall.com/cards/${set}/${cleanNum}`;
                try {
                    await delay(100); // 100ms rate limit delay
                    const response = await fetch(apiUrl);
                    if (response.ok) {
                        return await response.json();
                    }
                    if (response.status === 404) {
                        return { status: 404 };
                    }
                    return { status: response.status, error: `HTTP ${response.status}` };
                } catch (err) {
                    return { status: 500, error: err.message };
                }
            }

            // Attempt 1: Fetch with original parsed set & number
            let result = await fetchCard(setCode, collectorNumberRaw);
            if (result && !result.error && result.status !== 404) {
                cardData = result;
            }

            // Attempt 2: If collectorNumber has underscore, try trimming it (e.g. 247_1 -> 247)
            if (!cardData && collectorNumberRaw.includes('_')) {
                const trimmedNum = collectorNumberRaw.split('_')[0];
                console.log(`  Trying trimmed number: ${trimmedNum}`);
                result = await fetchCard(setCode, trimmedNum);
                if (result && !result.error && result.status !== 404) {
                    cardData = result;
                }
            }
            
            if (cardData) {
                console.log(`  Resolved: "${cardData.name}" by ${cardData.artist}`);
                resolvedCards.push({
                    category,
                    url,
                    name: cardData.name,
                    artist: cardData.artist,
                    set: cardData.set_name,
                    setCode: cardData.set.toUpperCase(),
                    collectorNumber: cardData.collector_number
                });
            } else {
                console.error(`  Failed to resolve: Set: ${setCode}, Num: ${collectorNumberRaw} (Status: ${result?.status || 'unknown'})`);
                failures.push({
                    category,
                    url,
                    setCode,
                    collectorNumber: collectorNumberRaw,
                    status: result?.status
                });
            }
        }
    }

    console.log("\n--- Resolution Summary ---");
    console.log(`Successfully resolved: ${resolvedCards.length}/${allUrls.size}`);
    console.log(`Failed to resolve: ${failures.length}/${allUrls.size}`);

    if (failures.length > 0) {
        console.log("\nFailures details:");
        failures.forEach(f => {
            console.log(`- URL: ${f.url} (Parsed set: ${f.setCode}, num: ${f.collectorNumber}, status: ${f.status})`);
        });
    }

    // Write Markdown Output
    let mdOutput = "";
    const groupedResolved = {};
    resolvedCards.forEach(c => {
        if (!groupedResolved[c.category]) groupedResolved[c.category] = [];
        groupedResolved[c.category].push(c);
    });

    for (const [cat, cards] of Object.entries(groupedResolved)) {
        mdOutput += `### ${cat}\n\n`;
        cards.forEach(c => {
            mdOutput += `###### ${c.name}\n`;
            mdOutput += `${c.url}\n`;
            mdOutput += `${c.artist}\n\n`;
        });
    }

    fs.writeFileSync(outputMarkdownPath, mdOutput, 'utf-8');
    console.log(`Wrote markdown resolved file to: ${outputMarkdownPath}`);

    // Write JS Module Output
    const jsContent = `// Automatically generated resolved art metadata
export const RESOLVED_ART = ${JSON.stringify(resolvedCards, null, 4)};\n`;

    fs.writeFileSync(outputJsPath, jsContent, 'utf-8');
    console.log(`Wrote JS module to: ${outputJsPath}`);
}

main().catch(console.error);
