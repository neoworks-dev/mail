import { ImapFlow } from 'imapflow'
import { shell } from 'electron'
import type {
	EmbeddingStatus,
	GmailClientConfig,
	MailAccount,
	MailAccountInput,
	MailFolder,
	MessageBody,
	OutgoingMessage,
	SearchResult,
	SyncStatus,
	ThreadMessage,
	ThreadPage
} from '../../shared/mail'
import { freshAccessToken } from './auth'
import {
	bufferFromVector,
	buildCentroids,
	centroidMatches,
	cosineSimilarity,
	vectorFromBuffer
} from './classify'
import { openDatabase } from './db'
import { EMBEDDING_MODEL, embedPassages, embedQuery } from './embedder'
import { isMailLabel } from './labeling'
import { runGoogleOauthFlow } from './oauth'
import { trackShipment } from './tracking'
import { parseListUnsubscribe, parseMailto } from './unsubscribe'
import { getGoogleClientConfig, setGoogleClientConfig } from './oauth-config'
import { MailOps } from './ops'
import { parseRawMessage } from './parse'
import { composeMail, sendMail } from './send'
import type { AccountCredentials, LocalFlag, MessageLocation, StoredAttachment } from './store'
import { MailStore } from './store'
import {
	AccountSync,
	type MessagesChangedListener,
	type NewMessagesListener,
	type SyncStatusListener
} from './sync'

const EMBED_BATCH_SIZE = 16
const EMBED_INTERVAL_MS = 20_000
const CLASSIFY_BATCH_SIZE = 200
/** Accept an ml label only when clearly closest to one centroid. */
const ML_MIN_SIMILARITY = 0.85
const ML_MIN_MARGIN = 0.02

const TRASH_FALLBACK_NAMES = ['Trash', 'Deleted Items', 'Deleted Messages', 'INBOX.Trash']
const ARCHIVE_FALLBACK_NAMES = ['Archive', 'Archives', 'INBOX.Archive']
const SENT_FALLBACK_NAMES = ['Sent', 'Sent Messages', 'Sent Items', 'INBOX.Sent']
const DRAFTS_FALLBACK_NAMES = ['Drafts', 'Draft', 'INBOX.Drafts']

/**
 * Facade the IPC layer talks to. Owns the store, one AccountSync (read/IDLE
 * connection) and one MailOps (write connection) per account.
 */
export class MailEngine {
	private store: MailStore
	private syncs = new Map<number, AccountSync>()
	private ops = new Map<number, MailOps>()
	private latestStatus = new Map<number, SyncStatus>()
	private embedTimer: ReturnType<typeof setInterval> | null = null
	private embedRunning = false
	private embedErrorLogged = false

	constructor(
		private onStatus: SyncStatusListener,
		private onMessagesChanged: MessagesChangedListener,
		private onNewMessages: NewMessagesListener | null = null,
		private onEmbeddingStatus: ((status: EmbeddingStatus) => void) | null = null
	) {
		this.store = new MailStore(openDatabase())
		this.store.backfillThreads()
	}

	startAllAccounts(): void {
		for (const account of this.store.listAccounts()) {
			this.startAccountSync(account.accountId)
		}
		this.startEmbeddingLoop()
	}

	async shutdown(): Promise<void> {
		if (this.embedTimer) {
			clearInterval(this.embedTimer)
			this.embedTimer = null
		}
		for (const sync of this.syncs.values()) {
			await sync.stop()
		}
		this.syncs.clear()
		for (const ops of this.ops.values()) {
			await ops.stop()
		}
		this.ops.clear()
	}

	/** Validates credentials with a real IMAP login before persisting. */
	async addAccount(input: MailAccountInput): Promise<MailAccount> {
		const probe = new ImapFlow({
			host: input.imapHost,
			port: input.imapPort,
			secure: input.useTls,
			auth: { user: input.imapUser, pass: input.imapPassword },
			logger: false
		})
		await probe.connect()
		await probe.logout()

		const account = this.store.createAccount(input)
		this.startAccountSync(account.accountId)
		return account
	}

	gmailClientConfigured(): boolean {
		return getGoogleClientConfig() !== null
	}

