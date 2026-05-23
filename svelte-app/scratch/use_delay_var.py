import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Replace transition-delay: {idx * 30}ms with --delay: {idx * 30}ms
content = content.replace('transition-delay: {idx * 30}ms', '--delay: {idx * 30}ms')

with open(file_path, 'w') as f:
    f.write(content)

print("Switched to --delay CSS variable in CurveView loops")
