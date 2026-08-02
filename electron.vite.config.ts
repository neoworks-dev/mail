import { svelte } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Externalize node deps so native modules (better-sqlite3) and the mail
// libraries load from node_modules at runtime instead of being bundled.
export default defineConfig({
	main: {
		plugins: [externalizeDepsPlugin()]
	},
	preload: {
		plugins: [externalizeDepsPlugin()]
	},
	renderer: {
		plugins: [tailwindcss(), svelte()]
	}
})
