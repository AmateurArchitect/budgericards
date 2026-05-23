import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Replace all 400ms flips with 200ms
content = content.replace('animate:flip={{duration: 400}}', 'animate:flip={{duration: 200}}')

# Replace all 30ms delays with 20ms for snappier waterfall
content = content.replace('--delay: {idx * 30}ms;', '--delay: {idx * 20}ms;')

with open(file_path, 'w') as f:
    f.write(content)

print("Restored snappy durations to CurveView")
