// The `rpc` service: the routes the UI can call and the events it hears. A plugin registers a
// route with `handle`, which is tracked on its fiber, so unloading the plugin takes its routes
// with it and a call to one afterwards answers `UnknownRoute` instead of reaching dead code.

import { Service, type Context } from '@neoworks/extension-system'
import type { Frame, RequestFrame, ResponseFrame, RpcError } from '../../shared/rpc'
import type { PushEvents, RouteHandler, RouteName } from '../../shared/routes'
import type { Transport } from './transport'

declare module '@neoworks/extension-system' {
	interface Context {
		rpc: RpcService
	}
}

type AnyHandler = (...args: unknown[]) => unknown

/** An error a route throws on purpose, with a code the UI can branch on. */
export class RouteError extends Error {
	constructor(
		public code: string,
		message: string
	) {
		super(message)
		this.name = 'RouteError'
	}
}

export class RpcService extends Service {
	private handlers = new Map<string, { handler: AnyHandler; owner: string }>()
	private transport: Transport
	/** Requests that arrived while the plugins were still loading, answered once they have. */
	private heldBack: RequestFrame[] | null = []

	constructor(ctx: Context, transport: Transport) {
		super(ctx, 'rpc')
		this.transport = transport
		transport.onFrame((frame) => this.receive(frame))
	}

	/** Serves a route until the calling plugin unloads, or the returned function is called. */
	handle<Name extends RouteName>(channel: Name, handler: RouteHandler<Name>): () => void {
		const owner = this.ctx.fiber.name
		return this.ctx.effect(() => {
			const existing = this.handlers.get(channel)
			if (existing) {
				throw new Error(`route "${channel}" is already served by ${existing.owner}`)
			}
			const registration = { handler: handler as AnyHandler, owner }
			this.handlers.set(channel, registration)
			return () => {
				if (this.handlers.get(channel) === registration) this.handlers.delete(channel)
			}
		}, `rpc.handle(${channel})`)
	}

	/** Pushes an event to the UI. */
	broadcast<Name extends keyof PushEvents>(channel: Name, payload: PushEvents[Name]): void {
		this.transport.send({ kind: 'event', channel, payload })
	}

	/** Every route served now, for diagnostics. */
	channels(): string[] {
		return [...this.handlers.keys()].sort()
	}

	/** Answers the requests held back during startup, and every one from now on at once. */
	open(): void {
		const waiting = this.heldBack
		this.heldBack = null
		if (!waiting) return
		for (const frame of waiting) void this.answer(frame)
	}

	private receive(frame: Frame): void {
		if (frame.kind !== 'request') return
		if (this.heldBack) {
			this.heldBack.push(frame)
			return
		}
		void this.answer(frame)
	}

	private async answer(frame: RequestFrame): Promise<void> {
		const registration = this.handlers.get(frame.channel)
		if (!registration) {
			this.respond({
				kind: 'response',
				id: frame.id,
				error: { message: `no route "${frame.channel}"`, code: 'UnknownRoute' }
			})
			return
		}
		try {
			const result = await registration.handler(...frame.args)
			this.respond({ kind: 'response', id: frame.id, result: result ?? null })
		} catch (error) {
			this.respond({ kind: 'response', id: frame.id, error: describeError(error) })
			if (!(error instanceof RouteError)) {
				this.ctx.logger('rpc').warn(`${frame.channel} failed: ${describeError(error).message}`)
			}
		}
	}

	private respond(frame: ResponseFrame): void {
		this.transport.send(frame)
	}
}

function describeError(error: unknown): RpcError {
	if (error instanceof RouteError) return { message: error.message, code: error.code }
	if (error instanceof Error) return { message: error.message }
	return { message: String(error) }
}
