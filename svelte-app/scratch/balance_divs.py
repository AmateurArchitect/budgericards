import re
import sys

file_path = "/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/components/CurveView.svelte"

with open(file_path, 'r') as f:
    content = f.read()

# Pattern 1: </CardShell> followed by </div>, {/if}, </div>
pattern1 = r'<\/CardShell>\s+<\/div>\s+\{\/if\}\s+<\/div>'
content = re.sub(pattern1, '</CardShell>', content)

# Pattern 2: (for the last loop which might be slightly different)
# It was: </CardShell>\n\t\t\t\t\t\t\t\t\t\t\t</div>\n\t\t\t\t\t\t\t\t\t\t{/if}\n\t\t\t\t\t\t\t\t\t</div>
pattern2 = r'<\/CardShell>\s+<\/div>\s+\{\/if\}\s+<\/div>' 
# Wait, pattern 2 is same as pattern 1 essentially with \s+

# Actually, let's just count divs again after this.
new_content = content

with open(file_path, 'w') as f:
    f.write(new_content)

print("Balanced divs in CurveView.svelte")
