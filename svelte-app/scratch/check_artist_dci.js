const refs = ["dci146", "dci136"];

async function main() {
    for (const ref of refs) {
        const url = `https://www.mtgpics.com/card?ref=${ref}`;
        try {
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (res.ok) {
                const html = await res.text();
                // Look for common artist names or find all occurrences of "by" or "Artist"
                console.log(`\nHTML snippet for ${ref}:`);
                const lines = html.split('\n');
                lines.forEach(line => {
                    if (line.includes('Artist') || line.includes('by ') || line.includes('Miracola') || line.includes('McKinnon') || line.includes('Zug')) {
                        console.log(`  ${line.trim()}`);
                    }
                });
            }
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

main();
