// Neomail's nib extension: gives the agent read access to the local mail
// store. Runs inside nib's bun process; the Electron main process passes the
// SQLite path via NEOMAIL_DB_PATH when it spawns the server. The DB is opened
// read-only per call — the mail engine (WAL mode) stays the only writer.

import type { ExtensionAPI } from 'nib'

function databasePath(): string {
	const path = process.env.NEOMAIL_DB_PATH
	if (!path) throw new Error('NEOMAIL_DB_PATH is not set — mail tools are unavailable')
	return path
}

async function openReadOnly() {
	const { Database } = await import('bun:sqlite')
	return new Database(databasePath(), { readonly: true })
}

/** Quote each term so user text can never be FTS5 syntax. */
function toFtsQuery(input: string): string {
	const terms = input
		.split(/\s+/)
		.map((term) => term.replace(/"/g, ''))
		.filter((term) => term.length > 0)
	return terms.map((term) => `"${term}"*`).join(' ')
}

/** Cap per-message body text handed to the model. */
const BODY_CHAR_LIMIT = 4000

function toFloat32(blob: Uint8Array): Float32Array {
	return new Float32Array(blob.buffer, blob.byteOffset, blob.byteLength / 4)
}

function cosine(a: Float32Array, b: Float32Array): number {
	let dot = 0
	let normA = 0
	let normB = 0
	for (let index = 0; index < a.length; index += 1) {
		dot += a[index] * b[index]
		normA += a[index] * a[index]
		normB += b[index] * b[index]
	}
	if (normA === 0 || normB === 0) return 0
	return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function truncate(text: string, limit: number): string {
	if (text.length <= limit) return text
	return `${text.slice(0, limit)}\n[… truncated]`
}

function messageLine(row: Record<string, unknown>): string {
	return (
		`- [id ${row.message_id}, thread ${row.thread_id}] ${row.date} · ` +
		`${row.from_name || row.from_address} · ${row.folder_path}\n  **${row.subject}**`
	)
}

export default function (nib: ExtensionAPI): void {
	const { z, defineTool, ToolError } = nib

	nib.registerTool(
		defineTool({
			name: 'search_email',
			description:
				'Full-text search over the locally synced emails (subject, sender, recipients and body). ' +
				'Use this whenever the user asks about their email, a sender, or the content of a message. ' +
				'Returns matching messages with ids usable with read_email and thread ids for read_thread.',
			schema: z.object({
				query: z.string().describe('Free-text search terms'),
				limit: z.number().int().positive().max(50).default(20)
			}),
			policy: 'allow',
			parallelSafe: true,
			display: { label: 'search_email {query}', result: 'markdown' },
			async execute(input) {
				const database = await openReadOnly()
				try {
					const ftsQuery = toFtsQuery(input.query)
					if (ftsQuery === '') return { content: 'Empty query.' }
					const rows = database
						.query(
							`SELECT m.message_id, m.thread_id, m.subject, m.from_name, m.from_address, m.date,
								f.path AS folder_path,
								snippet(message_fts, 3, '>>', '<<', ' … ', 16) AS match_snippet
							 FROM message_fts
							 JOIN messages m ON m.message_id = message_fts.rowid
							 JOIN folders f ON f.folder_id = m.folder_id
							 WHERE message_fts MATCH ?1
							 ORDER BY rank LIMIT ?2`
						)
						.all(ftsQuery, input.limit) as Array<Record<string, unknown>>
					if (rows.length === 0) return { content: 'No messages matched.' }
					const lines = rows.map((row) => `${messageLine(row)} — ${row.match_snippet}`)
					return { content: lines.join('\n') }
				} catch (error) {
					throw new ToolError(`mail search failed: ${(error as Error).message}`)
				} finally {
					database.close()
				}
			}
		})
	)

	nib.registerTool(
		defineTool({
			name: 'list_folders',
			description:
				'List every mail folder across all connected accounts with message and unread counts. ' +
				'Use the folder paths with list_recent.',
			schema: z.object({}),
			policy: 'allow',
			parallelSafe: true,
			display: { label: 'list_folders', result: 'markdown' },
			async execute() {
				const database = await openReadOnly()
				try {
					const rows = database
						.query(
							`SELECT a.email, f.path, f.special_use,
								COUNT(m.message_id) AS total,
								SUM(CASE WHEN m.seen = 0 THEN 1 ELSE 0 END) AS unread
							 FROM folders f
							 JOIN accounts a ON a.account_id = f.account_id
							 LEFT JOIN messages m ON m.folder_id = f.folder_id
							 GROUP BY f.folder_id
							 ORDER BY a.email, f.path`
						)
						.all() as Array<Record<string, unknown>>
					if (rows.length === 0) return { content: 'No folders synced yet.' }
					const lines = rows.map((row) => {
						const special = row.special_use ? ` (${row.special_use})` : ''
						return `- ${row.email} · ${row.path}${special}: ${row.total} messages, ${row.unread || 0} unread`
					})
					return { content: lines.join('\n') }
				} finally {
					database.close()
				}
			}
		})
	)

	nib.registerTool(
		defineTool({
			name: 'list_recent',
			description:
				'List the newest locally synced emails, most recent first. Filter by folder path ' +
				'(from list_folders, defaults to INBOX across all accounts), sender address substring, ' +
				'or unread only. Returns ids for read_email and thread ids for read_thread.',
			schema: z.object({
				folder: z.string().default('INBOX').describe('Folder path, e.g. INBOX or Archive'),
				sender: z.string().optional().describe('Substring of the sender address or name'),
				unreadOnly: z.boolean().default(false),
				limit: z.number().int().positive().max(50).default(20)
			}),
			policy: 'allow',
			parallelSafe: true,
			display: { label: 'list_recent {folder}', result: 'markdown' },
			async execute(input) {
				const database = await openReadOnly()
				try {
					const conditions = ['f.path = ?1']
					const parameters: unknown[] = [input.folder]
					if (input.unreadOnly) conditions.push('m.seen = 0')
					if (input.sender) {
						parameters.push(`%${input.sender}%`)
						conditions.push(
							`(m.from_address LIKE ?${parameters.length} OR m.from_name LIKE ?${parameters.length})`
						)
					}
					parameters.push(input.limit)
					const rows = database
						.query(
							`SELECT m.message_id, m.thread_id, m.subject, m.from_name, m.from_address,
								m.date, m.seen, m.snippet, f.path AS folder_path
							 FROM messages m
							 JOIN folders f ON f.folder_id = m.folder_id
							 WHERE ${conditions.join(' AND ')}
							 ORDER BY m.date DESC
							 LIMIT ?${parameters.length}`
						)
						.all(...parameters) as Array<Record<string, unknown>>
					if (rows.length === 0) return { content: 'No messages found.' }
					const lines = rows.map((row) => {
						const unreadMark = row.seen ? '' : ' · unread'
						return `${messageLine(row)}${unreadMark} — ${row.snippet}`
					})
					return { content: lines.join('\n') }
				} finally {
					database.close()
				}
			}
		})
	)

	nib.registerTool(
		defineTool({
			name: 'find_similar',
			description:
				'Find emails semantically similar to a given one using the local embeddings. Pass a ' +
				'message id from other mail tools; returns the closest messages from other ' +
				'conversations with their thread ids.',
			schema: z.object({
				messageId: z.number().int().positive().describe('The message id to find neighbours of'),
				limit: z.number().int().positive().max(25).default(10)
			}),
			policy: 'allow',
			parallelSafe: true,
			display: { label: 'find_similar {messageId}', result: 'markdown' },
			async execute(input) {
				const database = await openReadOnly()
				try {
					const source = database
						.query(
							`SELECT e.vector, m.thread_id FROM message_embeddings e
							 JOIN messages m ON m.message_id = e.message_id
							 WHERE e.message_id = ?1 LIMIT 1`
						)
						.get(input.messageId) as { vector: Uint8Array; thread_id: number } | null
					if (!source) {
						throw new ToolError(
							`message ${input.messageId} has no embedding yet — it may still be processing`
						)
					}
					const sourceVector = toFloat32(source.vector)

					const candidates = database
						.query(
							`SELECT e.message_id, e.vector, m.thread_id, m.subject, m.from_name,
								m.from_address, m.date, f.path AS folder_path
							 FROM message_embeddings e
							 JOIN messages m ON m.message_id = e.message_id
							 JOIN folders f ON f.folder_id = m.folder_id
							 WHERE m.thread_id != ?1`
						)
						.all(source.thread_id) as Array<Record<string, unknown>>

					const scored = candidates.map((row) => ({
						row,
						similarity: cosine(sourceVector, toFloat32(row.vector as Uint8Array))
					}))
					scored.sort((a, b) => b.similarity - a.similarity)
					const top = scored.slice(0, input.limit)
					if (top.length === 0) return { content: 'No similar messages found.' }

					const lines = top.map(
						(entry) =>
							`${messageLine(entry.row)} — similarity ${entry.similarity.toFixed(2)}`
					)
					return { content: lines.join('\n') }
				} finally {
					database.close()
				}
			}
		})
	)

	nib.registerTool(
		defineTool({
			name: 'show_thread',
			description:
				'Open a conversation on screen for the user in the Neomail window. Use when the user ' +
				'asks to see, open or show an email or conversation. Pass the thread id from ' +
				'search_email, list_recent or read_thread.',
			schema: z.object({
				threadId: z.number().int().positive().describe('The thread id to open')
			}),
			policy: 'allow',
			parallelSafe: false,
			display: { label: 'show_thread {threadId}', result: 'hidden' },
			async execute(input, context) {
				const database = await openReadOnly()
				try {
					const row = database
						.query(
							`SELECT m.account_id, m.subject FROM messages m
							 WHERE m.thread_id = ?1 ORDER BY m.date DESC LIMIT 1`
						)
						.get(input.threadId) as { account_id: number; subject: string } | null
					if (!row) throw new ToolError(`no thread with id ${input.threadId}`)

					// The renderer intercepts neomail:-prefixed surfaces and navigates
					// instead of drawing the node tree.
					context.emit({
						type: 'ui.surface',
						surfaceId: 'neomail:open-thread',
						slot: 'panel',
						view: {
							kind: 'keyValue',
							fallbackText: `Opened conversation: ${row.subject}`,
							entries: [
								{ key: 'accountId', value: String(row.account_id) },
								{ key: 'threadId', value: String(input.threadId) }
							]
						}
					})
					return { content: `Opened "${row.subject}" in the app.` }
				} finally {
					database.close()
				}
			}
		})
	)

	nib.registerTool(
		defineTool({
			name: 'read_thread',
			description:
				'Read a whole conversation: every message of the thread id (from search_email or ' +
				'list_recent) in chronological order with headers and plain-text bodies.',
			schema: z.object({
				threadId: z.number().int().positive().describe('The thread id from other mail tools')
			}),
			policy: 'allow',
			parallelSafe: true,
			display: { label: 'read_thread {threadId}', result: 'markdown' },
			async execute(input) {
				const database = await openReadOnly()
				try {
					const rows = database
						.query(
							`SELECT m.message_id, m.subject, m.from_name, m.from_address, m.date,
								m.rfc_message_id, f.path AS folder_path, b.text_body, m.snippet
							 FROM messages m
							 JOIN folders f ON f.folder_id = m.folder_id
							 LEFT JOIN message_bodies b ON b.message_id = m.message_id
							 WHERE m.thread_id = ?1
							 ORDER BY m.date ASC, m.message_id ASC`
						)
						.all(input.threadId) as Array<Record<string, unknown>>
					if (rows.length === 0) throw new ToolError(`no thread with id ${input.threadId}`)

					const seenRfcIds = new Set<string>()
					const sections: string[] = []
					for (const row of rows) {
						const rfcId = String(row.rfc_message_id || '')
						if (rfcId !== '') {
							if (seenRfcIds.has(rfcId)) continue
							seenRfcIds.add(rfcId)
						}
						const body = row.text_body ? String(row.text_body) : String(row.snippet || '(no body)')
						sections.push(
							`## [id ${row.message_id}] ${row.subject}\n` +
								`From: ${row.from_name} <${row.from_address}> · ${row.date} · ${row.folder_path}\n\n` +
								truncate(body, BODY_CHAR_LIMIT)
						)
					}
					return { content: sections.join('\n\n---\n\n') }
				} finally {
					database.close()
				}
			}
		})
	)

	nib.registerTool(
		defineTool({
			name: 'read_email',
			description:
				'Read one locally synced email in full (headers and plain-text body) by the numeric id ' +
				'returned from search_email.',
			schema: z.object({
				messageId: z.number().int().positive().describe('The message_id from search_email')
			}),
			policy: 'allow',
			parallelSafe: true,
			display: { label: 'read_email {messageId}', result: 'markdown' },
			async execute(input) {
				const database = await openReadOnly()
				try {
					const row = database
						.query(
							`SELECT m.subject, m.from_name, m.from_address, m.to_json, m.cc_json, m.date,
								f.path AS folder_path, b.text_body
							 FROM messages m
							 JOIN folders f ON f.folder_id = m.folder_id
							 LEFT JOIN message_bodies b ON b.message_id = m.message_id
							 WHERE m.message_id = ?1`
						)
						.get(input.messageId) as Record<string, unknown> | null
					if (!row) throw new ToolError(`no message with id ${input.messageId}`)

					const recipients = JSON.parse(String(row.to_json)) as Array<{ name: string; address: string }>
					const recipientList = recipients.map((entry) => entry.address).join(', ')
					const header =
						`Subject: ${row.subject}\n` +
						`From: ${row.from_name} <${row.from_address}>\n` +
						`To: ${recipientList}\n` +
						`Date: ${row.date}\n` +
						`Folder: ${row.folder_path}\n`
					const body = row.text_body ? String(row.text_body) : '(no plain-text body)'
					return { content: `${header}\n${body}` }
				} finally {
					database.close()
				}
			}
		})
	)
}
