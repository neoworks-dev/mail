// The window.neomail surface the preload script exposes to the renderer.

import type {
	AttachmentData,
	GmailClientConfig,
	MailAccount,
	MailAccountInput,
	ShipmentExtraction,
	MailFolder,
	MessageBody,
	OutgoingAttachment,
	OutgoingMessage,
	SearchResult,
	SyncStatus,
	ThreadMessage,
	ThreadPage
} from './mail'
import type { NibStatus } from './nib'

export interface NeomailApi {
	accounts: {
		list: () => Promise<MailAccount[]>
		add: (input: MailAccountInput) => Promise<MailAccount>
		addGmail: () => Promise<MailAccount>
		gmailClientConfigured: () => Promise<boolean>
		setGmailClientConfig: (config: GmailClientConfig) => Promise<void>
		remove: (accountId: number) => Promise<void>
	}
	folders: {
		list: (accountId: number) => Promise<MailFolder[]>
	}
	threads: {
		list: (folderId: number, limit: number, offset: number, label: string | null) => Promise<ThreadPage>
		listUnified: (limit: number, offset: number, label: string | null) => Promise<ThreadPage>
		messages: (accountId: number, threadId: number) => Promise<ThreadMessage[]>
		locate: (threadId: number) => Promise<number | null>
	}
	messages: {
		body: (messageId: number) => Promise<MessageBody | null>
		markSeen: (messageId: number, seen: boolean) => Promise<void>
		setFlagged: (messageId: number, flagged: boolean) => Promise<void>
		move: (messageId: number, targetFolderId: number) => Promise<void>
		archive: (messageId: number) => Promise<void>
		delete: (messageId: number) => Promise<void>
		byRfcId: (accountId: number, rfcMessageId: string) => Promise<number | null>
		locate: (messageId: number) => Promise<{ accountId: number; threadId: number } | null>
		setLabel: (messageId: number, label: string | null) => Promise<void>
		unsubscribe: (messageId: number) => Promise<'posted' | 'sent' | 'opened'>
		saveShipment: (messageId: number, payload: Omit<ShipmentExtraction, 'source'>) => Promise<void>
		trackShipment: (messageId: number) => Promise<void>
		saveActions: (messageId: number, items: Array<{ title: string; due: string | null }>) => Promise<void>
	}
	attachments: {
		data: (attachmentId: number) => Promise<AttachmentData | null>
		save: (attachmentId: number) => Promise<string | null>
	}
	drafts: {
		save: (input: OutgoingMessage) => Promise<number | null>
		discard: (messageId: number) => Promise<void>
	}
	compose: {
		pickFiles: () => Promise<OutgoingAttachment[]>
	}
	labels: {
		counts: (folderId: number | null) => Promise<Array<{ label: string | null; count: number }>>
	}
	contacts: {
		suggest: (accountId: number, query: string) => Promise<Array<{ address: string; name: string }>>
	}
	send: (input: OutgoingMessage) => Promise<void>
	sendQueue: {
		/** Schedule a delayed send; returns when the SMTP transaction will fire. */
		queue: (input: OutgoingMessage) => Promise<{ sendId: number; sendAt: number }>
		/** Undo a queued send; null when it already went out. */
		cancel: (sendId: number) => Promise<OutgoingMessage | null>
	}
	search: (query: string, accountId: number | null) => Promise<SearchResult[]>
	searchSemantic: (query: string, accountId: number | null) => Promise<SearchResult[]>
	sync: {
		statuses: () => Promise<SyncStatus[]>
	}
	digest: {
		candidates: () => Promise<
			Array<{
				threadId: number
				accountId: number
				fromName: string
				fromAddress: string
				subject: string
				snippet: string
				label: string | null
			}>
		>
	}
	nib: {
		status: () => Promise<NibStatus>
		start: () => Promise<NibStatus>
	}
	on: (channel: string, callback: (payload: unknown) => void) => () => void
}
