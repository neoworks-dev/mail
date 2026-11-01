// Provides `opener` and serves the desktop routes: opening a link in the system's browser or
// mail app, and showing a notification. Both hand off to the desktop's own tools
// (`xdg-open`, `notify-send`) and return at once.

import type { Context } from '@neoworks/extension-system'
import { spawn } from 'node:child_process'
import { RouteError } from '../../kernel/rpc'

declare module '@neoworks/extension-system' {
	interface Context {
		opener: Opener
	}
}

export interface Opener {
	/** Opens an http(s) or mailto address; anything else is refused, as mail content picks it. */
	openUrl(url: string): void
	notify(title: string, body: string): void
}

const OPENABLE_SCHEMES = ['http:', 'https:', 'mailto:']

export const system = {
	name: 'system',
	inject: ['rpc'],
	apply(ctx: Context) {
		const opener: Opener = {
			openUrl: (url) => {
				if (!isOpenable(url)) throw new RouteError('NotAllowed', `refusing to open "${url}"`)
				detached(openerCommand(), [url])
			},
			notify: (title, body) => {
				detached('notify-send', ['--app-name=Neomail', title, body])
			}
		}
		ctx.provide('opener', opener)
		ctx.rpc.handle('system.openUrl', (url) => opener.openUrl(url))
		ctx.rpc.handle('system.notify', (title, body) => opener.notify(title, body))
	}
}

function isOpenable(url: string): boolean {
	try {
		return OPENABLE_SCHEMES.includes(new URL(url).protocol)
	} catch {
		return false
	}
}

function openerCommand(): string {
	if (process.platform === 'darwin') return 'open'
	return 'xdg-open'
}

/** Starts a program the sidecar does not wait for; a missing one is logged, not thrown. */
function detached(command: string, args: string[]): void {
	const child = spawn(command, args, { stdio: 'ignore', detached: true })
	child.on('error', (error) => console.error(`[system] ${command} failed: ${error.message}`))
	child.unref()
}
