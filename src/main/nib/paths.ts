// Where the nib agent server comes from. Packaged builds ship a compiled
// binary via electron-builder extraResources; development runs a sibling
// checkout through bun, so nib changes are picked up by restarting the app.

import { app } from 'electron'
import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export interface NibLaunch {
	command: string
	args: string[]
	cwd: string
	/** The checkout or binary this resolves to, for error messages. */
	source: string
}

function packagedBinary(): string {
	const name = process.platform === 'win32' ? 'nib-server.exe' : 'nib-server'
	return join(process.resourcesPath, 'nib', 'dist', `${process.platform}-${process.arch}`, name)
}

/** The nib source checkout used in development. NEOMAIL_NIB overrides it. */
function sourceCheckout(): string {
	const configured = process.env.NEOMAIL_NIB
	if (configured) return resolve(configured)
	// apps/neoworks-mail -> monorepo sibling checkout ../../../nib
	return join(app.getAppPath(), '..', '..', '..', 'nib')
}

/** The command line for the nib server, or null when it is not installed. */
export function nibLaunch(): NibLaunch | null {
	if (app.isPackaged) {
		const binary = packagedBinary()
		if (!existsSync(binary)) return null
		return { command: binary, args: [], cwd: homedir(), source: binary }
	}

	const checkout = sourceCheckout()
	const entry = join(checkout, 'src', 'index.ts')
	if (!existsSync(entry)) return null
	return { command: 'bun', args: ['run', entry], cwd: checkout, source: checkout }
}

/**
 * Where nib keeps sessions, extensions and per-project memory. Scoped to the
 * app's userData rather than ~/.nib so the embedded server never shares state
 * with a nib the user runs themselves.
 */
export function nibDataDir(): string {
	return join(app.getPath('userData'), 'nib')
}

/** App-owned extensions, copied into the data dir where nib always trusts them. */
export function bundledNibExtensionsDir(): string {
	if (app.isPackaged) return join(process.resourcesPath, 'nib', 'extensions')
	return join(app.getAppPath(), 'resources', 'nib', 'extensions')
}

/** App-owned slash-command prompt templates, copied next to the extensions. */
export function bundledNibPromptsDir(): string {
	if (app.isPackaged) return join(process.resourcesPath, 'nib', 'prompts')
	return join(app.getAppPath(), 'resources', 'nib', 'prompts')
}

// A unix socket address is a fixed-size struct field; anything past ~108 bytes
// is silently rejected with EINVAL at connect time. Leave headroom.
const MAX_SOCKET_PATH = 100

export function nibSocketPath(): string {
	const userData = app.getPath('userData')
	const preferred = join(userData, 'sock', 'nib.sock')
	if (Buffer.byteLength(preferred) <= MAX_SOCKET_PATH) return preferred

	const hash = createHash('sha256').update(userData).digest('hex').slice(0, 12)
	return join(tmpdir(), `neomail-nib-${hash}.sock`)
}
