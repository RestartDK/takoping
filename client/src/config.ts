/**
 * Application configuration
 * All environment variables should be accessed through this file
 */

export const config = {
	/**
	 * API Base URL
	 * Set via VITE_API_BASE environment variable
	 * Falls back to http://localhost:3000 for local development
	 */
	apiBase: import.meta.env.VITE_API_BASE,
} as const;