	setGmailClientConfig(config: GmailClientConfig): void {
		if (config.clientId.trim() === '' || config.clientSecret.trim() === '') {
			throw new Error('client id and secret are both required')
		}
		setGoogleClientConfig({
			clientId: config.clientId.trim(),
			clientSecret: config.clientSecret.trim()
		})
	}

	/**
	 * One-click Gmail sign-in: browser consent against the app-wide OAuth
	 * client, address taken from the returned id_token, then a real IMAP
	 * XOAUTH2 login validates the token before anything is persisted.
	 */
	async addGmailAccount(): Promise<MailAccount> {
		const config = getGoogleClientConfig()
		if (!config) {
			throw new Error('Google OAuth client is not configured yet')
		}

		const tokens = await runGoogleOauthFlow(
			config.clientId,
			config.clientSecret,
			'',
			(url) => void shell.openExternal(url)
		)
		if (tokens.email === null) {
			throw new Error('Google sign-in did not return an email address')
		}
		const email = tokens.email

		const duplicate = this.store.listAccounts().find((account) => account.email === email)
		if (duplicate) {
			throw new Error(`${email} is already connected`)
		}

		const probe = new ImapFlow({
			host: 'imap.gmail.com',
			port: 993,
			secure: true,
			auth: { user: email, accessToken: tokens.accessToken },
			logger: false
		})
		await probe.connect()
		await probe.logout()

		const account = this.store.createGmailAccount(
			{ email, clientId: config.clientId, clientSecret: config.clientSecret },
			tokens
		)
		this.startAccountSync(account.accountId)
		return account
	}

	async removeAccount(accountId: number): Promise<void> {
		const sync = this.syncs.get(accountId)
		if (sync) {
			await sync.stop()
			this.syncs.delete(accountId)
		}
		const ops = this.ops.get(accountId)
		if (ops) {
			await ops.stop()
			this.ops.delete(accountId)
		}
		this.latestStatus.delete(accountId)
		this.store.deleteAccount(accountId)
	}

	listAccounts(): MailAccount[] {
		return this.store.listAccounts()
	}

	listFolders(accountId: number): MailFolder[] {
		return this.store.listFolders(accountId)
	}

	listThreads(folderId: number, limit: number, offset: number, label: string | null): ThreadPage {
		return this.store.listThreads(folderId, limit, offset, label)
	}

	listThreadsUnified(limit: number, offset: number, label: string | null): ThreadPage {
		return this.store.listThreadsUnified(limit, offset, label)
	}

	inboxUnreadCount(): number {
		return this.store.inboxUnreadCount()
	}

	getThreadMessages(accountId: number, threadId: number): ThreadMessage[] {
		return this.store.getThreadMessages(accountId, threadId)
	}

	getMessageBody(messageId: number): MessageBody | null {
		return this.store.getMessageBody(messageId)
	}

	search(query: string, accountId: number | null, limit: number): SearchResult[] {
		return this.store.search(query, accountId, limit)
	}

	/** Brute-force cosine search over the local embeddings. */
	async searchSemantic(query: string, accountId: number | null, limit: number): Promise<SearchResult[]> {
		const queryVector = await embedQuery(query)
		const candidates = this.store.allEmbeddings(EMBEDDING_MODEL, accountId)
		const scored = candidates.map((candidate) => ({
			messageId: candidate.messageId,
			similarity: cosineSimilarity(queryVector, vectorFromBuffer(candidate.vector))
		}))
		scored.sort((a, b) => b.similarity - a.similarity)
		return this.store.summariesWithFolder(scored.slice(0, limit).map((entry) => entry.messageId))
	}

	labelCounts(folderId: number | null): Array<{ label: string | null; count: number }> {
		return this.store.labelCounts(folderId)
	}

	suggestRecipients(accountId: number, query: string, limit: number): Array<{ address: string; name: string }> {
		return this.store.suggestRecipients(accountId, query, limit)
	}

	digestCandidates(): ReturnType<MailStore['digestCandidates']> {
		return this.store.digestCandidates(60)
	}

