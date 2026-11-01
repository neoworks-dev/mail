// Provides `reader` and the commands and keys that move through and act on the open thread.
// Thread actions close the tab first, as the open thread is what they act on.

import type { Context } from '@neoworks/extension-system'
import type { ThreadMessage } from '../../../shared/mail'
import { KeyPriority } from '../../kernel/keymap/service'
import { ReaderService } from './service.svelte'

export const reader = {
	name: 'reader',
	inject: ['sidecar', 'mailbox', 'commands', 'keymap'],
	apply(ctx: Context) {
		const service = new ReaderService(ctx)
		ctx.provide('reader', service)
		registerNavigation(ctx, service)
		registerThreadActions(ctx, service)

		// Escape closes the open thread when nothing above it took the key.
		ctx.keymap.subscribe(KeyPriority.app, (event) => {
			if (event.key !== 'Escape' || service.activeTab === null) return false
			service.closeActive()
			return true
		})
	}
}

function registerNavigation(ctx: Context, service: ReaderService): void {
	ctx.commands.register({
		id: 'thread.next',
		title: 'Next conversation',
		group: 'Navigation',
		run: () => service.openAdjacent(1)
	})
	ctx.commands.register({
		id: 'thread.previous',
		title: 'Previous conversation',
		group: 'Navigation',
		run: () => service.openAdjacent(-1)
	})
	ctx.commands.register({
		id: 'thread.openFirst',
		title: 'Open first conversation',
		group: 'Navigation',
		when: () => service.openThreadId === null && ctx.mailbox.state.threads.length > 0,
		run: () => {
			const first = ctx.mailbox.state.threads[0]
			return service.openThread(first.accountId, first.threadId)
		}
	})
	ctx.commands.register({
		id: 'reader.back',
		title: 'Back',
		group: 'Navigation',
		when: () => service.canGoBack,
		run: () => service.goBack()
	})
	ctx.commands.register({
		id: 'reader.forward',
		title: 'Forward',
		group: 'Navigation',
		when: () => service.canGoForward,
		run: () => service.goForward()
	})
	ctx.commands.register({
		id: 'reader.toggleSplit',
		title: 'Toggle split view',
		group: 'View',
		run: () => service.toggleSplit()
	})
	ctx.commands.register({
		id: 'reader.closeTab',
		title: 'Close tab',
		group: 'View',
		when: () => service.activeTab !== null,
		run: () => service.closeActive()
	})
	ctx.keymap.bind({ command: 'thread.next', combo: { key: 'j' } })
	ctx.keymap.bind({ command: 'thread.previous', combo: { key: 'k' } })
	ctx.keymap.bind({ command: 'thread.openFirst', combo: { key: 'enter' } })
	ctx.keymap.bind({ command: 'reader.back', combo: { key: 'arrowleft', alt: true } })
	ctx.keymap.bind({ command: 'reader.forward', combo: { key: 'arrowright', alt: true } })
}

function registerThreadActions(ctx: Context, service: ReaderService): void {
	const onTarget = (id: string, title: string, key: string, action: (target: ThreadMessage) => Promise<void>) => {
		ctx.commands.register({
			id,
			title,
			group: 'Conversation',
			when: () => service.actionTarget !== null,
			run: async () => {
				const target = service.actionTarget
				if (target) await action(target)
			}
		})
		ctx.keymap.bind({ command: id, combo: { key } })
	}

	onTarget('thread.archive', 'Archive conversation', 'e', async (target) => {
		service.closeActive()
		await ctx.mailbox.archive(target)
	})
	onTarget('thread.delete', 'Delete conversation', '#', async (target) => {
		service.closeActive()
		await ctx.mailbox.remove(target)
	})
	onTarget('thread.flag', 'Toggle flag', 's', (target) => ctx.mailbox.toggleFlagged(target))
	onTarget('thread.unread', 'Mark as unread', 'u', async (target) => {
		await ctx.mailbox.markSeen(target, false)
		service.closeActive()
	})
}
