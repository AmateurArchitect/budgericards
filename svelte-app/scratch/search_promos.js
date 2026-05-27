async function search(name) {
    const url = `https://api.scryfall.com/cards/search?q=name%3A%22${encodeURIComponent(name)}%22+is%3Apromo`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log(`\nPromos for "${name}":`);
            data.data.forEach(c => {
                console.log(`  - Set: ${c.set_name} (${c.set.toUpperCase()}) | CN: ${c.collector_number} | Artist: ${c.artist}`);
            });
        } else {
            console.log(`Failed to search for "${name}"`);
        }
    } catch (e) {
        console.log(`Error searching: ${e.message}`);
    }
}

async function main() {
    await search("Sterling Grove");
    await search("Chalice of the Void");
}

main();
