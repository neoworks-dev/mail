// What the kernel hands the window once it is up, and how components under `Root.svelte` reach
// it. Components never receive the plugin `Context`: they get the services to draw from, and
// everything else goes through plugins.

import { getContext, setContext } from 'svelte'
import type { Context } from '@neoworks/extension-system'
import type { CommandsService } from './commands'
import type { KeymapService } from './keymap/service'
import type { PluginLoader } from './loader'
import type { SettingsService } from './settings/service'
import type { SidecarService } from './sidecar/service'
import type { SlotsService } from './slots'

export interface Kernel {
	/** The root plugin context. Only boot code and tests use it directly. */
	context: Context
	slots: SlotsService
	commands: CommandsService
	keymap: KeymapService
	settings: SettingsService
	sidecar: SidecarService
	loader: PluginLoader
	/** Resolves once every plugin has settled as active, waiting or failed. */
	loaded: Promise<void>
	/** Logs an error no plugin caught, such as a throwing slot entry. */
	reportError(source: string, error: unknown): void
}

const KERNEL_CONTEXT = Symbol('neomail.kernel')

export function provideKernel(kernel: Kernel): void {
	setContext(KERNEL_CONTEXT, kernel)
}

/** The kernel, for a component rendered under `Root.svelte`. */
export function useKernel(): Kernel {
	const kernel = getContext<Kernel | undefined>(KERNEL_CONTEXT)
	if (!kernel) {
		throw new Error('useKernel() was called outside the kernel root component')
	}
	return kernel
}
