### Custom Card Data
Big change: users can overwrite certain card data within cards saved to a deck.
Supported Properties:
 - Mana Value
 - Color
 - Color Identity
 - Color Category
 - Primary Card Type
 - Creature/Noncreature

 Card data can be changed by typing in the fields in table view, or by dragging and dropping between columns in stacks view.

 In the table view, custom overrides need to be styled differently so we can tell the value is user set. We also need a way to reset overriden values, both for indivudal cards, individual fields, and the whole deck. These options should appear intelligently only when custom data exists.

### Custom Tags
We already have UI that hints at this feature in the table view, but we want to add a custom tagging system very similar to Archidekt's. Tags can be defined in table view. A card can have multiple tags, in which case one tag is considered "primary." When a card has multiple tags, users can change which tag is primary.

### Stacks View
 - Drag and drop between columns to change card data.
 - Control (Alt) click replaces shift click to add an additional card
 - Multi-select support using Command (control) A, Shift click and command (control) click now.
 - Cut, Copy and paste between columns
 - Bring back the view option to hide column headers
 - Add new grouping: Primary Tag.
 - Add new grouping: Freeform. Freeform does not automatically rearrange or regroup cards. Instead, it allows users to freely move cards between columns without changing card data. When switching to freeform, the existing grouping/sort is preserved, but column headers are changed to be generic (e.g. "column 4"). In freeform, column headers can be edited by clicking on them, although the card count for the column is not editable.
 - Primary Tags can be created/set from the stacks view. For example, in freeform you could click "generate tags from current stacks" in the advanced view options.

### Table View
 - Visually revamp the table view to look more like Tables in Notion. 
 - Support for selecting multiple rows and columns, copy/pasting data
 - Support for custom tags
 - Support for card data overrides

### Misc. Fixes and changes
 - Remove extra view options for [Use Color Identity], [Combine 0 & 1-Drops],[Combine 6+ Drops] from the list view.
 - Visual Spoiler Default size is 50% instead of 75%.
 - Clicking save from the list view returns the user to the last used view besires the list view, with fallback of the default deck view. If the default deck view is the list view, then clicking save keeps you on the list view.

 