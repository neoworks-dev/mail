// Adding and removing accounts: the first-run setup fills the window through `onboarding`, and
// the `accounts.add` and `accounts.remove` commands open their dialogs over it later.

import type { Context } from '@neoworks/extension-system'
import { KeyPriority } from '../../kernel/keymap/service'
import AccountDialogs from './AccountDialogs.svelte'
import { accountActions } from './actions'
import Onboarding from './Onboarding.svelte'
import { createAccountDialogState } from './state.svelte'

export const accountSetup = {
	name: 'account-setup',
	inject: ['slots', 'commands', 'keymap', 'sidecar', 'accounts'],
	apply(ctx: Context) {
		const actions = accountActions(ctx)
		const dialogs = createAccountDialogState()
		ctx.slots.register('onboarding', {
			id: 'account-setup',
			component: Onboarding,
			props: { actions }
		})
		ctx.slots.register('overlays', {
			id: 'account-dialogs',
			order: 20,
			component: AccountDialogs,
			props: { dialogs, accountActions: actions }
		})
		ctx.commands.register({
			id: 'accounts.add',
			title: 'Add mail account',
			group: 'Accounts',
			run: () => {
				dialogs.adding = true
			}
		})
		ctx.commands.register({
			id: 'accounts.remove',
			title: 'Remove this account',
			group: 'Accounts',
			when: () => ctx.accounts.state.selectedAccountId !== null,
			run: () => {
				dialogs.removing = true
			}
		})
		// The add dialog has fields of its own: Escape closes it and bare keys type into them.
		ctx.keymap.subscribe(KeyPriority.dialog, (event) => {
			if (!dialogs.adding) return false
			if (event.key === 'Escape') {
				event.preventDefault()
				dialogs.adding = false
				return true
			}
			return !(event.ctrl || event.alt || event.meta)
		})
	}
}
