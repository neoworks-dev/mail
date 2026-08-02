// One-shot text generation through the embedded nib server: ephemeral
// session, one user message, stream the answer, resolve when the turn ends.
// The session is deleted afterwards so one-shots never pollute the session
// list the assistant pane shows. Powers thread summaries and AI reply drafts.

import {
	createSession,
	deleteSession,
	sendInterrupt,
	sendUserMessage,
	streamSession,
	type NibServerEvent
} from './client'

export interface GenerateOptions {
	title: string
	systemPrompt: string
	userMessage: string
	/** Called with the accumulated text after every delta. */
	onText: (text: string) => void
}

export interface GenerateHandle {
	result: Promise<string>
	cancel: () => void
}

export function generateOnce(options: GenerateOptions): GenerateHandle {
	let stopStream: (() => void) | null = null
	let cancelled = false
	let activeSessionId: string | null = null

	const cleanup = (): void => {
		if (stopStream) stopStream()
		if (activeSessionId) {
			void deleteSession(activeSessionId).catch(() => {})
			activeSessionId = null
		}
	}

	const result = new Promise<string>((resolve, reject) => {
		let text = ''
		let sawRunning = false

		const onEvent = (event: NibServerEvent): void => {
			if (event.type === 'session.status_running') {
				sawRunning = true
				return
			}
			if (event.type === 'agent.message_delta') {
				text += event.text
				options.onText(text)
				return
			}
			if (event.type === 'session.error') {
				cleanup()
				reject(new Error(event.message))
				return
			}
			// The session starts idle; only the idle after our turn ends it.
			if (event.type === 'session.status_idle' && sawRunning) {
				cleanup()
				resolve(text)
			}
		}

		void (async () => {
			try {
				const status = await window.neomail.nib.start()
				if (!status.running) {
					throw new Error(status.error || 'agent server is not running')
				}
				const session = await createSession({
					title: options.title,
					appendSystemPrompt: options.systemPrompt
				})
				activeSessionId = session.id
				if (cancelled) {
					cleanup()
					return
				}
				stopStream = streamSession(session.id, 0, onEvent)
				await sendUserMessage(session.id, options.userMessage)
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
			const sessionId = activeSessionId
			if (sessionId) {
				void sendInterrupt(sessionId)
					.catch(() => {})
					.finally(cleanup)
				return
			}
			cleanup()
		}
	}
}
