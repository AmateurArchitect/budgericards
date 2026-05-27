

const MANUAL_OVERRIDES = {
    "https://www.mtgpics.com/pics/art/fre/005.jpg": {
        name: "Dryad Arbor",
        artist: "Eric Fortune",
        set: "Duskmourn: House of Horror Commander",
        setCode: "DSC",
        collectorNumber: "273"
    },
    "https://www.mtgpics.com/pics/art/fre/007.jpg": {
        name: "Glacial Chasm",
        artist: "Liz Danforth",
        set: "Masters Edition II",
        setCode: "ME2",
        collectorNumber: "229"
    },
    "https://www.mtgpics.com/pics/art/fic/391.jpg": {
        name: "Fetid Heath",
        artist: "Daarken",
        set: "Secrets of Strixhaven Commander",
        setCode: "C21",
        collectorNumber: "372"
    },
    "https://www.mtgpics.com/pics/art/zex/043.jpg": {
        name: "Strip Mine",
        artist: "Howard Lyon",
        set: "Zendikar Expeditions",
        setCode: "EXP",
        collectorNumber: "43"
    },
    "https://www.mtgpics.com/pics/art/znr/505.jpg": {
        name: "Needleverge Pathway // Pillarverge Pathway",
        artist: "Piotr Dura",
        set: "Zendikar Rising",
        setCode: "ZNR",
        collectorNumber: "263"
    },
    "https://www.mtgpics.com/pics/art/fin/278.jpg": {
        name: "Gohn, Town of Ruin",
        artist: "Salvatorre Zee Yazzie",
        set: "Final Fantasy",
        setCode: "FIN",
        collectorNumber: "278"
    },
    "https://www.mtgpics.com/pics/art/con/098.jpg": {
        name: "Apocalypse Hydra",
        artist: "Jason Chan",
        set: "Battlebond",
        setCode: "BBD",
        collectorNumber: "217"
    },
    "https://www.mtgpics.com/pics/art/dci/146.jpg": {
        name: "Sterling Grove",
        artist: "Seb McKinnon",
        set: "Judge Gift Cards 2020",
        setCode: "J20",
        collectorNumber: "9"
    },
    "https://www.mtgpics.com/pics/art/dci/136.jpg": {
        name: "Chalice of the Void",
        artist: "Seb McKinnon",
        set: "Judge Gift Cards 2019",
        setCode: "J19",
        collectorNumber: "7"
    },
    "https://www.mtgpics.com/pics/art/isd/205.jpg": {
        name: "Travel Preparations",
        artist: "Vincent Proce",
        set: "Innistrad",
        setCode: "ISD",
        collectorNumber: "206"
    },
    "https://www.mtgpics.com/pics/art/ths/189.jpg": {
        name: "Ashen Rider",
        artist: "Chris Rahn",
        set: "Theros",
        setCode: "THS",
        collectorNumber: "187"
    },
    "https://www.mtgpics.com/pics/art/11m/146.jpg": {
        name: "Inferno Titan",
        artist: "Kev Walker",
        set: "Modern Masters",
        setCode: "MMA",
        collectorNumber: "109"
    },
    "https://www.mtgpics.com/pics/art/10m/068.jpg": {
        name: "Ponder",
        artist: "Dan Scott",
        set: "Archenemy",
        setCode: "ARC",
        collectorNumber: "28"
    }
};

async function check() {
    console.log("Checking MANUAL_OVERRIDES against Scryfall API...");
    for (const [url, data] of Object.entries(MANUAL_OVERRIDES)) {
        const setCode = data.setCode.toLowerCase();
        const colNum = data.collectorNumber;
        const sUrl = `https://api.scryfall.com/cards/${setCode}/${colNum}`;
        
        try {
            const res = await fetch(sUrl);
            if (res.ok) {
                const sData = await res.json();
                const nameMatch = sData.name.toLowerCase() === data.name.toLowerCase();
                const artistMatch = sData.artist.toLowerCase().includes(data.artist.toLowerCase());
                
                console.log(`\nURL: ${url}`);
                console.log(`  Scryfall:   Name: "${sData.name}" | Artist: "${sData.artist}" | Set: "${sData.set_name}"`);
                console.log(`  Override:   Name: "${data.name}" | Artist: "${data.artist}"`);
                if (nameMatch && artistMatch) {
                    console.log("  [SUCCESS] Match found!");
                } else {
                    console.log(`  [MISMATCH] nameMatch: ${nameMatch}, artistMatch: ${artistMatch}`);
                }
            } else {
                console.log(`\nURL: ${url}`);
                console.log(`  [FAILED] Scryfall API returned status ${res.status} for ${setCode}/${colNum}`);
            }
        } catch (e) {
            console.log(`\nURL: ${url}`);
            console.log(`  [ERROR] Fetch error: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 100));
    }
}

check();
