import { QueryParser } from '@sillvva/search';

class LocalQueryParser extends QueryParser {
	parse(query) {
		return this._parse(query);
	}
}

const parser = new LocalQueryParser({
	validKeys: ['t', 'type', 'o', 'oracle', 'c', 'color', 'cmc', 'mv', 'price'],
	defaultKey: 'name'
});

const queries = [
	'lightning bolt',
	't:creature c:r cmc>=3',
	't:instant or t:sorcery',
	'c:w (t:instant or t:sorcery)',
	'cmc:1..3'
];

for (const q of queries) {
	console.log(`\n================= QUERY: "${q}" =================`);
	const res = parser.parse(q);
	console.log("AST:", JSON.stringify(res.ast, null, 2));
	console.log("AST Conditions:", JSON.stringify(res.astConditions, null, 2));
}
