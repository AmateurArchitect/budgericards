import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# 1. Restore Stable Keys (remove view suffix)
content = re.sub(r'\(item\.id \+ .*?\)\}', '(item.id)}', content)

# 2. Restore animate:flip and remove svelte transitions
content = re.sub(
    r'<div in:cardPop=\{.*?\} out:cardPop=\{.*?\}',
    '<div animate:flip={{duration: 200}}',
    content
)

# 3. Restore the CSS animation keyframes and the initial-load staggering
# We'll re-add these to the <style> block
if '@keyframes card-entrance' not in content:
    keyframes = """
	@keyframes card-entrance {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	:global(.initial-load .curve-card-item) {
		animation: card-entrance 0.2s ease backwards;
		animation-delay: var(--delay);
	}
"""
    # Insert before the first :global(.curve-card-item)
    content = content.replace(':global(.curve-card-item) {', keyframes + '\n\t:global(.curve-card-item) {')

# 4. Re-add the --delay variable to the style attribute
content = content.replace('style="z-index: {idx + 1};"', 'style="z-index: {idx + 1}; --delay: {idx * 20}ms;"')

with open(file_path, 'w') as f:
    f.write(content)

print("Reverted to sliding animations in CurveView")
