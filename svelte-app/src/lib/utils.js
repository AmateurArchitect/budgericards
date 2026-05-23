import { clsx } from "clsx";

/**
 * @param {...import('clsx').ClassValue} inputs
 * @returns {string}
 */
export function cn(...inputs) {
	return clsx(inputs);
}
