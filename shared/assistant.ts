// The assistant as the UI sees it: the neo agent's current session, reduced by the sidecar to
// items whose text uses the same blocks as a message body (shared/document.ts), so one renderer
// draws both. The sidecar also asks the UI to do things on the agent's behalf, through the
// `assistant.request` event.

import type { Block } from './document'

export interface AssistantButton {
	label: string
	/** What pressing it sends back through `assistant.action`. */
	action: string
	args?: unknown
	current?: boolean
}

export interface AssistantItem {
	ref: string
	kind: 'user' | 'agent' | 'thought' | 'tool' | 'notice'
	/** Who a user item came from, or a tool call's title. */
	label: string | null
	state: 'pending' | 'running' | 'done' | 'failed' | null
	blocks: Block[]
	buttons: AssistantButton[]
}

export interface AssistantView {
	sessionId: string | null
	items: AssistantItem[]
	/** The agent is working on a turn. */
	running: boolean
}

export interface AssistantStatus {
	/** `off` when the sidecar was told not to connect (NEOMAIL_NEO=off). */
	state: 'connecting' | 'open' | 'reconnecting' | 'closed' | 'off'
	error: string | null
	/** The session the agent works in now. */
	sessionId: string | null
	/** The app showing the agent: `mail` when it is here. */
	focusApp: string | null
}

export interface AssistantPrompt {
	name: string
	description: string
	/** The text sent to the agent; `$ARGUMENTS` stands for what the user adds. */
	text: string
}

export interface DigestItem {
	threadId: number
	note: string
}

export interface DigestGroup {
	title: string
	items: DigestItem[]
}

/** What the agent asked the window to do, through one of Mail's tools. */
export type AssistantRequest =
	| { kind: 'openThread'; accountId: number; threadId: number }
	| { kind: 'replyDraft'; messageId: number | null; markdown: string }
	| { kind: 'summary'; threadId: number; summary: string }
	| { kind: 'digest'; intro: string | null; groups: DigestGroup[] }
	| { kind: 'extractionSaved'; messageId: number }
