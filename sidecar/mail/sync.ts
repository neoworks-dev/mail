import { ImapFlow, type ListResponse } from 'imapflow'
import type { SyncStatus } from '../../shared/mail'
import { imapAuthFor } from './auth'
import { parseRawMessage } from './parse'
import type { AccountCredentials, MailStore } from './store'

const FETCH_BATCH_SIZE = 50
const RECONNECT_DELAY_MS = 5000
/** Full pass over every folder while otherwise idling on INBOX. */
const RESYNC_INTERVAL_MS = 5 * 60_000
/** Let event bursts (bulk expunge, flag sweeps) settle before reconciling. */
const EVENT_DEBOUNCE_MS = 1000

export type SyncStatusListener = (status: SyncStatus) => void
export type MessagesChangedListener = (accountId: number, folderId: number) => void

/** A message worth notifying about: new, unseen, in INBOX, after initial sync. */
export interface NewMessageInfo {
	accountId: number
	fromName: string
	fromAddress: string
	subject: string
}

export type NewMessagesListener = (messages: NewMessageInfo[]) => void

interface SyncFolderTarget {
	folderId: number
	path: string
}

/**
 * One sync engine per account. On connect it reconciles every folder (new
 * messages, server-side deletions, flag changes), then parks on INBOX in IDLE.
 * Server events wake an INBOX reconcile; a timer repeats the full pass.
 */
export class AccountSync {
	private client: ImapFlow | null = null
	private stopped = false
	private downloadedMessages = 0
	private totalMessages = 0
	private inboxDirty = false
	private wake: (() => void) | null = null
	/** Set once the first full pass is done; gates new-message notifications. */
	private initialSyncComplete = false

	constructor(
		private store: MailStore,
		private credentials: AccountCredentials,
		private onStatus: SyncStatusListener,
		private onMessagesChanged: MessagesChangedListener,
		private onNewMessages: NewMessagesListener | null = null
	) {}

	start(): void {
		void this.runLoop()
	}

	async stop(): Promise<void> {
		this.stopped = true
		this.wakeUp()
		if (!this.client) return
		try {
			await this.client.logout()
		} catch {
			this.client.close()
		}
		this.client = null
	}

	private emitStatus(
		phase: SyncStatus['phase'],
		folderPath: string | null,
		errorMessage: string | null = null
	): void {
		this.onStatus({
			accountId: this.credentials.accountId,
			phase,
			folderPath,
			downloadedMessages: this.downloadedMessages,
			totalMessages: this.totalMessages,
			errorMessage
		})
	}

	private async runLoop(): Promise<void> {
		while (!this.stopped) {
			try {
				await this.syncOnce()
			} catch (error) {
				if (this.stopped) return
				const message = error instanceof Error ? error.message : String(error)
				this.emitStatus('error', null, message)
			}
			if (this.stopped) return
			await delay(RECONNECT_DELAY_MS)
		}
	}

	private async syncOnce(): Promise<void> {
		this.emitStatus('connecting', null)
		const auth = await imapAuthFor(this.store, this.credentials)
		const client = new ImapFlow({
			host: this.credentials.imapHost,
			port: this.credentials.imapPort,
			secure: this.credentials.useTls,
			auth,
			logger: false
		})
		this.client = client

		await client.connect()

		this.emitStatus('listing', null)
		const targets = await this.syncFolderList(client)

		for (const target of targets) {
			if (this.stopped) return
			await this.reconcileFolder(client, target)
		}

		this.initialSyncComplete = true
		this.emitStatus('idle', 'INBOX')
		await this.watchLoop(client)
	}

	/** Upsert the folder tree; INBOX first so it reconciles before archives. */
	private async syncFolderList(client: ImapFlow): Promise<SyncFolderTarget[]> {
		const listed = await client.list()
		const selectable = listed.filter((entry) => !entry.flags.has('\\Noselect'))
		selectable.sort((a, b) => folderPriority(a) - folderPriority(b))

		const targets: SyncFolderTarget[] = []
		for (const entry of selectable) {
			const folderId = this.store.upsertFolder(
				this.credentials.accountId,
				entry.path,
				entry.name,
				entry.delimiter || null,
				entry.specialUse || null
			)
			targets.push({ folderId, path: entry.path })
		}
		return targets
	}

