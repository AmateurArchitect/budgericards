let isOpen = $state(false);
let title = $state('');
let message = $state('');
/** @type {string[]} */
let list = $state([]);
/** @type {((value: boolean) => void) | null} */
let resolveFn = null;

export const confirmStore = {
	get isOpen() { return isOpen; },
	get title() { return title; },
	get message() { return message; },
	get list() { return list; },

	/**
	 * @param {Object} options
	 * @param {string} [options.title]
	 * @param {string} [options.message]
	 * @param {string[]} [options.list]
	 * @returns {Promise<boolean>}
	 */
	show(options) {
		title = options.title || 'Warning';
		message = options.message || '';
		list = options.list || [];
		isOpen = true;

		return new Promise((resolve) => {
			resolveFn = resolve;
		});
	},

	confirm() {
		isOpen = false;
		if (resolveFn) {
			resolveFn(true);
			resolveFn = null;
		}
	},

	cancel() {
		isOpen = false;
		if (resolveFn) {
			resolveFn(false);
			resolveFn = null;
		}
	}
};
