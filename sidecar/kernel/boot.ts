// Boots the sidecar: the root context, the kernel's own services (paths and rpc), then every
// plugin. Plugins mount in parallel and each activates once what it injects exists, so the
// order of the list does not matter and a plugin that fails leaves the others running.
//
// When the host closes stdin, the plugins unload in reverse: their inverses log out of IMAP,
// flush the outbox and stop the agent server before the process exits.

import { Context, FiberState, Logger, LoggerLevel, type Exporter, type Fiber } from '@neoworks/extension-system'
import type { PluginReport } from '../../shared/routes'
import { resolvePaths } from './paths'
import { RpcService } from './rpc'
import { stdioTransport, type Transport } from './transport'

export interface SidecarPlugin {
	name: string
	inject?: string[] | Record<string, unknown>
	apply(ctx: Context, config?: unknown): void | Promise<void>
}

export interface SidecarKernel {
	context: Context
	fibers: Array<{ name: string; fiber: Fiber }>
	shutdown(): Promise<void>
}

const SHUTDOWN_TIMEOUT_MS = 15_000

export async function bootSidecar(plugins: SidecarPlugin[], transport: Transport = stdioTransport()): Promise<SidecarKernel> {
	const context = new Context()
	mountStderrExporter(context)
	context.provide('paths', resolvePaths())
	await context.plugin(RpcService, transport)

	const enabled = withoutDisabled(plugins)
	const fibers = enabled.map((plugin) => ({ name: plugin.name, fiber: context.plugin(plugin) }))
	for (const entry of fibers) {
		entry.fiber.then(undefined, (error: unknown) => {
			context.logger('kernel').error(`plugin ${entry.name} failed`, error)
		})
	}

	context.rpc.handle('sidecar.info', () => ({
		pid: process.pid,
		dataDirectory: context.paths.data,
		channels: context.rpc.channels(),
		plugins: fibers.map(reportFiber)
	}))

	const kernel: SidecarKernel = {
		context,
		fibers,
		shutdown: () => shutdown(fibers)
	}
	transport.onClose(() => {
		void kernel.shutdown().finally(() => process.exit(0))
	})
	return kernel
}

/** The plugins minus those `NEOMAIL_DISABLE` names (comma separated), such as `sync,neo` for test runs. */
function withoutDisabled(plugins: SidecarPlugin[]): SidecarPlugin[] {
	const disabled = (process.env.NEOMAIL_DISABLE ?? '').split(',').map((name) => name.trim())
	return plugins.filter((plugin) => !disabled.includes(plugin.name))
}

/** Unloads plugins last-mounted first, giving up after a timeout so the process always ends. */
async function shutdown(fibers: SidecarKernel['fibers']): Promise<void> {
	const unload = (async () => {
		for (const entry of [...fibers].reverse()) {
			try {
				await entry.fiber.dispose()
			} catch (error) {
				console.error(`[sidecar] unloading ${entry.name} failed:`, error)
			}
		}
	})()
	const timeout = new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS))
	await Promise.race([unload, timeout])
}

const STATE_NAMES: Record<FiberState, PluginReport['state']> = {
	[FiberState.PENDING]: 'pending',
	[FiberState.LOADING]: 'loading',
	[FiberState.ACTIVE]: 'active',
	[FiberState.FAILED]: 'failed',
	[FiberState.DISPOSED]: 'disposed',
	[FiberState.UNLOADING]: 'unloading'
}

function reportFiber(entry: { name: string; fiber: Fiber }): PluginReport {
	let error: string | null = null
	// The fiber keeps the error that failed it in a private field; this is diagnostics only.
	const failure = (entry.fiber as unknown as { _error?: unknown })._error
	if (failure instanceof Error) error = failure.message
	return { name: entry.name, state: STATE_NAMES[entry.fiber.state], error }
}

function mountStderrExporter(context: Context): void {
	const exporter: Exporter = {
		colors: false,
		levels: { default: LoggerLevel.INFO },
		export(message) {
			console.error(`[${message.name}] ${Logger.format(exporter, message)}`)
		}
	}
	context.logger.exporter(exporter)
}
