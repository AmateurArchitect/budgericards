import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Replace the CardShell component with a wrapped version that supports animate:flip
# We need to find the loop bodies and wrap the CardShell.
# This regex is a bit complex, let's do it carefully for top and bottom.

# Pattern for the top stack
top_pattern = r'<CardShell animate:flip=\{\{duration: 400\}\} card=\{item\} price=\{item.price\} class="curve-card-item" style="z-index: \{idx \+ 1\}; --delay: \{idx \* 30\}ms;">(.*?)</CardShell>'
def top_repl(m):
    inner = m.group(1)
    return f'<div animate:flip={{{{duration: 400}}}} class="curve-card-item" style="z-index: {{idx + 1}}; --delay: {{idx * 30}}ms;">\n<CardShell card={{item}} price={{item.price}} inSearchPanel={{false}}>\n{inner}\n</CardShell>\n</div>'

content = re.sub(top_pattern, top_repl, content, flags=re.DOTALL)

# Pattern for the bottom stack
bottom_pattern = r'<CardShell animate:flip=\{\{duration: 400\}\} card=\{item\} price=\{item.price\} class="curve-card-item" style="z-index: \{idx \+ 1\}; --delay: \{idx \* 30\}ms;">(.*?)</CardShell>'
# Since it's the same pattern, re.sub already handled it if it matched both.

# Clean up empty CSS rulesets
content = content.replace('\t:global(.curve-card-item:first-child) {\n\t\t/* All cards now use the same slot height logic */\n\t}', '')
content = content.replace('\t.curve-col-stack:hover :global(.curve-card-item) {\n\t\t/* Transition delay is now 0ms by default in CardShell */\n\t}', '')

with open(file_path, 'w') as f:
    f.write(content)

print("Fixed animate:flip usage and cleaned up CSS warnings")
