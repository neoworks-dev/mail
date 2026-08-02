import { describe, expect, test } from 'bun:test'
import { applyEvent, emptyTranscript, type TranscriptState } from '../src/renderer/src/nib/transcript'
import type { SessionEvent } from '../src/renderer/src/nib/types'

let nextSeq = 1

function event(body: Record<string, unknown>): SessionEvent {
	nextSeq += 1
	return {
		id: `evt-${nextSeq}`,
		seq: nextSeq,
		sessionId: 's1',
		createdAt: '2026-08-01T12:00:00Z',
		...body
	} as SessionEvent
}

function replay(state: TranscriptState, bodies: Array<Record<string, unknown>>): void {
	for (const body of bodies) applyEvent(state, event(body))
}

describe('transcript reducer', () => {
	test('full turn: user, thinking, streamed message finalized by message_end', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'user.message', content: [{ type: 'text', text: 'hi' }] },
			{ type: 'session.status_running' },
			{ type: 'agent.message_start' },
			{ type: 'agent.thinking_delta', text: 'let me ' },
			{ type: 'agent.thinking_delta', text: 'think' },
			{ type: 'agent.message_delta', text: 'Hel' },
			{ type: 'agent.message_delta', text: 'lo' },
			{ type: 'agent.message_end', content: [{ type: 'text', text: 'Hello!' }], stopReason: 'end_turn' },
			{ type: 'session.status_idle', stopReason: 'end_turn' }
		])
		expect(state.items.map((item) => item.kind)).toEqual(['user', 'assistant', 'thinking'])
		const assistant = state.items[1]
		if (assistant.kind !== 'assistant') throw new Error('expected assistant')
		expect(assistant.text).toBe('Hello!')
		expect(assistant.final).toBe(true)
		expect(state.running).toBe(false)
		expect(state.stopReason).toBe('end_turn')
	})

	test('tool lifecycle: use, progress, result', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'agent.tool_use', toolUseId: 't1', name: 'search_email', input: { query: 'x' }, permission: 'allow' },
			{ type: 'agent.tool_progress', toolUseId: 't1', name: 'search_email', message: 'scanning' },
			{ type: 'agent.tool_result', toolUseId: 't1', name: 'search_email', content: '2 hits', isError: false }
		])
		const tool = state.items[0]
		if (tool.kind !== 'tool') throw new Error('expected tool')
		expect(tool.running).toBe(false)
		expect(tool.progress).toEqual(['scanning'])
		expect(tool.result).toBe('2 hits')
	})

	test('approval flow: ask permission, edited input clears the flag', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'agent.tool_use', toolUseId: 't1', name: 'move', input: { to: 'A' }, permission: 'ask' },
			{ type: 'agent.tool_use_edited', toolUseId: 't1', name: 'move', input: { to: 'B' } }
		])
		const tool = state.items[0]
		if (tool.kind !== 'tool') throw new Error('expected tool')
		expect(tool.needsApproval).toBe(false)
		expect(tool.input).toEqual({ to: 'B' })
	})

	test('requires_action idle keeps stopReason visible', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'session.status_running' },
			{ type: 'session.status_idle', stopReason: 'requires_action' }
		])
		expect(state.running).toBe(false)
		expect(state.stopReason).toBe('requires_action')
	})

	test('user.command renders as slash text, followUp message marked queued', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'user.command', name: 'triage', args: 'inbox' },
			{ type: 'user.message', content: [{ type: 'text', text: 'later' }], deliverAs: 'followUp' }
		])
		expect(state.items[0]).toMatchObject({ kind: 'user', text: '/triage inbox' })
		expect(state.items[1]).toMatchObject({ kind: 'user', queued: true })
	})

	test('surfaces upsert by id and clear on null view', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'ui.surface', surfaceId: 's', slot: 'transcript', view: { kind: 'text', text: 'a' } },
			{ type: 'ui.surface', surfaceId: 's', slot: 'transcript', view: { kind: 'text', text: 'b' } }
		])
		expect(state.items).toHaveLength(1)
		expect(state.items[0]).toMatchObject({ kind: 'surface', view: { text: 'b' } })
		replay(state, [{ type: 'ui.surface', surfaceId: 's', view: null }])
		expect(state.items).toHaveLength(0)
	})

	test('image blocks are collected on the user item', () => {
		const state = emptyTranscript()
		replay(state, [
			{
				type: 'user.message',
				content: [
					{ type: 'text', text: 'what is this?' },
					{ type: 'image', ref: 'a'.repeat(64), mediaType: 'image/png' }
				]
			}
		])
		const user = state.items[0]
		if (user.kind !== 'user') throw new Error('expected user')
		expect(user.text).toBe('what is this?')
		expect(user.images).toEqual([{ ref: 'a'.repeat(64), mediaType: 'image/png' }])
	})

	test('session.branched truncates the abandoned tail', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'user.message', content: [{ type: 'text', text: 'first' }] },
			{ type: 'agent.message_start' },
			{ type: 'agent.message_end', content: [{ type: 'text', text: 'one' }], stopReason: 'end_turn' },
			{ type: 'user.message', content: [{ type: 'text', text: 'wrong turn' }] },
			{ type: 'agent.tool_use', toolUseId: 't1', name: 'search_email', input: {}, permission: 'allow' },
			{ type: 'agent.message_start' },
			{ type: 'agent.message_end', content: [{ type: 'text', text: 'two' }], stopReason: 'end_turn' }
		])
		const firstAssistant = state.items[1]
		if (firstAssistant.kind !== 'assistant') throw new Error('expected assistant')

		replay(state, [{ type: 'session.branched', fromSeq: firstAssistant.seq }])
		const kinds = state.items.map((item) => item.kind)
		expect(kinds).toEqual(['user', 'assistant', 'notice'])
		expect(state.items[2]).toMatchObject({ kind: 'notice', text: 'Rewound the conversation' })
	})

	test('backlog replay of two turns yields a clean transcript', () => {
		const state = emptyTranscript()
		replay(state, [
			{ type: 'user.message', content: [{ type: 'text', text: 'first' }] },
			{ type: 'session.status_running' },
			{ type: 'agent.message_start' },
			{ type: 'agent.message_delta', text: 'one' },
			{ type: 'agent.message_end', content: [{ type: 'text', text: 'one' }], stopReason: 'end_turn' },
			{ type: 'session.status_idle', stopReason: 'end_turn' },
			{ type: 'user.message', content: [{ type: 'text', text: 'second' }] },
			{ type: 'session.status_running' },
			{ type: 'agent.message_start' },
			{ type: 'agent.message_delta', text: 'two' },
			{ type: 'session.status_idle', stopReason: 'aborted' }
		])
		const kinds = state.items.map((item) => item.kind)
		expect(kinds).toEqual(['user', 'assistant', 'user', 'assistant'])
		const second = state.items[3]
		if (second.kind !== 'assistant') throw new Error('expected assistant')
		expect(second.text).toBe('two')
		expect(second.final).toBe(false)
	})
})
