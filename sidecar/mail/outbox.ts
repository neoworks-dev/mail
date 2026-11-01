// Undo send: outgoing mail waits here before the SMTP transaction runs.
// Lives in the main process so a queued send survives window reloads and is
// flushed on quit instead of silently dropped.

import type { OutgoingMessage } from '../../shared/mail'

export const UNDO_SEND_DELAY_MS = 30_000

interface PendingSend {
	sendId: number
	input: OutgoingMessage
	timer: NodeJS.Timeout | null
	sendAt: number
}

export interface SendOutboxEvents {
	onSent: (sendId: number) => void
	onFailed: (sendId: number, errorMessage: string, input: OutgoingMessage) => void
}

export class SendOutbox {
	private pending = new Map<number, PendingSend>()
	private nextSendId = 1

	constructor(
		private send: (input: OutgoingMessage) => Promise<void>,
		private events: SendOutboxEvents,
		private delayMs: number = UNDO_SEND_DELAY_MS
	) {}

	/** Schedule a send after the undo window; returns when it will fire. */
	queue(input: OutgoingMessage): { sendId: number; sendAt: number } {
		const sendId = this.nextSendId
		this.nextSendId += 1
		const entry: PendingSend = {
			sendId,
			input,
			timer: null,
			sendAt: Date.now() + this.delayMs
		}
		entry.timer = setTimeout(() => void this.fire(entry), this.delayMs)
		this.pending.set(sendId, entry)
		return { sendId, sendAt: entry.sendAt }
	}

	/** Undo: returns the message so the composer can be restored, or null when already sent. */
	cancel(sendId: number): OutgoingMessage | null {
		const entry = this.pending.get(sendId)
		if (!entry) return null
		if (entry.timer) clearTimeout(entry.timer)
		this.pending.delete(sendId)
		return entry.input
	}

	pendingCount(): number {
		return this.pending.size
	}

	/** Send everything still queued right now; used on app quit. */
	async flush(): Promise<void> {
		const entries = [...this.pending.values()]
		await Promise.all(entries.map((entry) => this.fire(entry)))
	}

	private async fire(entry: PendingSend): Promise<void> {
		// Cancel and flush race the timer; whoever removes the entry first wins.
		if (!this.pending.delete(entry.sendId)) return
		if (entry.timer) clearTimeout(entry.timer)
		try {
			await this.send(entry.input)
			this.events.onSent(entry.sendId)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			this.events.onFailed(entry.sendId, message, entry.input)
		}
	}
}
