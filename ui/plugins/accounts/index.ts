// Provides `accounts` and keeps it in step with the sidecar: sync progress, accounts added or
// removed elsewhere, and message changes that move the folder counts.

import type { Context } from '@neoworks/extension-system'
import { AccountsService } from './service.svelte'

export const accounts = {
	name: 'accounts',
	inject: ['sidecar'],
	async apply(ctx: Context) {
		const service = new AccountsService(ctx)
		ctx.provide('accounts', service)

		ctx.sidecar.on('sync.status', (status) => {
			service.state.syncStatuses[status.accountId] = status
			// Folder counts move while a backfill runs; keep the sidebar fresh.
			void service.refreshFolders()
		})
		ctx.sidecar.on('embeddings.status', (status) => {
			service.state.embeddingStatus = status
		})
		ctx.sidecar.on('accounts.changed', () => void service.reloadAccounts())
		ctx.sidecar.on('messages.changed', (change) => {
			ctx.emit('mail/changed', change.accountId, change.folderId)
			if (change.accountId === service.state.selectedAccountId) void service.refreshFolders()
		})

		await service.load()
	}
}
