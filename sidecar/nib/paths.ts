// Where the nib agent server comes from and where it keeps its state. A packaged build ships
// a compiled binary under `resources/dist`; development runs a sibling checkout through bun, so
// nib changes are picked up by restarting the app.

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

export interface NibLocations {
	/** The app's data directory. */
	dataDirectory: string
	/** The checkout's root. */
	appRoot: string
}

function resourcesDirectory(locations: NibLocations): string {
	return join(locations.appRoot, 'sidecar', 'nib', 'resources')
}

function compiledBinary(locations: NibLocations): string {
	const name = process.platform === 'win32' ? 'nib-server.exe' : 'nib-server'
	return join(resourcesDirectory(locations), 'dist', `${process.platform}-${process.arch}`, name)
}

/** The nib source checkout used in development. NEOMAIL_NIB overrides it. */
function sourceCheckout(locations: NibLocations): string {
	const configured = process.env.NEOMAIL_NIB
	if (configured) return resolve(configured)
	return join(locations.appRoot, '..', 'nib')
}

/** The command line for the nib server, or null when it is not installed. */
export function nibLaunch(locations: NibLocations): NibLaunch | null {
	const binary = compiledBinary(locations)
	if (existsSync(binary)) {
		return { command: binary, args: [], cwd: homedir(), source: binary }
	}

	const checkout = sourceCheckout(locations)
	const entry = join(checkout, 'src', 'index.ts')
	if (!existsSync(entry)) return null
	return { command: 'bun', args: ['run', entry], cwd: checkout, source: checkout }
}

/**
 * Where nib keeps sessions, extensions and per-project memory. Scoped to the app's data
 * directory rather than ~/.nib so the embedded server never shares state with a nib the user
 * runs themselves.
 */
export function nibDataDir(locations: NibLocations): string {
	return join(locations.dataDirectory, 'nib')
}

/** App-owned extensions, copied into the data dir where nib always trusts them. */
export function bundledNibExtensionsDir(locations: NibLocations): string {
	return join(resourcesDirectory(locations), 'extensions')
}

/** App-owned slash-command prompt templates, copied next to the extensions. */
export function bundledNibPromptsDir(locations: NibLocations): string {
	return join(resourcesDirectory(locations), 'prompts')
}

// A unix socket address is a fixed-size struct field; anything past ~108 bytes
// is silently rejected with EINVAL at connect time. Leave headroom.
const MAX_SOCKET_PATH = 100

export function nibSocketPath(locations: NibLocations): string {
	const preferred = join(locations.dataDirectory, 'sock', 'nib.sock')
	if (Buffer.byteLength(preferred) <= MAX_SOCKET_PATH) return preferred

	const hash = createHash('sha256').update(locations.dataDirectory).digest('hex').slice(0, 12)
	return join(tmpdir(), `neomail-nib-${hash}.sock`)
}