	/**
	 * Bring one folder fully in line with the server: drop rows whose UIDs are
	 * gone, download new UIDs, and diff flags on everything else.
	 */
	private async reconcileFolder(client: ImapFlow, target: SyncFolderTarget): Promise<void> {
		const lock = await client.getMailboxLock(target.path)
		try {
			const mailbox = client.mailbox
			if (!mailbox || typeof mailbox === 'boolean') return

			this.handleUidvalidity(target.folderId, Number(mailbox.uidValidity))

			const onServer = await client.search({ all: true }, { uid: true })
			const serverUids = onServer ? onServer : []
			const serverUidSet = new Set(serverUids)
			const known = this.store.knownUids(target.folderId)

			const deletedUids = [...known].filter((uid) => !serverUidSet.has(uid))
			if (deletedUids.length > 0) {
				this.store.deleteMessagesByUids(target.folderId, deletedUids)
				this.onMessagesChanged(this.credentials.accountId, target.folderId)
			}

			const pendingUids = serverUids.filter((uid) => !known.has(uid))
			if (pendingUids.length > 0) {
				this.totalMessages += pendingUids.length
				this.emitStatus('backfill', target.path)
				// Newest first so the visible mailbox top fills in immediately.
				pendingUids.sort((a, b) => b - a)
				for (let index = 0; index < pendingUids.length; index += FETCH_BATCH_SIZE) {
					if (this.stopped) return
					const batch = pendingUids.slice(index, index + FETCH_BATCH_SIZE)
					await this.fetchBatch(client, target, batch)
					this.emitStatus('backfill', target.path)
				}
			}

			await this.resyncFlags(client, target, serverUids.length, mailbox.highestModseq)
		} finally {
			lock.release()
		}
	}

	/**
	 * Diff server flags against local rows. With CONDSTORE only messages
	 * changed since the stored MODSEQ are fetched; otherwise a flags-only
	 * sweep over the whole folder.
	 */
	private async resyncFlags(
		client: ImapFlow,
		target: SyncFolderTarget,
		serverCount: number,
		highestModseq: bigint | undefined
	): Promise<void> {
		if (serverCount === 0) return

		const storedModseq = this.store.getFolderModseq(target.folderId)
		const fetchOptions: { uid: boolean; changedSince?: bigint } = { uid: true }
		if (storedModseq !== null && highestModseq !== undefined) {
			if (storedModseq === String(highestModseq)) return
			fetchOptions.changedSince = BigInt(storedModseq)
		}

		const localFlags = this.store.flagStates(target.folderId)
		let changed = 0
		for await (const message of client.fetch('1:*', { flags: true, uid: true }, fetchOptions)) {
			const local = localFlags.get(message.uid)
			if (!local) continue
			const flags = message.flags || new Set<string>()
			const seen = flags.has('\\Seen')
			const flagged = flags.has('\\Flagged')
			const answered = flags.has('\\Answered')
			if (seen === local.seen && flagged === local.flagged && answered === local.answered) continue
			this.store.updateFlags(target.folderId, message.uid, seen, flagged, answered)
			changed += 1
		}

		if (highestModseq !== undefined) {
			this.store.setFolderModseq(target.folderId, String(highestModseq))
		}
		if (changed > 0) {
			this.onMessagesChanged(this.credentials.accountId, target.folderId)
		}
	}

	private handleUidvalidity(folderId: number, uidValidity: number): void {
		const state = this.store.getFolderSyncState(folderId)
		if (state.uidvalidity !== null && state.uidvalidity !== uidValidity) {
			this.store.clearFolderMessages(folderId)
		}
		this.store.setFolderUidvalidity(folderId, uidValidity)
	}

