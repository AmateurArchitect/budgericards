import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Fix key syntax: remove double plus and extra spaces
content = content.replace('item.id +  + ', 'item.id + ')

# Remove unused --delay variable
content = content.replace('; --delay: {idx * 20}ms;', ';')

with open(file_path, 'w') as f:
    f.write(content)

print("Cleaned up key syntax and removed unused styles")
