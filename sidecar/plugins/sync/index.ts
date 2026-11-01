// Keeps every account in sync: one AccountSync (a read connection parked in IDLE on INBOX) per
// account, started when the plugin loads or an account is added, and logged out when the
// account goes or the plugin unloads.

import type { Context } from '@neoworks/extension-system'
import type { SyncStatus } from '../../../shared/mail'
import { AccountSync } from '../../mail/sync'

export const sync = {
	name: 'sync',
	inject: ['store', 'rpc'],
	apply(ctx: Context) {
		const syncs = new Map<number, AccountSync>()
		const latestStatus = new Map<number, SyncStatus>()

		const startAccount = (accountId: number): void => {
			if (syncs.has(accountId)) return
			const credentials = ctx.store.getCredentials(accountId)
			if (!credentials) return
			const accountSync = new AccountSync(
				ctx.store,
				credentials,
				(status) => {
					latestStatus.set(status.accountId, status)
					ctx.rpc.broadcast('sync.status', status)
				},
				(changedAccountId, folderId) => ctx.emit('mail/messages-changed', changedAccountId, folderId),
				(messages) => ctx.emit('mail/new-messages', messages)
			)
			syncs.set(accountId, accountSync)
			accountSync.start()
		}

		const stopAccount = async (accountId: number): Promise<void> => {
			const accountSync = syncs.get(accountId)
			syncs.delete(accountId)
			latestStatus.delete(accountId)
			if (accountSync) await accountSync.stop()
		}

		ctx.effect(() => {
			for (const account of ctx.store.listAccounts()) startAccount(account.accountId)
			return async () => {
				await Promise.all([...syncs.keys()].map((accountId) => stopAccount(accountId)))
			}
		}, 'account syncs')

		ctx.on('mail/account-added', (accountId) => startAccount(accountId))
		ctx.on('mail/account-removing', (accountId) => stopAccount(accountId))
		ctx.rpc.handle('sync.statuses', () => [...latestStatus.values()])
	}
}
