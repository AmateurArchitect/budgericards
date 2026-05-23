const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../svelte-app/src/lib/components/TableView.svelte');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
	'import { checkLegality } from "$lib/utils/legality.js";',
	'import { checkLegality } from "$lib/utils/legality.js";\n\timport { getGroupedCategories } from "$lib/layouts/grouping.svelte.js";'
);

const parseManaCostRegex = /\/\/ Parse mana symbols from Scryfall format.*?function parseManaCost\(manaCostStr\) \{[\s\S]*?return result;\n\t\}\n/g;
content = content.replace(parseManaCostRegex, '');

const groupedCategoriesRegex = /\/\/ Group and sort card rows Reactively in Svelte 5\n\tconst groupedCategories = \$derived\.by\(\(\) => \{[\s\S]*?return 0;\n\t\}\n/g;
content = content.replace(groupedCategoriesRegex, '// Group and sort card rows Reactively in Svelte 5\n\tconst groupedCategories = $derived.by(getGroupedCategories);\n');

fs.writeFileSync(filePath, content);
console.log('TableView.svelte updated');
