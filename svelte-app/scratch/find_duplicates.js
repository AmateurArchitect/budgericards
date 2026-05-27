import { RESOLVED_ART } from '../src/lib/constants/resolved-art.js';

console.log(`Total resolved artworks: ${RESOLVED_ART.length}`);

// Group by name + collectorNumber
// Note: collectorNumber and setCode should uniquely identify a card print, but let's check
// what the user meant: "Note the card and collector number and artist must all match!
// If the card and collector number match, but not the artist, something is likely wrong"
// So the key is (name, collectorNumber) or maybe (setCode, collectorNumber)?
// MTG cards can have the same collector number in different sets (e.g. #1 in set A and #1 in set B).
// So "card and collector number" must refer to either (name, collectorNumber) or (setCode, collectorNumber).
// Let's analyze both to be safe and precise.

const groupsByNameAndCN = {};
const groupsBySetAndCN = {};

for (const card of RESOLVED_ART) {
    const keyName = `${card.name.toLowerCase()} || ${card.collectorNumber.toLowerCase()}`;
    const keySet = `${card.setCode.toLowerCase()} || ${card.collectorNumber.toLowerCase()}`;

    if (!groupsByNameAndCN[keyName]) groupsByNameAndCN[keyName] = [];
    groupsByNameAndCN[keyName].push(card);

    if (!groupsBySetAndCN[keySet]) groupsBySetAndCN[keySet] = [];
    groupsBySetAndCN[keySet].push(card);
}

console.log('\n=== Analysis by Name & Collector Number ===');
const duplicatesName = [];
const anomaliesName = [];

for (const [key, cards] of Object.entries(groupsByNameAndCN)) {
    if (cards.length > 1) {
        // Check if all artists match
        const firstArtist = cards[0].artist;
        const allArtistsMatch = cards.every(c => c.artist === firstArtist);
        if (allArtistsMatch) {
            duplicatesName.push({ key, cards });
        } else {
            anomaliesName.push({ key, cards });
        }
    }
}

console.log(`Duplicates found (all match): ${duplicatesName.length}`);
duplicatesName.forEach(({ key, cards }) => {
    console.log(`- Duplicate Key: "${key}"`);
    cards.forEach(c => console.log(`  * Artist: "${c.artist}", Set: "${c.setCode}", URL: ${c.url}`));
});

console.log(`\nAnomalies found (different artist): ${anomaliesName.length}`);
anomaliesName.forEach(({ key, cards }) => {
    console.log(`- Anomaly Key: "${key}"`);
    cards.forEach(c => console.log(`  * Artist: "${c.artist}", Set: "${c.setCode}", URL: ${c.url}`));
});

console.log('\n=== Analysis by Set & Collector Number ===');
const duplicatesSet = [];
const anomaliesSet = [];

for (const [key, cards] of Object.entries(groupsBySetAndCN)) {
    if (cards.length > 1) {
        // Check if all artists match
        const firstArtist = cards[0].artist;
        const allArtistsMatch = cards.every(c => c.artist === firstArtist);
        if (allArtistsMatch) {
            duplicatesSet.push({ key, cards });
        } else {
            anomaliesSet.push({ key, cards });
        }
    }
}

console.log(`Duplicates found (all match): ${duplicatesSet.length}`);
duplicatesSet.forEach(({ key, cards }) => {
    console.log(`- Duplicate Key: "${key}"`);
    cards.forEach(c => console.log(`  * Artist: "${c.artist}", Name: "${c.name}", URL: ${c.url}`));
});

console.log(`\nAnomalies found (different artist): ${anomaliesSet.length}`);
anomaliesSet.forEach(({ key, cards }) => {
    console.log(`- Anomaly Key: "${key}"`);
    cards.forEach(c => console.log(`  * Artist: "${c.artist}", Name: "${c.name}", URL: ${c.url}`));
});
