// The `sidecar` service: the mail engine as the UI sees it. Plugins call routes with `call` and
// hear events with `on`; the frames travel through the host (host/src/sidecar.rs), which this
// reaches through a `SidecarBridge`, so tests can stand in a fake one. A sidecar that is
// starting makes calls wait; one that has ended makes them fail with `SidecarUnavailableError`,
// and `status()` says so to whoever shows it.

import { Service, type Context } from '@neoworks/extension-system'
import { RpcCaller, type RequestFrame, type ResponseFrame } from '../../../shared/rpc'
import type { PushEvents, RouteArgs, RouteName, RouteResult } from '../../../shared/routes'
import { createChangeSignal, type ChangeSignal } from '../reactive'

declare module '@neoworks/extension-system' {
	interface Context {
		sidecar: SidecarService
	}
}

export interface HostSidecarStatus {
	state: 'running' | 'exited' | 'disabled'
	pid?: number
	code?: number | null
	message?: string
}

/** How frames reach the sidecar and how its answers come back. */
export interface SidecarBridge {
	/** Hands a request to the host; rejects when the host cannot deliver it. */
	send(frame: RequestFrame): Promise<unknown>
	onReply(handler: (frame: ResponseFrame) => void): () => void
	onEvent(channel: string, handler: (payload: unknown) => void): () => void
	onExit(handler: (exit: { message: string }) => void): () => void
	status(): Promise<HostSidecarStatus>
}

export interface SidecarState {
	state: 'starting' | 'running' | 'exited'
	message?: string
}

export class SidecarUnavailableError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'SidecarUnavailableError'
	}
}

export class SidecarService extends Service {
	private bridge: SidecarBridge
	private caller: RpcCaller
	private current: SidecarState = { state: 'starting' }
	private changes: ChangeSignal = createChangeSignal()
	private waiting: Array<() => void> = []

	constructor(ctx: Context, bridge: SidecarBridge) {
		super(ctx, 'sidecar')
		this.bridge = bridge
		this.caller = new RpcCaller((frame) => this.deliver(frame))
		ctx.effect(() => bridge.onReply((frame) => this.caller.receive(frame)), 'sidecar replies')
		ctx.effect(
			() =>
				bridge.onExit((exit) => {
					this.caller.failAll(exit.message)
					this.settle({ state: 'exited', message: exit.message })
				}),
			'sidecar exit'
		)
		void this.connect()
	}

	/** How the sidecar is doing. Reactive. */
	status(): SidecarState {
		this.changes.track()
		return this.current
	}

	/** Calls a route. Waits while the sidecar starts; rejects once it has ended. */
	async call<Name extends RouteName>(channel: Name, ...args: RouteArgs<Name>): Promise<RouteResult<Name>> {
		if (this.current.state === 'starting') await this.untilSettled()
		if (this.current.state === 'exited') {
			throw new SidecarUnavailableError(this.current.message ?? 'the mail engine is not running')
		}
		const result = await this.caller.call(channel, args)
		return result as RouteResult<Name>
	}

	/** Hears an event the sidecar pushes, until the calling plugin unloads or the returned function runs. */
	on<Name extends keyof PushEvents>(channel: Name, handler: (payload: PushEvents[Name]) => void): () => void {
		return this.ctx.effect(
			() => this.bridge.onEvent(channel, (payload) => handler(payload as PushEvents[Name])),
			`sidecar.on(${channel})`
		)
	}

	private deliver(frame: RequestFrame): void {
		this.bridge.send(frame).catch((error: Error) => this.caller.fail(frame.id, error))
	}

	/** Learns whether the host started the sidecar, then waits for it to answer. */
	private async connect(): Promise<void> {
		try {
			const host = await this.bridge.status()
			if (host.state !== 'running') {
				this.settle({ state: 'exited', message: host.message ?? 'the mail engine is not running' })
				return
			}
			await this.caller.call('sidecar.info', [])
			this.settle({ state: 'running' })
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.settle({ state: 'exited', message })
		}
	}

	private settle(state: SidecarState): void {
		this.current = state
		this.changes.notify()
		for (const resume of this.waiting.splice(0)) resume()
	}

	private untilSettled(): Promise<void> {
		return new Promise((resolve) => this.waiting.push(resolve))
	}
}
