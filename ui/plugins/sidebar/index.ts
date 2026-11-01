// The folders column, first in the navigation surface. It declares:
//
// - `sidebar.top` (list): rows under the account switcher, such as search.
// - `sidebar.footer` (list): small buttons along the bottom, such as the theme switch.

import type { Context } from '@neoworks/extension-system'
import Sidebar from './Sidebar.svelte'

export const sidebar = {
	name: 'sidebar',
	inject: ['slots', 'accounts', 'mailbox', 'commands', 'settings'],
	apply(ctx: Context) {
		ctx.slots.declare('sidebar.top', 'list')
		ctx.slots.declare('sidebar.footer', 'list')
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
