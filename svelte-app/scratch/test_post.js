async function main() {
    // Try standard Vite dev server ports (default is 5173, but can be 5174, etc.)
    const ports = [5173, 5174, 5175, 3000];
    let success = false;

    for (const port of ports) {
        const url = `http://localhost:${port}/api/save-selection`;
        console.log(`Trying ${url}...`);
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(["https://www.mtgpics.com/pics/art/khm/257.jpg"])
            });

            if (res.ok) {
                const data = await res.json();
                console.log(`Success on port ${port}:`, data);
                success = true;
                break;
            } else {
                console.log(`Failed on port ${port} (status: ${res.status})`);
            }
        } catch (e) {
            console.log(`Error on port ${port}: ${e.message}`);
        }
    }

    if (success) {
        // Read file to verify it was updated
        const fs = await import('fs');
        const content = fs.readFileSync('/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json', 'utf-8');
        console.log("JSON contents:", content.trim());
        
        // Restore empty array
        fs.writeFileSync('/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json', '[]', 'utf-8');
        console.log("Restored selected-art.json to empty array.");
    } else {
        console.log("Could not contact the local dev server. That's normal if it uses a different host or is offline.");
    }
}

main();
