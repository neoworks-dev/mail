// The folders column, first in the navigation surface.

import type { Context } from '@neoworks/extension-system'
import Sidebar from './Sidebar.svelte'

export const sidebar = {
	name: 'sidebar',
	inject: ['slots', 'accounts', 'mailbox', 'commands', 'settings'],
	apply(ctx: Context) {
		ctx.slots.register('navigation', {
			id: 'sidebar',
			order: 0,
			component: Sidebar,
			props: {
				accounts: ctx.accounts,
				mailbox: ctx.mailbox,
				commands: ctx.commands,
				settings: ctx.settings
			}
		})
	}
}
