async function listAll(name) {
    const url = `https://api.scryfall.com/cards/search?q=name%3A%22${encodeURIComponent(name)}%22&unique=prints`;
    try {
        const res = await fetch(url);
        if (res.ok) {
            const data = await res.json();
            console.log(`\nAll prints for "${name}":`);
            data.data.forEach(c => {
                console.log(`  - Set: ${c.set_name} (${c.set.toUpperCase()}) | CN: ${c.collector_number} | Artist: ${c.artist}`);
            });
        } else {
            console.log(`Failed to list prints for "${name}"`);
        }
    } catch (e) {
        console.log(`Error: ${e.message}`);
    }
}

async function main() {
    await listAll("Sterling Grove");
    await listAll("Chalice of the Void");
}

main();
