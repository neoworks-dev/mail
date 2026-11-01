// Builds the assistant-pane transcript from nib session events. One reducer
// serves both paths: backlog replay (GET .../events) and the live SSE stream
// produce identical items, so resuming an old session just replays history.

import type { IdleReason, SessionEvent, UiNode, UiSlot } from './types'

export interface UserItem {
	kind: 'user'
	text: string
	/** Sent with deliverAs=followUp while the agent was busy. */
	queued: boolean
	/** Event id, target for bookmarks. */
	eventId: string
	/** Event seq; rewind cuts the transcript back to just before this. */
	seq: number
	images: Array<{ ref: string; mediaType: string }>
}

export interface AssistantItem {
	kind: 'assistant'
	text: string
	/** True once message_end replaced the streamed text with the final blocks. */
	final: boolean
	/** Event id of message_start, target for bookmarks. */
	eventId: string
	seq: number
}

export interface ThinkingItem {
	kind: 'thinking'
	text: string
}

export interface ToolItem {
	kind: 'tool'
	toolUseId: string
	toolName: string
	input: unknown
	running: boolean
	needsApproval: boolean
	progress: string[]
	result: string | null
	isError: boolean
}

export interface NoticeItem {
	kind: 'notice'
	text: string
}

export interface ErrorItem {
	kind: 'error'
	text: string
}

export interface SurfaceItem {
	kind: 'surface'
	surfaceId: string
	slot: UiSlot
	view: UiNode
}

export type TranscriptItem =
	| UserItem
	| AssistantItem
	| ThinkingItem
	| ToolItem
	| NoticeItem
	| ErrorItem
	| SurfaceItem

export interface TranscriptState {
	items: TranscriptItem[]
	running: boolean
	stopReason: IdleReason | null
}

export function emptyTranscript(): TranscriptState {
	return { items: [], running: false, stopReason: null }
}

export function applyEvent(state: TranscriptState, event: SessionEvent): void {
	switch (event.type) {
		case 'user.message': {
			const text = event.content
				.filter((block) => block.type === 'text')
				.map((block) => block.text)
				.join('\n')
			const images = event.content.flatMap((block) => {
				if (block.type !== 'image') return []
				return [{ ref: block.ref, mediaType: block.mediaType }]
			})
			state.items.push({
				kind: 'user',
				text,
				queued: event.deliverAs === 'followUp',
				eventId: event.id,
				seq: event.seq,
				images
			})
			return
		}
		case 'user.command': {
			const args = event.args.trim()
			state.items.push({
				kind: 'user',
				text: args === '' ? `/${event.name}` : `/${event.name} ${args}`,
				queued: false,
				eventId: event.id,
				seq: event.seq,
				images: []
			})
			return
		}
		case 'user.interrupt':
			state.items.push({ kind: 'notice', text: 'Interrupted' })
			return
		case 'session.status_running':
			state.running = true
			state.stopReason = null
			return
		case 'session.status_idle':
			state.running = false
			state.stopReason = event.stopReason
			return
		case 'session.status_terminated':
			state.running = false
			state.items.push({ kind: 'notice', text: `Session terminated: ${event.reason}` })
			return
		case 'session.error':
			state.items.push({ kind: 'error', text: event.message })
			return
		case 'session.notice':
			state.items.push({ kind: 'notice', text: event.message })
			return
		case 'session.compacted':
			state.items.push({
				kind: 'notice',
				text: `Conversation compacted — ${event.droppedMessages} older messages summarized`
			})
			return
		case 'session.forked':
			state.items.push({ kind: 'notice', text: 'Forked into a new session' })
			return
		case 'session.branched': {
			// Rewind: everything from the first message past fromSeq on belongs
			// to the abandoned branch, including the tool/thinking items after it.
			const cutIndex = state.items.findIndex(
				(item) => (item.kind === 'user' || item.kind === 'assistant') && item.seq > event.fromSeq
			)
			if (cutIndex !== -1) state.items = state.items.slice(0, cutIndex)
			state.items.push({ kind: 'notice', text: 'Rewound the conversation' })
			return
		}
		case 'agent.message_start':
			state.items.push({
				kind: 'assistant',
				text: '',
				final: false,
				eventId: event.id,
				seq: event.seq
			})
			return
		case 'agent.thinking_delta': {
			const last = state.items[state.items.length - 1]
			if (last && last.kind === 'thinking') {
				last.text += event.text
				return
			}
			state.items.push({ kind: 'thinking', text: event.text })
			return
		}
		case 'agent.message_delta': {
			const open = lastOpenAssistant(state)
			if (open) {
				open.text += event.text
				return
			}
			state.items.push({
				kind: 'assistant',
				text: event.text,
				final: false,
				eventId: event.id,
				seq: event.seq
			})
			return
		}
		case 'agent.message_end': {
			const text = event.content
				.filter((block) => block.type === 'text' && typeof block.text === 'string')
				.map((block) => block.text)
				.join('\n')
			const open = lastOpenAssistant(state)
			if (open) {
				open.text = text
				open.final = true
				return
			}
			if (text !== '') {
				state.items.push({
					kind: 'assistant',
					text,
					final: true,
					eventId: event.id,
					seq: event.seq
				})
			}
			return
		}
		case 'agent.tool_use':
			state.items.push({
				kind: 'tool',
				toolUseId: event.toolUseId,
				toolName: event.name,
				input: event.input,
				running: true,
				needsApproval: event.permission === 'ask',
				progress: [],
				result: null,
				isError: false
			})
			return
		case 'agent.tool_use_edited': {
			const tool = findTool(state, event.toolUseId)
			if (!tool) return
			tool.input = event.input
			tool.needsApproval = false
			return
		}
		case 'agent.tool_progress': {
			const tool = findTool(state, event.toolUseId)
			if (tool) tool.progress.push(event.message)
			return
		}
		case 'agent.tool_result': {
			const tool = findTool(state, event.toolUseId)
			if (!tool) return
			tool.running = false
			tool.needsApproval = false
			tool.result = event.content
			tool.isError = event.isError
			return
		}
		case 'ui.surface': {
			if (event.view === null) {
				state.items = state.items.filter(
					(item) => item.kind !== 'surface' || item.surfaceId !== event.surfaceId
				)
				return
			}
			const existing = state.items.find(
				(item): item is SurfaceItem => item.kind === 'surface' && item.surfaceId === event.surfaceId
			)
			if (existing) {
				existing.view = event.view
				existing.slot = event.slot
				return
			}
			state.items.push({
				kind: 'surface',
				surfaceId: event.surfaceId,
				slot: event.slot,
				view: event.view
			})
			return
		}
		default:
			return
	}
}

/** The most recent assistant item still streaming, if the transcript ends a turn with one. */
function lastOpenAssistant(state: TranscriptState): AssistantItem | null {
	for (let index = state.items.length - 1; index >= 0; index -= 1) {
		const item = state.items[index]
		if (item.kind === 'assistant') {
			if (item.final) return null
			return item
		}
		// Thinking and tool items interleave with a streaming message.
		if (item.kind === 'thinking' || item.kind === 'tool') continue
		return null
	}
	return null
}

function findTool(state: TranscriptState, toolUseId: string): ToolItem | null {
	for (let index = state.items.length - 1; index >= 0; index -= 1) {
		const item = state.items[index]
		if (item.kind === 'tool' && item.toolUseId === toolUseId) return item
	}
	return null
}
