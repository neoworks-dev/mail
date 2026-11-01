import { describe, expect, test } from 'bun:test'
import { SendOutbox, type SendOutboxEvents } from '../sidecar/mail/outbox'
import type { OutgoingMessage } from '../shared/mail'

const SHORT_DELAY_MS = 20

function message(subject: string): OutgoingMessage {
	return {
		accountId: 1,
		to: 'a@example.com',
		cc: '',
		subject,
		markdown: 'hello',
		replyToMessageId: null,
		attachments: [],
		draftMessageId: null
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

interface Recorded {
	sent: number[]
	failed: Array<{ sendId: number; errorMessage: string }>
}

function recordingEvents(): { events: SendOutboxEvents; recorded: Recorded } {
	const recorded: Recorded = { sent: [], failed: [] }
	return {
		recorded,
		events: {
			onSent: (sendId) => recorded.sent.push(sendId),
			onFailed: (sendId, errorMessage) => recorded.failed.push({ sendId, errorMessage })
		}
	}
}

describe('SendOutbox', () => {
	test('sends after the delay and reports success', async () => {
		const delivered: string[] = []
		const { events, recorded } = recordingEvents()
		const outbox = new SendOutbox(
			async (input) => {
				delivered.push(input.subject)
			},
			events,
			SHORT_DELAY_MS
		)

		const { sendId } = outbox.queue(message('one'))
		expect(outbox.pendingCount()).toBe(1)
		expect(delivered).toEqual([])

		await sleep(SHORT_DELAY_MS * 3)
		expect(delivered).toEqual(['one'])
		expect(recorded.sent).toEqual([sendId])
		expect(outbox.pendingCount()).toBe(0)
	})

	test('cancel inside the window returns the message and stops the send', async () => {
		const delivered: string[] = []
		const { events } = recordingEvents()
		const outbox = new SendOutbox(
			async (input) => {
				delivered.push(input.subject)
			},
			events,
			SHORT_DELAY_MS
		)

		const { sendId } = outbox.queue(message('two'))
		const restored = outbox.cancel(sendId)
		expect(restored?.subject).toBe('two')

		await sleep(SHORT_DELAY_MS * 3)
		expect(delivered).toEqual([])
		expect(outbox.cancel(sendId)).toBeNull()
	})

	test('failures are reported with the message for recovery', async () => {
		const { events, recorded } = recordingEvents()
		const outbox = new SendOutbox(
			async () => {
				throw new Error('smtp down')
			},
			events,
			SHORT_DELAY_MS
		)

		const { sendId } = outbox.queue(message('three'))
		await sleep(SHORT_DELAY_MS * 3)
		expect(recorded.failed).toEqual([{ sendId, errorMessage: 'smtp down' }])
	})

	test('flush sends everything immediately', async () => {
		const delivered: string[] = []
		const { events, recorded } = recordingEvents()
		const outbox = new SendOutbox(
			async (input) => {
				delivered.push(input.subject)
			},
			events,
			// Long delay: only flush can be responsible for the sends below.
			10_000
		)

		outbox.queue(message('four'))
		outbox.queue(message('five'))
		await outbox.flush()
		expect(delivered.sort()).toEqual(['five', 'four'])
		expect(recorded.sent).toHaveLength(2)
		expect(outbox.pendingCount()).toBe(0)
	})
})
