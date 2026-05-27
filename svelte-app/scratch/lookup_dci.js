const refs = ["dci146", "dci136"];

async function main() {
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
                console.log(`  Title from mtgpics: "${title}"`);
                if (title) {
                    // search scryfall
                    const sRes = await fetch(`https://api.scryfall.com/cards/named?fuzzy=${encodeURIComponent(title)}`);
                    if (sRes.ok) {
                        const data = await sRes.json();
                        console.log(`  Scryfall Match: "${data.name}" | Set: ${data.set.toUpperCase()} | CN: ${data.collector_number} | Artist: ${data.artist} | Type: ${data.type_line}`);
                    } else {
                        console.log(`  No Scryfall match for: "${title}"`);
                    }
                }
            } else {
                console.log(`  Failed mtgpics fetch (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`  Error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 1000));
    }
}

main();
