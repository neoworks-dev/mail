// Serves the account routes: listing, adding a password account after a real IMAP login, and
// removing one. Other plugins hear `mail/account-added` and `mail/account-removing` to start and
// stop what they run per account.

import type { Context } from '@neoworks/extension-system'
import { ImapFlow } from 'imapflow'
import type { MailAccountInput } from '../../../shared/mail'

export const accounts = {
	name: 'accounts',
	inject: ['store', 'rpc'],
	apply(ctx: Context) {
		ctx.rpc.handle('accounts.list', () => ctx.store.listAccounts())

		ctx.rpc.handle('accounts.add', async (input) => {
			await probeLogin(input)
			const account = ctx.store.createAccount(input)
			ctx.emit('mail/account-added', account.accountId)
			ctx.rpc.broadcast('accounts.changed', null)
			return account
		})

		ctx.rpc.handle('accounts.remove', async (accountId) => {
			await ctx.parallel('mail/account-removing', accountId)
			ctx.store.deleteAccount(accountId)
			ctx.emit('mail/account-removed', accountId)
			ctx.rpc.broadcast('accounts.changed', null)
		})
	}
}

/** Validates the credentials with a real IMAP login before anything is stored. */
async function probeLogin(input: MailAccountInput): Promise<void> {
	const probe = new ImapFlow({
		host: input.imapHost,
		port: input.imapPort,
		secure: input.useTls,
		auth: { user: input.imapUser, pass: input.imapPassword },
		logger: false
	})
	await probe.connect()
	await probe.logout()
}
