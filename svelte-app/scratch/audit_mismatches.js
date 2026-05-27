const urls = [
    "https://www.mtgpics.com/pics/art/isd/205.jpg",
    "https://www.mtgpics.com/pics/art/ths/189.jpg",
    "https://www.mtgpics.com/pics/art/m21/216.jpg",
    "https://www.mtgpics.com/pics/art/11m/146.jpg",
    "https://www.mtgpics.com/pics/art/stx/115.jpg",
    "https://www.mtgpics.com/pics/art/nph/020_1.jpg",
    "https://www.mtgpics.com/pics/art/10m/068.jpg",
    "https://www.mtgpics.com/pics/art/16c/014.jpg",
    "https://www.mtgpics.com/pics/art/bbd/214.jpg",
    "https://www.mtgpics.com/pics/art/cmm/110.jpg",
    "https://www.mtgpics.com/pics/art/mh1/075.jpg",
    "https://www.mtgpics.com/pics/art/dci/146.jpg",
    "https://www.mtgpics.com/pics/art/thb/207.jpg",
    "https://www.mtgpics.com/pics/art/dci/136.jpg",
    "https://www.mtgpics.com/pics/art/eld/288.jpg",
    "https://www.mtgpics.com/pics/art/mh1/214.jpg",
    "https://www.mtgpics.com/pics/art/m20/003.jpg",
    "https://www.mtgpics.com/pics/art/15c/007.jpg",
    "https://www.mtgpics.com/pics/art/c18/006.jpg",
    "https://www.mtgpics.com/pics/art/mh2/138.jpg",
    "https://www.mtgpics.com/pics/art/zen/168.jpg",
    "https://www.mtgpics.com/pics/art/uni/014_1.jpg",
    "https://www.mtgpics.com/pics/art/ulm/057.jpg"
];

// Map of currently resolved names from resolved-art.js for these URLs
const resolvedMap = {
    "https://www.mtgpics.com/pics/art/isd/205.jpg": { name: "Splinterfright", artist: "Eric Deschamps" },
    "https://www.mtgpics.com/pics/art/ths/189.jpg": { name: "Battlewise Hoplite", artist: "Willian Murai" },
    "https://www.mtgpics.com/pics/art/m21/216.jpg": { name: "Conclave Mentor", artist: "Raoul Vitale" },
    "https://www.mtgpics.com/pics/art/11m/146.jpg": { name: "Greater Mossdog", artist: "Chippy" },
    "https://www.mtgpics.com/pics/art/stx/115.jpg": { name: "Storm-Kiln Artist", artist: "Manuel Castañón" },
    "https://www.mtgpics.com/pics/art/nph/020_1.jpg": { name: "Puresteel Paladin", artist: "Jason Chan" },
    "https://www.mtgpics.com/pics/art/10m/068.jpg": { name: "Sakura-Tribe Elder", artist: "Carl Critchlow" },
    "https://www.mtgpics.com/pics/art/16c/014.jpg": { name: "Magus of the Will", artist: "Vincent Proce" },
    "https://www.mtgpics.com/pics/art/bbd/214.jpg": { name: "Veteran Explorer", artist: "Steven Belledin" },
    "https://www.mtgpics.com/pics/art/cmm/110.jpg": { name: "Personal Tutor", artist: "Julie Dillon" },
    "https://www.mtgpics.com/pics/art/mh1/075.jpg": { name: "Urza, Lord High Artificer", artist: "Grzegorz Rutkowski" },
    "https://www.mtgpics.com/pics/art/dci/146.jpg": { name: "Sterling Grove", artist: "Seb McKinnon" },
    "https://www.mtgpics.com/pics/art/thb/207.jpg": { name: "Allure of the Unknown", artist: "Seb McKinnon" },
    "https://www.mtgpics.com/pics/art/dci/136.jpg": { name: "Chalice of the Void", artist: "Seb McKinnon" },
    "https://www.mtgpics.com/pics/art/eld/288.jpg": { name: "Order of Midnight // Alter Fate", artist: "Seb McKinnon" },
    "https://www.mtgpics.com/pics/art/mh1/214.jpg": { name: "Soulherder", artist: "Seb McKinnon" },
    "https://www.mtgpics.com/pics/art/m20/003.jpg": { name: "Ancestral Blade", artist: "Scott Murphy" },
    "https://www.mtgpics.com/pics/art/15c/007.jpg": { name: "Righteous Confluence", artist: "Kieran Yanner" },
    "https://www.mtgpics.com/pics/art/c18/006.jpg": { name: "Aminatou's Augury", artist: "Seb McKinnon" },
    "https://www.mtgpics.com/pics/art/mh2/138.jpg": { name: "Ragavan, Nimble Pilferer", artist: "Simon Dominic" },
    "https://www.mtgpics.com/pics/art/zen/168.jpg": { name: "Lotus Cobra", artist: "Chippy" },
    "https://www.mtgpics.com/pics/art/uni/014_1.jpg": { name: "Midlife Upgrade", artist: "Hector Ortiz" },
    "https://www.mtgpics.com/pics/art/ulm/057.jpg": { name: "Frantic Search", artist: "Mitchell Malloy" }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("Checking all 23 new cards against mtgpics.com pages...");
    const mismatches = [];

    for (const url of urls) {
        const match = url.match(/\/art\/([a-z0-9]+)\/([a-z0-9_]+)\.jpg/);
        if (!match) continue;

        const setCode = match[1];
        const numRaw = match[2];
        const ref = `${setCode}${numRaw}`;
        const mtgpicsUrl = `https://www.mtgpics.com/card?ref=${ref}`;

        try {
            const res = await fetch(mtgpicsUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });

            if (res.ok) {
                const html = await res.text();
                // Extract Title
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                let title = titleMatch ? titleMatch[1].replace('- mtgpics.com', '').trim() : null;
                
                // Extract Artist
                const artistMatch = html.match(/Illus\.\s*<a href=[^>]+>([^<]+)<\/a>/i);
                const artist = artistMatch ? artistMatch[1].trim() : "Unknown";

                const resolved = resolvedMap[url];
                if (title && (title.toLowerCase() !== resolved.name.toLowerCase())) {
                    mismatches.push({
                        url,
                        ref,
                        mtgpicsName: title,
                        mtgpicsArtist: artist,
                        resolvedName: resolved.name,
                        resolvedArtist: resolved.artist,
                        reason: "Name mismatch"
                    });
                } else {
                    console.log(`[OK] "${title}" matches resolved name.`);
                }
            } else {
                console.log(`[Error] Failed to fetch mtgpics page for ${ref} (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`[Error] Network error for ${ref}: ${e.message}`);
        }
        await delay(500);
    }

    console.log("\n=== Mismatch Results ===");
    if (mismatches.length === 0) {
        console.log("No mismatches found!");
    } else {
        console.log(`Found ${mismatches.length} mismatch(es):`);
        mismatches.forEach(m => {
            console.log(`\nURL: ${m.url} (ref: ${m.ref})`);
            console.log(`  - Mtgpics lists: "${m.mtgpicsName}" by "${m.mtgpicsArtist}"`);
            console.log(`  - Resolved to:   "${m.resolvedName}" by "${m.resolvedArtist}"`);
        });
    }
}

main();
