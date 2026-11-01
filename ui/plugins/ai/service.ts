// The `ai` service: one-shot generations through the nib agent server, for summaries, drafts,
// extractions and the digest. Each makes an ephemeral session, sends one message, streams the
// answer and deletes the session when the turn ends, so one-shots never fill the session list
// the assistant shows. Also offers `nib`, the relay to nib's HTTP API the assistant uses.

import type { Context } from '@neoworks/extension-system'
import type { NibResponse } from '../../../shared/routes'
import type { CreateSessionOptions, SessionEvent, SessionSnapshot } from '../../nib/types'

declare module '@neoworks/extension-system' {
	interface Context {
		ai: AiService
	}
}

export interface GenerateOptions {
	title: string
	systemPrompt: string
	userMessage: string
	/** Called with the text so far after every delta. */
	onText?: (text: string) => void
}

export interface GenerateHandle {
	result: Promise<string>
	cancel: () => void
}

export class NibError extends Error {
	constructor(
		message: string,
		public status: number
	) {
		super(message)
		this.name = 'NibError'
	}
}

export class AiService {
	private streamHandlers = new Map<number, (event: SessionEvent) => void>()
	private streamEndHandlers = new Map<number, (error: string | null) => void>()

	constructor(private ctx: Context) {
		ctx.sidecar.on('nib.stream', (message) => {
			const handler = this.streamHandlers.get(message.streamId)
			if (!handler) return
			const payload = JSON.parse(message.data) as Record<string, unknown>
			handler({ ...payload, seq: Number(message.id) } as unknown as SessionEvent)
		})
		ctx.sidecar.on('nib.streamEnd', (message) => {
			const handler = this.streamEndHandlers.get(message.streamId)
			this.streamHandlers.delete(message.streamId)
			this.streamEndHandlers.delete(message.streamId)
			if (handler) handler(message.error)
		})
	}

	/** A JSON request to nib's API; rejects with nib's own error message on a failure status. */
	async request<Result>(method: string, path: string, body?: unknown): Promise<Result> {
		const request: { method: string; path: string; headers?: Record<string, string>; body?: string } = { method, path }
		if (body !== undefined) {
			request.headers = { 'content-type': 'application/json' }
			request.body = JSON.stringify(body)
		}
		const response = await this.ctx.sidecar.call('nib.request', request)
		return parseResponse<Result>(response)
	}

	/** Tails a session's events until the returned function runs. */
	async stream(path: string, onEvent: (event: SessionEvent) => void, onEnd?: (error: string | null) => void): Promise<() => void> {
		const streamId = await this.ctx.sidecar.call('nib.openStream', path)
		this.streamHandlers.set(streamId, onEvent)
		if (onEnd) this.streamEndHandlers.set(streamId, onEnd)
		return () => {
			this.streamHandlers.delete(streamId)
			this.streamEndHandlers.delete(streamId)
			void this.ctx.sidecar.call('nib.closeStream', streamId).catch(() => {})
		}
	}

	generate(options: GenerateOptions): GenerateHandle {
		let cancelled = false
		let sessionId: string | null = null
		let stopStream: (() => void) | null = null

		const cleanup = (): void => {
			if (stopStream) stopStream()
			stopStream = null
			if (sessionId) void this.request('DELETE', `/v1/sessions/${sessionId}`).catch(() => {})
			sessionId = null
		}

		const result = new Promise<string>((resolve, reject) => {
			let text = ''
			let sawRunning = false
			const onEvent = (event: SessionEvent): void => {
				if (event.type === 'session.status_running') sawRunning = true
				if (event.type === 'agent.message_delta') {
					text += event.text
					if (options.onText) options.onText(text)
				}
				if (event.type === 'session.error') {
					cleanup()
					reject(new Error(event.message))
				}
				// The session starts idle; only the idle after this turn ends it.
				if (event.type === 'session.status_idle' && sawRunning) {
					cleanup()
					resolve(text)
				}
			}

			void (async () => {
				try {
					const status = await this.ctx.sidecar.call('nib.start')
					if (!status.running) throw new Error(status.error || 'the agent server is not running')
					const createOptions: CreateSessionOptions = { title: options.title, appendSystemPrompt: options.systemPrompt }
					const session = await this.request<SessionSnapshot>('POST', '/v1/sessions', createOptions)
					sessionId = session.id
					if (cancelled) {
						cleanup()
						return
					}
					stopStream = await this.stream(`/v1/sessions/${session.id}/stream?after=0`, onEvent)
					await this.request('POST', `/v1/sessions/${session.id}/events`, {
						events: [{ type: 'user.message', content: [{ type: 'text', text: options.userMessage }] }]
					})
				} catch (error) {
					cleanup()
					reject(error instanceof Error ? error : new Error(String(error)))
				}
			})()
		})

		return {
			result,
			cancel: () => {
				cancelled = true
				if (!sessionId) {
					cleanup()
					return
				}
				const interrupted = sessionId
				void this.request('POST', `/v1/sessions/${interrupted}/events`, { events: [{ type: 'user.interrupt' }] })
					.catch(() => {})
					.finally(cleanup)
			}
		}
	}
}

function parseResponse<Result>(response: NibResponse): Result {
	if (response.status < 200 || response.status >= 300) {
		throw new NibError(nibErrorMessage(response.status, response.body), response.status)
	}
	if (response.body.trim() === '') return undefined as Result
	return JSON.parse(response.body) as Result
}

function nibErrorMessage(status: number, text: string): string {
	try {
		const body = JSON.parse(text) as { error?: { message?: string } }
		if (body.error && body.error.message) return body.error.message
	} catch {
		// Not a problem document.
	}
	if (text.trim() !== '') return text
	return `HTTP ${status}`
}
