import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANA_DIR = path.join(__dirname, '../svelte-app/static/mana');

function smoothSvg(filePath) {
  const fileName = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');

  let modified = false;

  // 1. Inject shape-rendering="geometricPrecision" into the <svg> element
  if (!content.includes('shape-rendering=')) {
    content = content.replace(/<svg([^>]+)>/, '<svg$1 shape-rendering="geometricPrecision">');
    modified = true;
  }

  // 2. Strip unnecessary clip-paths that disable subpixel antialiasing
  // e.g. clip-path="url(#clip0_147_628)"
  if (content.includes('clip-path=')) {
    content = content.replace(/clip-path=["']url\([^)]+\)["']/g, '');
    modified = true;
  }

  // 3. Remove defs and clipPath blocks if they are no longer needed
  if (content.includes('<clipPath') || content.includes('<defs>')) {
    content = content.replace(/<defs>[\s\S]*?<\/defs>/g, '');
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Smoothed and optimized antialiasing for ${fileName}`);
  } else {
    console.log(`Skipped ${fileName}: Already optimized.`);
  }
}

function main() {
  if (!fs.existsSync(MANA_DIR)) {
    console.error(`Directory not found: ${MANA_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MANA_DIR).filter(f => f.endsWith('.svg'));
  console.log(`Found ${files.length} SVGs. Applying smoothing optimization...`);

  let count = 0;
  for (const file of files) {
    const filePath = path.join(MANA_DIR, file);
    try {
      smoothSvg(filePath);
      count++;
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }

  console.log(`Finished optimization. Optimized ${count} files.`);
}

main();
