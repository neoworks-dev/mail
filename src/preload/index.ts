import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import type { NeomailApi } from '../shared/bridge'
import type { GmailClientConfig, MailAccountInput, OutgoingMessage } from '../shared/mail'

// Everything mail-related crosses IPC; nib sessions/streams go straight from
// the renderer to neomail-nib:// (proxied in main), so only process control
// for nib lives here.
const api: NeomailApi = {
	accounts: {
		list: () => ipcRenderer.invoke('mail:accounts:list'),
		add: (input: MailAccountInput) => ipcRenderer.invoke('mail:accounts:add', input),
		addGmail: () => ipcRenderer.invoke('mail:accounts:addGmail'),
		gmailClientConfigured: () => ipcRenderer.invoke('mail:accounts:gmailClientConfigured'),
		setGmailClientConfig: (config: GmailClientConfig) =>
			ipcRenderer.invoke('mail:accounts:setGmailClientConfig', config),
		remove: (accountId: number) => ipcRenderer.invoke('mail:accounts:remove', accountId)
	},
	folders: {
		list: (accountId: number) => ipcRenderer.invoke('mail:folders:list', accountId)
	},
	threads: {
		list: (folderId: number, limit: number, offset: number, label: string | null) =>
			ipcRenderer.invoke('mail:threads:list', folderId, limit, offset, label),
		listUnified: (limit: number, offset: number, label: string | null) =>
			ipcRenderer.invoke('mail:threads:listUnified', limit, offset, label),
		messages: (accountId: number, threadId: number) =>
			ipcRenderer.invoke('mail:threads:messages', accountId, threadId),
		locate: (threadId: number) => ipcRenderer.invoke('mail:threads:locate', threadId)
	},
	messages: {
		body: (messageId: number) => ipcRenderer.invoke('mail:messages:body', messageId),
		markSeen: (messageId: number, seen: boolean) =>
			ipcRenderer.invoke('mail:messages:markSeen', messageId, seen),
		setFlagged: (messageId: number, flagged: boolean) =>
			ipcRenderer.invoke('mail:messages:setFlagged', messageId, flagged),
		move: (messageId: number, targetFolderId: number) =>
			ipcRenderer.invoke('mail:messages:move', messageId, targetFolderId),
		archive: (messageId: number) => ipcRenderer.invoke('mail:messages:archive', messageId),
		delete: (messageId: number) => ipcRenderer.invoke('mail:messages:delete', messageId),
		byRfcId: (accountId: number, rfcMessageId: string) =>
			ipcRenderer.invoke('mail:messages:byRfcId', accountId, rfcMessageId),
		locate: (messageId: number) => ipcRenderer.invoke('mail:messages:locate', messageId),
		setLabel: (messageId: number, label: string | null) =>
			ipcRenderer.invoke('mail:messages:setLabel', messageId, label),
		unsubscribe: (messageId: number) => ipcRenderer.invoke('mail:messages:unsubscribe', messageId),
		saveShipment: (messageId: number, payload: unknown) =>
			ipcRenderer.invoke('mail:extractions:saveShipment', messageId, payload),
		trackShipment: (messageId: number) => ipcRenderer.invoke('mail:extractions:track', messageId),
		saveActions: (messageId: number, items: unknown) =>
			ipcRenderer.invoke('mail:extractions:saveActions', messageId, items)
	},
	attachments: {
		data: (attachmentId: number) => ipcRenderer.invoke('mail:attachments:data', attachmentId),
		save: (attachmentId: number) => ipcRenderer.invoke('mail:attachments:save', attachmentId)
	},
	drafts: {
		save: (input: OutgoingMessage) => ipcRenderer.invoke('mail:drafts:save', input),
		discard: (messageId: number) => ipcRenderer.invoke('mail:drafts:discard', messageId)
	},
	compose: {
		pickFiles: () => ipcRenderer.invoke('mail:compose:pickFiles')
	},
	labels: {
		counts: (folderId: number | null) => ipcRenderer.invoke('mail:labels:counts', folderId)
	},
	contacts: {
		suggest: (accountId: number, query: string) =>
			ipcRenderer.invoke('mail:contacts:suggest', accountId, query)
	},
	send: (input: OutgoingMessage) => ipcRenderer.invoke('mail:send', input),
	sendQueue: {
		queue: (input: OutgoingMessage) => ipcRenderer.invoke('mail:send:queue', input),
		cancel: (sendId: number) => ipcRenderer.invoke('mail:send:cancelQueued', sendId)
	},
	search: (query: string, accountId: number | null) =>
		ipcRenderer.invoke('mail:search', query, accountId),
	searchSemantic: (query: string, accountId: number | null) =>
		ipcRenderer.invoke('mail:search:semantic', query, accountId),
	sync: {
		statuses: () => ipcRenderer.invoke('mail:sync:statuses')
	},
	digest: {
		candidates: () => ipcRenderer.invoke('mail:digest:candidates')
	},
	nib: {
		status: () => ipcRenderer.invoke('nib:status'),
		start: () => ipcRenderer.invoke('nib:start')
	},
	on: (channel: string, callback: (payload: unknown) => void): (() => void) => {
		const listener = (_event: IpcRendererEvent, payload: unknown): void => callback(payload)
		ipcRenderer.on(channel, listener)
		return () => ipcRenderer.removeListener(channel, listener)
	}
}

contextBridge.exposeInMainWorld('neomail', api)
