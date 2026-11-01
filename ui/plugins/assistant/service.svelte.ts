// The `assistant` service: Mail's side of the neo agent. It mirrors the agent's current session
// for the assistant pane, sends the user's requests to it, and carries out what the agent asks
// of the window through Mail's tools: open a thread, put a reply in the composer, show a
// summary or the digest.
//
// The AI actions (summarize, draft a reply, extract action items or a shipment, the digest) are
// requests to the shared agent. Each names the ids it is about and the Mail tool that takes the
// result, so the answer arrives as structured data rather than text to parse.

import type { Context } from '@neoworks/extension-system'
import type {
	AssistantPrompt,
	AssistantRequest,
	AssistantStatus,
	AssistantView,
	DigestGroup
} from '../../../shared/assistant'
import type { ThreadMessage } from '../../../shared/mail'

declare module '@neoworks/extension-system' {
	interface Context {
		assistant: AssistantService
	}
}

export interface SummaryState {
	text: string
	pending: boolean
}

export interface DigestState {
	intro: string | null
	groups: DigestGroup[]
	pending: boolean
	generatedAt: number
}

export interface AssistantState {
	status: AssistantStatus
	view: AssistantView
	prompts: AssistantPrompt[]
	/** Summaries by thread id, for this run. */
	summaries: Record<number, SummaryState>
	digest: DigestState | null
	/** Messages the agent is extracting from, by what it extracts. */
	extracting: Record<number, 'actions' | 'shipment'>
	/** Why the last request to the agent failed. */
	error: string | null
	/** Whether a reply draft has been asked for and not yet arrived. */
	draftingReply: boolean
}

function createState(): AssistantState {
	const state: AssistantState = $state({
		status: { state: 'connecting', error: null, sessionId: null, focusApp: null },
		view: { sessionId: null, items: [], running: false },
		prompts: [],
		summaries: {},
		digest: null,
		extracting: {},
		error: null,
		draftingReply: false
	})
	return state
}

export const DIGEST_VIEW_KEY = 'digest'

export class AssistantService {
	readonly state = createState()

	constructor(private ctx: Context) {}

	async load(): Promise<void> {
		this.state.status = await this.ctx.sidecar.call('assistant.status')
		this.state.view = await this.ctx.sidecar.call('assistant.view')
		this.state.prompts = await this.ctx.sidecar.call('assistant.prompts')
	}

	get available(): boolean {
		return this.state.status.state === 'open'
	}

	/** Sends the user's own words to the agent. */
	async ask(text: string): Promise<void> {
		const trimmed = text.trim()
		if (trimmed === '') return
		await this.send(trimmed)
	}

	async cancel(): Promise<void> {
		await this.ctx.sidecar.call('assistant.cancel')
	}

	async press(ref: string, action: string, args: unknown): Promise<void> {
		await this.ctx.sidecar.call('assistant.action', ref, action, args)
	}

	/** Brings the agent into Mail, so its chat follows the user here. */
	async focusHere(): Promise<void> {
		await this.ctx.sidecar.call('assistant.focus')
	}

	async runPrompt(prompt: AssistantPrompt, extra: string): Promise<void> {
		await this.send(prompt.text.replace('$ARGUMENTS', extra).trim())
	}

	async summarize(threadId: number): Promise<void> {
		const existing = this.state.summaries[threadId]
		if (existing && (existing.pending || existing.text !== '')) return
		this.state.summaries[threadId] = { text: '', pending: true }
		const sent = await this.send(
			`Summarize Mail thread ${threadId} for me. Read it with mail.read_thread, then call ` +
				`mail.show_summary with threadId ${threadId} and a compact summary of 2 to 4 sentences: ` +
				'who wants what, decisions made, and open questions or action items. No preamble.'
		)
		if (!sent) delete this.state.summaries[threadId]
	}

	dismissSummary(threadId: number): void {
		delete this.state.summaries[threadId]
	}

	/** Asks for a reply to a message; any text already above the quote is the user's guidance. */
	async draftReply(message: ThreadMessage, guidance: string, senderEmail: string): Promise<void> {
		let instruction =
			`Draft my reply to Mail message ${message.messageId} in thread ${message.threadId}. Read the ` +
			`thread with mail.read_thread, then call mail.write_reply with messageId ${message.messageId} and ` +
			`the reply body as plain markdown, written as ${senderEmail} in the conversation's language and ` +
			'tone, concise and natural: no subject line, no quoted original, at most a simple closing.'
		if (guidance !== '') instruction += `\nWhat I want to say:\n${guidance}`
		this.state.draftingReply = true
		const sent = await this.send(instruction)
		if (!sent) this.state.draftingReply = false
	}

