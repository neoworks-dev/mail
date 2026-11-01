// Provides `mailOps`: changes to messages on the server. Each account gets one write connection
// (MailOps), separate from its sync connection, opened on first use and logged out when the
// account goes or the plugin unloads. Flag changes apply locally first so the UI updates at
// once; moves and deletes wait for the server.

import type { Context } from '@neoworks/extension-system'
import { MailOps } from '../../mail/ops'
import type { LocalFlag, MessageLocation } from '../../mail/store'

declare module '@neoworks/extension-system' {
	interface Context {
		mailOps: MailOpsService
	}
}

export const TRASH_FALLBACK_NAMES = ['Trash', 'Deleted Items', 'Deleted Messages', 'INBOX.Trash']
export const ARCHIVE_FALLBACK_NAMES = ['Archive', 'Archives', 'INBOX.Archive']
export const SENT_FALLBACK_NAMES = ['Sent', 'Sent Messages', 'Sent Items', 'INBOX.Sent']
export const DRAFTS_FALLBACK_NAMES = ['Drafts', 'Draft', 'INBOX.Drafts']

export interface MailOpsService {
	/** The account's write connection, opened on first use. */
	opsFor(accountId: number): MailOps
	requireLocation(messageId: number): MessageLocation
	setFlag(messageId: number, flag: LocalFlag, value: boolean): void
	moveMessage(messageId: number, targetFolderId: number): Promise<void>
	archiveMessage(messageId: number): Promise<void>
	deleteMessage(messageId: number): Promise<void>
}

export const mailOps = {
	name: 'mail-ops',
	inject: ['store', 'rpc'],
	apply(ctx: Context) {
		const connections = new Map<number, MailOps>()
		const service = createService(ctx, connections)

		ctx.effect(
			() => async () => {
				const open = [...connections.values()]
				connections.clear()
				await Promise.all(open.map((connection) => connection.stop()))
			},
			'write connections'
		)
		ctx.on('mail/account-removing', async (accountId) => {
			const connection = connections.get(accountId)
			connections.delete(accountId)
			if (connection) await connection.stop()
		})
		ctx.provide('mailOps', service)

		ctx.rpc.handle('messages.markSeen', (messageId, seen) =>
			service.setFlag(messageId, 'seen', seen)
		)
		ctx.rpc.handle('messages.setFlagged', (messageId, flagged) =>
			service.setFlag(messageId, 'flagged', flagged)
		)
		ctx.rpc.handle('messages.move', (messageId, targetFolderId) =>
			service.moveMessage(messageId, targetFolderId)
		)
		ctx.rpc.handle('messages.archive', (messageId) => service.archiveMessage(messageId))
		ctx.rpc.handle('messages.delete', (messageId) => service.deleteMessage(messageId))
	}
}

function createService(ctx: Context, connections: Map<number, MailOps>): MailOpsService {
	const changed = (accountId: number, folderId: number): void => {
		ctx.emit('mail/messages-changed', accountId, folderId)
	}

	const opsFor = (accountId: number): MailOps => {
		const existing = connections.get(accountId)
		if (existing) return existing
		const credentials = ctx.store.getCredentials(accountId)
		if (!credentials) throw new Error('account not found')
		const connection = new MailOps(ctx.store, credentials, changed)
		connections.set(accountId, connection)
		return connection
	}

	const requireLocation = (messageId: number): MessageLocation => {
		const location = ctx.store.getMessageLocation(messageId)
		if (!location) throw new Error('message not found')
		return location
	}

	const moveMessage = async (messageId: number, targetFolderId: number): Promise<void> => {
		const location = requireLocation(messageId)
		const target = ctx.store.getFolder(targetFolderId)
		if (!target) throw new Error('target folder not found')
		if (target.accountId !== location.accountId) throw new Error('cannot move across accounts')
		if (target.folderId === location.folderId) return

		const connection = opsFor(location.accountId)
		const newUid = await connection.move(location.folderPath, location.uid, target.path)
		if (newUid !== null) {
			ctx.store.rehomeMessage(messageId, target.folderId, newUid)
		} else {
			// Server lacks COPYUID; drop the stale row and refetch the target folder.
			ctx.store.deleteMessageLocal(messageId)
			void connection.syncFolder(target.folderId, target.path).catch((error: Error) => {
				ctx.logger('mail-ops').warn(`post-move sync failed: ${error.message}`)
			})
		}
		changed(location.accountId, location.folderId)
		changed(location.accountId, target.folderId)
	}

	return {
		opsFor,
		requireLocation,
		moveMessage,

		setFlag(messageId, flag, value) {
			const location = requireLocation(messageId)
			ctx.store.setLocalFlag(messageId, flag, value)
			changed(location.accountId, location.folderId)
			void opsFor(location.accountId)
				.setFlag(location.folderPath, location.uid, flag, value)
				.catch((error: Error) => {
					ctx.logger('mail-ops').warn(`flag writeback failed (${flag}=${value}): ${error.message}`)
				})
		},

		async archiveMessage(messageId) {
			const location = requireLocation(messageId)
			const archive = ctx.store.findSpecialFolder(
				location.accountId,
				'\\Archive',
				ARCHIVE_FALLBACK_NAMES
			)
			if (!archive) throw new Error('no archive folder on this account')
			await moveMessage(messageId, archive.folderId)
		},

		/** Moves to Trash; a message already in Trash is expunged for good. */
		async deleteMessage(messageId) {
			const location = requireLocation(messageId)
			const trash = ctx.store.findSpecialFolder(location.accountId, '\\Trash', TRASH_FALLBACK_NAMES)
			const alreadyInTrash = trash !== null && trash.folderId === location.folderId
			if (trash && !alreadyInTrash) {
				await moveMessage(messageId, trash.folderId)
				return
			}
			if (!trash) ctx.logger('mail-ops').warn('no trash folder found — deleting permanently')
			await opsFor(location.accountId).permanentDelete(location.folderPath, location.uid)
			ctx.store.deleteMessageLocal(messageId)
			changed(location.accountId, location.folderId)
		}
	}
}