	private async fetchBatch(
		client: ImapFlow,
		target: SyncFolderTarget,
		uids: number[]
	): Promise<void> {
		const range = uids.join(',')
		let highestUid = 0
		const arrivals: NewMessageInfo[] = []
		for await (const message of client.fetch(
			range,
			{ source: true, flags: true, size: true },
			{ uid: true }
		)) {
			if (!message.source) continue
			const flags = message.flags || new Set<string>()
			const parsed = await parseRawMessage(
				message.source,
				this.credentials.accountId,
				target.folderId,
				message.uid,
				flags,
				message.size || message.source.length
			)
			const inserted = this.store.insertMessage(parsed)
			if (inserted !== null) {
				this.downloadedMessages += 1
				if (!parsed.seen) {
					arrivals.push({
						accountId: this.credentials.accountId,
						fromName: parsed.fromName,
						fromAddress: parsed.fromAddress,
						subject: parsed.subject
					})
				}
			}
			if (message.uid > highestUid) highestUid = message.uid
		}
		if (highestUid > 0) this.store.setFolderLastSeenUid(target.folderId, highestUid)
		this.onMessagesChanged(this.credentials.accountId, target.folderId)

		const shouldNotify =
			this.initialSyncComplete &&
			target.path === 'INBOX' &&
			arrivals.length > 0 &&
			this.onNewMessages
		if (shouldNotify && this.onNewMessages) this.onNewMessages(arrivals)
	}

	/**
	 * Keep INBOX selected so imapflow idles and pushes exists/expunge/flags
	 * events; reconcile INBOX on events, everything on a timer.
	 */
	private async watchLoop(client: ImapFlow): Promise<void> {
		const inboxFolderId = this.store.upsertFolder(
			this.credentials.accountId,
			'INBOX',
			'INBOX',
			null,
			'\\Inbox'
		)
		const inboxTarget: SyncFolderTarget = { folderId: inboxFolderId, path: 'INBOX' }

		const markDirty = (): void => {
			this.inboxDirty = true
			this.wakeUp()
		}
		client.on('exists', markDirty)
		client.on('expunge', markDirty)
		client.on('flags', markDirty)

		while (!this.stopped && client.usable) {
			const lock = await client.getMailboxLock('INBOX')
			let timedOut = false
			try {
				timedOut = await this.waitForWake(client, RESYNC_INTERVAL_MS)
			} finally {
				lock.release()
			}
			if (this.stopped || !client.usable) return

			if (!timedOut) await delay(EVENT_DEBOUNCE_MS)

			if (this.inboxDirty) {
				this.inboxDirty = false
				await this.reconcileFolder(client, inboxTarget)
			}
			if (timedOut) {
				// Re-list so folders created elsewhere get picked up too.
				const targets = await this.syncFolderList(client)
				for (const target of targets) {
					if (this.stopped || !client.usable) return
					await this.reconcileFolder(client, target)
				}
			}
			this.emitStatus('idle', 'INBOX')
		}
	}

	/** Resolves true on timeout, false when woken by an event or the connection closing. */
	private waitForWake(client: ImapFlow, timeoutMs: number): Promise<boolean> {
		return new Promise((resolve) => {
			let settled = false
			const finish = (timedOut: boolean): void => {
				if (settled) return
				settled = true
				clearTimeout(timer)
				this.wake = null
				client.off('close', onClose)
				resolve(timedOut)
			}
			const timer = setTimeout(() => finish(true), timeoutMs)
			const onClose = (): void => finish(false)
			this.wake = () => finish(false)
			client.once('close', onClose)
		})
	}

	private wakeUp(): void {
		if (this.wake) this.wake()
	}
}

function folderPriority(entry: ListResponse): number {
	if (entry.path === 'INBOX') return 0
	if (entry.specialUse === '\\Sent') return 1
	if (entry.specialUse === '\\Drafts') return 2
	if (entry.specialUse === '\\Archive') return 3
	if (entry.specialUse === '\\Junk') return 5
	if (entry.specialUse === '\\Trash') return 6
	return 4
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}
