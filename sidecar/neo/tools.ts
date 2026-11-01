// The tools Mail offers the neo agent. Reading tools answer from the local store; the others
// hand a result to the window (open a thread, put a reply in the composer, show a summary or
// the digest) or store what the agent extracted. The daemon lists them as `mail.<name>`.

import type { ToolSpec } from '@neoworks-dev/neo-sdk'
import type { AssistantRequest, DigestGroup } from '../../shared/assistant'
import type { SearchResult } from '../../shared/mail'
import { cosineSimilarity, vectorFromBuffer } from '../mail/classify'
import { EMBEDDING_MODEL } from '../mail/embedder'
import type { MailStore } from '../mail/store'

/** Cap per-message body text handed to the model. */
const BODY_CHAR_LIMIT = 4000
const DEFAULT_LIMIT = 20

export interface ToolContext {
	store: MailStore
	/** Asks the window to do something for the agent. */
	request(request: AssistantRequest): void
}

export const TOOL_INSTRUCTIONS =
	"Mail is the user's email client; its store holds every synced message. Find mail with " +
	'search_email or list_recent, read it with read_thread or read_email, and use show_thread to ' +
	'open a conversation for the user. When the user asks for a summary, a reply draft, action ' +
	'items, shipment tracking or a digest, read the mail first, then hand the result to Mail with ' +
	'show_summary, write_reply, save_action_items, save_shipment or show_digest.'

export function mailTools(context: ToolContext): ToolSpec[] {
	return [...readingTools(context), ...windowTools(context), ...extractionTools(context)]
}

function readingTools({ store }: ToolContext): ToolSpec[] {
	return [
		{
			name: 'search_email',
			description:
				'Full-text search over the synced emails (subject, sender, recipients and body). Use it whenever ' +
				'the user asks about their email, a sender or what a message said. Returns message ids for ' +
				'read_email and thread ids for read_thread.',
			inputSchema: objectSchema({ query: { type: 'string' }, limit: limitSchema(50) }, ['query']),
			handler: async (args) => {
				const results = store.search(String(args.query), null, numberOr(args.limit, DEFAULT_LIMIT))
				if (results.length === 0) return 'No messages matched.'
				return results.map((result) => `${messageLine(result)} — ${result.matchSnippet}`).join('\n')
			}
		},
		{
			name: 'list_folders',
			description: 'Every mail folder of every connected account, with message and unread counts.',
			inputSchema: objectSchema({}, []),
			handler: async () => listFolders(store)
		},
		{
			name: 'list_recent',
			description:
				'The newest emails, most recent first, in a folder path (from list_folders; INBOX across all ' +
				'accounts by default), optionally only unread ones or from a sender.',
			inputSchema: objectSchema(
				{
					folder: { type: 'string', description: 'Folder path, such as INBOX or Archive' },
					sender: { type: 'string', description: 'Part of the sender address or name' },
					unreadOnly: { type: 'boolean' },
					limit: limitSchema(50)
				},
				[]
			),
			handler: async (args) => {
				const results = store.recentMessages({
					folderPath: stringOr(args.folder, 'INBOX'),
					sender: stringOr(args.sender, ''),
					unreadOnly: args.unreadOnly === true,
					limit: numberOr(args.limit, DEFAULT_LIMIT)
				})
				if (results.length === 0) return 'No messages found.'
				return results.map((result) => recentLine(result)).join('\n')
			}
		},
		{
			name: 'find_similar',
			description:
				'Emails from other conversations that are about the same thing as a message, by its id.',
			inputSchema: objectSchema({ messageId: { type: 'integer' }, limit: limitSchema(25) }, [
				'messageId'
			]),
			handler: async (args) => findSimilar(store, Number(args.messageId), numberOr(args.limit, 10))
		},
		{
			name: 'read_thread',
			description:
				'A whole conversation by thread id: every message in order, with headers and plain-text bodies.',
			inputSchema: objectSchema({ threadId: { type: 'integer' } }, ['threadId']),
			handler: async (args) => readThread(store, Number(args.threadId))
		},
		{
			name: 'read_email',
			description: 'One email in full, headers and plain-text body, by message id.',
			inputSchema: objectSchema({ messageId: { type: 'integer' } }, ['messageId']),
			handler: async (args) => readEmail(store, Number(args.messageId))
		}
	]
}

