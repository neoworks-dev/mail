import { describe, expect, test } from 'bun:test'
import {
	buildAuthorizationUrl,
	createPkcePair,
	emailFromIdToken,
	GMAIL_SCOPES,
	pkceChallenge
} from '../sidecar/mail/oauth'

describe('pkceChallenge', () => {
	test('matches the RFC 7636 appendix B test vector', () => {
		const challenge = pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')
		expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
	})

	test('createPkcePair returns a matching verifier/challenge pair', () => {
		const pair = createPkcePair()
		expect(pair.verifier.length).toBeGreaterThanOrEqual(43)
		expect(pkceChallenge(pair.verifier)).toBe(pair.challenge)
	})
})

describe('buildAuthorizationUrl', () => {
	test('carries client, redirect, PKCE and offline-access parameters', () => {
		const url = new URL(
			buildAuthorizationUrl({
				clientId: 'client-123.apps.googleusercontent.com',
				redirectUri: 'http://127.0.0.1:43210',
				state: 'state-abc',
				codeChallenge: 'challenge-xyz',
				loginHint: 'user@gmail.com'
			})
		)
		expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
		expect(url.searchParams.get('client_id')).toBe('client-123.apps.googleusercontent.com')
		expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:43210')
		expect(url.searchParams.get('response_type')).toBe('code')
		expect(url.searchParams.get('scope')).toBe(GMAIL_SCOPES)
		expect(url.searchParams.get('state')).toBe('state-abc')
		expect(url.searchParams.get('code_challenge')).toBe('challenge-xyz')
		expect(url.searchParams.get('code_challenge_method')).toBe('S256')
		expect(url.searchParams.get('access_type')).toBe('offline')
		expect(url.searchParams.get('prompt')).toBe('consent')
		expect(url.searchParams.get('login_hint')).toBe('user@gmail.com')
	})

	test('omits login_hint when empty', () => {
		const url = new URL(
			buildAuthorizationUrl({
				clientId: 'client',
				redirectUri: 'http://127.0.0.1:1',
				state: 's',
				codeChallenge: 'c',
				loginHint: ''
			})
		)
		expect(url.searchParams.has('login_hint')).toBe(false)
	})
})

describe('emailFromIdToken', () => {
	function fakeIdToken(payload: object): string {
		const encode = (value: object): string =>
			Buffer.from(JSON.stringify(value)).toString('base64url')
		return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`
	}

	test('extracts the email claim', () => {
		const token = fakeIdToken({ sub: '123', email: 'user@gmail.com', email_verified: true })
		expect(emailFromIdToken(token)).toBe('user@gmail.com')
	})

	test('returns null without an email claim', () => {
		expect(emailFromIdToken(fakeIdToken({ sub: '123' }))).toBeNull()
	})

	test('returns null for malformed tokens', () => {
		expect(emailFromIdToken('not-a-jwt')).toBeNull()
		expect(emailFromIdToken('a.%%%.c')).toBeNull()
	})
})
