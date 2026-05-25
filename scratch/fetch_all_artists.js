import fs from 'fs';
import path from 'path';

const mdPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/mtg-art-background.md';
const outputPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/backgrounds.js';

const CARD_NAMES = {
    "Angel-Warrior-Token-Kaldheim-MtG-Art.jpg": "Angel Warrior Token",
    "Plains-Variant-Kaldheim-MtG-Art.jpg": "Plains",
    "Swamp-Variant-Kaldheim-MtG-Art.jpg": "Swamp",
    "Cat-Token-Kaldheim-MtG-Art.jpg": "Cat Token",
    "Icy-Manalith-Token.jpg": "Icy Manalith",
    "Highland-Forest-Kaldheim-MtG-Art.jpg": "Highland Forest",
    "Sulfurous-Mire-Kaldheim-MtG-Art.jpg": "Sulfurous Mire",
    "Alpine-Meadow-Kaldheim-MtG-Art.jpg": "Alpine Meadow",
    "Glacial-Floodplain-2-Kaldheim-MtG-Art.jpg": "Glacial Floodplain",
    "Bretagard-Stronghold-Kaldheim-MtG-Art.jpg": "Bretagard Stronghold",
    "Hengegate-Pathway-Variant-Kaldheim-MtG-Art.jpg": "Hengegate Pathway",
    "Harmonize-Planar-Chaos-MtG-Art.jpg": "Harmonize",
    "Anger-of-the-Gods-Art.jpg": "Anger of the Gods",
    "Treeshaker-Chimera-Theros-Beyond-Death-Art.jpg": "Treeshaker Chimera",
    "The-Birth-of-Meletis-Theros-Beyond-Death-Art.jpg": "The Birth of Meletis",
    "Fyndhorn-Elves-MtG-Art.jpg": "Fyndhorn Elves",
    "Cuombajj-Witches-Commander-Legends-MtG-Art.jpg": "Cuombajj Witches",
    "War-Room-Commander-Legends-MtG-Art.jpg": "War Room",
    "Mountain-2-Jumpstart-MtG-Art.jpg": "Mountain",
    "Path-to-Exile-Conflux-MtG-Art.jpg": "Path to Exile",
    "Awakening-Zone-Rise-of-the-Eldrazi-MtG-Art.jpg": "Awakening Zone",
    "Thought-Scour-Double-Masters-2022-MtG-Art.jpg": "Thought Scour",
    "Rustvale-Bridge-Modern-Horizons-2-MtG-Art.jpg": "Rustvale Bridge",
    "Armament-Corps-Khans-of-Tarkir-MtG-Art.jpg": "Armament Corps",
    "Flooded-Strand-MtG-Art.jpg": "Flooded Strand",
    "Canopy-Vista-Expeditions-Battle-for-Zendikar-MtG-Art.jpg": "Canopy Vista",
    "Strip-Mine-Expeditions-Battle-for-Zendikar-MtG-Art.jpg": "Strip Mine",
    "Providence-Eldritch-Moon-MtG-Art.jpg": "Providence",
    "Precision-Bolt-MtG-Art.jpg": "Precision Bolt",
    "Trostani-Discordant-MtG-Art.jpg": "Trostani Discordant",
    "Knight-of-Autumn.jpg": "Knight of Autumn",
    "Boros-Guildgate-Guilds-of-Ravnica-MtG-Art.jpg": "Boros Guildgate",
    "Plains-1-Guilds-of-Ravnica-MtG-Art.png": "Plains",
    "Forest-Guilds-of-Ravnica-MtG-Art.png": "Forest",
    "Shock-MtG-Art.jpg": "Shock",
    "Whisper-Blood-Liturgist-Ravnica-Allegiance-Art.jpg": "Whisper, Blood Liturgist",
    "Horizon-Canopy-Iconic-Masters-MtG-Art.jpg": "Horizon Canopy",
    "Unknown-Shores-Ixalan-MtG-Art.jpg": "Unknown Shores",
    "Gruul-Guildgate-MtG-Art.jpg": "Gruul Guildgate",
    "Tome-of-the-Guildpact-Ravnica-Allegiance-Art.jpg": "Tome of the Guildpact",
    "Sidar-Kondo-of-Jamuraa-MtG-Art.jpg": "Sidar Kondo of Jamuraa",
    "Grindstone-Kaladesh-Inventions-MtG-Art.jpg": "Grindstone",
    "Cancel-MtG-Art.jpg": "Cancel"
};

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
            
            // Look up exact card name from dictionary
            const cardName = CARD_NAMES[filename];
            if (!cardName) {
                console.warn(`    Warning: No card name mapping found for filename: ${filename}`);
                continue;
            }

            console.log(`[${i+1}/${urls.length}] Querying Scryfall for: "${cardName}"...`);
            
            let artist = 'Unknown Artist';
            let setName = 'Magic: The Gathering';

            try {
                const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(cardName)}`);
                if (res.ok) {
                    const data = await res.json();
                    artist = data.artist || 'Unknown Artist';
                    setName = data.set_name || 'Magic: The Gathering';
                } else {
                    // Try fuzzy search if exact name fails
                    const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(cardName)}`);
                    if (fuzzyRes.ok) {
                        const data = await fuzzyRes.json();
                        artist = data.artist || 'Unknown Artist';
                        setName = data.set_name || 'Magic: The Gathering';
                    } else {
                        console.warn(`    Warning: Scryfall API exact/fuzzy returned status ${res.status}`);
                    }
                }
            } catch (err) {
                console.error(`    Error fetching card metadata:`, err.message);
            }

            items.push({
                url,
                title: cardName,
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
