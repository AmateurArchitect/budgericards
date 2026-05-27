const cardsToTest = [
    { name: "Knight of Autumn", set: "Forgotten Realms Commander" },
    { name: "Precision Bolt", set: "Guilds of Ravnica" },
    { name: "Providence", set: "Eldritch Moon" },
    { name: "Trostani Discordant", set: "Ravnica: Clue Edition" },
    { name: "Canopy Vista", set: "Tarkir: Dragonstorm Commander" },
    { name: "Plains", set: "The Hobbit" },
    { name: "Strip Mine", set: "Vintage Masters" },
    { name: "Swamp", set: "The Hobbit" },
    { name: "Angel Warrior Token", set: "Battle for Baldur's Gate Tokens" },
    { name: "Cat Token", set: "Kaldheim" }
];

async function test() {
    for (const card of cardsToTest) {
        console.log(`\nTesting: "${card.name}" (Set: "${card.set}")`);
        
        // Let's try named exact search
        const url = `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(card.name)}`;
        try {
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                console.log(`  Exact Match: "${data.name}" | Set: ${data.set.toUpperCase()} | CN: ${data.collector_number} | Artist: ${data.artist}`);
            } else {
                console.log(`  Exact Match failed with status: ${res.status}`);
                // Try search query for name and set if possible
                const searchUrl = `https://api.scryfall.com/cards/search?q=${encodeURIComponent(card.name)}`;
                const sRes = await fetch(searchUrl);
                if (sRes.ok) {
                    const sData = await sRes.json();
                    console.log(`  Found ${sData.total_cards} cards via search.`);
                    sData.data.slice(0, 3).forEach(c => {
                        console.log(`    - Set: ${c.set.toUpperCase()} | CN: ${c.collector_number} | Artist: ${c.artist}`);
                    });
                } else {
                    console.log(`  Search failed with status: ${sRes.status}`);
                }
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 100)); // rate limit
    }
}

test();