function windowTools({ store, request }: ToolContext): ToolSpec[] {
	return [
		{
			name: 'show_thread',
			description:
				'Opens a conversation in the Mail window, when the user asks to see, open or show one.',
			inputSchema: objectSchema({ threadId: { type: 'integer' } }, ['threadId']),
			handler: async (args) => {
				const threadId = Number(args.threadId)
				const accountId = store.findThreadAccount(threadId)
				if (accountId === null) throw new Error(`no thread with id ${threadId}`)
				request({ kind: 'openThread', accountId, threadId })
				return `Opened thread ${threadId} in Mail.`
			}
		},
		{
			name: 'write_reply',
			description:
				"Puts a reply into Mail's composer for the user to check and send; nothing is sent. Pass the " +
				'message id being answered and the reply body as plain markdown, without a subject or the ' +
				'quoted original.',
			inputSchema: objectSchema({ messageId: { type: 'integer' }, markdown: { type: 'string' } }, [
				'markdown'
			]),
			handler: async (args) => {
				let messageId: number | null = null
				if (typeof args.messageId === 'number') messageId = args.messageId
				request({ kind: 'replyDraft', messageId, markdown: String(args.markdown) })
				return 'The reply is in the composer; the user sends it.'
			}
		},
		{
			name: 'show_summary',
			description:
				'Shows a summary of a conversation above it in Mail. 2 to 4 sentences: who wants what, decisions, open questions.',
			inputSchema: objectSchema({ threadId: { type: 'integer' }, summary: { type: 'string' } }, [
				'threadId',
				'summary'
			]),
			handler: async (args) => {
				request({
					kind: 'summary',
					threadId: Number(args.threadId),
					summary: String(args.summary)
				})
				return 'The summary is shown in Mail.'
			}
		},
		{
			name: 'show_digest',
			description:
				'Shows a digest of new mail in Mail, as groups of conversations by importance: personal and ' +
				'urgent first, then notable updates, then bulk. Each item is a thread id and one sentence on why it matters.',
			inputSchema: objectSchema(
				{
					intro: { type: 'string' },
					groups: {
						type: 'array',
						items: objectSchema(
							{
								title: { type: 'string' },
								items: {
									type: 'array',
									items: objectSchema({ threadId: { type: 'integer' }, note: { type: 'string' } }, [
										'threadId',
										'note'
									])
								}
							},
							['title', 'items']
						)
					}
				},
				['groups']
			),
			handler: async (args) => {
				let intro: string | null = null
				if (typeof args.intro === 'string' && args.intro.trim() !== '') intro = args.intro
				request({ kind: 'digest', intro, groups: digestGroups(args.groups) })
				return 'The digest is shown in Mail.'
			}
		}
	]
}

function extractionTools({ store, request }: ToolContext): ToolSpec[] {
	return [
		{
			name: 'save_action_items',
			description:
				'Stores the action items the user has to do from a message, shown on the message in Mail.',
			inputSchema: objectSchema(
				{
					messageId: { type: 'integer' },
					items: {
						type: 'array',
						items: objectSchema(
							{
								title: { type: 'string' },
								due: { type: 'string', description: 'ISO date or a short phrase' }
							},
							['title']
						)
					}
				},
				['messageId', 'items']
			),
			handler: async (args) => {
				const messageId = requireMessage(store, args.messageId)
				const items = actionItems(args.items)
				store.saveExtraction(messageId, 'actions', 'ai', JSON.stringify({ items }))
				request({ kind: 'extractionSaved', messageId })
				return `Saved ${items.length} action items.`
			}
		},
		{
			name: 'save_shipment',
			description:
				'Stores the shipment a message is about, shown as a tracking card on the message in Mail.',
			inputSchema: objectSchema(
				{
					messageId: { type: 'integer' },
					carrier: { type: 'string' },
					trackingNumber: { type: 'string' },
					trackingUrl: { type: 'string' },
					status: { type: 'string' },
					deliveryDate: { type: 'string' }
				},
				['messageId', 'carrier']
			),
			handler: async (args) => {
				const messageId = requireMessage(store, args.messageId)
				store.saveExtraction(messageId, 'shipment', 'ai', JSON.stringify(shipmentPayload(args)))
				request({ kind: 'extractionSaved', messageId })
				return 'Saved the shipment.'
			}
		}
	]
}

function listFolders(store: MailStore): string {
	const lines: string[] = []
	for (const account of store.listAccounts()) {
		for (const folder of store.listFolders(account.accountId)) {
			let special = ''
			if (folder.specialUse) special = ` (${folder.specialUse})`
			lines.push(
				`- ${account.email} · ${folder.path}${special}: ${folder.totalMessages} messages, ${folder.unreadMessages} unread`
			)
		}
	}
	if (lines.length === 0) return 'No folders synced yet.'
	return lines.join('\n')
}

