// What the account forms ask of the sidecar and the accounts service, built with the plugin's
// context so the components never hold it.

import type { Context } from '@neoworks/extension-system'
import type { GmailClientConfig, MailAccountInput } from '../../../shared/mail'

export interface AccountActions {
	addImap(input: MailAccountInput): Promise<void>
	gmailClientConfigured(): Promise<boolean>
	setGmailClientConfig(config: GmailClientConfig): Promise<void>
	addGmail(): Promise<void>
	/** The selected account's address, for the removal question. */
	selectedEmail(): string | null
	removeSelected(): Promise<void>
}

export function accountActions(ctx: Context): AccountActions {
	return {
		async addImap(input) {
			const account = await ctx.sidecar.call('accounts.add', input)
			await ctx.accounts.add(account)
		},
		gmailClientConfigured: () => ctx.sidecar.call('accounts.gmailClientConfigured'),
		setGmailClientConfig: (config) => ctx.sidecar.call('accounts.setGmailClientConfig', config),
		async addGmail() {
			const account = await ctx.sidecar.call('accounts.addGmail')
			await ctx.accounts.add(account)
		},
		selectedEmail() {
			const account = ctx.accounts.selectedAccount
			if (!account) return null
			return account.email
		},
		async removeSelected() {
			const accountId = ctx.accounts.state.selectedAccountId
			if (accountId !== null) await ctx.accounts.remove(accountId)
		}
	}
}
