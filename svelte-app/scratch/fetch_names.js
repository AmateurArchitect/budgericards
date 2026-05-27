async function test() {
    const titles = [
        "Needleverge Pathway // Pillarverge Pathway",
        "Gohn, Town of Ruin",
        "Fetid Heath",
        "Dryad Arbor"
    ];

    for (const title of titles) {
        console.log(`\nQuerying Scryfall for: ${title}`);
        try {
            const res = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(title)}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`  SUCCESS: "${data.name}" by ${data.artist} (Set: ${data.set_name}, Collector Number: ${data.collector_number})`);
            } else {
                console.log(`  Failed (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 100)); // space out requests
    }
}

test();
