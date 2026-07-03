import fs from 'fs';

const cardsPath = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/static/cards.json';
const data = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
const adeline = data.find(c => c.name === 'Adeline, Resplendent Cathar');
console.log('Adeline card structure:', JSON.stringify(adeline, null, 2));
