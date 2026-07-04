/**
 * Processes an array of items in parallel chunks to avoid resource exhaustion.
 *
 * @template T, R
 * @param {T[]} items - The array of items to process.
 * @param {number} batchSize - How many items to process concurrently.
 * @param {(item: T, index: number) => Promise<R>} fn - The async function to run on each item.
 * @returns {Promise<R[]>}
 */
export async function batchProcess(items, batchSize, fn) {
	const results = [];
	for (let i = 0; i < items.length; i += batchSize) {
		const batch = items.slice(i, i + batchSize);
		const batchResults = await Promise.all(
			batch.map((item, index) => fn(item, i + index))
		);
		results.push(...batchResults);
	}
	return results;
}
