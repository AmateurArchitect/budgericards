import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# 1. Update CardShell to include class and style
# 2. Remove curve-card-item div (but keep its content)
# 3. Port over transition-delay if present (user mentioned "animate")

def refactor_loop(match):
    shell_opening = match.group(1)
    inner_div_opening = match.group(2)
    inner_content = match.group(3)
    
    # Extract z-index from inner_div_opening
    z_index_match = re.search(r'style="z-index: (.*?)"', inner_div_opening)
    z_index = z_index_match.group(1) if z_index_match else "{idx + 1}"
    
    # Check if there was a transition delay in the old code (idx * 30ms)
    # The user mentioned "animate", let's add it back for polish
    style = f'style="z-index: {z_index}; transition-delay: {{idx * 30}}ms;"'
    
    new_shell = shell_opening.replace('<CardShell', f'<CardShell class="curve-card-item" {style}')
    
    # We remove the inner div but keep its contents (CardArt and Badge)
    return f'{new_shell}\n\t\t\t\t\t\t\t\t\t\t\t\t\t{{#snippet children({{ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate }})}}\n{inner_content}\n\t\t\t\t\t\t\t\t\t\t\t\t\t{{/snippet}}\n\t\t\t\t\t\t\t\t\t\t\t\t</CardShell>'

# Pattern to match CardShell and its inner curve-card-item div
# Group 1: CardShell opening tag
# Group 2: Inner div opening tag
# Group 3: Content between inner div tags
pattern = r'(<CardShell.*?>)\s+{#snippet children.*?}\s+(<div\s+class="curve-card-item".*?>)(.*?)\s+<\/div>\s+{#/snippet}\s+<\/CardShell>'

# Actually, the snippet might have different formatting.
# Let's use a simpler approach: replace the specific pattern we have now.

new_content = content

# Replace the CardShell blocks
# Current structure:
# <CardShell card={item} price={item.price}>
#     {#snippet children({ isDragging, isFlipped, isRotated, toggleFlip, toggleRotate })}
#         <div 
#             class="curve-card-item" 
#             class:dragging={isDragging}
#             style="z-index: {idx + 1}"
#         >
#             ... (Badge and CardArt)
#         </div>
#     {/snippet}
# </CardShell>

def replacement(m):
    shell_props = m.group(1)
    snippet_args = m.group(2)
    div_classes = m.group(3) # class:dragging={isDragging} etc
    z_index = m.group(4)
    inner_content = m.group(5)
    
    return f'<CardShell {shell_props} class="curve-card-item" style="z-index: {z_index}; transition-delay: {{idx * 30}}ms;">\n\t\t\t\t\t\t\t\t\t\t\t\t\t{{#snippet children({snippet_args})}}\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t{inner_content.strip()}\n\t\t\t\t\t\t\t\t\t\t\t\t\t{{/snippet}}\n\t\t\t\t\t\t\t\t\t\t\t\t</CardShell>'

# Precise pattern for current structure
pattern = r'<CardShell (.*?)>\s+{#snippet children\((.*?)\)}\s+<div\s+class="curve-card-item"\s+(.*?)\s+style="z-index: (.*?)"\s+>\s+(.*?)\s+<\/div>\s+{#/snippet}\s+<\/CardShell>'

new_content = re.sub(pattern, replacement, content, flags=re.DOTALL)

with open(file_path, 'w') as f:
    f.write(new_content)

print("Ported stacking and animation logic to CardShell in CurveView")
