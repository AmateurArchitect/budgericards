import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Add keys to the card loops: (item.id)
# Pattern: {#each stack.top as item, idx} -> {#each stack.top as item, idx (item.id)}
content = content.replace('{#each stack.top as item, idx}', '{#each stack.top as item, idx (item.id)}')
content = content.replace('{#each stack.bottom as item, idx}', '{#each stack.bottom as item, idx (item.id)}')

# Add keys to the column entries loop: (key)
# Pattern: {#each Object.entries(columns) as [key, stack]} -> {#each Object.entries(columns) as [key, stack] (key)}
content = content.replace('{#each Object.entries(columns) as [key, stack]}', '{#each Object.entries(columns) as [key, stack] (key)}')

with open(file_path, 'w') as f:
    f.write(content)

print("Applied keys to CurveView loops")
