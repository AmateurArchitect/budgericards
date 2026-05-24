import fs from 'fs';
import path from 'path';

const mdPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/local-resources/mtg-art-background.md';
const outputPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/backgrounds.js';

try {
    const content = fs.readFileSync(mdPath, 'utf8');
    const urls = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('http'));

    const items = urls.map(url => {
        // Parse filename from URL
        const parts = url.split('/');
        const filename = parts[parts.length - 1];
        const basename = filename.substring(0, filename.lastIndexOf('.'));
        
        // Clean name
        let cleanName = basename.replace(/-/g, ' ');
        
        // Remove common keywords
        cleanName = cleanName.replace(/\b(MtG|Art|Variant|Expeditions|Inventions)\b/gi, '').trim();

        // Extract set and title
        // Most filenames look like "Card-Name-SetName-MtG-Art" or "CardName-SetName-Art"
        // Let's do some manual cleanups or heuristics
        let title = cleanName;
        let set = 'Magic: The Gathering';

        // Known sets in our list
        const knownSets = [
            'Kaldheim', 'Planar Chaos', 'Theros Beyond Death', 'Commander Legends', 
            'Jumpstart', 'Conflux', 'Rise of the Eldrazi', 'Double Masters 2022', 
            'Modern Horizons 2', 'Khans of Tarkir', 'Battle for Zendikar', 'Eldritch Moon', 
            'Guilds of Ravnica', 'Ravnica Allegiance', 'Iconic Masters', 'Ixalan', 
            'Kaladesh Inventions', 'Shards of Alara', 'Commander 2016'
        ];

        for (const ks of knownSets) {
            if (cleanName.toLowerCase().includes(ks.toLowerCase())) {
                set = ks;
                // Remove set name from title
                const regex = new RegExp('\\b' + ks.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'gi');
                title = cleanName.replace(regex, '').trim();
                break;
            }
        }

        // Clean up remaining double spaces or trailing dashes in title
        title = title.replace(/\s+/g, ' ').trim();
        // Capitalize words
        title = title.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        
        // Manual override overrides
        if (title.endsWith(' Token')) {
            // keep it
        } else if (title === 'Angel Warrior') {
            title = 'Angel Warrior Token';
        } else if (title === 'Plains 1') {
            title = 'Plains';
        } else if (title === 'Mountain 2') {
            title = 'Mountain';
        } else if (title === 'Glacial Floodplain 2') {
            title = 'Glacial Floodplain';
        }

        // Fix specific titles
        if (title.toLowerCase() === 'knight of autumn') {
            set = 'Guilds of Ravnica';
        } else if (title.toLowerCase() === 'icy manalith token') {
            set = 'Kaldheim';
        }

        return {
            url,
            title: title || cleanName,
            set
        };
    });

    const outputContent = `// Automatically generated from mtg-art-background.md
export const BACKGROUNDS = ${JSON.stringify(items, null, 4)};
`;

    // Ensure directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, outputContent, 'utf8');
    console.log(`Successfully generated backgrounds.js with ${items.length} backgrounds.`);
} catch (e) {
    console.error('Error generating backgrounds:', e);
}
