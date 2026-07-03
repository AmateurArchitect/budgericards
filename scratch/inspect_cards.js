import fs from 'fs';
import path from 'path';

const cardsPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/static/cards.json';
const data = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
console.log('Total cards:', data.length);
console.log('First card structure:', JSON.stringify(data[0], null, 2));
