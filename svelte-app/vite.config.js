import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import fs from 'fs';
import path from 'path';

export default defineConfig({
	server: {
		watch: {
			ignored: ['**/selected-art.json']
		}
	},
	plugins: [
		sveltekit(),
		{
			name: 'save-selection-plugin',
			configureServer(server) {
				server.middlewares.use((req, res, next) => {
					if (req.url === '/api/save-selection') {
						const filePath = path.resolve('/Users/henrygardella/Documents/VS Code Projects/budgericards/svelte-app/src/lib/constants/selected-art.json');
						if (req.method === 'GET') {
							try {
								const data = fs.readFileSync(filePath, 'utf-8');
								res.statusCode = 200;
								res.setHeader('Content-Type', 'application/json');
								res.end(data);
							} catch (err) {
								res.statusCode = 500;
								res.end(JSON.stringify({ error: err.message }));
							}
						} else if (req.method === 'POST') {
							let body = '';
							req.on('data', chunk => {
								body += chunk;
							});
							req.on('end', () => {
								try {
									const data = JSON.parse(body);
									fs.writeFileSync(filePath, JSON.stringify(data, null, 4), 'utf-8');
									res.statusCode = 200;
									res.setHeader('Content-Type', 'application/json');
									res.end(JSON.stringify({ success: true }));
								} catch (err) {
									res.statusCode = 500;
									res.end(JSON.stringify({ error: err.message }));
								}
							});
						}
					} else {
						next();
					}
				});
			}
		}
	]
});
