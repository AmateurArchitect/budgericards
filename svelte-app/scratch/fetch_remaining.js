async function test() {
    const refs = ["fre007", "con098"];
    for (const ref of refs) {
        const url = `https://www.mtgpics.com/card?ref=${ref}`;
        console.log(`\nFetching: ${url}`);
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (res.ok) {
                const html = await res.text();
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                const title = titleMatch ? titleMatch[1].replace('- mtgpics.com', '').trim() : null;
                console.log(`  Title: ${title}`);
                if (title) {
                    // query scryfall
                    const sRes = await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(title)}`);
                    if (sRes.ok) {
                        const data = await sRes.json();
                        console.log(`    Scryfall Match: "${data.name}" by ${data.artist} (Set: ${data.set_name}, CN: ${data.collector_number})`);
                    } else {
                        // try fuzzy search
                        const fuzzyRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(title)}`);
                        if (fuzzyRes.ok) {
                            const data = await fuzzyRes.json();
                            console.log(`    Scryfall Fuzzy Match: "${data.name}" by ${data.artist} (Set: ${data.set_name}, CN: ${data.collector_number})`);
                        } else {
                            console.log(`    No Scryfall match for: ${title}`);
                        }
                    }
                }
            } else {
                console.log(`  Failed (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 500)); // space out requests
    }
}

test();
