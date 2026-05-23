import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Snippet to replace with
replacement = """<CardShell card={item} price={item.price}>
\t\t\t\t\t\t\t\t\t\t\t\t\t{#snippet children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tclass="curve-card-item" 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tclass:dragging={isDragging}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tstyle="z-index: {idx + 1}"
\t\t\t\t\t\t\t\t\t\t\t\t\t\t>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{#if item.isStack}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<div class="stack-badge">x{item.stackCount}</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{/if}
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t<CardArt 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tcard={item} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tprice={item.price} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{isFlipped} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{isRotated} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{toggleFlip} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t{toggleRotate} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tshowPrice={false} 
\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t/>
\t\t\t\t\t\t\t\t\t\t\t\t\t\t</div>
\t\t\t\t\t\t\t\t\t\t\t\t\t{/snippet}
\t\t\t\t\t\t\t\t\t\t\t\t</CardShell>"""

# Regex to find the entire block from {@const imgUrl...} down to the closing </div> of the curve-card-item
# We use a non-greedy match for the content of the div
pattern = r'\{@const imgUrl =.*?<div\s+class="curve-card-item".*?<\/div>'

# Replace all occurrences
new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Successfully refactored CurveView.svelte")
