
const prices = {
    "Fury Sliver": { "price": 0.4 },
    "Island": { "price": 0.05 },
    "Wear // Tear": { "price": 0.25 }
};

const priceMap = new Map();
for (const name in prices) {
    priceMap.set(name.toLowerCase(), prices[name]);
}

function getPrice(name) {
    if (!name) return null;
    const lowerName = name.toLowerCase();
    
    const basics = ['island', 'forest', 'mountain', 'swamp', 'plains'];
    if (basics.includes(lowerName)) return 0;

    if (priceMap.has(lowerName)) return priceMap.get(lowerName).price;

    const splitName = name.split(' // ')[0].toLowerCase();
    if (priceMap.has(splitName)) return priceMap.get(splitName).price;

    return null;
}

console.log("Fury Sliver:", getPrice("Fury Sliver"));
console.log("Island:", getPrice("Island"));
console.log("Wear // Tear:", getPrice("Wear // Tear"));
console.log("Unknown:", getPrice("Non-existent Card"));
