// Provides `store`: the mail database. It also relays `mail/messages-changed` to the UI, since
// every plugin that changes messages reports it through the context.

import type { Context } from '@neoworks/extension-system'
import { openDatabase } from '../../mail/db'
import { MailStore } from '../../mail/store'

declare module '@neoworks/extension-system' {
	interface Context {
		store: MailStore
	}
}

export const store = {
	name: 'store',
	inject: ['credentials', 'paths', 'rpc'],
	apply(ctx: Context) {
		const database = openDatabase(ctx.paths.file('mail.db'))
		ctx.effect(() => () => database.close(), 'mail database')
		const mailStore = new MailStore(database, ctx.credentials)
		mailStore.backfillThreads()
		ctx.provide('store', mailStore)

		ctx.on('mail/messages-changed', (accountId, folderId) => {
			ctx.rpc.broadcast('messages.changed', { accountId, folderId })
		})
	}
}
