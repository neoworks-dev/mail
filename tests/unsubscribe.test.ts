import { describe, expect, test } from 'bun:test'
import { parseListUnsubscribe, parseMailto } from '../src/main/mail/unsubscribe'

describe('parseListUnsubscribe', () => {
	test('extracts https and mailto entries', () => {
		const target = parseListUnsubscribe(
			'<https://list.example/unsub?u=1>, <mailto:leave@list.example?subject=unsub>'
		)
		expect(target.url).toBe('https://list.example/unsub?u=1')
		expect(target.mailto).toBe('mailto:leave@list.example?subject=unsub')
	})

	test('mailto only', () => {
		const target = parseListUnsubscribe('<mailto:leave@list.example>')
		expect(target.url).toBeNull()
		expect(target.mailto).toBe('mailto:leave@list.example')
	})

	test('rejects non-http(s) schemes', () => {
		const target = parseListUnsubscribe('<ftp://list.example/x>, <javascript:alert(1)>')
		expect(target.url).toBeNull()
		expect(target.mailto).toBeNull()
	})

	test('keeps the first entry of each kind', () => {
		const target = parseListUnsubscribe('<https://a.example/1>, <https://b.example/2>')
		expect(target.url).toBe('https://a.example/1')
	})
})

describe('parseMailto', () => {
	test('address with subject and body parameters', () => {
		const request = parseMailto('mailto:leave@list.example?subject=Remove%20me&body=please')
		expect(request).toEqual({ to: 'leave@list.example', subject: 'Remove me', body: 'please' })
	})

	test('defaults subject and body to unsubscribe', () => {
		const request = parseMailto('mailto:leave@list.example')
		expect(request).toEqual({ to: 'leave@list.example', subject: 'unsubscribe', body: 'unsubscribe' })
	})

	test('empty address is rejected', () => {
		expect(parseMailto('mailto:?subject=x')).toBeNull()
	})
})
