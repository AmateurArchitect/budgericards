async function test() {
    const setsFor505 = [
        "znr", "pznr", "mznr", "tznr", "sznr", "vznr", "znc", "tznc", "khm", "pkhm", "iko", "piko"
    ];
    const setsFor278 = [
        "fnm", "pfnm", "f01", "f02", "f03", "f04", "f05", "f06", "f07", "f08", "f09", "f10", "f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18", "f19", "f20", "pres"
    ];

    console.log("Testing sets for 505:");
    for (const s of setsFor505) {
        const res = await fetch(`https://api.scryfall.com/cards/${s}/505`);
        if (res.ok) {
            const data = await res.json();
            console.log(`  SUCCESS: set ${s}/505 -> "${data.name}" by ${data.artist}`);
        }
    }

    console.log("Testing sets for 278:");
    for (const s of setsFor278) {
        const res = await fetch(`https://api.scryfall.com/cards/${s}/278`);
        if (res.ok) {
            const data = await res.json();
            console.log(`  SUCCESS: set ${s}/278 -> "${data.name}" by ${data.artist}`);
        }
    }
}

test();
