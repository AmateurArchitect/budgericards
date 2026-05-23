import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to find the garbage left after </CardShell> inside an each loop
# It usually starts with {/if} (the end of the old isStack check) 
# and ends with the closing </div> of the old curve-card-item.
garbage_pattern = r'<\/CardShell>\s+\{\/if\}\s+\{#if imgUrl\}.*?<\/div>'

new_content = re.sub(garbage_pattern, '</CardShell>', content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Cleaned up CurveView.svelte garbage")
