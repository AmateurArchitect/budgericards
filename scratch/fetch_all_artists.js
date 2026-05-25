import fs from 'fs';
import path from 'path';

const mdPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/mtg-art-background.md';
const outputPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/backgrounds.js';

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function run() {
    try {
        const content = fs.readFileSync(mdPath, 'utf8');
        const urls = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.startsWith('http'));

        console.log(`Found ${urls.length} URLs. Commencing Scryfall artist fetching...`);
        const items = [];

        for (let i = 0; i < urls.length; i++) {
            const url = urls[i];
            const parts = url.split('/');
            const filename = parts[parts.length - 1];
            const basename = filename.substring(0, filename.lastIndexOf('.'));
            
            let cleanName = basename.replace(/-/g, ' ');
            cleanName = cleanName.replace(/\b(MtG|Art|Variant|Expeditions|Inventions)\b/gi, '').trim();

            let title = cleanName;
            
            // Refine specific cards for better fuzzy matching
            const queryTitle = cleanName
                .replace(/ (Token|Variant)$/i, '')
                .replace(/ 2$/, '')
                .replace(/ 1$/, '')
                .trim();

            console.log(`[${i+1}/${urls.length}] Querying Scryfall for: "${queryTitle}"...`);
            
            let artist = 'Unknown Artist';
            let setName = 'Magic: The Gathering';

            try {
                const res = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(queryTitle)}`);
                if (res.ok) {
                    const data = await res.json();
                    artist = data.artist || 'Unknown Artist';
                    setName = data.set_name || 'Magic: The Gathering';
                } else {
                    console.warn(`    Warning: Scryfall API returned status ${res.status}`);
                }
            } catch (err) {
                console.error(`    Error fetching card metadata:`, err.message);
            }

            // Capitalize title
            const capitalizedTitle = queryTitle.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

            items.push({
                url,
                title: capitalizedTitle,
                set: setName,
                artist: artist
            });

            // Respect Scryfall guidelines (100ms between requests)
            await sleep(100);
        }

        const outputContent = `// Automatically generated with pre-fetched artist metadata
export const BACKGROUNDS = ${JSON.stringify(items, null, 4)};
`;

        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, outputContent, 'utf8');
        console.log(`Successfully generated backgrounds.js with ${items.length} card assets and artists.`);
    } catch (e) {
        console.error('Failure running artist fetch:', e);
    }
}

run();
