// Mounts the UI's plugins and keeps track of how each one is doing, so a plugin that throws
// shows up in the window instead of silently leaving a hole. Plugins mount in parallel and each
// activates once what it injects exists.

import { FiberState, type Context, type Fiber, type Plugin } from '@neoworks/extension-system'
import { createChangeSignal, type ChangeSignal } from './reactive'

export interface UiPlugin {
	name: string
	inject?: string[] | Record<string, unknown>
	apply(ctx: Context, config?: unknown): void | Promise<void>
}

export interface PluginFailure {
	name: string
	message: string
}

export class PluginLoader {
	private fibers: Array<{ name: string; fiber: Fiber }> = []
	private failed = new Map<string, string>()
	private changes: ChangeSignal = createChangeSignal()

	constructor(private context: Context) {}

	/** Mounts plugins; resolves once each is active, failed or waiting for a dependency. */
	async mount(plugins: UiPlugin[]): Promise<void> {
		await Promise.all(plugins.map((plugin) => this.mountOne(plugin)))
	}

	/** The plugins that failed, with why. Reactive. */
	failures(): PluginFailure[] {
		this.changes.track()
		return [...this.failed.entries()].map(([name, message]) => ({ name, message }))
	}

	/** Each mounted plugin's state, for diagnostics. */
	states(): Array<{ name: string; state: FiberState }> {
		return this.fibers.map((entry) => ({ name: entry.name, state: entry.fiber.state }))
	}

	private mountOne(plugin: UiPlugin): Promise<void> {
		const fiber = this.context.plugin(plugin as Plugin)
		this.fibers.push({ name: plugin.name, fiber })
		const outcome = fiber.then(
			() => undefined,
			(error: unknown) => this.recordFailure(plugin.name, error)
		)
		return Promise.race([outcome, settledWhilePending(fiber)])
	}

	private recordFailure(name: string, error: unknown): void {
		const message = error instanceof Error ? error.message : String(error)
		this.context.logger('loader').error(`plugin ${name} failed`, error)
		this.failed.set(name, message)
		this.changes.notify()
	}
}

/** Resolves on the next tick when the fiber is waiting for a dependency, so boot does not hang on it. */
function settledWhilePending(fiber: Fiber): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(() => {
			if (fiber.state === FiberState.PENDING) resolve()
		}, 0)
	})
}
