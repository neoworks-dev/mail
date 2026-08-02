// Compile the nib agent server into resources/nib/dist/<platform>-<arch>/ for
// a packaged build. Development runs nib from the sibling checkout through bun
// instead, so this only matters when producing a distributable.
//
// Absence-tolerant: a missing checkout warns and exits 0 so `npm run build`
// still works; the agent pane then reports the runtime as missing.

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const target = process.env.NIB_TARGET || `${process.platform}-${process.arch}`
const rootDir = join(import.meta.dirname, '..', 'resources', 'nib', 'dist')
const targetDir = join(rootDir, target)
const binaryName = target.startsWith('win32') ? 'nib-server.exe' : 'nib-server'
const binaryPath = join(targetDir, binaryName)

/** Where nib's source lives. NEOMAIL_NIB wins, else the sibling checkout. */
function checkoutPath(): string {
	const configured = process.env.NEOMAIL_NIB
	if (configured) return resolve(configured)
	return join(import.meta.dirname, '..', '..', '..', '..', 'nib')
}

function fail(message: string): never {
	console.warn(`build-nib: ${message}`)
	console.warn('build-nib: the packaged build will have no agent server.')
	process.exit(0)
}

function revisionOf(checkout: string): string {
	const result = spawnSync('git', ['-C', checkout, 'rev-parse', 'HEAD'], { encoding: 'utf8' })
	if (result.status !== 0) return 'unknown'
	return result.stdout.trim()
}

async function main(): Promise<void> {
	const checkout = checkoutPath()
	const entry = join(checkout, 'src', 'index.ts')
	if (!existsSync(entry)) fail(`no nib checkout at ${checkout} (set NEOMAIL_NIB)`)

	// Skip when the compiled binary already matches the checkout's revision.
	const revision = revisionOf(checkout)
	const stampPath = join(rootDir, `.stamp-${target}`)
	if (existsSync(binaryPath) && existsSync(stampPath)) {
		const stamped = await readFile(stampPath, 'utf8')
		if (stamped.trim() === revision && revision !== 'unknown') {
			console.log(`build-nib: ${revision.slice(0, 8)} for ${target} already built`)
			return
		}
	}

	await mkdir(targetDir, { recursive: true })
	console.log(`build-nib: compiling ${entry} → ${binaryPath}`)
	const result = spawnSync('bun', ['build', '--compile', entry, '--outfile', binaryPath], {
		cwd: checkout,
		stdio: 'inherit'
	})
	if (result.status !== 0) {
		await rm(binaryPath, { force: true })
		fail('bun build --compile failed')
	}

	await writeFile(stampPath, `${revision}\n`)
	console.log(`build-nib: built ${revision.slice(0, 8)} for ${target}`)
}

await main()
