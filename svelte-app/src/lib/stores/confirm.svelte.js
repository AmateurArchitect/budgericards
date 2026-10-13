let isOpen = $state(false);
let title = $state('');
let message = $state('');
let prompt = $state('');
let confirmText = $state('Confirm');
let cancelText = $state('Cancel');
/** @type {'default' | 'destructive'} */
let variant = $state('default');
/** @type {string[]} */
let list = $state([]);
/** @type {((value: boolean) => void) | null} */
let resolveFn = null;

export const confirmStore = {
	get isOpen() { return isOpen; },
	get title() { return title; },
	get message() { return message; },
	get prompt() { return prompt; },
	get confirmText() { return confirmText; },
	get cancelText() { return cancelText; },
	get variant() { return variant; },
	get list() { return list; },

	/**
	 * @param {Object} options
	 * @param {string} [options.title]
	 * @param {string} [options.message]
	 * @param {string} [options.prompt]
	 * @param {string} [options.confirmText]
	 * @param {string} [options.cancelText]
	 * @param {'default' | 'destructive'} [options.variant]
	 * @param {string[]} [options.list]
	 * @returns {Promise<boolean>}
	 */
	show(options) {
		title = options.title || 'Confirm';
		message = options.message || '';
		prompt = options.prompt || (options.list && options.list.length > 0 ? 'Would you like to save the rest of the deck?' : '');
		confirmText = options.confirmText || (options.variant === 'destructive' ? 'Delete' : 'OK');
		cancelText = options.cancelText || 'Cancel';
		variant = options.variant || 'default';
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
