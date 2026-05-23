import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Add animate:flip to the CardShell components in the loops
content = content.replace(
    '<CardShell card={item} price={item.price} class="curve-card-item"',
    '<CardShell animate:flip={{duration: 400}} card={item} price={item.price} class="curve-card-item"'
)

with open(file_path, 'w') as f:
    f.write(content)

print("Applied animate:flip to CurveView cards")