function findSimilar(store: MailStore, messageId: number, limit: number): string {
	const source = store.embeddingOf(messageId, EMBEDDING_MODEL)
	if (!source)
		throw new Error(`message ${messageId} has no embedding yet; it may still be processing`)
	const sourceVector = vectorFromBuffer(source.vector)
	const scored = store
		.allEmbeddings(EMBEDDING_MODEL, null)
		.map((candidate) => ({
			messageId: candidate.messageId,
			similarity: cosineSimilarity(sourceVector, vectorFromBuffer(candidate.vector))
		}))
		.sort((first, second) => second.similarity - first.similarity)
	const similarity = new Map(scored.map((entry) => [entry.messageId, entry.similarity]))
	const results = store
		.summariesWithFolder(scored.slice(0, limit * 4).map((entry) => entry.messageId))
		.filter((result) => result.threadId !== source.threadId)
		.slice(0, limit)
	if (results.length === 0) return 'No similar messages found.'
	return results
		.map(
			(result) =>
				`${messageLine(result)} — similarity ${(similarity.get(result.messageId) ?? 0).toFixed(2)}`
		)
		.join('\n')
}

function readThread(store: MailStore, threadId: number): string {
	const accountId = store.findThreadAccount(threadId)
	if (accountId === null) throw new Error(`no thread with id ${threadId}`)
	const sections = store.getThreadMessages(accountId, threadId).map((message) => {
		const body = store.getMessageBody(message.messageId)
		let text = message.snippet
		if (body && body.textBody) text = body.textBody
		return (
			`## [id ${message.messageId}] ${message.subject}\n` +
			`From: ${message.fromName} <${message.fromAddress}> · ${message.date} · ${message.folderPath}\n\n` +
			truncate(text, BODY_CHAR_LIMIT)
		)
	})
	return sections.join('\n\n---\n\n')
}

function readEmail(store: MailStore, messageId: number): string {
	const location = store.getMessageLocation(messageId)
	const body = store.getMessageBody(messageId)
	if (!location || !body) throw new Error(`no message with id ${messageId}`)
	const [summary] = store.summariesWithFolder([messageId])
	const recipients = body.toAddresses.map((entry) => entry.address).join(', ')
	const header =
		`Subject: ${summary.subject}\nFrom: ${summary.fromName} <${summary.fromAddress}>\n` +
		`To: ${recipients}\nDate: ${summary.date}\nFolder: ${summary.folderPath}\n`
	let text = '(no plain-text body)'
	if (body.textBody) text = body.textBody
	return `${header}\n${truncate(text, BODY_CHAR_LIMIT * 2)}`
}

function requireMessage(store: MailStore, value: unknown): number {
	const messageId = Number(value)
	if (!store.getMessageLocation(messageId)) throw new Error(`no message with id ${messageId}`)
	return messageId
}

function actionItems(value: unknown): Array<{ title: string; due: string | null }> {
	if (!Array.isArray(value)) throw new Error('items must be an array')
	return value
		.filter((item) => typeof item?.title === 'string' && item.title.trim() !== '')
		.map((item) => {
			let due: string | null = null
			if (typeof item.due === 'string' && item.due.trim() !== '') due = item.due.trim()
			return { title: String(item.title).trim(), due }
		})
}

function shipmentPayload(args: Record<string, unknown>): Record<string, unknown> {
	let trackingUrl: string | null = stringOr(args.trackingUrl, '')
	if (!/^https?:\/\//i.test(trackingUrl)) trackingUrl = null
	const payload: Record<string, unknown> = {
		carrier: String(args.carrier),
		trackingNumber: stringOr(args.trackingNumber, '') || null,
		trackingUrl
	}
	if (typeof args.status === 'string') payload.status = args.status
	if (typeof args.deliveryDate === 'string') payload.deliveryDate = args.deliveryDate
	return payload
}

function digestGroups(value: unknown): DigestGroup[] {
	if (!Array.isArray(value)) return []
	return value.map((group) => ({
		title: String(group?.title ?? ''),
		items: Array.isArray(group?.items)
			? group.items.map((item: { threadId?: unknown; note?: unknown }) => ({
					threadId: Number(item.threadId),
					note: String(item.note ?? '')
				}))
			: []
	}))
}

function messageLine(result: SearchResult): string {
	return (
		`- [id ${result.messageId}, thread ${result.threadId}] ${result.date} · ` +
		`${result.fromName || result.fromAddress} · ${result.folderPath}\n  **${result.subject}**`
	)
}

function recentLine(result: SearchResult): string {
	let unread = ''
	if (!result.seen) unread = ' · unread'
	return `${messageLine(result)}${unread} — ${result.snippet}`
}

function truncate(text: string, limit: number): string {
	if (text.length <= limit) return text
	return `${text.slice(0, limit)}\n[… truncated]`
}

function objectSchema(
	properties: Record<string, unknown>,
	required: string[]
): Record<string, unknown> {
	return { type: 'object', properties, required }
}

function limitSchema(maximum: number): Record<string, unknown> {
	return { type: 'integer', minimum: 1, maximum }
}

function numberOr(value: unknown, fallback: number): number {
	if (typeof value === 'number' && Number.isFinite(value)) return value
	return fallback
}

function stringOr(value: unknown, fallback: string): string {
	if (typeof value === 'string') return value
	return fallback
}
