// Thin client for the embedded nib agent server. All traffic goes over the
// neomail-nib:// protocol, which the main process proxies onto nib's unix
// socket — so this is ordinary fetch/EventSource web code.

import type {
	BlobDescriptor,
	ClientEventBody,
	CommandInfo,
	ConfirmationResult,
	CreateSessionOptions,
	DeliverAs,
	ModelsResponse,
	SessionEvent,
	SessionMeta,
	SessionPatch,
	SessionSnapshot,
	SessionUpdateResult,
	ToolInfo
} from './types'
import { EVENT_TYPES } from './types'

const BASE = 'neomail-nib://api'

export type NibServerEvent = SessionEvent

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
	const response = await fetch(`${BASE}${path}`, init)
	const text = await response.text()
	if (!response.ok) {
		throw new Error(nibErrorMessage(response.status, text))
	}
	if (text.trim() === '') return undefined as T
	return JSON.parse(text) as T
}

function nibErrorMessage(status: number, text: string): string {
	try {
		const body = JSON.parse(text) as { error?: { message?: string } }
		if (body.error && body.error.message) return body.error.message
	} catch {
		// Not a problem document; fall through.
	}
	if (text.trim() !== '') return text
	return `HTTP ${status}`
}

function json(method: string, body: unknown): RequestInit {
	return { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export function createSession(options: CreateSessionOptions): Promise<SessionSnapshot> {
	return requestJson('/v1/sessions', json('POST', options))
}

export function listSessions(): Promise<{ sessions: SessionMeta[] }> {
	return requestJson('/v1/sessions')
}

export function getSession(sessionId: string): Promise<SessionSnapshot> {
	return requestJson(`/v1/sessions/${sessionId}`)
}

export function renameSession(sessionId: string, title: string): Promise<void> {
	return requestJson(`/v1/sessions/${sessionId}`, json('PATCH', { title }))
}

export function patchSession(sessionId: string, patch: SessionPatch): Promise<SessionUpdateResult> {
	return requestJson(`/v1/sessions/${sessionId}`, json('PATCH', patch))
}

export function listModels(): Promise<ModelsResponse> {
	return requestJson('/v1/models')
}

/** Fork at `afterSeq`; returns the child session's snapshot. */
export function forkSession(sessionId: string, afterSeq: number): Promise<SessionSnapshot> {
	return requestJson(`/v1/sessions/${sessionId}/fork`, json('POST', { afterSeq }))
}

/** Bookmark an event; label null clears it. Returns all labels of the session. */
export function setEventLabel(
	sessionId: string,
	eventId: string,
	label: string | null
): Promise<{ labels: Record<string, string> }> {
	return requestJson(`/v1/sessions/${sessionId}/labels`, json('POST', { eventId, label }))
}

/** Upload raw attachment bytes; the returned ref goes into image blocks. */
export async function uploadBlob(
	sessionId: string,
	data: Blob,
	mediaType: string,
	filename?: string
): Promise<BlobDescriptor> {
	const headers: Record<string, string> = { 'content-type': mediaType }
	if (filename) headers['x-filename'] = encodeURIComponent(filename)
	return requestJson(`/v1/sessions/${sessionId}/blobs`, { method: 'POST', headers, body: data })
}

export function blobUrl(sessionId: string, ref: string): string {
	return `${BASE}/v1/sessions/${sessionId}/blobs/${ref}`
}

/** The whole session as JSONL text (meta line + every event). */
export async function exportSessionJsonl(sessionId: string): Promise<string> {
	const response = await fetch(`${BASE}/v1/sessions/${sessionId}/export?format=jsonl`)
	const text = await response.text()
	if (!response.ok) throw new Error(nibErrorMessage(response.status, text))
	return text
}

export function deleteSession(sessionId: string): Promise<void> {
	return requestJson(`/v1/sessions/${sessionId}`, { method: 'DELETE' })
}

export function listSessionEvents(
	sessionId: string,
	after = 0
): Promise<{ events: SessionEvent[]; lastSeq: number }> {
	return requestJson(`/v1/sessions/${sessionId}/events?after=${after}`)
}

export function listTools(): Promise<{ tools: ToolInfo[] }> {
	return requestJson('/v1/tools')
}

export function listCommands(): Promise<{ commands: CommandInfo[] }> {
	return requestJson('/v1/commands')
}

export function sendUserMessage(
	sessionId: string,
	text: string,
	deliverAs?: DeliverAs,
	images?: Array<{ ref: string; mediaType: string }>
): Promise<void> {
	const content: ClientEventBody & { type: 'user.message' } = {
		type: 'user.message',
		content: [{ type: 'text', text }]
	}
	if (images) {
		for (const image of images) {
			content.content.push({ type: 'image', ref: image.ref, mediaType: image.mediaType })
		}
	}
	if (deliverAs) content.deliverAs = deliverAs
	return sendEvents(sessionId, [content])
}

/** Rewind: abandon everything after `fromSeq` and continue from there. */
export function sendBranch(sessionId: string, fromSeq: number): Promise<void> {
	return sendEvents(sessionId, [{ type: 'user.branch', fromSeq }])
}

export function sendCommand(sessionId: string, name: string, args: string): Promise<void> {
	return sendEvents(sessionId, [{ type: 'user.command', name, args }])
}

export function sendUnqueue(sessionId: string, messageId: string): Promise<void> {
	return sendEvents(sessionId, [{ type: 'user.unqueue', messageId }])
}

export function sendToolConfirmation(
	sessionId: string,
	toolUseId: string,
	result: ConfirmationResult,
	editedInput?: unknown
): Promise<void> {
	const event: ClientEventBody & { type: 'user.tool_confirmation' } = {
		type: 'user.tool_confirmation',
		toolUseId,
		result
	}
	if (editedInput !== undefined) event.input = editedInput
	return sendEvents(sessionId, [event])
}

export function sendInterrupt(sessionId: string): Promise<void> {
	return sendEvents(sessionId, [{ type: 'user.interrupt' }])
}

function sendEvents(sessionId: string, events: ClientEventBody[]): Promise<void> {
	return requestJson(`/v1/sessions/${sessionId}/events`, json('POST', { events }))
}

/**
 * Tail a session's event stream. Returns a cleanup function; the EventSource
 * reconnects on its own and resumes from Last-Event-ID without gaps.
 */
export function streamSession(
	sessionId: string,
	after: number,
	onEvent: (event: NibServerEvent) => void
): () => void {
	const source = new EventSource(`${BASE}/v1/sessions/${sessionId}/stream?after=${after}`)

	const listener = (message: MessageEvent): void => {
		const payload = JSON.parse(message.data) as Record<string, unknown>
		onEvent({ ...payload, seq: Number(message.lastEventId) } as NibServerEvent)
	}

	// nib names its SSE events by type; subscribe to the full vocabulary.
	for (const type of EVENT_TYPES) {
		source.addEventListener(type, listener)
	}

	return () => source.close()
}
