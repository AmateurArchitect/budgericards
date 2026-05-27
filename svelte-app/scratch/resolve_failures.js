async function test() {
    const failures = [
        { orig_set: "fre", set: "fem", num: "005" },
        { orig_set: "fre", set: "fem", num: "007" },
        { orig_set: "fic", set: "c15", num: "391" },
        { orig_set: "zex", set: "exp", num: "043" },
        { orig_set: "znr", set: "znr", num: "505" },
        { orig_set: "svc", set: "ddf", num: "073" },
        { orig_set: "slu", set: "slu", num: "001" },
        { orig_set: "zne", set: "zne", num: "026" },
        { orig_set: "fin", set: "fnm", num: "278" },
        { orig_set: "jmp", set: "jmp", num: "035" },
        { orig_set: "thb", set: "thb", num: "013" },
        { orig_set: "acr", set: "acr", num: "013" }
    ];

    for (const item of failures) {
        let set = item.set;
        let num = parseInt(item.num, 10).toString();
        
        // Let's also test alternatives for sets
        let setsToTry = [set];
        if (item.orig_set === "fre") {
            setsToTry.push("fem", "all", "me2");
        } else if (item.orig_set === "fic") {
            // Commander Anthology? Commander 2016? Commander 2013?
            setsToTry.push("c16", "c17", "c18", "c19", "c20", "c21", "cmr", "cma", "cmd");
        } else if (item.orig_set === "svc") {
            // Duel decks? Elspeth vs Tezzeret is ddf. What about Elspeth vs Kiora? ddq?
            // Let's try dd3, ddc, ddd, dde, ddf, ddg, ddh, ddi, ddj, ddk, ddl, ddm, ddn, ddo, ddp, ddq, ddr, dds, ddt, ddu
            setsToTry.push("ddq", "ddr", "dds", "ddt", "ddu", "dd3");
        } else if (item.orig_set === "fin") {
            // FNM promos are usually numbered like f01, f02, etc. where 01, 02 is the year.
            // Let's check fnm, f01, f02, f03...
            setsToTry.push("fnm", "f11", "f12", "f13", "f14", "f15", "f16", "f17", "f18");
        } else if (item.orig_set === "znr") {
            // ZNR 505 might be art series? Art series is aznr.
            setsToTry.push("znr", "aznr");
        }

        let resolved = false;
        for (const s of setsToTry) {
            const res = await fetch(`https://api.scryfall.com/cards/${s}/${num}`);
            if (res.ok) {
                const data = await res.json();
                console.log(`SUCCESS: mtgpics set: ${item.orig_set}, num: ${item.num} -> Scryfall set: ${s}, num: ${num} -> "${data.name}" by ${data.artist}`);
                resolved = true;
                break;
            }
        }
        if (!resolved) {
            console.log(`FAILED: mtgpics set: ${item.orig_set}, num: ${item.num} (tried sets: ${setsToTry.join(', ')})`);
        }
        await new Promise(r => setTimeout(r, 100)); // space out requests
    }
}

test();
