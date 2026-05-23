import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = path.join(__dirname, 'cards.json');
const outputPath = path.join(__dirname, 'random-100.json');

console.log('Reading cards.json...');
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

console.log(`Loaded ${data.length} cards. Selecting 100 random cards...`);

// Fisher-Yates shuffle
for (let i = data.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [data[i], data[j]] = [data[j], data[i]];
}

const random100 = data.slice(0, 100);

fs.writeFileSync(outputPath, JSON.stringify(random100, null, 2));
console.log('Successfully generated random-100.json!');
