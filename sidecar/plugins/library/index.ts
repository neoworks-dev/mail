// Serves what the UI reads: folders, thread pages, a thread's messages, bodies, attachments,
// label counts and recipient suggestions. Everything here is a local query; nothing reaches
// the server.

import type { Context } from '@neoworks/extension-system'
import { stat, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { isMailLabel } from '../../mail/labeling'

const LIST_LIMIT_MAX = 200
const SUGGESTION_LIMIT = 8

export const library = {
	name: 'library',
	inject: ['store', 'mailOps', 'rpc'],
	apply(ctx: Context) {
		const store = ctx.store

		ctx.rpc.handle('folders.list', (accountId) => store.listFolders(accountId))

		ctx.rpc.handle('threads.list', (folderId, limit, offset, label, filter) =>
			store.listThreads(folderId, Math.min(limit, LIST_LIMIT_MAX), offset, label, filter)
		)
		ctx.rpc.handle('threads.listUnified', (limit, offset, label, filter) =>
			store.listThreadsUnified(Math.min(limit, LIST_LIMIT_MAX), offset, label, filter)
		)
		ctx.rpc.handle('threads.messages', (accountId, threadId) =>
			store.getThreadMessages(accountId, threadId)
		)
		ctx.rpc.handle('threads.locate', (threadId) => store.findThreadAccount(threadId))

		ctx.rpc.handle('messages.body', (messageId) => store.getMessageBody(messageId))
		ctx.rpc.handle('messages.byRfcId', (accountId, rfcMessageId) =>
			store.findMessageIdByRfcId(accountId, rfcMessageId)
		)
		ctx.rpc.handle('messages.locate', (messageId) => {
			const location = store.getMessageLocation(messageId)
			if (!location) return null
			return { accountId: location.accountId, threadId: location.threadId }
		})

		// A user label also trains the classifier: labelled embeddings become its examples.
		ctx.rpc.handle('messages.setLabel', (messageId, label) => {
			if (label !== null && !isMailLabel(label)) throw new Error(`unknown label: ${label}`)
			const location = ctx.mailOps.requireLocation(messageId)
			store.setMessageLabel(messageId, label, 'user')
			ctx.emit('mail/messages-changed', location.accountId, location.folderId)
		})

		ctx.rpc.handle('attachments.data', (attachmentId) => {
			const attachment = store.getAttachment(attachmentId)
			if (!attachment) return null
			return { contentType: attachment.contentType, base64: attachment.content.toString('base64') }
		})

		ctx.rpc.handle('attachments.saveTo', async (attachmentId, path) => {
			const attachment = store.getAttachment(attachmentId)
			if (!attachment) throw new Error('attachment not found')
			await writeFile(path, attachment.content)
			return path
		})

		ctx.rpc.handle('attachments.describeFiles', (paths) =>
			Promise.all(
				paths.map(async (path) => ({ path, name: basename(path), size: (await stat(path)).size }))
			)
		)

		ctx.rpc.handle('labels.unreadCounts', (folderId) => store.unreadLabelCounts(folderId))
		ctx.rpc.handle('contacts.suggest', (accountId, query) =>
			store.suggestRecipients(accountId, query, SUGGESTION_LIMIT)
		)
	}
}
