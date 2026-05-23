import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Fix the specific broken selector from previous step
# It became :global(.curve-card-item:hover) ~ :global(.curve-card-item) or similar
# Let's just fix it manually in the file or with a better script.

content = content.replace(
    ':global(.curve-card-item:hover ~ .curve-card-item) {',
    ':global(.curve-card-item:hover ~ .curve-card-item) {'
)
# Wait, if I already ran the script, it might look like:
# :global(.curve-card-item:hover) ~ :global(.curve-card-item) {
# No, let's just use a clean regex for all global selectors in the file.

# Find all :global(xxx) and ensure they are correct
new_content = re.sub(r':global\((.*?)\)\s*~?\s*:global\((.*?)\)', r':global(\1 ~ \2)', content)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Cleaned up :global selectors")
