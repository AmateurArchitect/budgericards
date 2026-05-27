import fs from 'fs';

const urls = [
    "https://www.mtgpics.com/pics/art/isd/205.jpg",
    "https://www.mtgpics.com/pics/art/ths/189.jpg",
    "https://www.mtgpics.com/pics/art/m21/216.jpg",
    "https://www.mtgpics.com/pics/art/11m/146.jpg",
    "https://www.mtgpics.com/pics/art/stx/115.jpg",
    "https://www.mtgpics.com/pics/art/nph/020_1.jpg",
    "https://www.mtgpics.com/pics/art/10m/068.jpg",
    "https://www.mtgpics.com/pics/art/16c/014.jpg",
    "https://www.mtgpics.com/pics/art/bbd/214.jpg",
    "https://www.mtgpics.com/pics/art/cmm/110.jpg",
    "https://www.mtgpics.com/pics/art/mh1/075.jpg",
    "https://www.mtgpics.com/pics/art/dci/146.jpg",
    "https://www.mtgpics.com/pics/art/thb/207.jpg",
    "https://www.mtgpics.com/pics/art/dci/136.jpg",
    "https://www.mtgpics.com/pics/art/eld/288.jpg",
    "https://www.mtgpics.com/pics/art/mh1/214.jpg",
    "https://www.mtgpics.com/pics/art/m20/003.jpg",
    "https://www.mtgpics.com/pics/art/15c/007.jpg",
    "https://www.mtgpics.com/pics/art/c18/006.jpg",
    "https://www.mtgpics.com/pics/art/mh2/138.jpg",
    "https://www.mtgpics.com/pics/art/zen/168.jpg",
    "https://www.mtgpics.com/pics/art/uni/014_1.jpg",
    "https://www.mtgpics.com/pics/art/ulm/057.jpg"
];

const SET_OVERRIDES = {
    '17c': 'c17', 'vir': 'vis', 'zex': 'exp', 'fin': 'fnm', 'tdm': 'dmr', 'fre': 'fem', 'fic': 'c21', 'svc': 'ddf',
    '11m': 'mma', // Modern Masters
    '10m': 'arc', // Archenemy (fallback or promo)
    '16c': 'c16', // Commander 2016
    '15c': 'c15', // Commander 2015
    'uni': 'ust', // Unstable (fallback or promo)
    'ulm': 'uma'  // Ultimate Masters
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
    console.log("Analyzing new URLs...");
    for (const url of urls) {
        const match = url.match(/\/art\/([a-z0-9]+)\/([a-z0-9_]+)\.jpg/);
        if (!match) {
            console.log(`Failed to parse URL: ${url}`);
            continue;
        }

        let setCode = match[1].toLowerCase();
        let numRaw = match[2].toLowerCase();
        if (SET_OVERRIDES[setCode]) {
            setCode = SET_OVERRIDES[setCode];
        }

        // Clean number
        let cleanNum = numRaw;
        if (/^\d+/.test(numRaw)) {
            const digits = numRaw.match(/^\d+/)[0];
            cleanNum = parseInt(digits, 10).toString();
        }

        const apiUrl = `https://api.scryfall.com/cards/${setCode}/${cleanNum}`;
        try {
            await delay(100);
            const res = await fetch(apiUrl);
            if (res.ok) {
                const data = await res.json();
                const type = (data.type_line || "").toLowerCase();
                let category = "Objects";
                if (type.includes("saga")) {
                    category = "Sagas";
                } else if (type.includes("land")) {
                    category = "Landscapes";
                } else if (type.includes("creature")) {
                    category = "Creatures";
                }
                console.log(`URL: "${url}" -> "${data.name}" | Type: "${data.type_line}" | Category: ${category}`);
            } else {
                console.log(`URL: "${url}" -> Failed Scryfall fetch (status: ${res.status}, set: ${setCode}, num: ${cleanNum})`);
            }
        } catch (e) {
            console.log(`URL: "${url}" -> Error: ${e.message}`);
        }
    }
}

main();
