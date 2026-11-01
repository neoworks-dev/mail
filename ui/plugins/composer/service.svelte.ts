// The `composer` service: the message being written, and the sends waiting out the undo window.
// Sending queues the message in the sidecar's outbox and closes the composer; Undo within the
// window brings it back, as does a send that failed.

import type { Context } from '@neoworks/extension-system'
import type { MessageBody, OutgoingAttachment, OutgoingMessage, ThreadMessage } from '../../../shared/mail'

declare module '@neoworks/extension-system' {
	interface Context {
		composer: ComposerService
	}
}

export interface ComposeDraft {
	accountId: number
	to: string
	cc: string
	subject: string
	markdown: string
	replyToMessageId: number | null
	attachments: OutgoingAttachment[]
	/** Local message id of the last autosaved copy in the Drafts folder. */
	draftMessageId: number | null
}

/** A send held back by the undo window, or one that failed after it. */
export interface PendingSend {
	sendId: number
	to: string
	subject: string
	/** When the SMTP transaction fires, for the countdown. */
	sendAt: number
	status: 'pending' | 'failed'
	errorMessage: string | null
	/** Kept so Undo or a failure can bring the composer back. */
	input: OutgoingMessage
}

export interface ComposerState {
	draft: ComposeDraft | null
	pendingSends: PendingSend[]
	/** When the last autosave finished, for the composer's footer. */
	savedAt: number | null
}

function createState(): ComposerState {
	const state: ComposerState = $state({ draft: null, pendingSends: [], savedAt: null })
	return state
}

export class ComposerService {
	readonly state = createState()

	constructor(private ctx: Context) {}

	/** Starts a new message from the selected account. */
	open(): void {
		const accountId = this.ctx.accounts.state.selectedAccountId
		if (accountId === null) return
		this.replace({
			accountId,
			to: '',
			cc: '',
			subject: '',
			markdown: '',
			replyToMessageId: null,
			attachments: [],
			draftMessageId: null
		})
	}

	/** Starts a reply, quoting the message; with `replyAll` the other recipients go on Cc. */
	openReply(message: ThreadMessage, body: MessageBody | null, replyAll: boolean): void {
		const ownEmail = this.ctx.accounts.ownEmail(message.accountId)
		let to = message.fromAddress
		let cc = ''
		if (replyAll && body) {
			const others = [...body.toAddresses, ...body.ccAddresses]
				.map((entry) => entry.address)
				.filter((address) => address !== '' && address !== ownEmail && address !== message.fromAddress)
			cc = [...new Set(others)].join(', ')
		}
		if (to === ownEmail && body && body.toAddresses.length > 0) {
			// Replying to one's own message: address its recipients instead.
			to = body.toAddresses.map((entry) => entry.address).join(', ')
		}
		this.replace({
			accountId: message.accountId,
			to,
			cc,
			subject: replySubject(message.subject),
			markdown: quoteForReply(message, body),
			replyToMessageId: message.messageId,
			attachments: [],
			draftMessageId: null
		})
	}

	/** Reopens a message from the Drafts folder. */
	async editDraft(message: ThreadMessage, body: MessageBody | null): Promise<void> {
		let replyToMessageId: number | null = null
		if (message.inReplyTo) {
			replyToMessageId = await this.ctx.sidecar.call('messages.byRfcId', message.accountId, message.inReplyTo)
		}
		let to = ''
		let cc = ''
		let markdown = ''
		if (body) {
			to = body.toAddresses.map((entry) => entry.address).join(', ')
			cc = body.ccAddresses.map((entry) => entry.address).join(', ')
			if (body.textBody) markdown = body.textBody
		}
		this.replace({
			accountId: message.accountId,
			to,
			cc,
			subject: message.subject,
			markdown,
			replyToMessageId,
			attachments: [],
			draftMessageId: message.messageId
		})
	}

	close(): void {
		this.ctx.emit('composer/closing')
		this.state.draft = null
	}

