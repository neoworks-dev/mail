// Provides `composer`: the commands that start a message, the keys for them, the outbox's
// answers about queued sends, and the agent's reply drafts, which land in the open composer or
// open one.

import type { Context } from '@neoworks/extension-system'
import { extractQuote } from '../../lib/quote'
import { ComposerService } from './service.svelte'

export const composer = {
	name: 'composer',
	inject: ['sidecar', 'accounts', 'reader', 'commands', 'keymap'],
	apply(ctx: Context) {
		const service = new ComposerService(ctx)
		ctx.provide('composer', service)

		ctx.sidecar.on('send.done', ({ sendId }) => service.dropPending(sendId))
		ctx.sidecar.on('send.failed', ({ sendId, errorMessage }) =>
			service.markFailed(sendId, errorMessage)
		)
		ctx.on(
			'assistant/reply-draft',
			(messageId, markdown) => void acceptReplyDraft(ctx, service, messageId, markdown)
		)

		ctx.commands.register({
			id: 'compose.new',
			title: 'Compose new message',
			group: 'Compose',
			when: () => ctx.accounts.state.selectedAccountId !== null,
			run: () => service.open()
		})
		ctx.commands.register({
			id: 'thread.reply',
			title: 'Reply',
			group: 'Compose',
			when: () => ctx.reader.replyTarget !== null,
			run: () => reply(ctx, service, false)
		})
		ctx.commands.register({
			id: 'thread.replyAll',
			title: 'Reply all',
			group: 'Compose',
			when: () => ctx.reader.replyTarget !== null,
			run: () => reply(ctx, service, true)
		})
		ctx.keymap.bind({ command: 'compose.new', combo: { key: 'c' } })
		ctx.keymap.bind({ command: 'thread.reply', combo: { key: 'r' } })
		ctx.keymap.bind({ command: 'thread.replyAll', combo: { key: 'a' } })
	}
}

async function reply(ctx: Context, service: ComposerService, replyAll: boolean): Promise<void> {
	const target = ctx.reader.replyTarget
	if (!target) return
	const body = await ctx.reader.loadBody(target.messageId)
	service.openReply(target, body, replyAll)
}

/**
 * Puts the agent's reply above the quote of the open reply, or opens a reply to the message it
 * answers. A draft for another message than the open composer's replaces nothing.
 */
async function acceptReplyDraft(
	ctx: Context,
	service: ComposerService,
	messageId: number | null,
	markdown: string
): Promise<void> {
	const draft = service.state.draft
	if (draft && (messageId === null || draft.replyToMessageId === messageId)) {
		const quote = extractQuote(draft.markdown)
		draft.markdown = joinReply(markdown, quote)
		return
	}
	if (messageId === null) return
	const location = await ctx.sidecar.call('messages.locate', messageId)
	if (!location) return
	const messages = await ctx.sidecar.call('threads.messages', location.accountId, location.threadId)
	const message = messages.find((entry) => entry.messageId === messageId)
	if (!message) return
	service.openReply(message, await ctx.reader.loadBody(messageId), false)
	const opened = service.state.draft
	if (opened) opened.markdown = joinReply(markdown, extractQuote(opened.markdown))
}

function joinReply(reply: string, quote: string): string {
	if (quote === '') return reply
	return `${reply}\n\n${quote}`
}
