async function test() {
    // 1. Search for ZNR related lands or cards that could be #505
    // Let's search by query
    console.log("Searching for cards in ZNR/ZNC/ZNE/PZNR that are lands:");
    try {
        const res = await fetch("https://api.scryfall.com/cards/search?q=(set:znr+or+set:znc+or+set:zne+or+set:pznr)+t:land&unique=art");
        if (res.ok) {
            const data = await res.json();
            console.log(`Found ${data.total_cards} lands. Examples:`);
            for (const c of data.data) {
                // Let's print name, artist, set, and collector number
                console.log(`  - [${c.set.toUpperCase()}] #${c.collector_number}: ${c.name} by ${c.artist}`);
            }
        }
    } catch(e) {
        console.error(e);
    }

    // 2. What about set FIN? Let's check if there's a card from Friday Night Magic Promos (pfnm) or similar with artist and name.
    // Let's search Scryfall for all cards in FNM promos (pfnm) that are lands
    console.log("\nSearching for lands in Friday Night Magic Promos:");
    try {
        const res = await fetch("https://api.scryfall.com/cards/search?q=set:pfnm+t:land");
        if (res.ok) {
            const data = await res.json();
            console.log(`Found ${data.total_cards} lands in pfnm:`);
            for (const c of data.data) {
                console.log(`  - #${c.collector_number}: ${c.name} by ${c.artist}`);
            }
        }
    } catch(e) {
        console.error(e);
    }

    // 3. Let's search for set FIN. Is there a set in Scryfall with code "fin"? Let's search by set code.
    console.log("\nSearching Scryfall sets for 'fin':");
    try {
        const res = await fetch("https://api.scryfall.com/sets");
        if (res.ok) {
            const data = await res.json();
            const matching = data.data.filter(s => s.code.includes('fin') || s.name.toLowerCase().includes('fin'));
            matching.forEach(s => console.log(`  - Set: ${s.name} (${s.code})`));
        }
    } catch(e) {
        console.error(e);
    }
}

test();
