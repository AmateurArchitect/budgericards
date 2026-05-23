const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../svelte-app/src/lib/components/DeckHeader.svelte');
let content = fs.readFileSync(filePath, 'utf8');

content = content.replace(
	'Table,\n\t\tCheck,\n\t} from "lucide-svelte";',
	'Table,\n\t\tCheck,\n\t\tAlignJustify,\n\t} from "lucide-svelte";'
);

content = content.replace(
	'<Table size={14} />\n\t\t\t\t\t</Button>\n\t\t\t\t\t<Button\n\t\t\t\t\t\tvariant={settingsStore.deckViewMode === "spoiler"',
	'<Table size={14} />\n\t\t\t\t\t</Button>\n\t\t\t\t\t<Button\n\t\t\t\t\t\tvariant={settingsStore.deckViewMode === "list"\n\t\t\t\t\t\t\t? "toggle-active"\n\t\t\t\t\t\t\t: "ghost"}\n\t\t\t\t\t\tsize="icon"\n\t\t\t\t\t\tclass="display-toggle-btn"\n\t\t\t\t\t\tonclick={() => (settingsStore.deckViewMode = "list")}\n\t\t\t\t\t\ttitle="List View"\n\t\t\t\t\t>\n\t\t\t\t\t\t<AlignJustify size={14} />\n\t\t\t\t\t</Button>\n\t\t\t\t\t<Button\n\t\t\t\t\t\tvariant={settingsStore.deckViewMode === "spoiler"'
);

// We should also allow the Columns dropdown to show in list view so they can toggle prices if they want, but the prompt says price is visible when toggled on and automatically when sorting. Wait, the table columns dropdown controls `settingsStore.visibleColumns`. Does list view use `visibleColumns` for price?
// Yes, ListView checks `settingsStore.showPrices || deckStore.sorting === 'price'`. Wait, I didn't add a `showPrices` to `settingsStore` actually, `settingsStore` has `showPrices`! I used `settingsStore.showPrices` in my ListView component.
// In TableView, prices are toggled via the Columns dropdown (it toggles `price` in `visibleColumns`). In settingsStore, `showPrices` exists as a separate toggle (for print/spoiler).
// Wait, TableView uses `settingsStore.visibleColumns.includes("price")`.
// My ListView uses `settingsStore.showPrices || deckStore.sorting === "price"`.
// Wait, the prompt says "By default only card quantity, card name and mana cost are visible. Price is visible when toggled on (and is automatically toggled on when sorting by price)."
// The columns dropdown is for table view. To toggle price in List View, they need a toggle. Or I can just make List View use `visibleColumns` like TableView! Let's update ListView to check `settingsStore.visibleColumns.includes("price")` instead!

fs.writeFileSync(filePath, content);
console.log('DeckHeader.svelte updated');
