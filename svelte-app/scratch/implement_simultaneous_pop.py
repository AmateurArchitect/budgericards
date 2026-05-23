import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Fix script tag if missing
if not content.startswith('<script>'):
    content = '<script>\n' + content

# Update Loop Keys to force re-render on view switch
# This triggers the Out/In transitions instead of a Flip move
view_key_suffix = " + (deckStore.splitView ? 'split' : 'normal') + deckStore.grouping"
content = content.replace('(item.id)}', f'(item.id + {view_key_suffix})}}')

# Apply the cardPop transition to the card item wrappers
# We use a conditional delay: staggered on initial load, simultaneous on view switch
pop_transition = 'in:cardPop={{duration: 350, delay: isInitialLoad ? idx * 20 : 0}} out:cardPop={{duration: 200}}'

# We replace the animate:flip line with our new transition
content = re.sub(
    r'<div animate:flip=\{\{duration: 200\}\}',
    f'<div {pop_transition}',
    content
)

# Remove the CSS-based entrance animation since we are now using the Svelte transition
content = re.sub(
    r':global\(\.initial-load \.curve-card-item\) \{.*?\}',
    '',
    content,
    flags=re.DOTALL
)
content = re.sub(
    r'@keyframes card-entrance \{.*?\}',
    '',
    content,
    flags=re.DOTALL
)

with open(file_path, 'w') as f:
    f.write(content)

print("Implemented simultaneous Pop transitions for view switching")
