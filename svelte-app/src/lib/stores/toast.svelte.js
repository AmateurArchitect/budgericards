/** @type {any[]} */
let toasts = $state([]);

export const toastStore = {
	get toasts() { return toasts; },

	/**
	 * @param {string} message
	 * @param {{ type?: 'info' | 'success' | 'warning' | 'error', duration?: number }} [options]
	 */
	show(message, options = {}) {
		const id = Math.random().toString(36).substring(2, 9);
		const type = options.type || 'info';
		const duration = options.duration !== undefined ? options.duration : 4000;

		const newToast = {
			id,
			message,
			type,
			action: options.action,
			actionLabel: options.actionLabel,
			shortcutHint: options.shortcutHint
		};

		toasts = [...toasts, newToast];

		if (duration > 0) {
			setTimeout(() => {
				this.dismiss(id);
			}, duration);
		}

		return id;
	},

	/**
	 * @param {string} id
	 */
	dismiss(id) {
		toasts = toasts.filter(t => t.id !== id);
	}
};
