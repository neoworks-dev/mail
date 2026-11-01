// Provides `mailbox`: opens the inbox when an account is selected, reloads the list when its
// messages change, and registers the commands that act on the selection.

import type { Context } from '@neoworks/extension-system'
import { KeyPriority } from '../../kernel/keymap/service'
import { MailboxService } from './service.svelte'

export const mailbox = {
	name: 'mailbox',
	inject: ['sidecar', 'accounts', 'commands', 'keymap'],
	apply(ctx: Context) {
		const service = new MailboxService(ctx)
		ctx.provide('mailbox', service)

		ctx.on('accounts/selected', () => void service.openInbox())
		ctx.on('mail/changed', (_accountId, folderId) => {
			if (service.shows(folderId)) void service.reload()
		})
		// The account may have been selected before this plugin was listening.
		if (ctx.accounts.state.selectedAccountId !== null) void service.openInbox()

		const hasSelection = () => service.state.selectedThreadIds.length > 0
		// Escape clears a selection before it closes the open thread.
		ctx.keymap.subscribe(KeyPriority.app, (event) => {
			if (event.key !== 'Escape' || !hasSelection()) return false
			service.clearSelection()
			return true
		})
		ctx.commands.register({
			id: 'mailbox.unifiedInbox',
			title: 'Show all inboxes',
			group: 'Go to',
			when: () => ctx.accounts.state.accounts.length > 1,
			run: () => service.openUnified()
		})
		ctx.commands.register({
			id: 'mailbox.inbox',
			title: 'Go to inbox',
			group: 'Go to',
			run: () => service.openInbox()
		})
		ctx.commands.register({
			id: 'selection.markRead',
			title: 'Mark selected as read',
			group: 'Selection',
			when: hasSelection,
			run: () => service.markSelectedRead()
		})
		ctx.commands.register({
			id: 'selection.archive',
			title: 'Archive selected',
			group: 'Selection',
			when: hasSelection,
			run: () => service.archiveSelected()
		})
		ctx.commands.register({
			id: 'selection.delete',
			title: 'Delete selected',
			group: 'Selection',
			when: hasSelection,
			run: () => service.deleteSelected()
		})
		ctx.commands.register({
			id: 'selection.clear',
			title: 'Clear selection',
			group: 'Selection',
			when: hasSelection,
			run: () => service.clearSelection()
		})
	}
}
