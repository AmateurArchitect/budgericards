import { RESOLVED_ART } from '../src/lib/constants/resolved-art.js';

async function checkAll() {
    console.log(`Auditing all ${RESOLVED_ART.length} resolved gallery cards against Scryfall API...`);
    const mismatches = [];
    const failures = [];
    let count = 0;

    for (const card of RESOLVED_ART) {
        count++;
        // Skip UNK / 0 fallback cards as they are known custom or unresolvable tokens
        if (card.setCode === 'UNK' || card.collectorNumber === '0') {
            console.log(`[${count}/${RESOLVED_ART.length}] Skipping custom fallback card: "${card.name}"`);
            continue;
        }

        const setCode = card.setCode.toLowerCase();
        const colNum = card.collectorNumber;
        const url = `https://api.scryfall.com/cards/${setCode}/${colNum}`;

        try {
            const res = await fetch(url);
            if (res.ok) {
                const sData = await res.json();
                
                // Compare name (case-insensitive, ignore double slashes formatting differences)
                const cleanSName = sData.name.replace(/\s*\/\/s*/g, ' // ').toLowerCase().trim();
                const cleanCName = card.name.replace(/\s*\/\/s*/g, ' // ').toLowerCase().trim();
                const nameMatch = cleanSName === cleanCName;
                
                // Compare artist (fuzzy match since artist name spelling can slightly differ)
                // e.g. "Zoltan Boros & Gabor Szikszai" vs "Zoltan Boros"
                const cleanSArtist = sData.artist.toLowerCase();
                const cleanCArtist = card.artist.toLowerCase();
                
                // Check if any words from the artist name match
                const artistWords = cleanCArtist.split(/[\s&,]+/).filter(w => w.length > 2);
                const artistMatch = artistWords.some(word => cleanSArtist.includes(word)) || cleanSArtist.includes(cleanCArtist) || cleanCArtist.includes(cleanSArtist);

                if (!nameMatch || !artistMatch) {
                    console.log(`[${count}/${RESOLVED_ART.length}] [MISMATCH] "${card.name}" by "${card.artist}" (${card.setCode}/${card.collectorNumber})`);
                    console.log(`      Scryfall has: "${sData.name}" by "${sData.artist}"`);
                    mismatches.push({
                        card,
                        scryfall: {
                            name: sData.name,
                            artist: sData.artist,
                            set: sData.set_name,
                            setCode: sData.set.toUpperCase(),
                            collectorNumber: sData.collector_number
                        },
                        reasons: {
                            nameMatch,
                            artistMatch
                        }
                    });
                } else {
                    console.log(`[${count}/${RESOLVED_ART.length}] [OK] "${card.name}" matches Scryfall.`);
                }
            } else {
                console.log(`[${count}/${RESOLVED_ART.length}] [FAIL] Scryfall API returned status ${res.status} for "${card.name}" (${setCode}/${colNum})`);
                failures.push({ card, status: res.status });
            }
        } catch (e) {
            console.log(`[${count}/${RESOLVED_ART.length}] [ERROR] Fetch error for "${card.name}": ${e.message}`);
            failures.push({ card, error: e.message });
        }
        // Rate limit: 100ms
        await new Promise(r => setTimeout(r, 100));
    }

    console.log("\n=== AUDIT RESULTS ===");
    console.log(`Total checked: ${RESOLVED_ART.length}`);
    console.log(`Mismatches: ${mismatches.length}`);
    console.log(`Failures (404/API errors): ${failures.length}`);

    if (mismatches.length > 0) {
        console.log("\nMismatches details:");
        mismatches.forEach((m, idx) => {
            console.log(`\n${idx + 1}. Card: "${m.card.name}" by "${m.card.artist}" (${m.card.setCode}/${m.card.collectorNumber})`);
            console.log(`   URL: ${m.card.url}`);
            console.log(`   Scryfall: "${m.scryfall.name}" by "${m.scryfall.artist}" (${m.scryfall.setCode}/${m.scryfall.collectorNumber})`);
            console.log(`   Reason: Name match: ${m.reasons.nameMatch}, Artist match: ${m.reasons.artistMatch}`);
        });
    }

    if (failures.length > 0) {
        console.log("\nFailures details:");
        failures.forEach((f, idx) => {
            console.log(`\n${idx + 1}. Card: "${f.card.name}" (${f.card.setCode}/${f.card.collectorNumber})`);
            console.log(`   URL: ${f.card.url}`);
            console.log(`   Status/Error: ${f.status || f.error}`);
        });
    }
}

checkAll();
