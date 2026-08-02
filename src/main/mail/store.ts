import type { Database } from 'better-sqlite3'
import type {
	AttachmentMeta,
	MailAccount,
	MailAccountInput,
	MailFolder,
	MessageAddress,
	MessageBody,
	MessageSummary,
	SearchResult,
	ThreadMessage,
	ThreadPage,
	ThreadSummary
} from '../../shared/mail'
import { decryptPassword, encryptPassword } from './credentials'

export interface ParsedAttachmentInput {
	filename: string
	contentType: string
	size: number
	contentId: string | null
	isInline: boolean
	content: Buffer
}

export interface StoredAttachment extends AttachmentMeta {
	messageId: number
	content: Buffer
}

/** Per-message flag state, used to diff against server flags during resync. */
export interface FlagState {
	seen: boolean
	flagged: boolean
	answered: boolean
}

export interface ParsedMessageInput {
	accountId: number
	folderId: number
	uid: number
	rfcMessageId: string
	inReplyTo: string | null
	references: string[]
	subject: string
	fromName: string
	fromAddress: string
	toAddresses: MessageAddress[]
	ccAddresses: MessageAddress[]
	date: string
	snippet: string
	seen: boolean
	flagged: boolean
	answered: boolean
	hasAttachments: boolean
	size: number
	textBody: string | null
	htmlBody: string | null
	searchBody: string
	attachments: ParsedAttachmentInput[]
	label: string | null
	labelSource: 'heuristic' | 'ml' | 'user' | null
	listUnsubscribe: string | null
	listUnsubscribeOneClick: boolean
	shipment: { carrier: string; trackingNumber: string | null; trackingUrl: string | null } | null
}

export type AccountAuthType = 'password' | 'oauth'

export interface AccountCredentials {
	accountId: number
	email: string
	imapHost: string
	imapPort: number
	imapUser: string
	imapPassword: string
	useTls: boolean
	smtpHost: string | null
	smtpPort: number | null
	authType: AccountAuthType
	oauthClientId: string | null
	oauthClientSecret: string | null
	oauthRefreshToken: string | null
}

/** Where a message lives on the server, for IMAP write operations. */
export interface MessageLocation {
	messageId: number
	accountId: number
	folderId: number
	folderPath: string
	folderSpecialUse: string | null
	uid: number
	threadId: number
	rfcMessageId: string
	seen: boolean
	flagged: boolean
	answered: boolean
}

export type LocalFlag = 'seen' | 'flagged' | 'answered'

interface AccountRow {
	account_id: number
	email: string
	imap_host: string
	imap_port: number
	imap_user: string
	imap_password_encrypted: Buffer
	use_tls: number
	smtp_host: string | null
	smtp_port: number | null
	auth_type: string
	oauth_client_id: string | null
	oauth_client_secret_encrypted: Buffer | null
	oauth_refresh_token_encrypted: Buffer | null
	oauth_access_token: string | null
	oauth_token_expires_at: string | null
	created_at: string
}

interface MessageRow {
	message_id: number
	account_id: number
	folder_id: number
	uid: number
	thread_id: number
	rfc_message_id: string
	in_reply_to: string | null
	subject: string
	from_name: string
	from_address: string
	date: string
	snippet: string
	seen: number
	flagged: number
	answered: number
	has_attachments: number
	label: string | null
}

const SUMMARY_COLUMNS = `m.message_id, m.account_id, m.folder_id, m.uid, m.thread_id,
	m.rfc_message_id, m.in_reply_to, m.subject, m.from_name, m.from_address,
	m.date, m.snippet, m.seen, m.flagged, m.answered, m.has_attachments, m.label`

function rowToSummary(row: MessageRow): MessageSummary {
	return {
		messageId: row.message_id,
		accountId: row.account_id,
		folderId: row.folder_id,
		uid: row.uid,
		threadId: row.thread_id,
		rfcMessageId: row.rfc_message_id,
		inReplyTo: row.in_reply_to,
		subject: row.subject,
		fromName: row.from_name,
		fromAddress: row.from_address,
		date: row.date,
		snippet: row.snippet,
		seen: row.seen === 1,
		flagged: row.flagged === 1,
		answered: row.answered === 1,
		hasAttachments: row.has_attachments === 1,
		label: row.label
	}
}

function addressesToSearchText(addresses: MessageAddress[]): string {
	return addresses.map((entry) => `${entry.name} ${entry.address}`).join(' ')
}

function decryptOptional(stored: Buffer | null): string | null {
	if (stored === null) return null
	return decryptPassword(stored)
}

export class MailStore {
	constructor(private database: Database) {}

