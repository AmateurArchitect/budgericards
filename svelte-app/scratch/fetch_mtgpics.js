async function test() {
    const refs = ["znr505", "fin278", "fic391", "fre005"];
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
                // Let's find title or some headers
                // E.g. <title>MTG Pics - ...</title> or card name in headers
                const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
                console.log(`  Title: ${titleMatch ? titleMatch[1].trim() : "Not found"}`);
                
                // Let's print some lines containing "Artist" or "Illustrator" or search for name
                const lines = html.split('\n');
                const artistLines = lines.filter(l => l.toLowerCase().includes('artist') || l.toLowerCase().includes('by'));
                console.log(`  Artist info lines:`, artistLines.slice(0, 3).map(l => l.trim()));
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
