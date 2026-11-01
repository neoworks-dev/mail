// Where the sidecar keeps its files. The directory is the one the Electron app used
// (`~/.config/neoworks-mail`), so the database, the downloaded models and the settings carry
// over. `NEOMAIL_DATA_DIR` points it elsewhere, which tests and trial runs use to stay off the
// real mailbox.

import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

declare module '@neoworks/extension-system' {
	interface Context {
		paths: SidecarPaths
	}
}

export interface SidecarPaths {
	/** The data directory; it exists once `resolvePaths` returns. */
	data: string
	/** A file or directory inside the data directory. */
	file(...segments: string[]): string
	/** The checkout's root, for resources that ship beside the sidecar. */
	appRoot: string
}

const APP_DIRECTORY_NAME = 'neoworks-mail'

export function resolvePaths(): SidecarPaths {
	const data = dataDirectory()
	mkdirSync(data, { recursive: true })
	return {
		data,
		file: (...segments) => join(data, ...segments),
		appRoot: join(import.meta.dir, '..', '..')
	}
}

function dataDirectory(): string {
	const override = process.env.NEOMAIL_DATA_DIR
	if (override && override !== '') return override
	const configHome = process.env.XDG_CONFIG_HOME
	if (configHome && configHome !== '') return join(configHome, APP_DIRECTORY_NAME)
	return join(homedir(), '.config', APP_DIRECTORY_NAME)
}
