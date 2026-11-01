// The conversation list, beside the sidebar in the navigation surface.

import type { Context } from '@neoworks/extension-system'
import MessageList from './MessageList.svelte'

export const messageList = {
	name: 'message-list',
	inject: ['slots', 'accounts', 'mailbox', 'reader', 'commands'],
	apply(ctx: Context) {
		ctx.slots.register('navigation', {
			id: 'message-list',
			order: 10,
			component: MessageList,
			props: {
				accounts: ctx.accounts,
				mailbox: ctx.mailbox,
				reader: ctx.reader,
				commands: ctx.commands
			}
		})
	}
}
