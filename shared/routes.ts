// Every route the sidecar serves and every event it pushes, with their shapes, so the UI's
// calls and the sidecar's handlers are checked against one list. A plugin that adds a route of
// its own declares it here by augmentation:
//
//   declare module '../../shared/routes' { interface Routes { 'my.route': (id: number) => string } }

import type {
	AttachmentData,
	EmbeddingStatus,
	GmailClientConfig,
	MailAccount,
	MailAccountInput,
	MailFolder,
	MessageBody,
	OutgoingMessage,
	SearchResult,
	ShipmentExtraction,
	SyncStatus,
	ThreadMessage,
	ThreadPage
} from './mail'
import type { NibStatus } from './nib'

export interface DigestCandidate {
	threadId: number
	accountId: number
	fromName: string
	fromAddress: string
	subject: string
	snippet: string
	label: string | null
}

export interface PluginReport {
	name: string
	state: 'pending' | 'loading' | 'active' | 'failed' | 'disposed' | 'unloading'
	error: string | null
}

export interface SidecarInfo {
	pid: number
	dataDirectory: string
	channels: string[]
	plugins: PluginReport[]
}

/** A request to the nib agent server, relayed by the sidecar. */
export interface NibRequest {
	method: string
	path: string
	headers?: Record<string, string>
	/** A text body, or base64 when `bodyEncoding` says so. */
	body?: string
	bodyEncoding?: 'utf8' | 'base64'
}

export interface NibResponse {
	status: number
	headers: Record<string, string>
	body: string
}

export interface Routes {
	'sidecar.info': () => SidecarInfo

	'accounts.list': () => MailAccount[]
	'accounts.add': (input: MailAccountInput) => MailAccount
	'accounts.addGmail': () => MailAccount
	'accounts.gmailClientConfigured': () => boolean
	'accounts.setGmailClientConfig': (config: GmailClientConfig) => void
	'accounts.remove': (accountId: number) => void

	'folders.list': (accountId: number) => MailFolder[]

	'threads.list': (folderId: number, limit: number, offset: number, label: string | null) => ThreadPage
	'threads.listUnified': (limit: number, offset: number, label: string | null) => ThreadPage
	'threads.messages': (accountId: number, threadId: number) => ThreadMessage[]
	'threads.locate': (threadId: number) => number | null

	'messages.body': (messageId: number) => MessageBody | null
	'messages.markSeen': (messageId: number, seen: boolean) => void
	'messages.setFlagged': (messageId: number, flagged: boolean) => void
	'messages.move': (messageId: number, targetFolderId: number) => void
	'messages.archive': (messageId: number) => void
	'messages.delete': (messageId: number) => void
	'messages.byRfcId': (accountId: number, rfcMessageId: string) => number | null
	'messages.locate': (messageId: number) => { accountId: number; threadId: number } | null
	'messages.setLabel': (messageId: number, label: string | null) => void
	'messages.unsubscribe': (messageId: number) => 'posted' | 'sent' | 'opened'
	'messages.saveShipment': (messageId: number, payload: Omit<ShipmentExtraction, 'source'>) => void
	'messages.trackShipment': (messageId: number) => void
	'messages.saveActions': (messageId: number, items: Array<{ title: string; due: string | null }>) => void

	'attachments.data': (attachmentId: number) => AttachmentData | null
	/** Writes an attachment to a path the UI picked; resolves to that path. */
	'attachments.saveTo': (attachmentId: number, path: string) => string
	/** Describes files the UI picked, for the composer's attachment list. */
	'attachments.describeFiles': (paths: string[]) => Array<{ path: string; name: string; size: number }>

	'drafts.save': (input: OutgoingMessage) => number | null
	'drafts.discard': (messageId: number) => void

	'send.now': (input: OutgoingMessage) => void
	'send.queue': (input: OutgoingMessage) => { sendId: number; sendAt: number }
	'send.cancel': (sendId: number) => OutgoingMessage | null

	'labels.counts': (folderId: number | null) => Array<{ label: string | null; count: number }>
	'contacts.suggest': (accountId: number, query: string) => Array<{ address: string; name: string }>

	'search.text': (query: string, accountId: number | null) => SearchResult[]
	'search.semantic': (query: string, accountId: number | null) => SearchResult[]

	'sync.statuses': () => SyncStatus[]
	'embeddings.status': () => EmbeddingStatus | null
	'digest.candidates': () => DigestCandidate[]

	'system.openUrl': (url: string) => void
	'system.notify': (title: string, body: string) => void

	'nib.status': () => NibStatus
	'nib.start': () => NibStatus
	'nib.request': (request: NibRequest) => NibResponse
	/** Starts relaying a server-sent event stream as `nib.stream` events; resolves to its id. */
	'nib.openStream': (path: string) => number
	'nib.closeStream': (streamId: number) => void
}

export interface PushEvents {
	'sync.status': SyncStatus
	'messages.changed': { accountId: number; folderId: number }
	'accounts.changed': null
	'embeddings.status': EmbeddingStatus
	'digest.due': null
	'send.done': { sendId: number }
	'send.failed': { sendId: number; errorMessage: string; input: OutgoingMessage }
	'nib.ready': unknown
	'nib.exit': { reason: string }
	'nib.stream': { streamId: number; event: string; data: string; id: string | null }
	'nib.streamEnd': { streamId: number; error: string | null }
}

export type RouteName = keyof Routes
export type RouteArgs<Name extends RouteName> = Parameters<Routes[Name]>
export type RouteResult<Name extends RouteName> = Awaited<ReturnType<Routes[Name]>>
export type RouteHandler<Name extends RouteName> = (
	...args: RouteArgs<Name>
) => RouteResult<Name> | Promise<RouteResult<Name>>
