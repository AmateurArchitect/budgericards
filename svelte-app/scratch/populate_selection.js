import fs from 'fs';
import { RESOLVED_ART } from '../src/lib/constants/resolved-art.js';

const urls = RESOLVED_ART.map(c => c.url);
const dest = '/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json';
fs.writeFileSync(dest, JSON.stringify(urls, null, 4), 'utf-8');
console.log(`Successfully populated selected-art.json with ${urls.length} artwork URLs.`);
