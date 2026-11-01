// Bundles the UI into one script for the host to run. `--watch` rebuilds on every source
// change; `--watch --host BINARY` also starts the host, reloading the window on each build.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { build } from '@neoworks/svelte-gpui/build'

const here = (path) => fileURLToPath(new URL(path, import.meta.url))

const watch = process.argv.includes('--watch')
const hostFlag = process.argv.indexOf('--host')

await build({
	entry: here('./ui/main.ts'),
	outfile: here('./dist/neomail.js'),
	watch
})

if (watch && hostFlag !== -1) {
	const host = process.argv[hostFlag + 1]
	const child = spawn(host, ['--bundle', here('./dist/neomail.js'), '--watch'], {
		stdio: 'inherit'
	})
	child.on('exit', (code) => process.exit(code ?? 0))
}