	/**
	 * Unsubscribe from the list a message came from. Preference order:
	 * RFC 8058 one-click POST (silent), mailto (sends the unsubscribe mail
	 * through the account), plain link (opened in the browser).
	 */
	async unsubscribe(messageId: number): Promise<'posted' | 'sent' | 'opened'> {
		const info = this.store.getUnsubscribeHeader(messageId)
		if (!info) throw new Error('message has no unsubscribe header')
		const target = parseListUnsubscribe(info.header)

		if (target.url && info.oneClick) {
			const response = await fetch(target.url, {
				method: 'POST',
				headers: { 'content-type': 'application/x-www-form-urlencoded' },
				body: 'List-Unsubscribe=One-Click',
				signal: AbortSignal.timeout(10_000)
			})
			if (!response.ok) throw new Error(`unsubscribe endpoint answered HTTP ${response.status}`)
			return 'posted'
		}

		if (target.mailto) {
			const request = parseMailto(target.mailto)
			if (!request) throw new Error('unusable mailto unsubscribe address')
			const location = this.requireLocation(messageId)
			const credentials = this.store.getCredentials(location.accountId)
			if (!credentials) throw new Error('account not found')
			await sendMail(
				credentials,
				{
					from: credentials.email,
					to: request.to,
					cc: '',
					subject: request.subject,
					markdown: request.body,
					inReplyTo: null,
					references: [],
					attachments: []
				},
				await this.smtpAccessToken(credentials)
			)
			return 'sent'
		}

		if (target.url) {
			await shell.openExternal(target.url)
			return 'opened'
		}
		throw new Error('no usable unsubscribe target in the header')
	}

	/**
	 * Query the carrier API for the live status of a message's extracted
	 * shipment and merge the result into the stored extraction.
	 */
	async trackShipmentStatus(messageId: number): Promise<void> {
		const extraction = this.store.getExtraction(messageId, 'shipment')
		if (!extraction) throw new Error('message has no shipment extraction')
		const payload = JSON.parse(extraction.payload) as {
			carrier: string
			trackingNumber: string | null
			[key: string]: unknown
		}
		if (!payload.trackingNumber) throw new Error('no tracking number to look up')

		const result = await trackShipment(payload.carrier, payload.trackingNumber)
		const merged = {
			...payload,
			status: result.status,
			deliveryDate: result.deliveryDate === null ? payload.deliveryDate : result.deliveryDate,
			lastEvent: result.lastEvent,
			trackedAt: result.trackedAt
		}
		this.store.saveExtraction(messageId, 'shipment', extraction.source, JSON.stringify(merged))
	}

	/** Persist user-triggered AI action items. */
	saveActionsExtraction(messageId: number, items: Array<{ title: string; due: string | null }>): void {
		if (!Array.isArray(items)) throw new Error('items must be an array')
		const cleaned = items
			.filter((item) => typeof item.title === 'string' && item.title.trim() !== '')
			.map((item) => ({
				title: item.title.trim(),
				due: typeof item.due === 'string' && item.due.trim() !== '' ? item.due.trim() : null
			}))
		this.requireLocation(messageId)
		this.store.saveExtraction(messageId, 'actions', 'ai', JSON.stringify({ items: cleaned }))
	}

	/** Persist a user-triggered AI shipment extraction. */
	saveShipmentExtraction(
		messageId: number,
		payload: { carrier: string; trackingNumber: string | null; trackingUrl: string | null; status?: string; deliveryDate?: string }
	): void {
		if (typeof payload.carrier !== 'string' || payload.carrier === '') {
			throw new Error('extraction needs a carrier')
		}
		if (payload.trackingUrl !== null && !/^https?:\/\//i.test(String(payload.trackingUrl))) {
			payload.trackingUrl = null
		}
		this.requireLocation(messageId)
		this.store.saveExtraction(messageId, 'shipment', 'ai', JSON.stringify(payload))
	}

	/** Manual relabel from the UI; user labels train the ml classifier. */
	setMessageUserLabel(messageId: number, label: string | null): void {
		if (label !== null && !isMailLabel(label)) throw new Error(`unknown label: ${label}`)
		const location = this.requireLocation(messageId)
		this.store.setMessageLabel(messageId, label, 'user')
		this.onMessagesChanged(location.accountId, location.folderId)
	}

