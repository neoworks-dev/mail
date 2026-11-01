// Data shapes crossing the main <-> renderer boundary. Keep serializable.

export interface MailAccountInput {
	email: string
	imapHost: string
	imapPort: number
	imapUser: string
	imapPassword: string
	useTls: boolean
	smtpHost: string
	smtpPort: number
}

export interface MailAccount {
	accountId: number
	email: string
	imapHost: string
	imapPort: number
	imapUser: string
	useTls: boolean
	smtpHost: string | null
	smtpPort: number | null
	authType: 'password' | 'oauth'
	createdAt: string
}

/**
 * App-wide Google OAuth client (one-time setup). Google requires a registered
 * client for the flow; individual accounts then sign in with one click.
 */
export interface GmailClientConfig {
	clientId: string
	clientSecret: string
}

export interface MailFolder {
	folderId: number
	accountId: number
	path: string
	name: string
	specialUse: string | null
	totalMessages: number
	unreadMessages: number
}

export interface MessageAddress {
	name: string
	address: string
}

/** Automatic categorization labels (heuristics + embedding classifier). */
export type MailLabel = 'newsletter' | 'ad' | 'notification' | 'social' | 'spam'

export const ALL_MAIL_LABELS: MailLabel[] = ['newsletter', 'ad', 'notification', 'social', 'spam']

export interface MessageSummary {
	messageId: number
	accountId: number
	folderId: number
	uid: number
	threadId: number
	subject: string
	fromName: string
	fromAddress: string
	date: string
	snippet: string
	seen: boolean
	flagged: boolean
	answered: boolean
	hasAttachments: boolean
	rfcMessageId: string
	inReplyTo: string | null
	label: string | null
}

/** One row of the folder list: the newest message of each thread. */
export interface ThreadSummary extends MessageSummary {
	/** Messages in the thread across all folders of the account. */
	threadTotal: number
	threadUnread: number
	/** Everyone who wrote in the thread, once each, in the order they first wrote. */
	participants: MessageAddress[]
}

/** Narrows a thread list beyond its folder and label. */
export interface ThreadFilter {
	unread: boolean
	flagged: boolean
	hasAttachments: boolean
	/** Only threads someone at this address wrote in. */
	fromAddress: string | null
}

export const NO_THREAD_FILTER: ThreadFilter = {
	unread: false,
	flagged: false,
	hasAttachments: false,
	fromAddress: null
}

/** One message inside an opened thread. */
export interface ThreadMessage extends MessageSummary {
	folderPath: string
}

export interface AttachmentMeta {
	attachmentId: number
	filename: string
	contentType: string
	size: number
	/** RFC content id without angle brackets, when the part is referenced via cid:. */
	contentId: string | null
	isInline: boolean
}

/** Extracted shipment data, from parse-time heuristics or manual AI runs. */
export interface ShipmentExtraction {
	carrier: string
	trackingNumber: string | null
	trackingUrl: string | null
	status?: string
	deliveryDate?: string
	/** Latest tracking event from the carrier API, when live-tracked. */
	lastEvent?: string
	/** When the carrier API was last queried. */
	trackedAt?: string
	source: 'heuristic' | 'ai'
}

/** Verdict of one authentication method from an Authentication-Results header. */
export type AuthVerdict =
	| 'pass'
	| 'fail'
	| 'softfail'
	| 'neutral'
	| 'none'
	| 'temperror'
	| 'permerror'
	| 'policy'
	| 'unknown'

export interface MessageAuthResults {
	spf: AuthVerdict | null
	dkim: AuthVerdict | null
	dmarc: AuthVerdict | null
}

export interface MessageSecurity {
	/** Null when the message predates auth capture or carried no Authentication-Results header. */
	auth: MessageAuthResults | null
	/** No earlier message from this address exists in the account. */
	firstTimeSender: boolean
	/** The display name contains an address on a different domain than the real sender. */
	nameSpoof: { claimedDomain: string; actualDomain: string } | null
}

export interface MessageBody {
	messageId: number
	textBody: string | null
	htmlBody: string | null
	toAddresses: MessageAddress[]
	ccAddresses: MessageAddress[]
	references: string[]
	attachments: AttachmentMeta[]
	/** Present when the message carries a List-Unsubscribe header. */
	unsubscribe: { oneClick: boolean } | null
	shipment: ShipmentExtraction | null
	/** Manually AI-extracted action items. */
	actions: { items: ActionItem[] } | null
	security: MessageSecurity
}

export interface ActionItem {
	title: string
	due: string | null
}

export interface AttachmentData {
	contentType: string
	base64: string
}

/** A file picked for an outgoing message; read from disk at send time. */
export interface OutgoingAttachment {
	path: string
	name: string
	size: number
}

export interface MessageDetail extends MessageSummary {
	body: MessageBody
}

export interface SearchResult extends MessageSummary {
	folderPath: string
	/** FTS5 snippet with [match] markers around hits. */
	matchSnippet: string
}

export type SyncPhase = 'connecting' | 'listing' | 'backfill' | 'idle' | 'error'

export interface SyncStatus {
	accountId: number
	phase: SyncPhase
	folderPath: string | null
	downloadedMessages: number
	totalMessages: number
	errorMessage: string | null
}

/** State of the background embedding/classification pipeline. */
export interface EmbeddingStatus {
	/** Messages still waiting for an embedding. */
	pending: number
	running: boolean
	error: string | null
}

export interface ThreadPage {
	threads: ThreadSummary[]
	/** Distinct threads in the folder. */
	total: number
}

export interface OutgoingMessage {
	accountId: number
	/** Comma separated address lists, as typed. */
	to: string
	cc: string
	subject: string
	markdown: string
	/** Local message_id being replied to; sets In-Reply-To/References. */
	replyToMessageId: number | null
	attachments: OutgoingAttachment[]
	/** Local message_id of the autosaved draft, removed after a successful send. */
	draftMessageId: number | null
}
