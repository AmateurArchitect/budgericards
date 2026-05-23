const fs = require('fs');
const path = require('path');

// Target string to replace (regex)
const groupingColorBlock = /if \(factor === "color"\) \{\n\s+\/\*\* @type \{Record<string, number>\} \*\/\n\s+const colorWeights = \{[\s\S]*?getWeight\(b\.color_identity \|\| b\.colors\)\n\s+\);\n\s+\}/m;
const stacksColorBlock = /if \(factor === "color"\) \{\n\s+const colorWeights = \{ "": 0, W: 1, U: 2, B: 3, R: 4, G: 5, WU: 6, UB: 7, BR: 8, RG: 9, WG: 10, WB: 11, UR: 12, BG: 13, WR: 14, UG: 15 \};\n\s+const getWeight = \(id\) => colorWeights\[\[\.\.\.\(id \|\| \[\]\)\].sort\(\(a, b\) => "WUBRG"\.indexOf\(a\) - "WUBRG"\.indexOf\(b\)\)\.join\(""\)\] \?\? 99;\n\s+return getWeight\(a\.color_identity\) - getWeight\(b\.color_identity\);\n\s+\}/m;
const spoilerColorBlock = /if \(factor === "color"\) \{\n\s+\/\*\* @type \{Record<string, number>\} \*\/\n\s+const colorWeights = \{ "": 0, W: 1, U: 2, B: 3, R: 4, G: 5, WU: 6, UB: 7, BR: 8, RG: 9, WG: 10, WB: 11, UR: 12, BG: 13, WR: 14, UG: 15 \};\n\s+const getWeight = \(\/\*\* @type \{any\} \*\/ id\) => colorWeights\[\[\.\.\.\(id \|\| \[\]\)\].sort\(\(\/\*\* @type \{any\} \*\/ a, \/\*\* @type \{any\} \*\/ b\) => "WUBRG"\.indexOf\(a\) - "WUBRG"\.indexOf\(b\)\)\.join\(""\)\] \?\? 99;\n\s+return getWeight\(a\.color_identity \|\| a\.colors\) - getWeight\(b\.color_identity \|\| b\.colors\);\n\s+\}/m;

const replacement = `if (factor === "color") {
		return compareColors(a, b, settingsStore.useColorIdentity);
	}`;

const spoilerReplacement = `if (factor === "color") {
			return compareColors(a, b, settingsStore.useColorIdentity);
		}`;


// 1. Grouping.svelte.js
const groupingPath = path.join(__dirname, '../svelte-app/src/lib/layouts/grouping.svelte.js');
let grouping = fs.readFileSync(groupingPath, 'utf8');
if (!grouping.includes('import { compareColors }')) {
    grouping = 'import { compareColors } from "$lib/utils/colors.js";\n' + grouping;
}
grouping = grouping.replace(groupingColorBlock, replacement);
fs.writeFileSync(groupingPath, grouping);

// 2. Stacks.svelte.js
const stacksPath = path.join(__dirname, '../svelte-app/src/lib/layouts/stacks.svelte.js');
let stacks = fs.readFileSync(stacksPath, 'utf8');
if (!stacks.includes('import { compareColors }')) {
    stacks = "import { compareColors } from '$lib/utils/colors.js';\n" + stacks;
}
stacks = stacks.replace(stacksColorBlock, replacement);
fs.writeFileSync(stacksPath, stacks);

// 3. SpoilerView.svelte
const spoilerPath = path.join(__dirname, '../svelte-app/src/lib/components/SpoilerView.svelte');
let spoiler = fs.readFileSync(spoilerPath, 'utf8');
if (!spoiler.includes('import { compareColors }')) {
    spoiler = spoiler.replace('import { checkLegality } from "$lib/utils/legality.js";', 'import { checkLegality } from "$lib/utils/legality.js";\n\timport { compareColors } from "$lib/utils/colors.js";');
}
spoiler = spoiler.replace(spoilerColorBlock, spoilerReplacement);
fs.writeFileSync(spoilerPath, spoiler);

console.log("Updated files to use compareColors");