	syncStatuses(): SyncStatus[] {
		return [...this.latestStatus.values()]
	}

	/**
	 * Flag changes apply locally first so the UI updates instantly; the server
	 * STORE runs behind them and only logs on failure.
	 */
	setFlag(messageId: number, flag: LocalFlag, value: boolean): void {
		const location = this.requireLocation(messageId)
		this.store.setLocalFlag(messageId, flag, value)
		this.onMessagesChanged(location.accountId, location.folderId)

		const ops = this.opsFor(location.accountId)
		void ops.setFlag(location.folderPath, location.uid, flag, value).catch((error: Error) => {
			console.error(`[mail] flag writeback failed (${flag}=${value}): ${error.message}`)
		})
	}

	async moveMessage(messageId: number, targetFolderId: number): Promise<void> {
		const location = this.requireLocation(messageId)
		const target = this.store.getFolder(targetFolderId)
		if (!target) throw new Error('target folder not found')
		if (target.accountId !== location.accountId) throw new Error('cannot move across accounts')
		if (target.folderId === location.folderId) return

		const ops = this.opsFor(location.accountId)
		const newUid = await ops.move(location.folderPath, location.uid, target.path)
		if (newUid !== null) {
			this.store.rehomeMessage(messageId, target.folderId, newUid)
		} else {
			// Server lacks COPYUID; drop the stale row and refetch the target folder.
			this.store.deleteMessageLocal(messageId)
			void ops.syncFolder(target.folderId, target.path).catch((error: Error) => {
				console.error(`[mail] post-move sync failed: ${error.message}`)
			})
		}
		this.onMessagesChanged(location.accountId, location.folderId)
		this.onMessagesChanged(location.accountId, target.folderId)
	}

	async archiveMessage(messageId: number): Promise<void> {
		const location = this.requireLocation(messageId)
		const archive = this.store.findSpecialFolder(location.accountId, '\\Archive', ARCHIVE_FALLBACK_NAMES)
		if (!archive) throw new Error('no archive folder on this account')
		await this.moveMessage(messageId, archive.folderId)
	}

	/** Move to Trash; a message already in Trash is expunged for good. */
	async deleteMessage(messageId: number): Promise<void> {
		const location = this.requireLocation(messageId)
		const trash = this.store.findSpecialFolder(location.accountId, '\\Trash', TRASH_FALLBACK_NAMES)

		const alreadyInTrash = trash !== null && trash.folderId === location.folderId
		if (trash && !alreadyInTrash) {
			await this.moveMessage(messageId, trash.folderId)
			return
		}

		if (!trash) console.warn('[mail] no trash folder found — deleting permanently')
		const ops = this.opsFor(location.accountId)
		await ops.permanentDelete(location.folderPath, location.uid)
		this.store.deleteMessageLocal(messageId)
		this.onMessagesChanged(location.accountId, location.folderId)
	}

	async sendMessage(input: OutgoingMessage): Promise<void> {
		const credentials = this.store.getCredentials(input.accountId)
		if (!credentials) throw new Error('account not found')

		const reply = this.resolveReplyHeaders(input)
		const composed = await sendMail(
			credentials,
			{
				from: credentials.email,
				to: input.to,
				cc: input.cc,
				subject: input.subject,
				markdown: input.markdown,
				inReplyTo: reply.inReplyTo,
				references: reply.references,
				attachments: input.attachments
			},
			await this.smtpAccessToken(credentials)
		)

		if (reply.location) {
			this.setFlag(reply.location.messageId, 'answered', true)
		}
		if (input.draftMessageId !== null) {
			await this.discardDraft(input.draftMessageId).catch((error: Error) => {
				console.error(`[mail] removing draft after send failed: ${error.message}`)
			})
		}
		await this.storeSentCopy(input.accountId, composed.raw)
	}

