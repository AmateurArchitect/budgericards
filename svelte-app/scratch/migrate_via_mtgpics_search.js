import fs from 'fs';
import path from 'path';

const resolvedArtPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/resolved-art.js';
const backgroundsPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/backgrounds.js';
const selectedArtPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json';

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Helper: map Scryfall set code to mtgpics set prefix
function getMtgPicsSetPrefix(setCode) {
    const code = setCode.toLowerCase();
    if (code === 'm10') return '10m';
    if (code === 'm11') return '11m';
    if (code === 'm12') return '12m';
    if (code === 'm13') return '13m';
    if (code === 'm14') return '14m';
    if (code === 'm15') return '15m';
    if (code === 'm19') return '19m';
    if (code === 'm20') return '20m';
    if (code === 'm21') return '21m';
    if (code === '2x2') return '2xm';
    return code;
}

async function main() {
    const { RESOLVED_ART } = await import(resolvedArtPath);
    const { BACKGROUNDS } = await import(backgroundsPath);
    const selectedUrls = JSON.parse(fs.readFileSync(selectedArtPath, 'utf8'));

    const artofmtgArts = RESOLVED_ART.filter(c => c.url.includes('artofmtg.com'));
    console.log(`Found ${artofmtgArts.length} artofmtg.com entries to migrate via mtgpics search...`);

    const migrationMap = {};
    const failures = [];

    let count = 0;
    for (const art of artofmtgArts) {
        count++;
        console.log(`\n[${count}/${artofmtgArts.length}] Searching for: "${art.name}" (Set: ${art.setCode})`);

        if (art.setCode === 'UNK' || art.collectorNumber === '0') {
            console.log(`  Skipping UNK/0 fallback card.`);
            continue;
        }

        // 1. POST Search request to results.php
        await delay(300);
        let searchHtml = '';
        try {
            const res = await fetch("https://www.mtgpics.com/results.php?zbob=1", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: `cardtitle_search=${encodeURIComponent(art.name)}`
            });
            if (res.ok) {
                searchHtml = await res.text();
            }
        } catch (e) {
            console.error(`  Search error:`, e.message);
        }

        if (!searchHtml) {
            console.warn(`  Failed to get search response.`);
            failures.push({ name: art.name, reason: 'Failed search request' });
            continue;
        }

        // Check if redirect
        const redirectMatch = searchHtml.match(/location="card\?ref=([a-z0-9_]+)"/i);
        let ref = '';

        if (redirectMatch) {
            ref = redirectMatch[1];
            console.log(`  -> Direct redirect ref found: ${ref}`);
        } else {
            // It returned a results page. Find matching refs.
            const matches = [...searchHtml.matchAll(/card\?ref=([a-z0-9_]+)/gi)].map(m => m[1]);
            if (matches.length > 0) {
                // Find a ref starting with our target set prefix
                const prefix = getMtgPicsSetPrefix(art.setCode);
                const matchedRef = matches.find(m => m.startsWith(prefix));
                if (matchedRef) {
                    ref = matchedRef;
                    console.log(`  -> List match ref found: ${ref} (prefix: ${prefix})`);
                } else {
                    // Try to fall back to the first match if no prefix matches
                    ref = matches[0];
                    console.log(`  -> Fallback to first list match ref: ${ref}`);
                }
            }
        }

        if (!ref) {
            console.warn(`  Could not find any card references on mtgpics!`);
            failures.push({ name: art.name, reason: 'No card references found' });
            continue;
        }

        // 2. Fetch Card Page to extract gamerid
        await delay(300);
        let cardHtml = '';
        try {
            const res = await fetch(`https://www.mtgpics.com/card?ref=${ref}`);
            if (res.ok) {
                cardHtml = await res.text();
            }
        } catch (e) {
            console.error(`  Card fetch error:`, e.message);
        }

        const gamerIdMatch = cardHtml.match(/gamerid=([a-z0-9_]+)/i);
        if (!gamerIdMatch) {
            console.warn(`  Could not extract gamerid from card page!`);
            failures.push({ name: art.name, reason: 'No gamerid on card page' });
            continue;
        }

        const gamerId = gamerIdMatch[1];
        console.log(`  -> Extracted illustration ID (gamerid): ${gamerId}`);

        // 3. Resolve set and collector number from gamerid
        // gamerId structure is usually [set][cn], e.g., "roe176" or "2x2102"
        const splitMatch = gamerId.match(/^([a-z0-9]+?)(\d+[a-z0-9]*(_\d+)?)$/i);
        if (!splitMatch) {
            console.warn(`  Could not parse gamerid: ${gamerId}`);
            failures.push({ name: art.name, reason: `Could not parse gamerid: ${gamerId}` });
            continue;
        }

        const set = splitMatch[1];
        const cn = splitMatch[2];
        const candidateUrl = `https://www.mtgpics.com/pics/art/${set}/${cn}.jpg`;

        // 4. Verify candidate URL exists
        await delay(200);
        let urlExists = false;
        try {
            const headRes = await fetch(candidateUrl, { method: 'HEAD' });
            urlExists = headRes.ok;
        } catch (e) {
            console.error(`  Verification error:`, e.message);
        }

        if (urlExists) {
            console.log(`  -> SUCCESS! Migrated to mtgpics URL: ${candidateUrl}`);
            migrationMap[art.url] = candidateUrl;
        } else {
            console.warn(`  -> FAILED! Checked image URL did not exist: ${candidateUrl}`);
            failures.push({ name: art.name, reason: `Image URL returned 404: ${candidateUrl}` });
        }
    }

    console.log('\n=== MIGRATION RESULTS ===');
    console.log(`Successfully mapped to mtgpics: ${Object.keys(migrationMap).length} / ${artofmtgArts.length}`);
    console.log(`Failed: ${failures.length}`);

    if (Object.keys(migrationMap).length > 0) {
        console.log('\nWriting updates to files...');

        // Update selected-art.json
        const updatedSelectedUrls = selectedUrls.map(url => migrationMap[url] || url);
        fs.writeFileSync(selectedArtPath, JSON.stringify(updatedSelectedUrls, null, 4), 'utf8');
        console.log(`Updated ${selectedArtPath}`);

        // Update backgrounds.js
        const updatedBackgrounds = BACKGROUNDS.map(bg => {
            if (bg.url.includes('artofmtg.com')) {
                const newUrl = migrationMap[bg.url];
                if (newUrl) {
                    return {
                        ...bg,
                        url: newUrl
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
                const newUrl = migrationMap[art.url];
                if (newUrl) {
                    return {
                        ...art,
                        url: newUrl
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
}

main().catch(console.error);
