import { ImapFlow } from 'imapflow'
import type { MessagesChangedListener } from './sync'
import { imapAuthFor } from './auth'
import { parseRawMessage } from './parse'
import type { AccountCredentials, LocalFlag, MailStore } from './store'

const FETCH_BATCH_SIZE = 50

const FLAG_NAMES: Record<LocalFlag, string> = {
	seen: '\\Seen',
	flagged: '\\Flagged',
	answered: '\\Answered'
}

/**
 * Per-account IMAP connection for write operations (STORE, MOVE, APPEND,
 * EXPUNGE). Separate from AccountSync, whose connection is parked in IDLE on
 * INBOX. Operations are serialized through a queue; the connection is opened
 * lazily and reopened after errors.
 */
export class MailOps {
	private client: ImapFlow | null = null
	private queue: Promise<unknown> = Promise.resolve()
	private stopped = false

	constructor(
		private store: MailStore,
		private credentials: AccountCredentials,
		private onMessagesChanged: MessagesChangedListener
	) {}

	async stop(): Promise<void> {
		this.stopped = true
		const client = this.client
		this.client = null
		if (!client) return
		try {
			await client.logout()
		} catch {
			client.close()
		}
	}

	setFlag(folderPath: string, uid: number, flag: LocalFlag, value: boolean): Promise<void> {
		return this.run(async (client) => {
			const lock = await client.getMailboxLock(folderPath)
			try {
				if (value) {
					await client.messageFlagsAdd([uid], [FLAG_NAMES[flag]], { uid: true })
				} else {
					await client.messageFlagsRemove([uid], [FLAG_NAMES[flag]], { uid: true })
				}
			} finally {
				lock.release()
			}
		})
	}

	/** MOVE one message; resolves to its UID in the target when the server reports it. */
	move(folderPath: string, uid: number, targetPath: string): Promise<number | null> {
		return this.run(async (client) => {
			const lock = await client.getMailboxLock(folderPath)
			try {
				const response = await client.messageMove([uid], targetPath, { uid: true })
				if (!response) throw new Error(`move to ${targetPath} failed`)
				if (!response.uidMap) return null
				const newUid = response.uidMap.get(uid)
				return newUid === undefined ? null : newUid
			} finally {
				lock.release()
			}
		})
	}

	/** Flag \Deleted and expunge — permanent removal, used inside Trash. */
	permanentDelete(folderPath: string, uid: number): Promise<void> {
		return this.run(async (client) => {
			const lock = await client.getMailboxLock(folderPath)
			try {
				const ok = await client.messageDelete([uid], { uid: true })
				if (!ok) throw new Error('delete failed')
			} finally {
				lock.release()
			}
		})
	}

	/** APPEND raw RFC822 bytes; resolves to the new UID when the server reports it. */
	append(folderPath: string, raw: Buffer, flags: string[]): Promise<number | null> {
		return this.run(async (client) => {
			const response = await client.append(folderPath, raw, flags)
			if (!response) throw new Error(`append to ${folderPath} failed`)
			return response.uid === undefined ? null : response.uid
		})
	}

	/**
	 * Pull messages the local store does not have yet for one folder. Used after
	 * a move/append when the server did not report the new UID.
	 */
	syncFolder(folderId: number, folderPath: string): Promise<void> {
		return this.run(async (client) => {
			const lock = await client.getMailboxLock(folderPath)
			try {
				const onServer = await client.search({ all: true }, { uid: true })
				if (!onServer || onServer.length === 0) return
				const known = this.store.knownUids(folderId)
				const pending = onServer.filter((uid) => !known.has(uid))
				if (pending.length === 0) return

				pending.sort((a, b) => b - a)
				for (let index = 0; index < pending.length; index += FETCH_BATCH_SIZE) {
					const batch = pending.slice(index, index + FETCH_BATCH_SIZE)
					await this.fetchBatch(client, folderId, batch)
				}
				this.onMessagesChanged(this.credentials.accountId, folderId)
			} finally {
				lock.release()
			}
		})
	}

	private async fetchBatch(client: ImapFlow, folderId: number, uids: number[]): Promise<void> {
		const range = uids.join(',')
		for await (const message of client.fetch(
			range,
			{ source: true, flags: true, size: true },
			{ uid: true }
		)) {
			if (!message.source) continue
			const parsed = await parseRawMessage(
				message.source,
				this.credentials.accountId,
				folderId,
				message.uid,
				message.flags || new Set<string>(),
				message.size || message.source.length
			)
			this.store.insertMessage(parsed)
		}
	}

	/** Serialize operations; a failed operation drops the connection for a clean retry. */
	private run<T>(task: (client: ImapFlow) => Promise<T>): Promise<T> {
		const next = this.queue.then(async () => {
			if (this.stopped) throw new Error('account removed')
			const client = await this.ensureConnected()
			try {
				return await task(client)
			} catch (error) {
				this.dropClient()
				throw error
			}
		})
		this.queue = next.catch(() => {})
		return next
	}

	private async ensureConnected(): Promise<ImapFlow> {
		if (this.client && this.client.usable) return this.client

		const auth = await imapAuthFor(this.store, this.credentials)
		const client = new ImapFlow({
			host: this.credentials.imapHost,
			port: this.credentials.imapPort,
			secure: this.credentials.useTls,
			auth,
			logger: false
		})
		client.on('error', () => {
			if (this.client === client) this.client = null
		})
		client.on('close', () => {
			if (this.client === client) this.client = null
		})
		await client.connect()
		this.client = client
		return client
	}

	private dropClient(): void {
		const client = this.client
		this.client = null
		if (client) client.close()
	}
}
