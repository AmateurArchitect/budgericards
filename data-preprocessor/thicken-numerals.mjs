import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MANA_DIR = path.join(__dirname, '../svelte-app/static/mana');
const STROKE_PERCENT = 0.018; // 1.8% of viewBox width

function shouldThicken(fileName) {
  // Target digits, fraction half, and infinity
  return /\d/.test(fileName) || fileName.includes('½') || fileName.includes('∞');
}

function processSvgFile(filePath) {
  const fileName = path.basename(filePath);
  
  if (!shouldThicken(fileName)) {
    return; // Skip non-numeric symbols
  }

  let content = fs.readFileSync(filePath, 'utf8');

  // Extract viewBox to calculate scale
  const viewBoxMatch = content.match(/viewBox=['"]([^'"]+)['"]/);
  let width = 100;

  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length === 4) {
      width = parts[2];
    }
  } else {
    const widthMatch = content.match(/width=['"]([^'"]+)['"]/);
    if (widthMatch) {
      width = parseFloat(widthMatch[1]);
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

  // Check if it already has a stroke to avoid double-stroking
  if (pathTag.includes('stroke=')) {
    console.log(`Skipping ${fileName}: Already has stroke.`);
    return;
  }

  // Extract fill color
  const fillMatch = pathTag.match(/fill=['"]([^'"]+)['"]/);
  const fillColor = fillMatch ? fillMatch[1] : '#0D0F0F';

  // Calculate proportional stroke width
  const strokeWidth = (width * STROKE_PERCENT).toFixed(2);
  const strokeAttrs = ` stroke="${fillColor}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;

  // Insert stroke attributes before closing tag
  let updatedPathTag = pathTag;
  if (pathTag.endsWith('/>')) {
    updatedPathTag = pathTag.replace(/\s*\/?>$/, `${strokeAttrs} />`);
  } else if (pathTag.endsWith('>')) {
    updatedPathTag = pathTag.replace(/\s*>$/, `${strokeAttrs} >`);
  }

  const before = content.substring(0, lastPathIndex);
  const after = content.substring(pathEndIndex + 1);
  const newContent = before + updatedPathTag + after;

  fs.writeFileSync(filePath, newContent, 'utf8');
  console.log(`Thickened ${fileName}: stroke-width ${strokeWidth}px (color: ${fillColor})`);
}

function main() {
  if (!fs.existsSync(MANA_DIR)) {
    console.error(`Directory not found: ${MANA_DIR}`);
    process.exit(1);
  }

  const files = fs.readdirSync(MANA_DIR).filter(f => f.endsWith('.svg'));
  console.log(`Found ${files.length} SVGs in ${MANA_DIR}. Scanning for numerals to thicken...`);

  let count = 0;
  for (const file of files) {
    const filePath = path.join(MANA_DIR, file);
    try {
      if (shouldThicken(file)) {
        processSvgFile(filePath);
        count++;
      }
    } catch (err) {
      console.error(`Error processing ${file}:`, err.message);
    }
  }

  console.log(`Finished processing. Thickened ${count} numeral glyphs.`);
}

main();