	async extractActions(message: ThreadMessage): Promise<void> {
		await this.extract(
			message,
			'actions',
			`Find the action items I have to do in Mail thread ${message.threadId} (read it with ` +
				`mail.read_thread) and store them with mail.save_action_items on message ${message.messageId}, ` +
				'each with a due date when the mail names one. Store an empty list if there is nothing to do.'
		)
	}

	async extractShipment(message: ThreadMessage): Promise<void> {
		await this.extract(
			message,
			'shipment',
			`Read Mail message ${message.messageId} with mail.read_email. If it is about a shipment, store ` +
				`its carrier, tracking number, tracking link, status and delivery date with mail.save_shipment ` +
				'on that message; otherwise tell me it is not about a shipment.'
		)
	}

	/** Asks for the digest of new mail; `scheduled` when the morning schedule asked for it. */
	async generateDigest(scheduled: boolean): Promise<void> {
		if (this.state.digest && this.state.digest.pending) return
		const candidates = await this.ctx.sidecar.call('digest.candidates')
		if (candidates.length === 0) {
			if (scheduled) return
			this.state.digest = { intro: 'Nothing new since yesterday.', groups: [], pending: false, generatedAt: Date.now() }
			await this.openDigest()
			return
		}
		this.state.digest = { intro: null, groups: [], pending: true, generatedAt: Date.now() }
		await this.openDigest()
		const lines = [...new Map(candidates.map((entry) => [entry.threadId, entry])).values()].map((entry) => {
			const sender = entry.fromName || entry.fromAddress
			let label = ''
			if (entry.label) label = ` [${entry.label}]`
			return `- [thread ${entry.threadId}] ${sender}: ${entry.subject}${label} — ${entry.snippet}`
		})
		const sent = await this.send(
			'Write my digest of new unread mail and show it with mail.show_digest: group the threads by ' +
				'importance (personal and urgent first, then notable updates, then bulk such as newsletters ' +
				`and ads), one short sentence per thread on what it is about or why it matters.\n\n${lines.join('\n')}`
		)
		if (!sent && this.state.digest) this.state.digest.pending = false
	}

	dismissDigest(): void {
		this.state.digest = null
		this.ctx.reader.closeCustom(DIGEST_VIEW_KEY)
	}

	/** Carries out what the agent asked of the window. */
	async handleRequest(request: AssistantRequest): Promise<void> {
		if (request.kind === 'openThread') {
			await this.ctx.reader.openThread(request.accountId, request.threadId)
			return
		}
		if (request.kind === 'summary') {
			this.state.summaries[request.threadId] = { text: request.summary, pending: false }
			return
		}
		if (request.kind === 'digest') {
			this.state.digest = { intro: request.intro, groups: request.groups, pending: false, generatedAt: Date.now() }
			await this.openDigest()
			return
		}
		if (request.kind === 'replyDraft') {
			this.state.draftingReply = false
			this.ctx.emit('assistant/reply-draft', request.messageId, request.markdown)
			return
		}
		delete this.state.extracting[request.messageId]
		await this.ctx.reader.reloadBody(request.messageId)
	}

	private async extract(message: ThreadMessage, kind: 'actions' | 'shipment', instruction: string): Promise<void> {
		if (this.state.extracting[message.messageId]) return
		this.state.extracting[message.messageId] = kind
		const sent = await this.send(instruction)
		if (!sent) delete this.state.extracting[message.messageId]
	}

	private async openDigest(): Promise<void> {
		await this.ctx.reader.openInNewTab({ kind: 'custom', key: DIGEST_VIEW_KEY, title: 'Digest' })
	}

	/** Sends input to the agent; false, with the reason in `error`, when it could not. */
	private async send(text: string): Promise<boolean> {
		this.state.error = null
		try {
			await this.ctx.sidecar.call('assistant.ask', text)
			return true
		} catch (error) {
			this.state.error = error instanceof Error ? error.message : String(error)
			return false
		}
	}
}
