// The nib wire protocol, as this renderer uses it. Hand-written mirror of
// nib's src/core/events.ts (same approach as nib's own reference client), so
// the app builds without importing server code.

export type SessionStatus = 'idle' | 'running' | 'terminated'

export type IdleReason = 'end_turn' | 'requires_action' | 'aborted' | 'error'

export type ToolPermission = 'allow' | 'ask'

export type DeliverAs = 'steer' | 'followUp'

export type ConfirmationResult = 'allow' | 'deny' | 'always_session' | 'always_project'

export interface TextBlock {
	type: 'text'
	text: string
}

export type UserContentBlock = TextBlock | { type: 'image'; ref: string; mediaType: string }

export interface ContentBlock {
	type: string
	text?: string
	[key: string]: unknown
}

export interface EventEnvelope {
	id: string
	seq: number
	sessionId: string
	createdAt: string
}

export type ClientEventBody =
	| { type: 'user.message'; content: UserContentBlock[]; deliverAs?: DeliverAs }
	| {
			type: 'user.tool_confirmation'
			toolUseId: string
			result: ConfirmationResult
			reason?: string
			input?: unknown
	  }
	| { type: 'user.interrupt' }
	| { type: 'user.command'; name: string; args: string }
	| { type: 'user.unqueue'; messageId: string }
	| { type: 'user.branch'; fromSeq: number }

export type ServerEventBody =
	| { type: 'session.status_running' }
	| { type: 'session.status_idle'; stopReason: IdleReason }
	| { type: 'session.status_terminated'; reason: string }
	| { type: 'session.error'; message: string }
	| { type: 'session.notice'; message: string }
	| { type: 'session.info_changed'; changed: string[] }
	| { type: 'session.compacted'; summary: string; droppedMessages: number }
	| { type: 'session.forked'; childSessionId: string; afterSeq: number }
	| { type: 'session.branched'; fromSeq: number }
	| { type: 'agent.message_start' }
	| { type: 'agent.thinking_delta'; text: string }
	| { type: 'agent.message_delta'; text: string }
	| { type: 'agent.message_end'; content: ContentBlock[]; stopReason: string }
	| { type: 'agent.tool_use'; toolUseId: string; name: string; input: unknown; permission: ToolPermission }
	| { type: 'agent.tool_use_edited'; toolUseId: string; name: string; input: unknown }
	| { type: 'agent.tool_progress'; toolUseId: string; name: string; message: string }
	| { type: 'agent.tool_result'; toolUseId: string; name: string; content: string; isError: boolean }
	| { type: 'ui.surface'; surfaceId: string; slot: UiSlot; view: UiNode }
	| { type: 'ui.surface'; surfaceId: string; view: null }

export type UiSlot = 'transcript' | 'panel'

export type UiTone = 'normal' | 'muted' | 'success' | 'warning' | 'danger'

interface UiNodeBase {
	fallbackText?: string
}

export type UiNode =
	| (UiNodeBase & { kind: 'stack'; children: UiNode[] })
	| (UiNodeBase & { kind: 'text'; text: string; tone?: UiTone })
	| (UiNodeBase & { kind: 'markdown'; text: string })
	| (UiNodeBase & { kind: 'code'; text: string; language?: string })
	| (UiNodeBase & { kind: 'list'; items: string[] })
	| (UiNodeBase & { kind: 'keyValue'; entries: Array<{ key: string; value: string }> })
	| (UiNodeBase & { kind: 'table'; columns: string[]; rows: string[][] })
	| (UiNodeBase & { kind: 'badge'; text: string; tone?: UiTone })
	| (UiNodeBase & { kind: 'divider' })

export type EventBody = ClientEventBody | ServerEventBody

export type SessionEvent = EventBody & EventEnvelope

/** Every event name the server frames as `event: <type>`. */
export const EVENT_TYPES: string[] = [
	'user.message',
	'user.tool_confirmation',
	'user.interrupt',
	'user.tool_result',
	'user.command',
	'user.compact',
	'user.unqueue',
	'user.branch',
	'user.shell',
	'session.status_running',
	'session.status_idle',
	'session.status_terminated',
	'session.error',
	'session.notice',
	'session.info_changed',
	'session.compacted',
	'session.forked',
	'session.branched',
	'session.shell_result',
	'agent.message_start',
	'agent.thinking_delta',
	'agent.message_delta',
	'agent.message_end',
	'agent.tool_use',
	'agent.tool_use_edited',
	'agent.tool_progress',
	'agent.tool_result',
	'ui.surface'
]

export interface Usage {
	inputTokens: number
	outputTokens: number
	cacheReadTokens: number
	cacheWriteTokens: number
}

export interface ContextUsage {
	usedTokens: number
	contextWindow: number
	remainingTokens: number
	ratio: number
}

export interface QueuedMessage {
	id: string
	text: string
	deliverAs: DeliverAs
}

export type ThinkingLevel = 'off' | 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const THINKING_LEVELS: ThinkingLevel[] = ['off', 'low', 'medium', 'high', 'xhigh', 'max']

export interface SessionSnapshot {
	id: string
	title: string
	provider: string
	model: string
	thinkingLevel: ThinkingLevel
	activeTools: string[] | null
	autoApproveTools: string[]
	/** Bookmarks: event id -> label text. */
	labels: Record<string, string>
	/** Present only when the session is a fork. */
	parentSessionId?: string
	forkedAfterSeq?: number
	createdAt: string
	updatedAt: string
	status: SessionStatus
	stopReason?: IdleReason
	pendingApprovals: string[]
	messageCount: number
	lastSeq: number
	usage: Usage
	cost: number
	context: ContextUsage
	queued: QueuedMessage[]
}

/** A `GET /v1/sessions` row: metadata plus live status, no heavy fields. */
export type SessionMeta = Omit<SessionSnapshot, 'messageCount' | 'usage' | 'cost' | 'context' | 'queued'> & {
	live: boolean
}

/** Response of a session PATCH: what changed plus the fresh snapshot. */
export interface SessionUpdateResult {
	changed: string[]
	session: SessionSnapshot
}

export interface SessionPatch {
	title?: string
	provider?: string
	model?: string
	thinkingLevel?: ThinkingLevel
	activeTools?: string[] | null
}

/** Uploaded attachment metadata; `ref` goes into image content blocks. */
export interface BlobDescriptor {
	ref: string
	mediaType: string
	filename?: string
	bytes: number
}

export interface ModelInfo {
	id: string
	provider: string
	displayName?: string
	contextWindow?: number
	maxOutputTokens?: number
}

export interface ModelsResponse {
	default: { provider: string; model: string }
	providers: Array<{ provider: string; models: ModelInfo[] }>
}

export interface CreateSessionOptions {
	title?: string
	systemPrompt?: string
	appendSystemPrompt?: string
	activeTools?: string[]
}

export type ToolResultView = 'hidden' | 'text' | 'list' | 'file' | 'markdown' | 'code'

export interface ToolDisplay {
	label?: string
	input?: 'hidden' | 'json' | 'code' | 'command' | 'diff'
	result?: ToolResultView
	languageFrom?: string
}

export interface ToolInfo {
	name: string
	description: string
	summary?: string
	display?: ToolDisplay
}

export interface CommandInfo {
	name: string
	description: string
	argumentHint?: string
	kind: string
}