	/** Queues the message behind the undo window and closes the composer. */
	async send(): Promise<void> {
		const payload = this.payload()
		if (!payload) return
		this.ctx.emit('composer/closing')
		const queued = await this.ctx.sidecar.call('send.queue', payload)
		this.state.pendingSends = [
			...this.state.pendingSends,
			{
				sendId: queued.sendId,
				to: payload.to,
				subject: payload.subject,
				sendAt: queued.sendAt,
				status: 'pending',
				errorMessage: null,
				input: payload
			}
		]
		this.state.draft = null
	}

	/** Takes a queued send back; the composer reopens when it had not gone out yet. */
	async undoSend(sendId: number): Promise<void> {
		const restored = await this.ctx.sidecar.call('send.cancel', sendId)
		this.dropPending(sendId)
		if (restored) this.restore(restored)
	}

	/** Reopens a failed send in the composer for another try. */
	reopenFailed(sendId: number): void {
		const entry = this.state.pendingSends.find((candidate) => candidate.sendId === sendId)
		if (!entry) return
		this.dropPending(sendId)
		this.restore(entry.input)
	}

	dropPending(sendId: number): void {
		this.state.pendingSends = this.state.pendingSends.filter((entry) => entry.sendId !== sendId)
	}

	markFailed(sendId: number, errorMessage: string): void {
		for (const entry of this.state.pendingSends) {
			if (entry.sendId !== sendId) continue
			entry.status = 'failed'
			entry.errorMessage = errorMessage
		}
	}

	/** Saves the message to Drafts, replacing the previous autosave. */
	async saveDraft(): Promise<void> {
		const payload = this.payload()
		if (!payload) return
		const draftMessageId = await this.ctx.sidecar.call('drafts.save', payload)
		// The composer may have been closed or replaced while the save ran.
		const draft = this.state.draft
		if (draft && draft.accountId === payload.accountId) draft.draftMessageId = draftMessageId
		this.state.savedAt = Date.now()
	}

	/** Adds files from the system's file dialog, skipping ones already attached. */
	addAttachments(described: OutgoingAttachment[]): void {
		const draft = this.state.draft
		if (!draft || described.length === 0) return
		const existing = new Set(draft.attachments.map((attachment) => attachment.path))
		const fresh = described.filter((attachment) => !existing.has(attachment.path))
		draft.attachments = [...draft.attachments, ...fresh]
	}

	removeAttachment(path: string): void {
		const draft = this.state.draft
		if (!draft) return
		draft.attachments = draft.attachments.filter((attachment) => attachment.path !== path)
	}

	private replace(draft: ComposeDraft): void {
		this.state.draft = draft
		this.state.savedAt = null
	}

	private restore(input: OutgoingMessage): void {
		this.replace({ ...input, attachments: input.attachments.map((attachment) => ({ ...attachment })) })
	}

	private payload(): OutgoingMessage | null {
		const draft = this.state.draft
		if (!draft) return null
		return {
			accountId: draft.accountId,
			to: draft.to,
			cc: draft.cc,
			subject: draft.subject,
			markdown: draft.markdown,
			replyToMessageId: draft.replyToMessageId,
			attachments: draft.attachments.map((attachment) => ({ ...attachment })),
			draftMessageId: draft.draftMessageId
		}
	}
}

export function replySubject(subject: string): string {
	if (/^re:/i.test(subject.trim())) return subject
	return `Re: ${subject}`
}

export function quoteForReply(message: ThreadMessage, body: MessageBody | null): string {
	let sender = message.fromAddress
	if (message.fromName !== '') sender = `${message.fromName} <${message.fromAddress}>`
	const date = new Date(message.date).toLocaleString()
	let original = message.snippet
	if (body && body.textBody) original = body.textBody
	const quoted = original
		.split('\n')
		.map((line) => `> ${line}`)
		.join('\n')
	return `\n\nOn ${date}, ${sender} wrote:\n\n${quoted}\n`
}
