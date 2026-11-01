// One-click Gmail sign-in: browser consent against the app-wide OAuth client, the address
// taken from the returned id_token, then a real IMAP XOAUTH2 login validates the token before
// anything is stored.

import type { Context } from '@neoworks/extension-system'
import { ImapFlow } from 'imapflow'
import type { MailAccount } from '../../../shared/mail'
import { runGoogleOauthFlow } from '../../mail/oauth'
import { getGoogleClientConfig, setGoogleClientConfig } from '../../mail/oauth-config'

export const gmail = {
	name: 'gmail',
	inject: ['store', 'opener', 'paths', 'rpc'],
	apply(ctx: Context) {
		const dataDirectory = ctx.paths.data

		ctx.rpc.handle(
			'accounts.gmailClientConfigured',
			() => getGoogleClientConfig(dataDirectory) !== null
		)

		ctx.rpc.handle('accounts.setGmailClientConfig', (config) => {
			if (config.clientId.trim() === '' || config.clientSecret.trim() === '') {
				throw new Error('client id and secret are both required')
			}
			setGoogleClientConfig(dataDirectory, {
				clientId: config.clientId.trim(),
				clientSecret: config.clientSecret.trim()
			})
		})

		ctx.rpc.handle('accounts.addGmail', async () => {
			const account = await addGmailAccount(ctx, dataDirectory)
			ctx.emit('mail/account-added', account.accountId)
			ctx.rpc.broadcast('accounts.changed', null)
			return account
		})
	}
}

async function addGmailAccount(ctx: Context, dataDirectory: string): Promise<MailAccount> {
	const config = getGoogleClientConfig(dataDirectory)
	if (!config) {
		throw new Error('Google OAuth client is not configured yet')
	}

	const tokens = await runGoogleOauthFlow(config.clientId, config.clientSecret, '', (url) =>
		ctx.opener.openUrl(url)
	)
	if (tokens.email === null) {
		throw new Error('Google sign-in did not return an email address')
	}
	const email = tokens.email

	const duplicate = ctx.store.listAccounts().find((account) => account.email === email)
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

	return ctx.store.createGmailAccount(
		{ email, clientId: config.clientId, clientSecret: config.clientSecret },
		tokens
	)
}
