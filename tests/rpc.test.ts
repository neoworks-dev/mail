import { describe, expect, test } from 'bun:test'
import { isFrame, RemoteError, RpcCaller, type RequestFrame } from '../shared/rpc'

describe('RpcCaller', () => {
	test('matches responses to requests by id', async () => {
		const sent: RequestFrame[] = []
		const caller = new RpcCaller((frame) => sent.push(frame))
		const first = caller.call('a', [1])
		const second = caller.call('b', [])
		expect(sent.map((frame) => frame.channel)).toEqual(['a', 'b'])

		caller.receive({ kind: 'response', id: sent[1].id, result: 'two' })
		caller.receive({ kind: 'response', id: sent[0].id, result: 'one' })
		expect(await first).toBe('one')
		expect(await second).toBe('two')
		expect(caller.pendingCount()).toBe(0)
	})

	test('rejects with the code the other end gave', async () => {
		const sent: RequestFrame[] = []
		const caller = new RpcCaller((frame) => sent.push(frame))
		const call = caller.call('nope', [])
		caller.receive({
			kind: 'response',
			id: sent[0].id,
			error: { message: 'no route', code: 'UnknownRoute' }
		})
		const error = (await call.catch((caught: unknown) => caught)) as RemoteError
		expect(error).toBeInstanceOf(RemoteError)
		expect(error.code).toBe('UnknownRoute')
	})

	test('fails every waiting call when the other end goes', async () => {
		const caller = new RpcCaller(() => {})
		const calls = [caller.call('a', []), caller.call('b', [])]
		caller.failAll('the sidecar exited')
		for (const call of calls) expect(call).rejects.toThrow('the sidecar exited')
	})

	test('isFrame accepts only the three kinds', () => {
		expect(isFrame({ kind: 'event', channel: 'x', payload: null })).toBe(true)
		expect(isFrame({ kind: 'other' })).toBe(false)
		expect(isFrame('text')).toBe(false)
	})
})
