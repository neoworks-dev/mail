import { BrowserWindow, dialog, ipcMain } from 'electron'
import { statSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import type {
	AttachmentData,
	GmailClientConfig,
	MailAccountInput,
	OutgoingAttachment,
	OutgoingMessage
} from '../shared/mail'
import type { MailEngine } from './mail/engine'
import type { SendOutbox } from './mail/outbox'
import type { NibServer } from './nib/server'

const LIST_LIMIT_MAX = 200
const SEARCH_LIMIT = 100

export function registerIpc(engine: MailEngine, nib: NibServer, outbox: SendOutbox): void {
	ipcMain.handle('mail:accounts:list', () => {
		return engine.listAccounts()
	})

	ipcMain.handle('mail:accounts:add', (_event, input: MailAccountInput) => {
		return engine.addAccount(input)
	})

	ipcMain.handle('mail:accounts:addGmail', () => {
		return engine.addGmailAccount()
	})

	ipcMain.handle('mail:accounts:gmailClientConfigured', () => {
		return engine.gmailClientConfigured()
	})

	ipcMain.handle('mail:accounts:setGmailClientConfig', (_event, config: GmailClientConfig) => {
		engine.setGmailClientConfig(config)
	})

	ipcMain.handle('mail:accounts:remove', (_event, accountId: number) => {
		return engine.removeAccount(accountId)
	})

	ipcMain.handle('mail:folders:list', (_event, accountId: number) => {
		return engine.listFolders(accountId)
	})

	ipcMain.handle(
		'mail:threads:list',
		(_event, folderId: number, limit: number, offset: number, label: string | null) => {
			return engine.listThreads(folderId, Math.min(limit, LIST_LIMIT_MAX), offset, label ?? null)
		}
	)

	ipcMain.handle(
		'mail:threads:listUnified',
		(_event, limit: number, offset: number, label: string | null) => {
			return engine.listThreadsUnified(Math.min(limit, LIST_LIMIT_MAX), offset, label ?? null)
		}
	)

	ipcMain.handle('mail:threads:messages', (_event, accountId: number, threadId: number) => {
		return engine.getThreadMessages(accountId, threadId)
	})

	ipcMain.handle('mail:messages:body', (_event, messageId: number) => {
		return engine.getMessageBody(messageId)
	})

	ipcMain.handle('mail:messages:markSeen', (_event, messageId: number, seen: boolean) => {
		engine.setFlag(messageId, 'seen', seen)
	})

	ipcMain.handle('mail:messages:setFlagged', (_event, messageId: number, flagged: boolean) => {
		engine.setFlag(messageId, 'flagged', flagged)
	})

	ipcMain.handle('mail:messages:move', (_event, messageId: number, targetFolderId: number) => {
		return engine.moveMessage(messageId, targetFolderId)
	})

	ipcMain.handle('mail:messages:archive', (_event, messageId: number) => {
		return engine.archiveMessage(messageId)
	})

	ipcMain.handle('mail:messages:delete', (_event, messageId: number) => {
		return engine.deleteMessage(messageId)
	})

	ipcMain.handle('mail:send', (_event, input: OutgoingMessage) => {
		return engine.sendMessage(input)
	})

	ipcMain.handle('mail:send:queue', (_event, input: OutgoingMessage) => {
		return outbox.queue(input)
	})

	ipcMain.handle('mail:send:cancelQueued', (_event, sendId: number) => {
		return outbox.cancel(sendId)
	})

	ipcMain.handle('mail:drafts:save', (_event, input: OutgoingMessage) => {
		return engine.saveDraft(input)
	})

	ipcMain.handle('mail:drafts:discard', (_event, messageId: number) => {
		return engine.discardDraft(messageId)
	})

	ipcMain.handle('mail:messages:byRfcId', (_event, accountId: number, rfcMessageId: string) => {
		return engine.findMessageIdByRfcId(accountId, rfcMessageId)
	})

	ipcMain.handle('mail:messages:locate', (_event, messageId: number) => {
		return engine.locateMessage(messageId)
	})

	ipcMain.handle('mail:threads:locate', (_event, threadId: number) => {
		return engine.locateThread(threadId)
	})

	ipcMain.handle('mail:attachments:data', (_event, attachmentId: number): AttachmentData | null => {
		const attachment = engine.getAttachment(attachmentId)
		if (!attachment) return null
		return { contentType: attachment.contentType, base64: attachment.content.toString('base64') }
	})

	ipcMain.handle('mail:attachments:save', async (event, attachmentId: number): Promise<string | null> => {
		const attachment = engine.getAttachment(attachmentId)
		if (!attachment) return null
		const window = BrowserWindow.fromWebContents(event.sender)
		if (!window) return null
		const result = await dialog.showSaveDialog(window, {
			defaultPath: attachment.filename || 'attachment'
		})
		if (result.canceled || !result.filePath) return null
		await writeFile(result.filePath, attachment.content)
		return result.filePath
	})

	ipcMain.handle('mail:compose:pickFiles', async (event): Promise<OutgoingAttachment[]> => {
		const window = BrowserWindow.fromWebContents(event.sender)
		if (!window) return []
		const result = await dialog.showOpenDialog(window, {
			properties: ['openFile', 'multiSelections']
		})
		if (result.canceled) return []
		return result.filePaths.map((path) => ({
			path,
			name: basename(path),
			size: statSync(path).size
		}))
	})

	ipcMain.handle('mail:search', (_event, query: string, accountId: number | null) => {
		return engine.search(query, accountId, SEARCH_LIMIT)
	})

	ipcMain.handle('mail:search:semantic', (_event, query: string, accountId: number | null) => {
		return engine.searchSemantic(query, accountId, SEARCH_LIMIT)
	})

	ipcMain.handle('mail:messages:setLabel', (_event, messageId: number, label: string | null) => {
		engine.setMessageUserLabel(messageId, label)
	})

	ipcMain.handle('mail:labels:counts', (_event, folderId: number | null) => {
		return engine.labelCounts(folderId)
	})

	ipcMain.handle('mail:contacts:suggest', (_event, accountId: number, query: string) => {
		return engine.suggestRecipients(accountId, query, 8)
	})

	ipcMain.handle('mail:messages:unsubscribe', (_event, messageId: number) => {
		return engine.unsubscribe(messageId)
	})

	ipcMain.handle('mail:extractions:track', (_event, messageId: number) => {
		return engine.trackShipmentStatus(messageId)
	})

	ipcMain.handle(
		'mail:extractions:saveActions',
		(_event, messageId: number, items: Array<{ title: string; due: string | null }>) => {
			engine.saveActionsExtraction(messageId, items)
		}
	)

	ipcMain.handle(
		'mail:extractions:saveShipment',
		(_event, messageId: number, payload: Parameters<MailEngine['saveShipmentExtraction']>[1]) => {
			engine.saveShipmentExtraction(messageId, payload)
		}
	)

	ipcMain.handle('mail:sync:statuses', () => {
		return engine.syncStatuses()
	})

	ipcMain.handle('mail:digest:candidates', () => {
		return engine.digestCandidates()
	})

	ipcMain.handle('nib:status', () => {
		return nib.status()
	})

	ipcMain.handle('nib:start', async () => {
		await nib.start()
		return nib.status()
	})
}

export function broadcast(channel: string, payload: unknown): void {
	for (const window of BrowserWindow.getAllWindows()) {
		window.webContents.send(channel, payload)
	}
}
