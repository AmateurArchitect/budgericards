import { RESOLVED_ART } from '../src/lib/constants/resolved-art.js';

const urlCounts = {};
for (const card of RESOLVED_ART) {
    urlCounts[card.url] = (urlCounts[card.url] || 0) + 1;
}

console.log('--- Duplicate URLs ---');
let dupUrlCount = 0;
for (const [url, count] of Object.entries(urlCounts)) {
    if (count > 1) {
        dupUrlCount++;
        const matches = RESOLVED_ART.filter(c => c.url === url);
        console.log(`URL: ${url} (Appears ${count} times)`);
        matches.forEach(c => {
            console.log(`  - Name: "${c.name}", Category: "${c.category}", SetCode: "${c.setCode}"`);
        });
    }
}
console.log(`Total duplicate URLs: ${dupUrlCount}`);
