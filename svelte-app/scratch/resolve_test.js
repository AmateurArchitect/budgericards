async function test() {
    const urls = [
        "https://www.mtgpics.com/pics/art/con/142.jpg",
        "https://www.mtgpics.com/pics/art/kld/247_1.jpg",
        "https://www.mtgpics.com/pics/art/con/121_5.jpg"
    ];

    for (const url of urls) {
        // Parse set and number
        const match = url.match(/\/art\/([a-z0-9]+)\/([a-z0-9_]+)\.jpg/);
        if (!match) {
            console.log("Could not parse:", url);
            continue;
        }
        const set = match[1];
        let num = match[2];
        console.log(`\nURL: ${url} -> parsed set: ${set}, num: ${num}`);

        // Try querying Scryfall with original number
        try {
            const res = await fetch(`https://api.scryfall.com/cards/${set}/${num}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`  Success with original num: ${data.name} by ${data.artist}`);
                continue;
            } else {
                console.log(`  Failed with original num (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }

        // If it has an underscore, try trimming the suffix (e.g. 247_1 -> 247)
        if (num.includes('_')) {
            const cleanNum = num.split('_')[0];
            console.log(`  Trying trimmed num: ${cleanNum}`);
            try {
                const res = await fetch(`https://api.scryfall.com/cards/${set}/${cleanNum}`);
                if (res.ok) {
                    const data = await res.json();
                    console.log(`  Success with trimmed num: ${data.name} by ${data.artist}`);
                } else {
                    console.log(`  Failed with trimmed num (status: ${res.status})`);
                }
            } catch (e) {
                console.log(`  Error on trimmed: ${e.message}`);
            }
        }
    }
}

test();