	/**
	 * APPEND the current composer state to the Drafts folder, replacing the
	 * previous autosave. Resolves to the local message id of the new draft.
	 */
	async saveDraft(input: OutgoingMessage): Promise<number | null> {
		const credentials = this.store.getCredentials(input.accountId)
		if (!credentials) throw new Error('account not found')
		const drafts = this.store.findSpecialFolder(input.accountId, '\\Drafts', DRAFTS_FALLBACK_NAMES)
		if (!drafts) {
			console.warn('[mail] no drafts folder found — draft not saved')
			return null
		}

		const reply = this.resolveReplyHeaders(input)
		const composed = await composeMail({
			from: credentials.email,
			to: input.to,
			cc: input.cc,
			subject: input.subject,
			markdown: input.markdown,
			inReplyTo: reply.inReplyTo,
			references: reply.references,
			attachments: input.attachments
		})

		const ops = this.opsFor(input.accountId)
		const uid = await ops.append(drafts.path, composed.raw, ['\\Draft', '\\Seen'])

		// New draft is safely on the server; now drop the superseded one.
		if (input.draftMessageId !== null) {
			await this.discardDraft(input.draftMessageId).catch((error: Error) => {
				console.error(`[mail] removing superseded draft failed: ${error.message}`)
			})
		}

		if (uid === null) {
			await ops.syncFolder(drafts.folderId, drafts.path)
			return null
		}
		const parsed = await parseRawMessage(
			composed.raw,
			input.accountId,
			drafts.folderId,
			uid,
			new Set(['\\Draft', '\\Seen']),
			composed.raw.length
		)
		const messageId = this.store.insertMessage(parsed)
		this.onMessagesChanged(input.accountId, drafts.folderId)
		return messageId
	}

	async discardDraft(messageId: number): Promise<void> {
		const location = this.store.getMessageLocation(messageId)
		if (!location) return
		const ops = this.opsFor(location.accountId)
		await ops.permanentDelete(location.folderPath, location.uid)
		this.store.deleteMessageLocal(messageId)
		this.onMessagesChanged(location.accountId, location.folderId)
	}

	getAttachment(attachmentId: number): StoredAttachment | null {
		return this.store.getAttachment(attachmentId)
	}

	findMessageIdByRfcId(accountId: number, rfcMessageId: string): number | null {
		return this.store.findMessageIdByRfcId(accountId, rfcMessageId)
	}

	/** Where a message lives, for the UI to open its thread. */
	locateMessage(messageId: number): { accountId: number; threadId: number } | null {
		const location = this.store.getMessageLocation(messageId)
		if (!location) return null
		return { accountId: location.accountId, threadId: location.threadId }
	}

	locateThread(threadId: number): number | null {
		return this.store.findThreadAccount(threadId)
	}

	private resolveReplyHeaders(input: OutgoingMessage): {
		inReplyTo: string | null
		references: string[]
		location: MessageLocation | null
	} {
		if (input.replyToMessageId === null) {
			return { inReplyTo: null, references: [], location: null }
		}
		const location = this.store.getMessageLocation(input.replyToMessageId)
		if (!location || location.rfcMessageId === '') {
			return { inReplyTo: null, references: [], location }
		}
		const body = this.store.getMessageBody(input.replyToMessageId)
		return {
			inReplyTo: location.rfcMessageId,
			references: body ? body.references : [],
			location
		}
	}

	/** APPEND the sent bytes to the Sent folder and mirror them locally. */
	private async storeSentCopy(accountId: number, raw: Buffer): Promise<void> {
		const sent = this.store.findSpecialFolder(accountId, '\\Sent', SENT_FALLBACK_NAMES)
		if (!sent) {
			console.warn('[mail] no sent folder found — sent message not stored')
			return
		}

		const ops = this.opsFor(accountId)
		try {
			const uid = await ops.append(sent.path, raw, ['\\Seen'])
			if (uid === null) {
				await ops.syncFolder(sent.folderId, sent.path)
				return
			}
			const parsed = await parseRawMessage(raw, accountId, sent.folderId, uid, new Set(['\\Seen']), raw.length)
			this.store.insertMessage(parsed)
			this.onMessagesChanged(accountId, sent.folderId)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			console.error(`[mail] storing sent copy failed: ${message}`)
		}
	}

