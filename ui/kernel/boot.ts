// Boots the UI kernel: the root context, its services (sidecar, settings, commands, keymap,
// slots), then every plugin. The window is already up while this runs and fills in as plugins
// activate, so one that is slow or broken never holds the window back.

import { Context } from '@neoworks/extension-system'
import { CommandsService } from './commands'
import type { Kernel } from './kernel'
import { KeymapService } from './keymap/service'
import { PluginLoader, type UiPlugin } from './loader'
import { mountHostLogExporter } from './logging'
import { SettingsService } from './settings/service'
import { SidecarService, type SidecarBridge } from './sidecar/service'
import { SlotsService } from './slots'

export interface BootOptions {
	plugins: UiPlugin[]
	bridge: SidecarBridge
}

export async function bootKernel(options: BootOptions): Promise<Kernel> {
	const context = new Context()
	mountHostLogExporter(context)
	await context.plugin(SidecarService, options.bridge)
	await context.plugin(SettingsService)
	await context.plugin(CommandsService)
	await context.plugin(KeymapService)
	await context.plugin(SlotsService)

	const loader = new PluginLoader(context)
	const loaded = loader.mount(options.plugins)
	return {
		context,
		slots: context.slots,
		commands: context.commands,
		keymap: context.keymap,
		settings: context.settings,
		sidecar: context.sidecar,
		loader,
		loaded,
		reportError(source, error) {
			context.logger(source).error(error)
		}
	}
}
