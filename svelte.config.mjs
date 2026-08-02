import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

export default {
	preprocess: vitePreprocess(),
	compilerOptions: {
		// Force runes mode everywhere except third-party node_modules; our own
		// workspace ui package is authored in runes.
		runes: (/** @type {{ filename: string }} */ { filename }) => {
			if (filename.includes('@neoworks-dev')) return true
			if (filename.includes('packages/ui')) return true
			return filename.split(/[/\\]/).includes('node_modules') ? undefined : true
		}
	}
}