	private async smtpAccessToken(credentials: AccountCredentials): Promise<string | null> {
		if (credentials.authType !== 'oauth') return null
		return freshAccessToken(this.store, credentials)
	}

	private requireLocation(messageId: number): MessageLocation {
		const location = this.store.getMessageLocation(messageId)
		if (!location) throw new Error('message not found')
		return location
	}

	private opsFor(accountId: number): MailOps {
		const existing = this.ops.get(accountId)
		if (existing) return existing
		const credentials = this.store.getCredentials(accountId)
		if (!credentials) throw new Error('account not found')
		const ops = new MailOps(this.store, credentials, this.onMessagesChanged)
		this.ops.set(accountId, ops)
		return ops
	}

	/**
	 * Background loop: embed new messages, then let the centroid classifier
	 * label whatever the header heuristics left blank. Everything is best-
	 * effort — an offline first run (model download) just retries later.
	 */
	private startEmbeddingLoop(): void {
		if (this.embedTimer) return
		this.embedTimer = setInterval(() => {
			void this.runEmbeddingPass()
		}, EMBED_INTERVAL_MS)
		void this.runEmbeddingPass()
	}

	private emitEmbeddingStatus(running: boolean, error: string | null): void {
		if (!this.onEmbeddingStatus) return
		this.onEmbeddingStatus({
			pending: this.store.embeddingBacklog(EMBEDDING_MODEL),
			running,
			error
		})
	}

	private async runEmbeddingPass(): Promise<void> {
		if (this.embedRunning) return
		this.embedRunning = true
		try {
			const candidates = this.store.embeddingCandidates(EMBEDDING_MODEL, EMBED_BATCH_SIZE)
			if (candidates.length > 0) {
				this.emitEmbeddingStatus(true, null)
				const vectors = await embedPassages(candidates.map((candidate) => candidate.text))
				for (let index = 0; index < candidates.length; index += 1) {
					this.store.insertEmbedding(
						candidates[index].messageId,
						EMBEDDING_MODEL,
						bufferFromVector(vectors[index])
					)
				}
			}
			this.classifyPending()
			this.embedErrorLogged = false
			this.emitEmbeddingStatus(false, null)
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error)
			if (!this.embedErrorLogged) {
				console.error(`[mail] embedding pass failed (will retry): ${message}`)
				this.embedErrorLogged = true
			}
			this.emitEmbeddingStatus(false, message)
		} finally {
			this.embedRunning = false
		}
	}

	private classifyPending(): void {
		const pending = this.store.classifiableEmbeddings(EMBEDDING_MODEL, CLASSIFY_BATCH_SIZE)
		if (pending.length === 0) return

		const examples = this.store.labeledEmbeddings(EMBEDDING_MODEL).map((row) => ({
			label: row.label,
			vector: vectorFromBuffer(row.vector)
		}))
		const centroids = buildCentroids(examples)
		if (centroids.size === 0) return

		const changedFolders = new Map<number, number>()
		for (const candidate of pending) {
			const matches = centroidMatches(vectorFromBuffer(candidate.vector), centroids)
			if (matches.length === 0) continue
			const best = matches[0]
			if (best.similarity < ML_MIN_SIMILARITY) continue
			if (matches.length > 1 && best.similarity - matches[1].similarity < ML_MIN_MARGIN) continue
			this.store.setMessageLabel(candidate.messageId, best.label, 'ml')
			changedFolders.set(candidate.folderId, candidate.accountId)
		}
		for (const [folderId, accountId] of changedFolders) {
			this.onMessagesChanged(accountId, folderId)
		}
	}

	private startAccountSync(accountId: number): void {
		if (this.syncs.has(accountId)) return
		const credentials = this.store.getCredentials(accountId)
		if (!credentials) return

		const sync = new AccountSync(
			this.store,
			credentials,
			(status) => {
				this.latestStatus.set(status.accountId, status)
				this.onStatus(status)
			},
			this.onMessagesChanged,
			this.onNewMessages
		)
		this.syncs.set(accountId, sync)
		sync.start()
	}
}
