// The frames the UI and the sidecar exchange, one JSON object per line. The host relays them
// without reading them (host/src/sidecar.rs): a request goes in on the sidecar's stdin, and a
// response or an event comes out on its stdout.
//
// Plain TypeScript with no Node or host APIs, so it runs in the UI's QuickJS and under Bun.

export interface RequestFrame {
	kind: 'request'
	id: number
	channel: string
	args: unknown[]
}

export interface RpcError {
	message: string
	code?: string
}

export interface ResponseFrame {
	kind: 'response'
	id: number
	result?: unknown
	error?: RpcError
}

export interface EventFrame {
	kind: 'event'
	channel: string
	payload: unknown
}

export type Frame = RequestFrame | ResponseFrame | EventFrame

/** An error a route answered with, carrying the code the sidecar gave it. */
export class RemoteError extends Error {
	code: string | undefined

	constructor(error: RpcError) {
		super(error.message)
		this.name = 'RemoteError'
		this.code = error.code
	}
}

interface PendingCall {
	resolve: (value: unknown) => void
	reject: (error: Error) => void
}

/**
 * The calling end: numbers each request, and settles it when its response arrives. It does not
 * know how frames travel; `send` carries them and `receive` is called with every response.
 */
export class RpcCaller {
	private nextId = 1
	private pending = new Map<number, PendingCall>()

	constructor(private send: (frame: RequestFrame) => void) {}

	call(channel: string, args: unknown[]): Promise<unknown> {
		const id = this.nextId
		this.nextId += 1
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject })
			this.send({ kind: 'request', id, channel, args })
		})
	}

	/** Settles the call a response answers; a response nobody waits for is dropped. */
	receive(frame: ResponseFrame): void {
		const call = this.pending.get(frame.id)
		if (!call) return
		this.pending.delete(frame.id)
		if (frame.error) {
			call.reject(new RemoteError(frame.error))
			return
		}
		call.resolve(frame.result)
	}

	/** Fails one call, for a request that could not be sent. */
	fail(id: number, error: Error): void {
		const call = this.pending.get(id)
		if (!call) return
		this.pending.delete(id)
		call.reject(error)
	}

	/** Fails every call still waiting, when the other end is gone. */
	failAll(message: string): void {
		const calls = [...this.pending.values()]
		this.pending.clear()
		for (const call of calls) {
			call.reject(new Error(message))
		}
	}

	pendingCount(): number {
		return this.pending.size
	}
}

/** Whether a parsed line is a frame at all, before its kind is trusted. */
export function isFrame(value: unknown): value is Frame {
	if (typeof value !== 'object' || value === null) return false
	const kind = (value as { kind?: unknown }).kind
	return kind === 'request' || kind === 'response' || kind === 'event'
}
