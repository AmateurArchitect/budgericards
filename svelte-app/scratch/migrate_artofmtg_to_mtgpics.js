import fs from 'fs';
import path from 'path';

const resolvedArtPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/resolved-art.js';
const backgroundsPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/backgrounds.js';
const selectedArtPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Map Scryfall set codes to mtgpics set codes if they differ
function getMtgPicsSet(setCode, setName) {
    const code = setCode.toLowerCase();
    const name = setName.toLowerCase();
    
    if (code === 'm10') return '10m';
    if (code === 'm11') return '11m';
    if (code === 'm12') return '12m';
    if (code === 'm13') return '13m';
    if (code === 'm14') return '14m';
    if (code === 'm15') return '15m';
    if (code === 'm19') return '19m';
    if (code === 'm20') return '20m';
    if (code === 'm21') return '21m';
    
    // Modern Horizons 3
    if (code === 'mh3') return 'mh3';
    // Modern Horizons 2
    if (code === 'mh2') return 'mh2';
    // Double Masters 2022
    if (code === '2x2') return '2xm'; 
    
    return code;
}

async function verifyUrl(url) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        return res.ok;
    } catch (e) {
        return false;
    }
}

async function main() {
    // 1. Load current constants
    const resolvedArtContent = fs.readFileSync(resolvedArtPath, 'utf8');
    const backgroundsContent = fs.readFileSync(backgroundsPath, 'utf8');
    const selectedArtContent = fs.readFileSync(selectedArtPath, 'utf8');

    // Parse the JS objects by matches
    // Since they are JS files exporting constants, we can import them dynamically
    const { RESOLVED_ART } = await import(resolvedArtPath);
    const { BACKGROUNDS } = await import(backgroundsPath);
    const selectedUrls = JSON.parse(selectedArtContent);

    console.log(`Loaded ${RESOLVED_ART.length} resolved arts, ${BACKGROUNDS.length} backgrounds, and ${selectedUrls.length} selected URLs.`);

    const artofmtgArts = RESOLVED_ART.filter(c => c.url.includes('artofmtg.com'));
    console.log(`Found ${artofmtgArts.length} artworks from artofmtg.com in resolved-art.js.`);

    const migrationMap = {}; // oldUrl -> newUrl
    const artistUpdateMap = {}; // oldUrl -> correctArtist
    const setUpdateMap = {}; // oldUrl -> { set, setCode, collectorNumber }
    const failures = [];

    let count = 0;
    for (const art of artofmtgArts) {
        count++;
        console.log(`[${count}/${artofmtgArts.length}] Processing: "${art.name}" (${art.setCode}/${art.collectorNumber})`);

        if (art.setCode === 'UNK' || art.collectorNumber === '0') {
            console.log(`  Skipping UNK/0 fallback card: "${art.name}"`);
            failures.push({ name: art.name, url: art.url, reason: 'UNK/0 fallback card' });
            continue;
        }

        // Fetch correct info from Scryfall
        await delay(100);
        let scryfallCard = null;
        try {
            const res = await fetch(`https://api.scryfall.com/cards/${art.setCode.toLowerCase()}/${art.collectorNumber}`);
            if (res.ok) {
                scryfallCard = await res.json();
            } else {
                console.log(`  Scryfall direct lookup failed. Trying named search...`);
                await delay(100);
                const namedRes = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(art.name)}`);
                if (namedRes.ok) {
                    scryfallCard = await namedRes.json();
                }
            }
        } catch (e) {
            console.error(`  Scryfall error:`, e.message);
        }

        if (!scryfallCard) {
            console.warn(`  Failed to find card on Scryfall!`);
            failures.push({ name: art.name, url: art.url, reason: 'Not found on Scryfall' });
            continue;
        }

        const correctArtist = scryfallCard.artist;
        const setCode = scryfallCard.set.toLowerCase();
        const setName = scryfallCard.set_name;
        const collectorNumber = scryfallCard.collector_number;

        artistUpdateMap[art.url] = correctArtist;
        setUpdateMap[art.url] = { set: setName, setCode: setCode.toUpperCase(), collectorNumber };

        // Determine mtgpics set code
        const mtgPicsSet = getMtgPicsSet(setCode, setName);
        
        // Try candidate mtgpics URLs
        const candidates = [
            `https://www.mtgpics.com/pics/art/${mtgPicsSet}/${collectorNumber}.jpg`,
            `https://www.mtgpics.com/pics/art/${mtgPicsSet}/${collectorNumber}_1.jpg`,
            `https://www.mtgpics.com/pics/art/${mtgPicsSet}/${collectorNumber}_2.jpg`,
            `https://www.mtgpics.com/pics/art/${mtgPicsSet}/${collectorNumber}_3.jpg`
        ];

        let foundUrl = null;
        for (const candidate of candidates) {
            await delay(100);
            if (await verifyUrl(candidate)) {
                foundUrl = candidate;
                break;
            }
        }

        if (foundUrl) {
            console.log(`  -> SUCCESS! Mapped to: ${foundUrl} (Artist: ${correctArtist})`);
            migrationMap[art.url] = foundUrl;
        } else {
            console.warn(`  -> FAILED to find valid mtgpics URL! Keeping original URL, but correcting artist.`);
            failures.push({ name: art.name, url: art.url, reason: `No mtgpics URL found (Tried set: ${mtgPicsSet}, cn: ${collectorNumber})` });
        }
    }

    console.log('\n=== MIGRATION SUMMARY ===');
    console.log(`Successfully mapped to mtgpics: ${Object.keys(migrationMap).length} / ${artofmtgArts.length}`);
    console.log(`Failed to map to mtgpics (kept original URL, updated metadata): ${failures.length}`);

    // 2. Perform updates
    console.log('\nApplying updates to files...');

    // Update selected-art.json
    const updatedSelectedUrls = selectedUrls.map(url => migrationMap[url] || url);
    fs.writeFileSync(selectedArtPath, JSON.stringify(updatedSelectedUrls, null, 4), 'utf8');
    console.log(`Updated ${selectedArtPath}`);

    // Update backgrounds.js
    const updatedBackgrounds = BACKGROUNDS.map(bg => {
        if (bg.url.includes('artofmtg.com')) {
            const newUrl = migrationMap[bg.url] || bg.url;
            const correctArtist = artistUpdateMap[bg.url];
            const setInfo = setUpdateMap[bg.url];
            if (correctArtist && setInfo) {
                return {
                    url: newUrl,
                    title: bg.title,
                    set: setInfo.set,
                    artist: correctArtist
                };
            }
        }
        return bg;
    });

    const newBackgroundsJs = `// Automatically generated with pre-fetched artist metadata
export const BACKGROUNDS = ${JSON.stringify(updatedBackgrounds, null, 4)};\n`;
    fs.writeFileSync(backgroundsPath, newBackgroundsJs, 'utf8');
    console.log(`Updated ${backgroundsPath}`);

    // Update resolved-art.js
    const updatedResolvedArt = RESOLVED_ART.map(art => {
        if (art.url.includes('artofmtg.com')) {
            const newUrl = migrationMap[art.url] || art.url;
            const correctArtist = artistUpdateMap[art.url];
            const setInfo = setUpdateMap[art.url];
            if (correctArtist && setInfo) {
                return {
                    category: art.category,
                    url: newUrl,
                    name: art.name,
                    artist: correctArtist,
                    set: setInfo.set,
                    setCode: setInfo.setCode,
                    collectorNumber: setInfo.collectorNumber
                };
            }
        }
        return art;
    });

    const newResolvedArtJs = `// Automatically generated resolved art metadata
export const RESOLVED_ART = ${JSON.stringify(updatedResolvedArt, null, 4)};\n`;
    fs.writeFileSync(resolvedArtPath, newResolvedArtJs, 'utf8');
    console.log(`Updated ${resolvedArtPath}`);
}

main().catch(console.error);
