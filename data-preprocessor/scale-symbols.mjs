import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANA_DIR = path.join(__dirname, '../svelte-app/static/mana');
const SCALE = 0.9; // Target scale factor (10% padding/margin increase around glyph)

function processSvgFile(filePath) {
  const fileName = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');

  // If it's already scaled, update the scale factor to the current SCALE value
  if (content.includes('id="scaled-glyph"')) {
    const updatedContent = content.replace(/(id="scaled-glyph"[^>]*scale\()[\d.]+(\))/g, `$1${SCALE}$2`);
    if (updatedContent !== content) {
      fs.writeFileSync(filePath, updatedContent, 'utf8');
      console.log(`Updated scale factor of ${fileName} to ${SCALE}`);
    } else {
      console.log(`Skipping ${fileName}: Already scaled at ${SCALE}.`);
    }
    return;
  }

  // Extract viewBox to calculate center coordinates
  const viewBoxMatch = content.match(/viewBox=['"]([^'"]+)['"]/);
  let cx = 50;
  let cy = 50;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length === 4) {
      const [x, y, w, h] = parts;
      cx = x + w / 2;
      cy = y + h / 2;
    }
  } else {
    // Fallback to width/height attributes if viewBox is missing
    const widthMatch = content.match(/width=['"]([^'"]+)['"]/);
    const heightMatch = content.match(/height=['"]([^'"]+)['"]/);
    if (widthMatch && heightMatch) {
      const w = parseFloat(widthMatch[1]);
      const h = parseFloat(heightMatch[1]);
      cx = w / 2;
      cy = h / 2;
    }
  }

  // Find the last <path tag in the file, which represents the glyph
  const lastPathIndex = content.lastIndexOf('<path');
  if (lastPathIndex === -1) {
    console.log(`Skipping ${fileName}: No <path> element found.`);
    return;
  }

  // Find the closing '>' of the path tag
  const pathEndIndex = content.indexOf('>', lastPathIndex);
  if (pathEndIndex === -1) {
    console.log(`Skipping ${fileName}: Malformed <path> tag.`);
    return;
  }

  const pathTag = content.substring(lastPathIndex, pathEndIndex + 1);

  const before = content.substring(0, lastPathIndex);
  const after = content.substring(pathEndIndex + 1);

  // Wrap the path tag in a transform group scaled around center
  const scaledPath = `<g id="scaled-glyph" transform="translate(${cx}, ${cy}) scale(${SCALE}) translate(-${cx}, -${cy})">${pathTag}</g>`;
  const newContent = before + scaledPath + after;

  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`Successfully scaled ${fileName} glyph by ${SCALE} around (${cx}, ${cy})`);
}

function main() {
  if (!fs.existsSync(MANA_DIR)) {
    console.error(`Directory not found: ${MANA_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MANA_DIR).filter(f => f.endsWith('.svg'));
  console.log(`Found ${files.length} SVGs in ${MANA_DIR}. Processing...`);

  let count = 0;
  for (const file of files) {
    const filePath = path.join(MANA_DIR, file);
    try {
      processSvgFile(filePath);
      count++;
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }

  console.log(`Finished processing. Scaled ${count} files.`);
}

main();
