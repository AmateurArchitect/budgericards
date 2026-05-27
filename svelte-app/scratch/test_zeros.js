async function test() {
    const testCases = [
        { set: "c17", num: "056" },
        { set: "con", num: "098" },
        { set: "dom", num: "032" },
        { set: "neo", num: "012" }
    ];

    for (const { set, num } of testCases) {
        console.log(`\nQuerying ${set} / ${num}:`);
        const cleanNum = parseInt(num, 10).toString();
        
        // Try original
        const res1 = await fetch(`https://api.scryfall.com/cards/${set}/${num}`);
        console.log(`  With leading zeros (${num}): ${res1.status}`);
        
        // Try parsed integer
        const res2 = await fetch(`https://api.scryfall.com/cards/${set}/${cleanNum}`);
        console.log(`  As integer (${cleanNum}): ${res2.status}`);
        if (res2.ok) {
            const data = await res2.json();
            console.log(`    Success: ${data.name} by ${data.artist}`);
        }
    }
}

test();