	createAccount(input: MailAccountInput): MailAccount {
		const encrypted = encryptPassword(input.imapPassword)
		const result = this.database
			.prepare(
				`INSERT INTO accounts (email, imap_host, imap_port, imap_user, imap_password_encrypted, use_tls, smtp_host, smtp_port)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
			)
			.run(
				input.email,
				input.imapHost,
				input.imapPort,
				input.imapUser,
				encrypted,
				input.useTls ? 1 : 0,
				input.smtpHost,
				input.smtpPort
			)
		const account = this.getAccount(Number(result.lastInsertRowid))
		if (!account) throw new Error('account insert failed')
		return account
	}

	getAccount(accountId: number): MailAccount | null {
		const row = this.database
			.prepare('SELECT * FROM accounts WHERE account_id = ?')
			.get(accountId) as AccountRow | undefined
		if (!row) return null
		return this.rowToAccount(row)
	}

	listAccounts(): MailAccount[] {
		const rows = this.database
			.prepare('SELECT * FROM accounts ORDER BY account_id')
			.all() as AccountRow[]
		return rows.map((row) => this.rowToAccount(row))
	}

	deleteAccount(accountId: number): void {
		this.database.prepare('DELETE FROM accounts WHERE account_id = ?').run(accountId)
	}

	getCredentials(accountId: number): AccountCredentials | null {
		const row = this.database
			.prepare('SELECT * FROM accounts WHERE account_id = ?')
			.get(accountId) as AccountRow | undefined
		if (!row) return null
		return {
			accountId: row.account_id,
			email: row.email,
			imapHost: row.imap_host,
			imapPort: row.imap_port,
			imapUser: row.imap_user,
			imapPassword: decryptPassword(row.imap_password_encrypted),
			useTls: row.use_tls === 1,
			smtpHost: row.smtp_host,
			smtpPort: row.smtp_port,
			authType: row.auth_type === 'oauth' ? 'oauth' : 'password',
			oauthClientId: row.oauth_client_id,
			oauthClientSecret: decryptOptional(row.oauth_client_secret_encrypted),
			oauthRefreshToken: decryptOptional(row.oauth_refresh_token_encrypted)
		}
	}

	getOauthAccessToken(accountId: number): { accessToken: string; expiresAt: string } | null {
		const row = this.database
			.prepare('SELECT oauth_access_token, oauth_token_expires_at FROM accounts WHERE account_id = ?')
			.get(accountId) as
			| { oauth_access_token: string | null; oauth_token_expires_at: string | null }
			| undefined
		if (!row || row.oauth_access_token === null || row.oauth_token_expires_at === null) return null
		return { accessToken: row.oauth_access_token, expiresAt: row.oauth_token_expires_at }
	}

	setOauthAccessToken(accountId: number, accessToken: string, expiresAt: string): void {
		this.database
			.prepare('UPDATE accounts SET oauth_access_token = ?, oauth_token_expires_at = ? WHERE account_id = ?')
			.run(accessToken, expiresAt, accountId)
	}

	private rowToAccount(row: AccountRow): MailAccount {
		return {
			accountId: row.account_id,
			email: row.email,
			imapHost: row.imap_host,
			imapPort: row.imap_port,
			imapUser: row.imap_user,
			useTls: row.use_tls === 1,
			smtpHost: row.smtp_host,
			smtpPort: row.smtp_port,
			authType: row.auth_type === 'oauth' ? 'oauth' : 'password',
			createdAt: row.created_at
		}
	}

	/** Persist a Gmail OAuth account; secrets go through the same encryption as passwords. */
	createGmailAccount(
		input: { email: string; clientId: string; clientSecret: string },
		tokens: { accessToken: string; refreshToken: string; expiresAt: string }
	): MailAccount {
		const result = this.database
			.prepare(
				`INSERT INTO accounts (
					email, imap_host, imap_port, imap_user, imap_password_encrypted, use_tls,
					smtp_host, smtp_port, auth_type, oauth_client_id,
					oauth_client_secret_encrypted, oauth_refresh_token_encrypted,
					oauth_access_token, oauth_token_expires_at
				) VALUES (?, 'imap.gmail.com', 993, ?, ?, 1, 'smtp.gmail.com', 465, 'oauth', ?, ?, ?, ?, ?)`
			)
			.run(
				input.email,
				input.email,
				encryptPassword(''),
				input.clientId,
				encryptPassword(input.clientSecret),
				encryptPassword(tokens.refreshToken),
				tokens.accessToken,
				tokens.expiresAt
			)
		const account = this.getAccount(Number(result.lastInsertRowid))
		if (!account) throw new Error('account insert failed')
		return account
	}

	upsertFolder(
		accountId: number,
		path: string,
		name: string,
		delimiter: string | null,
		specialUse: string | null
	): number {
		this.database
			.prepare(
				`INSERT INTO folders (account_id, path, name, delimiter, special_use)
				 VALUES (?, ?, ?, ?, ?)
				 ON CONFLICT(account_id, path) DO UPDATE SET
					 name = excluded.name,
					 delimiter = excluded.delimiter,
					 special_use = excluded.special_use`
			)
			.run(accountId, path, name, delimiter, specialUse)
		const row = this.database
			.prepare('SELECT folder_id FROM folders WHERE account_id = ? AND path = ?')
			.get(accountId, path) as { folder_id: number }
		return row.folder_id
	}

	listFolders(accountId: number): MailFolder[] {
		const rows = this.database
			.prepare(
				`SELECT f.folder_id, f.account_id, f.path, f.name, f.special_use,
					COUNT(m.message_id) AS total_messages,
					SUM(CASE WHEN m.seen = 0 THEN 1 ELSE 0 END) AS unread_messages
				 FROM folders f
				 LEFT JOIN messages m ON m.folder_id = f.folder_id
				 WHERE f.account_id = ?
				 GROUP BY f.folder_id
				 ORDER BY
					 CASE f.special_use
						 WHEN '\\Inbox' THEN 0 WHEN '\\Sent' THEN 1 WHEN '\\Drafts' THEN 2
						 WHEN '\\Archive' THEN 3 WHEN '\\Junk' THEN 4 WHEN '\\Trash' THEN 5
						 ELSE 6
					 END,
					 f.path`
			)
			.all(accountId) as Array<{
			folder_id: number
			account_id: number
			path: string
			name: string
			special_use: string | null
			total_messages: number
			unread_messages: number | null
		}>
		return rows.map((row) => ({
			folderId: row.folder_id,
			accountId: row.account_id,
			path: row.path,
			name: row.name,
			specialUse: row.special_use,
			totalMessages: row.total_messages,
			unreadMessages: row.unread_messages === null ? 0 : row.unread_messages
		}))
	}

	getFolder(folderId: number): { folderId: number; accountId: number; path: string; specialUse: string | null } | null {
		const row = this.database
			.prepare('SELECT folder_id, account_id, path, special_use FROM folders WHERE folder_id = ?')
			.get(folderId) as
			| { folder_id: number; account_id: number; path: string; special_use: string | null }
			| undefined
		if (!row) return null
		return {
			folderId: row.folder_id,
			accountId: row.account_id,
			path: row.path,
			specialUse: row.special_use
		}
	}

	/** Find a special-use folder, falling back to well-known names. */
	findSpecialFolder(
		accountId: number,
		specialUse: string,
		nameFallbacks: string[]
	): { folderId: number; path: string } | null {
		const bySpecialUse = this.database
			.prepare('SELECT folder_id, path FROM folders WHERE account_id = ? AND special_use = ?')
			.get(accountId, specialUse) as { folder_id: number; path: string } | undefined
		if (bySpecialUse) return { folderId: bySpecialUse.folder_id, path: bySpecialUse.path }

		for (const name of nameFallbacks) {
			const byName = this.database
				.prepare('SELECT folder_id, path FROM folders WHERE account_id = ? AND (name = ? OR path = ?)')
				.get(accountId, name, name) as { folder_id: number; path: string } | undefined
			if (byName) return { folderId: byName.folder_id, path: byName.path }
		}
		return null
	}

	getFolderSyncState(folderId: number): { uidvalidity: number | null; lastSeenUid: number } {
		const row = this.database
			.prepare('SELECT uidvalidity, last_seen_uid FROM folders WHERE folder_id = ?')
			.get(folderId) as { uidvalidity: number | null; last_seen_uid: number }
		return { uidvalidity: row.uidvalidity, lastSeenUid: row.last_seen_uid }
	}

	setFolderUidvalidity(folderId: number, uidvalidity: number): void {
		this.database
			.prepare('UPDATE folders SET uidvalidity = ? WHERE folder_id = ?')
			.run(uidvalidity, folderId)
	}

	setFolderLastSeenUid(folderId: number, lastSeenUid: number): void {
		this.database
			.prepare('UPDATE folders SET last_seen_uid = MAX(last_seen_uid, ?) WHERE folder_id = ?')
			.run(lastSeenUid, folderId)
	}

	/** Wipe a folder's messages after a UIDVALIDITY change invalidates all UIDs. */
	clearFolderMessages(folderId: number): void {
		const clear = this.database.transaction((): void => {
			// message_search rows must go through their own DELETE so the FTS
			// triggers fire; a cascade would leave stale index entries.
			this.database
				.prepare(
					'DELETE FROM message_search WHERE message_id IN (SELECT message_id FROM messages WHERE folder_id = ?)'
				)
				.run(folderId)
			this.database.prepare('DELETE FROM messages WHERE folder_id = ?').run(folderId)
			this.database
				.prepare('UPDATE folders SET last_seen_uid = 0, highest_modseq = NULL WHERE folder_id = ?')
				.run(folderId)
		})
		clear()
	}

	knownUids(folderId: number): Set<number> {
		const rows = this.database
			.prepare('SELECT uid FROM messages WHERE folder_id = ?')
			.all(folderId) as Array<{ uid: number }>
		return new Set(rows.map((row) => row.uid))
	}

	getFolderModseq(folderId: number): string | null {
		const row = this.database
			.prepare('SELECT highest_modseq FROM folders WHERE folder_id = ?')
			.get(folderId) as { highest_modseq: string | null } | undefined
		if (!row) return null
		return row.highest_modseq
	}

	setFolderModseq(folderId: number, modseq: string): void {
		this.database
			.prepare('UPDATE folders SET highest_modseq = ? WHERE folder_id = ?')
			.run(modseq, folderId)
	}

	flagStates(folderId: number): Map<number, FlagState> {
		const rows = this.database
			.prepare('SELECT uid, seen, flagged, answered FROM messages WHERE folder_id = ?')
			.all(folderId) as Array<{ uid: number; seen: number; flagged: number; answered: number }>
		const states = new Map<number, FlagState>()
		for (const row of rows) {
			states.set(row.uid, {
				seen: row.seen === 1,
				flagged: row.flagged === 1,
				answered: row.answered === 1
			})
		}
		return states
	}

	/** Remove messages whose UIDs vanished from the server (expunged or moved away). */
	deleteMessagesByUids(folderId: number, uids: number[]): void {
		if (uids.length === 0) return
		const remove = this.database.transaction((): void => {
			for (const uid of uids) {
				const row = this.database
					.prepare('SELECT message_id FROM messages WHERE folder_id = ? AND uid = ?')
					.get(folderId, uid) as { message_id: number } | undefined
				if (!row) continue
				this.database.prepare('DELETE FROM message_search WHERE message_id = ?').run(row.message_id)
				this.database.prepare('DELETE FROM messages WHERE message_id = ?').run(row.message_id)
			}
		})
		remove()
	}

	/** Account a thread belongs to, for opening it from bare ids. */
	findThreadAccount(threadId: number): number | null {
		const row = this.database
			.prepare('SELECT account_id FROM messages WHERE thread_id = ? LIMIT 1')
			.get(threadId) as { account_id: number } | undefined
		if (!row) return null
		return row.account_id
	}

	findMessageIdByRfcId(accountId: number, rfcMessageId: string): number | null {
		if (rfcMessageId === '') return null
		const row = this.database
			.prepare(
				'SELECT message_id FROM messages WHERE account_id = ? AND rfc_message_id = ? ORDER BY message_id LIMIT 1'
			)
			.get(accountId, rfcMessageId) as { message_id: number } | undefined
		if (!row) return null
		return row.message_id
	}

	insertMessage(input: ParsedMessageInput): number | null {
		const insert = this.database.transaction((message: ParsedMessageInput): number | null => {
			const result = this.database
				.prepare(
					`INSERT INTO messages (
						account_id, folder_id, uid, rfc_message_id, in_reply_to, references_json,
						subject, from_name, from_address, to_json, cc_json, date, snippet,
						seen, flagged, answered, has_attachments, size, label, label_source,
						list_unsubscribe, list_unsubscribe_one_click
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(folder_id, uid) DO NOTHING`
				)
				.run(
					message.accountId,
					message.folderId,
					message.uid,
					message.rfcMessageId,
					message.inReplyTo,
					JSON.stringify(message.references),
					message.subject,
					message.fromName,
					message.fromAddress,
					JSON.stringify(message.toAddresses),
					JSON.stringify(message.ccAddresses),
					message.date,
					message.snippet,
					message.seen ? 1 : 0,
					message.flagged ? 1 : 0,
					message.answered ? 1 : 0,
					message.hasAttachments ? 1 : 0,
					message.size,
					message.label,
					message.labelSource,
					message.listUnsubscribe,
					message.listUnsubscribeOneClick ? 1 : 0
				)
			if (result.changes === 0) return null

			const messageId = Number(result.lastInsertRowid)
			this.database
				.prepare('INSERT INTO message_bodies (message_id, text_body, html_body) VALUES (?, ?, ?)')
				.run(messageId, message.textBody, message.htmlBody)
			this.database
				.prepare(
					`INSERT INTO message_search (message_id, subject, from_text, recipients, body)
					 VALUES (?, ?, ?, ?, ?)`
				)
				.run(
					messageId,
					message.subject,
					`${message.fromName} ${message.fromAddress}`,
					addressesToSearchText([...message.toAddresses, ...message.ccAddresses]),
					message.searchBody
				)
			this.insertAttachments(messageId, message.attachments)
			if (message.shipment) {
				this.saveExtraction(messageId, 'shipment', 'heuristic', JSON.stringify(message.shipment))
			}
			this.assignThread(messageId, message.accountId, message.rfcMessageId, message.inReplyTo, message.references)
			return messageId
		})
		return insert(input)
	}

	private insertAttachments(messageId: number, attachments: ParsedAttachmentInput[]): void {
		const insert = this.database.prepare(
			`INSERT INTO attachments (message_id, filename, content_type, size, content_id, is_inline, content)
			 VALUES (?, ?, ?, ?, ?, ?, ?)`
		)
		for (const attachment of attachments) {
			insert.run(
				messageId,
				attachment.filename,
				attachment.contentType,
				attachment.size,
				attachment.contentId,
				attachment.isInline ? 1 : 0,
				attachment.content
			)
		}
	}

	listAttachments(messageId: number): AttachmentMeta[] {
		const rows = this.database
			.prepare(
				`SELECT attachment_id, filename, content_type, size, content_id, is_inline
				 FROM attachments WHERE message_id = ? ORDER BY attachment_id`
			)
			.all(messageId) as Array<{
			attachment_id: number
			filename: string
			content_type: string
			size: number
			content_id: string | null
			is_inline: number
		}>
		return rows.map((row) => ({
			attachmentId: row.attachment_id,
			filename: row.filename,
			contentType: row.content_type,
			size: row.size,
			contentId: row.content_id,
			isInline: row.is_inline === 1
		}))
	}

	getAttachment(attachmentId: number): StoredAttachment | null {
		const row = this.database
			.prepare(
				`SELECT attachment_id, message_id, filename, content_type, size, content_id, is_inline, content
				 FROM attachments WHERE attachment_id = ?`
			)
			.get(attachmentId) as
			| {
					attachment_id: number
					message_id: number
					filename: string
					content_type: string
					size: number
					content_id: string | null
					is_inline: number
					content: Buffer
			  }
			| undefined
		if (!row) return null
		return {
			attachmentId: row.attachment_id,
			messageId: row.message_id,
			filename: row.filename,
			contentType: row.content_type,
			size: row.size,
			contentId: row.content_id,
			isInline: row.is_inline === 1,
			content: row.content
		}
	}

	/**
	 * Link a message into a thread. The thread id is the message_id of the
	 * first-seen member. A late-arriving parent merges the threads that were
	 * started by its children.
	 */
	private assignThread(
		messageId: number,
		accountId: number,
		rfcMessageId: string,
		inReplyTo: string | null,
		references: string[]
	): void {
		const relatedThreadIds = new Set<number>()

		const parentIds = [...new Set([...references, ...(inReplyTo ? [inReplyTo] : [])])].filter(
			(id) => id !== ''
		)
		if (parentIds.length > 0) {
			const placeholders = parentIds.map(() => '?').join(',')
			const rows = this.database
				.prepare(
					`SELECT DISTINCT thread_id FROM messages
					 WHERE account_id = ? AND thread_id IS NOT NULL AND rfc_message_id IN (${placeholders})`
				)
				.all(accountId, ...parentIds) as Array<{ thread_id: number }>
			for (const row of rows) relatedThreadIds.add(row.thread_id)
		}

		if (rfcMessageId !== '') {
			const childRows = this.database
				.prepare(
					`SELECT DISTINCT m.thread_id FROM messages m
					 WHERE m.account_id = ? AND m.thread_id IS NOT NULL AND m.message_id != ?
						 AND (m.in_reply_to = ?
							 OR EXISTS (SELECT 1 FROM json_each(m.references_json) WHERE json_each.value = ?))`
				)
				.all(accountId, messageId, rfcMessageId, rfcMessageId) as Array<{ thread_id: number }>
			for (const row of childRows) relatedThreadIds.add(row.thread_id)
		}

		if (relatedThreadIds.size === 0) {
			this.database.prepare('UPDATE messages SET thread_id = ? WHERE message_id = ?').run(messageId, messageId)
			return
		}

		const threadIds = [...relatedThreadIds].sort((a, b) => a - b)
		const canonical = threadIds[0]
		this.database.prepare('UPDATE messages SET thread_id = ? WHERE message_id = ?').run(canonical, messageId)
		if (threadIds.length > 1) {
			const placeholders = threadIds.slice(1).map(() => '?').join(',')
			this.database
				.prepare(`UPDATE messages SET thread_id = ? WHERE thread_id IN (${placeholders})`)
				.run(canonical, ...threadIds.slice(1))
		}
	}

	/** One-time thread assignment for rows that predate the thread_id column. */
	backfillThreads(): void {
		const pending = this.database
			.prepare(
				`SELECT message_id, account_id, rfc_message_id, in_reply_to, references_json
				 FROM messages WHERE thread_id IS NULL ORDER BY date ASC, message_id ASC`
			)
			.all() as Array<{
			message_id: number
			account_id: number
			rfc_message_id: string
			in_reply_to: string | null
			references_json: string
		}>
		if (pending.length === 0) return

		const backfill = this.database.transaction((): void => {
			for (const row of pending) {
				this.assignThread(
					row.message_id,
					row.account_id,
					row.rfc_message_id,
					row.in_reply_to,
					JSON.parse(row.references_json)
				)
			}
		})
		backfill()
	}

	getMessageLocation(messageId: number): MessageLocation | null {
		const row = this.database
			.prepare(
				`SELECT m.message_id, m.account_id, m.folder_id, m.uid, m.thread_id, m.rfc_message_id,
					m.seen, m.flagged, m.answered, f.path AS folder_path, f.special_use
				 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
				 WHERE m.message_id = ?`
			)
			.get(messageId) as
			| {
					message_id: number
					account_id: number
					folder_id: number
					uid: number
					thread_id: number
					rfc_message_id: string
					seen: number
					flagged: number
					answered: number
					folder_path: string
					special_use: string | null
			  }
			| undefined
		if (!row) return null
		return {
			messageId: row.message_id,
			accountId: row.account_id,
			folderId: row.folder_id,
			folderPath: row.folder_path,
			folderSpecialUse: row.special_use,
			uid: row.uid,
			threadId: row.thread_id,
			rfcMessageId: row.rfc_message_id,
			seen: row.seen === 1,
			flagged: row.flagged === 1,
			answered: row.answered === 1
		}
	}

	updateFlags(folderId: number, uid: number, seen: boolean, flagged: boolean, answered: boolean): void {
		this.database
			.prepare('UPDATE messages SET seen = ?, flagged = ?, answered = ? WHERE folder_id = ? AND uid = ?')
			.run(seen ? 1 : 0, flagged ? 1 : 0, answered ? 1 : 0, folderId, uid)
	}

	setLocalFlag(messageId: number, flag: LocalFlag, value: boolean): void {
		// Column names come from the LocalFlag union, never from user input.
		this.database
			.prepare(`UPDATE messages SET ${flag} = ? WHERE message_id = ?`)
			.run(value ? 1 : 0, messageId)
	}

	/** Re-point a message at its post-move folder/uid, keeping body and FTS rows. */
	rehomeMessage(messageId: number, targetFolderId: number, newUid: number): boolean {
		try {
			this.database
				.prepare('UPDATE messages SET folder_id = ?, uid = ? WHERE message_id = ?')
				.run(targetFolderId, newUid, messageId)
			return true
		} catch {
			// Target row already exists (folder was synced first); drop the stale copy.
			this.deleteMessageLocal(messageId)
			return false
		}
	}

	deleteMessageLocal(messageId: number): void {
		const remove = this.database.transaction((): void => {
			this.database.prepare('DELETE FROM message_search WHERE message_id = ?').run(messageId)
			this.database.prepare('DELETE FROM messages WHERE message_id = ?').run(messageId)
		})
		remove()
	}

	/** Folder ids of every Sent folder — the base of the priority signals. */
	private sentFolderIds(): number[] {
		const rows = this.database
			.prepare(
				`SELECT folder_id FROM folders
				 WHERE special_use = '\\Sent'
					 OR name IN ('Sent', 'Sent Messages', 'Sent Items', 'Gesendet', 'Gesendete Elemente')`
			)
			.all() as Array<{ folder_id: number }>
		return rows.map((row) => row.folder_id)
	}

	/**
	 * Priority = personal mail (no bulk label) that is flagged, part of a
	 * thread the user wrote in, or from someone the user has written to.
	 */
	private priorityClause(): string {
		const sentIds = this.sentFolderIds()
		if (sentIds.length === 0) return `(m.label IS NULL AND m.flagged = 1)`
		const idList = sentIds.join(',')
		return `(m.label IS NULL AND (
			m.flagged = 1
			OR EXISTS (SELECT 1 FROM messages t WHERE t.thread_id = m.thread_id AND t.folder_id IN (${idList}))
			OR lower(m.from_address) IN (
				SELECT DISTINCT lower(json_extract(j.value, '$.address'))
				FROM messages s, json_each(s.to_json) j WHERE s.folder_id IN (${idList})
			)
		))`
	}

	/** WHERE fragment + parameters for a label filter, incl. the __priority pseudo-label. */
	private labelFilterClause(label: string | null): { clause: string; parameters: unknown[] } {
		if (label === null) return { clause: '1=1', parameters: [] }
		if (label === '__priority') return { clause: this.priorityClause(), parameters: [] }
		return { clause: 'm.label = ?', parameters: [label] }
	}

	listThreads(folderId: number, limit: number, offset: number, label: string | null = null): ThreadPage {
		const filter = this.labelFilterClause(label)
		const rows = this.database
			.prepare(
				`SELECT ${SUMMARY_COLUMNS},
					(SELECT COUNT(*) FROM messages t WHERE t.thread_id = m.thread_id AND t.account_id = m.account_id) AS thread_total,
					(SELECT COUNT(*) FROM messages t WHERE t.thread_id = m.thread_id AND t.account_id = m.account_id AND t.seen = 0) AS thread_unread
				 FROM messages m
				 WHERE m.folder_id = ?
					 AND ${filter.clause}
					 AND m.message_id = (
						 SELECT m2.message_id FROM messages m2
						 WHERE m2.folder_id = m.folder_id AND m2.thread_id = m.thread_id
						 ORDER BY m2.date DESC, m2.message_id DESC LIMIT 1
					 )
				 ORDER BY m.date DESC LIMIT ? OFFSET ?`
			)
			.all(folderId, ...filter.parameters, limit, offset) as Array<
			MessageRow & { thread_total: number; thread_unread: number }
		>
		const total = this.database
			.prepare(
				`SELECT COUNT(DISTINCT m.thread_id) AS count FROM messages m
				 WHERE m.folder_id = ? AND ${filter.clause}`
			)
			.get(folderId, ...filter.parameters) as { count: number }
		const threads: ThreadSummary[] = rows.map((row) => ({
			...rowToSummary(row),
			threadTotal: row.thread_total,
			threadUnread: row.thread_unread
		}))
		return { threads, total: total.count }
	}

	/** Newest thread rows across the INBOX of every account, for the unified view. */
	listThreadsUnified(limit: number, offset: number, label: string | null = null): ThreadPage {
		const filter = this.labelFilterClause(label)
		const rows = this.database
			.prepare(
				`SELECT ${SUMMARY_COLUMNS},
					(SELECT COUNT(*) FROM messages t WHERE t.thread_id = m.thread_id AND t.account_id = m.account_id) AS thread_total,
					(SELECT COUNT(*) FROM messages t WHERE t.thread_id = m.thread_id AND t.account_id = m.account_id AND t.seen = 0) AS thread_unread
				 FROM messages m
				 JOIN folders f ON f.folder_id = m.folder_id
				 WHERE f.path = 'INBOX'
					 AND ${filter.clause}
					 AND m.message_id = (
						 SELECT m2.message_id FROM messages m2
						 JOIN folders f2 ON f2.folder_id = m2.folder_id
						 WHERE f2.path = 'INBOX' AND m2.thread_id = m.thread_id
						 ORDER BY m2.date DESC, m2.message_id DESC LIMIT 1
					 )
				 ORDER BY m.date DESC LIMIT ? OFFSET ?`
			)
			.all(...filter.parameters, limit, offset) as Array<
			MessageRow & { thread_total: number; thread_unread: number }
		>
		const total = this.database
			.prepare(
				`SELECT COUNT(DISTINCT m.thread_id) AS count
				 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
				 WHERE f.path = 'INBOX' AND ${filter.clause}`
			)
			.get(...filter.parameters) as { count: number }
		const threads: ThreadSummary[] = rows.map((row) => ({
			...rowToSummary(row),
			threadTotal: row.thread_total,
			threadUnread: row.thread_unread
		}))
		return { threads, total: total.count }
	}

	/** Unseen INBOX messages across all accounts, for the tray tooltip. */
	inboxUnreadCount(): number {
		const row = this.database
			.prepare(
				`SELECT COUNT(*) AS count
				 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
				 WHERE f.path = 'INBOX' AND m.seen = 0`
			)
			.get() as { count: number }
		return row.count
	}

	/** All messages of a thread across folders, oldest first, deduped by rfc id. */
	getThreadMessages(accountId: number, threadId: number): ThreadMessage[] {
		const rows = this.database
			.prepare(
				`SELECT ${SUMMARY_COLUMNS}, f.path AS folder_path
				 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
				 WHERE m.account_id = ? AND m.thread_id = ?
				 ORDER BY m.date ASC, m.message_id ASC`
			)
			.all(accountId, threadId) as Array<MessageRow & { folder_path: string }>

		const seenRfcIds = new Set<string>()
		const result: ThreadMessage[] = []
		for (const row of rows) {
			if (row.rfc_message_id !== '') {
				if (seenRfcIds.has(row.rfc_message_id)) continue
				seenRfcIds.add(row.rfc_message_id)
			}
			result.push({ ...rowToSummary(row), folderPath: row.folder_path })
		}
		return result
	}

	getMessageBody(messageId: number): MessageBody | null {
		const message = this.database
			.prepare(
				`SELECT to_json, cc_json, references_json, list_unsubscribe, list_unsubscribe_one_click
				 FROM messages WHERE message_id = ?`
			)
			.get(messageId) as
			| {
					to_json: string
					cc_json: string
					references_json: string
					list_unsubscribe: string | null
					list_unsubscribe_one_click: number
			  }
			| undefined
		if (!message) return null
		const body = this.database
			.prepare('SELECT text_body, html_body FROM message_bodies WHERE message_id = ?')
			.get(messageId) as { text_body: string | null; html_body: string | null } | undefined

		let unsubscribe: { oneClick: boolean } | null = null
		if (message.list_unsubscribe !== null) {
			unsubscribe = { oneClick: message.list_unsubscribe_one_click === 1 }
		}

		let shipment: MessageBody['shipment'] = null
		const extraction = this.getExtraction(messageId, 'shipment')
		if (extraction) {
			try {
				shipment = {
					...JSON.parse(extraction.payload),
					source: extraction.source === 'ai' ? 'ai' : 'heuristic'
				}
			} catch {
				// Corrupt payload — treat as absent.
			}
		}

		let actions: MessageBody['actions'] = null
		const actionsExtraction = this.getExtraction(messageId, 'actions')
		if (actionsExtraction) {
			try {
				actions = JSON.parse(actionsExtraction.payload)
			} catch {
				// Corrupt payload — treat as absent.
			}
		}
		return {
			messageId,
			textBody: body ? body.text_body : null,
			htmlBody: body ? body.html_body : null,
			toAddresses: JSON.parse(message.to_json),
			ccAddresses: JSON.parse(message.cc_json),
			references: JSON.parse(message.references_json),
			attachments: this.listAttachments(messageId),
			unsubscribe,
			shipment,
			actions
		}
	}

	saveExtraction(messageId: number, kind: string, source: string, payload: string): void {
		this.database
			.prepare(
				`INSERT OR REPLACE INTO message_extractions (message_id, kind, source, payload)
				 VALUES (?, ?, ?, ?)`
			)
			.run(messageId, kind, source, payload)
	}

	getExtraction(messageId: number, kind: string): { source: string; payload: string } | null {
		const row = this.database
			.prepare('SELECT source, payload FROM message_extractions WHERE message_id = ? AND kind = ?')
			.get(messageId, kind) as { source: string; payload: string } | undefined
		if (!row) return null
		return row
	}

	getUnsubscribeHeader(messageId: number): { header: string; oneClick: boolean } | null {
		const row = this.database
			.prepare(
				'SELECT list_unsubscribe, list_unsubscribe_one_click FROM messages WHERE message_id = ?'
			)
			.get(messageId) as
			| { list_unsubscribe: string | null; list_unsubscribe_one_click: number }
			| undefined
		if (!row || row.list_unsubscribe === null) return null
		return { header: row.list_unsubscribe, oneClick: row.list_unsubscribe_one_click === 1 }
	}

	/**
	 * Message counts per label for one folder, or across every INBOX when
	 * folderId is null. The null-label bucket (regular mail) is included.
	 */
	labelCounts(folderId: number | null): Array<{ label: string | null; count: number }> {
		let rows: Array<{ label: string | null; count: number }>
		if (folderId !== null) {
			rows = this.database
				.prepare('SELECT label, COUNT(*) AS count FROM messages WHERE folder_id = ? GROUP BY label')
				.all(folderId) as Array<{ label: string | null; count: number }>
		} else {
			rows = this.database
				.prepare(
					`SELECT m.label, COUNT(*) AS count
					 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
					 WHERE f.path = 'INBOX' GROUP BY m.label`
				)
				.all() as Array<{ label: string | null; count: number }>
		}
		rows.push({ label: '__priority', count: this.priorityCount(folderId) })
		return rows
	}

	private priorityCount(folderId: number | null): number {
		const clause = this.priorityClause()
		if (folderId !== null) {
			const row = this.database
				.prepare(`SELECT COUNT(*) AS count FROM messages m WHERE m.folder_id = ? AND ${clause}`)
				.get(folderId) as { count: number }
			return row.count
		}
		const row = this.database
			.prepare(
				`SELECT COUNT(*) AS count FROM messages m
				 JOIN folders f ON f.folder_id = m.folder_id
				 WHERE f.path = 'INBOX' AND ${clause}`
			)
			.get() as { count: number }
		return row.count
	}

	setMessageLabel(messageId: number, label: string | null, source: 'ml' | 'user'): void {
		this.database
			.prepare('UPDATE messages SET label = ?, label_source = ? WHERE message_id = ?')
			.run(label, label === null ? null : source, messageId)
	}

	/** Messages that still need an embedding, oldest text first kept simple: newest first. */
	embeddingCandidates(model: string, limit: number): Array<{ messageId: number; text: string }> {
		const rows = this.database
			.prepare(
				`SELECT m.message_id, m.subject, m.from_name, m.from_address, m.snippet, b.text_body
				 FROM messages m
				 LEFT JOIN message_bodies b ON b.message_id = m.message_id
				 WHERE NOT EXISTS (
					 SELECT 1 FROM message_embeddings e
					 WHERE e.message_id = m.message_id AND e.model = ?
				 )
				 ORDER BY m.message_id DESC LIMIT ?`
			)
			.all(model, limit) as Array<{
			message_id: number
			subject: string
			from_name: string
			from_address: string
			snippet: string
			text_body: string | null
		}>
		return rows.map((row) => {
			const body = row.text_body ? row.text_body.replace(/\s+/g, ' ').slice(0, 600) : row.snippet
			return {
				messageId: row.message_id,
				text: `${row.from_name} ${row.from_address}\n${row.subject}\n${body}`
			}
		})
	}

	embeddingBacklog(model: string): number {
		const row = this.database
			.prepare(
				`SELECT COUNT(*) AS count FROM messages m
				 WHERE NOT EXISTS (
					 SELECT 1 FROM message_embeddings e
					 WHERE e.message_id = m.message_id AND e.model = ?
				 )`
			)
			.get(model) as { count: number }
		return row.count
	}

	insertEmbedding(messageId: number, model: string, vector: Buffer): void {
		this.database
			.prepare(
				`INSERT OR REPLACE INTO message_embeddings (message_id, chunk_index, model, vector)
				 VALUES (?, 0, ?, ?)`
			)
			.run(messageId, model, vector)
	}

	/** Embeddings of messages with a trustworthy label (heuristic or user). */
	labeledEmbeddings(model: string): Array<{ label: string; vector: Buffer }> {
		return this.database
			.prepare(
				`SELECT m.label, e.vector
				 FROM messages m JOIN message_embeddings e ON e.message_id = m.message_id
				 WHERE e.model = ? AND m.label IS NOT NULL AND m.label_source IN ('heuristic', 'user')`
			)
			.all(model) as Array<{ label: string; vector: Buffer }>
	}

	/** Embedded but still unlabeled messages, newest first. */
	classifiableEmbeddings(
		model: string,
		limit: number
	): Array<{ messageId: number; accountId: number; folderId: number; vector: Buffer }> {
		const rows = this.database
			.prepare(
				`SELECT m.message_id, m.account_id, m.folder_id, e.vector
				 FROM messages m JOIN message_embeddings e ON e.message_id = m.message_id
				 WHERE e.model = ? AND m.label IS NULL
				 ORDER BY m.message_id DESC LIMIT ?`
			)
			.all(model, limit) as Array<{
			message_id: number
			account_id: number
			folder_id: number
			vector: Buffer
		}>
		return rows.map((row) => ({
			messageId: row.message_id,
			accountId: row.account_id,
			folderId: row.folder_id,
			vector: row.vector
		}))
	}

	/** All embeddings with summary rows for brute-force semantic search. */
	allEmbeddings(model: string, accountId: number | null): Array<{ messageId: number; vector: Buffer }> {
		const rows = this.database
			.prepare(
				`SELECT m.message_id, e.vector
				 FROM messages m JOIN message_embeddings e ON e.message_id = m.message_id
				 WHERE e.model = ? AND (? IS NULL OR m.account_id = ?)`
			)
			.all(model, accountId, accountId) as Array<{ message_id: number; vector: Buffer }>
		return rows.map((row) => ({ messageId: row.message_id, vector: row.vector }))
	}

	summariesWithFolder(messageIds: number[]): SearchResult[] {
		if (messageIds.length === 0) return []
		const placeholders = messageIds.map(() => '?').join(',')
		const rows = this.database
			.prepare(
				`SELECT ${SUMMARY_COLUMNS}, f.path AS folder_path
				 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
				 WHERE m.message_id IN (${placeholders})`
			)
			.all(...messageIds) as Array<MessageRow & { folder_path: string }>
		const byId = new Map(rows.map((row) => [row.message_id, row]))
		const result: SearchResult[] = []
		for (const messageId of messageIds) {
			const row = byId.get(messageId)
			if (!row) continue
			result.push({ ...rowToSummary(row), folderPath: row.folder_path, matchSnippet: row.snippet })
		}
		return result
	}

	/** Unseen recent INBOX mail across accounts — the raw material of the daily digest. */
	digestCandidates(limit: number): Array<{
		threadId: number
		accountId: number
		fromName: string
		fromAddress: string
		subject: string
		snippet: string
		label: string | null
	}> {
		const rows = this.database
			.prepare(
				`SELECT m.thread_id, m.account_id, m.from_name, m.from_address, m.subject, m.snippet, m.label
				 FROM messages m JOIN folders f ON f.folder_id = m.folder_id
				 WHERE f.path = 'INBOX' AND m.seen = 0
					 AND m.date >= datetime('now', '-36 hours')
					 AND (m.label IS NULL OR m.label != 'spam')
				 ORDER BY m.date DESC LIMIT ?`
			)
			.all(limit) as Array<{
			thread_id: number
			account_id: number
			from_name: string
			from_address: string
			subject: string
			snippet: string
			label: string | null
		}>
		return rows.map((row) => ({
			threadId: row.thread_id,
			accountId: row.account_id,
			fromName: row.from_name,
			fromAddress: row.from_address,
			subject: row.subject,
			snippet: row.snippet,
			label: row.label
		}))
	}

	/**
	 * Recipient suggestions from the synced mail: every address seen in
	 * From/To/Cc, ranked by how often it appears.
	 */
	suggestRecipients(
		accountId: number,
		query: string,
		limit: number
	): Array<{ address: string; name: string }> {
		const pattern = `%${query.replace(/[%_]/g, '')}%`
		const rows = this.database
			.prepare(
				`SELECT address, name, COUNT(*) AS uses FROM (
					SELECT json_extract(j.value, '$.address') AS address,
						json_extract(j.value, '$.name') AS name
					FROM messages m, json_each(m.to_json) j WHERE m.account_id = ?
					UNION ALL
					SELECT json_extract(j.value, '$.address'), json_extract(j.value, '$.name')
					FROM messages m, json_each(m.cc_json) j WHERE m.account_id = ?
					UNION ALL
					SELECT m.from_address, m.from_name FROM messages m WHERE m.account_id = ?
				)
				WHERE address != '' AND (address LIKE ? OR name LIKE ?)
				GROUP BY lower(address)
				ORDER BY uses DESC
				LIMIT ?`
			)
			.all(accountId, accountId, accountId, pattern, pattern, limit) as Array<{
			address: string
			name: string | null
		}>
		return rows.map((row) => ({ address: row.address, name: row.name || '' }))
	}

	search(query: string, accountId: number | null, limit: number): SearchResult[] {
		const ftsQuery = toFtsQuery(query)
		if (ftsQuery === '') return []
		const rows = this.database
			.prepare(
				`SELECT ${SUMMARY_COLUMNS},
					f.path AS folder_path,
					snippet(message_fts, 3, '[', ']', ' … ', 12) AS match_snippet
				 FROM message_fts
				 JOIN messages m ON m.message_id = message_fts.rowid
				 JOIN folders f ON f.folder_id = m.folder_id
				 WHERE message_fts MATCH ?
					 AND (? IS NULL OR m.account_id = ?)
				 ORDER BY rank
				 LIMIT ?`
			)
			.all(ftsQuery, accountId, accountId, limit) as Array<
			MessageRow & { folder_path: string; match_snippet: string }
		>
		return rows.map((row) => ({
			...rowToSummary(row),
			folderPath: row.folder_path,
			matchSnippet: row.match_snippet
		}))
	}
}

/**
 * Convert free text into a safe FTS5 prefix query. Quoting each term avoids
 * FTS syntax errors from user input (colons, dashes, unbalanced quotes).
 */
function toFtsQuery(input: string): string {
	const terms = input
		.split(/\s+/)
		.map((term) => term.replace(/"/g, ''))
		.filter((term) => term.length > 0)
	if (terms.length === 0) return ''
	return terms.map((term) => `"${term}"*`).join(' ')
}
