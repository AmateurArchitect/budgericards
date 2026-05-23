const columnMap = {};
// ensureCmcColumns
columnMap["1"] = true;
columnMap["2"] = true;
columnMap["3"] = true;
// process cards
columnMap["4"] = true;
columnMap["5"] = true;
columnMap["Lands"] = true;
columnMap["0"] = true;

const numericKeys = Object.keys(columnMap).filter((k) => k.match(/^\d+$/) || k === "0-1").sort((a, b) => {
    if (a === "0-1") return -1;
    if (b === "0-1") return 1;
    return parseInt(a) - parseInt(b);
});

console.log("Object.keys:", Object.keys(columnMap));
console.log("numericKeys:", numericKeys);

const colOrder = [...numericKeys, "6+", "Unknown", "Lands"];
console.log("colOrder:", colOrder);
