// The `accounts` service: the connected accounts, which one is selected, its folders, and how
// each account's sync is going. Folder counts refresh as sync reports progress and as messages
// change, so the sidebar stays current without polling.

import type { Context } from '@neoworks/extension-system'
import type { EmbeddingStatus, MailAccount, MailFolder, SyncStatus } from '../../../shared/mail'

declare module '@neoworks/extension-system' {
	interface Context {
		accounts: AccountsService
	}
}

export interface AccountsState {
	accounts: MailAccount[]
	loaded: boolean
	selectedAccountId: number | null
	folders: MailFolder[]
	syncStatuses: Record<number, SyncStatus>
	embeddingStatus: EmbeddingStatus | null
	/** Messages per label in the selected account's inbox; `__all` and `__priority` are totals. */
	inboxLabelCounts: Record<string, number>
	/** The same across every account's inbox. */
	unifiedLabelCounts: Record<string, number>
}

function createState(): AccountsState {
	const state: AccountsState = $state({
		accounts: [],
		loaded: false,
		selectedAccountId: null,
		folders: [],
		syncStatuses: {},
		embeddingStatus: null,
		inboxLabelCounts: {},
		unifiedLabelCounts: {}
	})
	return state
}

export class AccountsService {
	readonly state = createState()

	constructor(private ctx: Context) {}

	async load(): Promise<void> {
		this.state.accounts = await this.ctx.sidecar.call('accounts.list')
		// Sync and embeddings are plugins of their own; without them there is just no status.
		const statuses = await this.ctx.sidecar.call('sync.statuses').catch(() => [])
		for (const status of statuses) {
			this.state.syncStatuses[status.accountId] = status
		}
		this.state.embeddingStatus = await this.ctx.sidecar.call('embeddings.status').catch(() => null)
		this.state.loaded = true
		const first = this.state.accounts[0]
		if (first && this.state.selectedAccountId === null) await this.select(first.accountId)
	}

	get selectedAccount(): MailAccount | null {
		const found = this.state.accounts.find(
			(account) => account.accountId === this.state.selectedAccountId
		)
		if (!found) return null
		return found
	}

	/** Selects an account and loads its folders; the mailbox plugin then opens its inbox. */
	async select(accountId: number): Promise<void> {
		this.state.selectedAccountId = accountId
		this.state.folders = []
		await this.refreshFolders()
		this.ctx.emit('accounts/selected', accountId)
	}

	async refreshFolders(): Promise<void> {
		const accountId = this.state.selectedAccountId
		if (accountId === null) return
		const folders = await this.ctx.sidecar.call('folders.list', accountId)
		if (this.state.selectedAccountId !== accountId) return
		this.state.folders = folders
		await this.refreshLabelCounts()
	}

	inbox(): MailFolder | null {
		const found = this.state.folders.find((folder) => folder.path === 'INBOX')
		if (!found) return null
		return found
	}

	/** The address of an account, to tell the user's own messages apart. */
	ownEmail(accountId: number): string {
		const account = this.state.accounts.find((entry) => entry.accountId === accountId)
		if (!account) return ''
		return account.email
	}

	async add(account: MailAccount): Promise<void> {
		if (!this.state.accounts.some((entry) => entry.accountId === account.accountId)) {
			this.state.accounts = [...this.state.accounts, account]
		}
		await this.select(account.accountId)
	}

	async remove(accountId: number): Promise<void> {
		await this.ctx.sidecar.call('accounts.remove', accountId)
		this.state.accounts = this.state.accounts.filter((account) => account.accountId !== accountId)
		if (this.state.selectedAccountId !== accountId) return
		this.state.selectedAccountId = null
		const next = this.state.accounts[0]
		if (next) await this.select(next.accountId)
	}

	async reloadAccounts(): Promise<void> {
		this.state.accounts = await this.ctx.sidecar.call('accounts.list')
	}

	private async refreshLabelCounts(): Promise<void> {
		const inbox = this.inbox()
		if (inbox) {
			this.state.inboxLabelCounts = toCountRecord(
				await this.ctx.sidecar.call('labels.unreadCounts', inbox.folderId)
			)
		} else {
			this.state.inboxLabelCounts = {}
		}
		if (this.state.accounts.length > 1) {
			this.state.unifiedLabelCounts = toCountRecord(
				await this.ctx.sidecar.call('labels.unreadCounts', null)
			)
		}
	}
}

function toCountRecord(
	rows: Array<{ label: string | null; count: number }>
): Record<string, number> {
	const record: Record<string, number> = {}
	let total = 0
	for (const row of rows) {
		// The priority pseudo-label overlaps real rows; keep it out of the total.
		if (row.label === '__priority') {
			record['__priority'] = row.count
			continue
		}
		total += row.count
		if (row.label !== null) record[row.label] = row.count
	}
	record['__all'] = total
	return record
}
