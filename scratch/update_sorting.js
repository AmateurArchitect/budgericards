const fs = require('fs');
const path = require('path');

const helperLogic = `
function isBasicLand(name) {
	if (!name) return false;
	const n = name.toLowerCase();
	const basicNames = ["plains", "island", "swamp", "mountain", "forest", "wastes"];
	return basicNames.some(b => n.includes(b));
}

function getBasicLandWeight(name) {
	if (!name) return 99;
	const n = name.toLowerCase();
	if (n.includes("plains")) return 1;
	if (n.includes("island")) return 2;
	if (n.includes("swamp")) return 3;
	if (n.includes("mountain")) return 4;
	if (n.includes("forest")) return 5;
	if (n.includes("wastes")) return 6;
	return 99;
}
`;

// 1. Update grouping.svelte.js
const groupingPath = path.join(__dirname, '../svelte-app/src/lib/layouts/grouping.svelte.js');
let groupingContent = fs.readFileSync(groupingPath, 'utf8');

const groupingSortFnRegex = /function createSortFn\(sorting\) \{\n\treturn \(\/\*\* @type \{any\} \*\/ a, \/\*\* @type \{any\} \*\/ b\) => \{\n\t\tconst primary = compare\(a, b, sorting\);\n\t\tif \(primary !== 0\) \{\n\t\t\treturn deckStore\.sortAscending \? primary : -primary;\n\t\t\}\n\t\treturn a\.name\.localeCompare\(b\.name\);\n\t\};\n\}/;

const newGroupingSortFn = `function createSortFn(sorting) {
	return (/** @type {any} */ a, /** @type {any} */ b) => {
		const aIsBasic = isBasicLand(a.name);
		const bIsBasic = isBasicLand(b.name);
		
		if (aIsBasic && !bIsBasic) return -1;
		if (!aIsBasic && bIsBasic) return 1;
		if (aIsBasic && bIsBasic) {
			const weightDiff = getBasicLandWeight(a.name) - getBasicLandWeight(b.name);
			if (weightDiff !== 0) return weightDiff;
		}

		const primary = compare(a, b, sorting);
		if (primary !== 0) {
			return deckStore.sortAscending ? primary : -primary;
		}
		return a.name.localeCompare(b.name);
	};
}`;

groupingContent = groupingContent.replace(groupingSortFnRegex, newGroupingSortFn);
groupingContent += '\n' + helperLogic;
fs.writeFileSync(groupingPath, groupingContent);

// 2. Update stacks.svelte.js
const stacksPath = path.join(__dirname, '../svelte-app/src/lib/layouts/stacks.svelte.js');
let stacksContent = fs.readFileSync(stacksPath, 'utf8');

const stacksSortFnRegex = /function createSortFn\(sorting\) \{\n\t\treturn \(a, b\) => \{\n\t\t\tconst primary = compare\(a, b, sorting\);\n\t\t\tif \(primary !== 0\) return primary;\n\t\t\treturn a\.name\.localeCompare\(b\.name\);\n\t\t\};\n\t\}/;

const newStacksSortFn = `function createSortFn(sorting) {
		return (a, b) => {
			const aIsBasic = isBasicLand(a.name);
			const bIsBasic = isBasicLand(b.name);
			
			if (aIsBasic && !bIsBasic) return -1;
			if (!aIsBasic && bIsBasic) return 1;
			if (aIsBasic && bIsBasic) {
				const weightDiff = getBasicLandWeight(a.name) - getBasicLandWeight(b.name);
				if (weightDiff !== 0) return weightDiff;
			}

			const primary = compare(a, b, sorting);
			if (primary !== 0) {
				// DeckStore sorting fallback check in Stacks since we can read it
				if (deckStore.sortAscending !== undefined) {
					return deckStore.sortAscending ? primary : -primary;
				}
				return primary;
			}
			return a.name.localeCompare(b.name);
		};
	}`;

stacksContent = stacksContent.replace(stacksSortFnRegex, newStacksSortFn);
stacksContent += '\n' + helperLogic;
fs.writeFileSync(stacksPath, stacksContent);

console.log('Sorting logic updated in grouping.svelte.js and stacks.svelte.js');
