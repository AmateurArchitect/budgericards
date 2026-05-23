import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to find selectors starting with .curve-card-item and wrap them in :global()
# We need to be careful with complex selectors like .curve-card-item:hover ~ .curve-card-item

selectors = [
    r'\.curve-card-item\s*\{',
    r'\.curve-card-item::after\s*\{',
    r'\.curve-card-item:first-child\s*\{',
    r'\.curve-card-item\.is-dragging\s*\{',
    r'\.curve-card-item:hover\s*\{',
    r'\.curve-card-item:hover\s*~\s*\.curve-card-item\s*\{'
]

new_content = content
for pattern in selectors:
    def repl(m):
        selector = m.group(0).replace('{', '').strip()
        # Wrap the whole selector in :global()
        return f':global({selector}) {{'
    
    new_content = re.sub(pattern, repl, new_content)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Wrapped curve-card-item selectors in :global()")
