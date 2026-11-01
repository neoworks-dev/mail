// Keeps the UI's preferences in `ui-settings.json` in the data directory. Written through a
// temporary file and a rename, so a crash mid-write never leaves half a file.

import type { Context } from '@neoworks/extension-system'
import { readFile, rename, writeFile } from 'node:fs/promises'

export const settings = {
	name: 'settings',
	inject: ['paths', 'rpc'],
	apply(ctx: Context) {
		const path = ctx.paths.file('ui-settings.json')

		ctx.rpc.handle('settings.load', async () => {
			try {
				const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
				if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
					return parsed as Record<string, unknown>
				}
			} catch {
				// Missing or malformed: start from defaults.
			}
			return {}
		})

		ctx.rpc.handle('settings.save', async (values) => {
			const temporary = `${path}.${process.pid}.tmp`
			await writeFile(temporary, JSON.stringify(values, null, '\t'))
			await rename(temporary, path)
		})
	}
}
