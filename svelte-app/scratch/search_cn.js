async function test() {
    const numbers = ["505", "278"];
    for (const num of numbers) {
        console.log(`\nSearching Scryfall for collector number: ${num}`);
        try {
            const res = await fetch(`https://api.scryfall.com/cards/search?q=cn:${num}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`Found ${data.total_cards} cards:`);
                for (const card of data.data.slice(0, 10)) {
                    console.log(`- [${card.set.toUpperCase()}] ${card.name} by ${card.artist} (${card.set_name})`);
                }
            } else {
                console.log(`Failed to search (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

test();
