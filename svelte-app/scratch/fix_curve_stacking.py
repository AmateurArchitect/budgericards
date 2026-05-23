import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Pattern to replace in each loop
old_block = """<CardShell card={item} price={item.price}>
													{#snippet children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
														<div 
															class="curve-card-item" 
															class:dragging={isDragging}
															style="z-index: {idx + 1}"
														>
															{#if item.isStack}
																<div class="stack-badge">x{item.stackCount}</div>
															{/if}
															<CardArt 
																card={item} 
																price={item.price} 
																{isFlipped} 
																{isRotated} 
																{toggleFlip} 
																{toggleRotate} 
																showPrice={false} 
																loading={!item._metadata}
															/>
														</div>
													{/snippet}
												</CardShell>"""

new_block = """<CardShell card={item} price={item.price} class="curve-card-item" style="z-index: {idx + 1}; transition-delay: {idx * 30}ms;">
													{#snippet children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
														{#if item.isStack}
															<div class="stack-badge">x{item.stackCount}</div>
														{/if}
														<CardArt 
															card={item} 
															price={item.price} 
															{isFlipped} 
															{isRotated} 
															{toggleFlip} 
															{toggleRotate} 
															showPrice={false} 
															loading={!item._metadata}
														/>
													{/snippet}
												</CardShell>"""

# Replace all occurrences (the formatting might vary slightly, let's normalize whitespace)
import re

def normalize(s):
    return re.sub(r'\s+', ' ', s.strip())

# We need to be careful with exact whitespace for replace()
# Let's try to find them by parts

content = content.replace(
    '<CardShell card={item} price={item.price}>',
    '<CardShell card={item} price={item.price} class="curve-card-item" style="z-index: {idx + 1}; transition-delay: {idx * 30}ms;">'
)

# Remove the inner div and its closing tag
# Note: I'm being very specific to avoid collateral damage
content = content.replace(
    '<div \n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tclass="curve-card-item" \n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tclass:dragging={isDragging}\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\tstyle="z-index: {idx + 1}"\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t>',
    ''
)
# Wait, the whitespace in my view_file was different.
# Let's use regex for the inner div removal

# Remove opening div
content = re.sub(r'<div\s+class="curve-card-item".*?style="z-index: {idx \+ 1}".*?>', '', content, flags=re.DOTALL)

# Remove the corresponding closing div (the one before {/snippet})
content = content.replace('</div>\n\t\t\t\t\t\t\t\t\t\t\t\t\t{/snippet}', '{/snippet}')

with open(file_path, 'w') as f:
    f.write(content)

print("Updated CurveView loops")
