import { createHash, randomBytes } from 'node:crypto'
import { createServer, type Server } from 'node:http'

// Google OAuth for Gmail IMAP/SMTP (XOAUTH2). Desktop-app flow: loopback
// redirect + PKCE. The user supplies their own OAuth client (Google Cloud
// Console, application type "Desktop app"); Google still issues a client
// secret for desktop clients and requires it at the token endpoint, but it is
// not treated as confidential.

const AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
/**
 * Full mail scope for IMAP/SMTP, plus openid+email so the token response
 * carries an id_token naming the signed-in address — the user never types it.
 */
export const GMAIL_SCOPES = 'https://mail.google.com/ openid email'

const FLOW_TIMEOUT_MS = 5 * 60_000
/** Refresh this long before the reported expiry to absorb clock skew. */
const EXPIRY_SLACK_MS = 60_000

export interface GoogleTokens {
	accessToken: string
	refreshToken: string
	/** ISO timestamp after which the access token must be refreshed. */
	expiresAt: string
	/** Signed-in address from the id_token, when Google returned one. */
	email: string | null
}

export interface PkcePair {
	verifier: string
	challenge: string
}

export function createPkcePair(): PkcePair {
	const verifier = randomBytes(32).toString('base64url')
	return { verifier, challenge: pkceChallenge(verifier) }
}

export function pkceChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url')
}

export function buildAuthorizationUrl(options: {
	clientId: string
	redirectUri: string
	state: string
	codeChallenge: string
	loginHint: string
}): string {
	const url = new URL(AUTHORIZATION_ENDPOINT)
	url.searchParams.set('client_id', options.clientId)
	url.searchParams.set('redirect_uri', options.redirectUri)
	url.searchParams.set('response_type', 'code')
	url.searchParams.set('scope', GMAIL_SCOPES)
	url.searchParams.set('state', options.state)
	url.searchParams.set('code_challenge', options.codeChallenge)
	url.searchParams.set('code_challenge_method', 'S256')
	// offline + consent so a refresh token is issued even on re-authorization.
	url.searchParams.set('access_type', 'offline')
	url.searchParams.set('prompt', 'consent')
	if (options.loginHint !== '') url.searchParams.set('login_hint', options.loginHint)
	return url.toString()
}

interface TokenResponse {
	access_token?: string
	refresh_token?: string
	expires_in?: number
	id_token?: string
	error?: string
	error_description?: string
}

/**
 * Pull the email claim out of an id_token JWT. Decode only — the token came
 * straight from Google's token endpoint over TLS, so no signature check.
 */
export function emailFromIdToken(idToken: string): string | null {
	const segments = idToken.split('.')
	if (segments.length < 2) return null
	try {
		const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'))
		if (typeof payload.email === 'string' && payload.email !== '') return payload.email
		return null
	} catch {
		return null
	}
}

export function tokenExpiryFromNow(expiresInSeconds: number): string {
	return new Date(Date.now() + expiresInSeconds * 1000 - EXPIRY_SLACK_MS).toISOString()
}

async function requestTokens(parameters: Record<string, string>): Promise<TokenResponse> {
	const response = await fetch(TOKEN_ENDPOINT, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(parameters).toString()
	})
	const payload = (await response.json()) as TokenResponse
	if (!response.ok || payload.error) {
		const detail = payload.error_description || payload.error || `HTTP ${response.status}`
		throw new Error(`Google token request failed: ${detail}`)
	}
	return payload
}

export async function refreshGoogleAccessToken(
	clientId: string,
	clientSecret: string,
	refreshToken: string
): Promise<{ accessToken: string; expiresAt: string }> {
	const payload = await requestTokens({
		client_id: clientId,
		client_secret: clientSecret,
		refresh_token: refreshToken,
		grant_type: 'refresh_token'
	})
	if (!payload.access_token || !payload.expires_in) {
		throw new Error('Google token refresh returned no access token')
	}
	return {
		accessToken: payload.access_token,
		expiresAt: tokenExpiryFromNow(payload.expires_in)
	}
}

/**
 * Run the browser consent flow: start a loopback server, open the consent
 * page, wait for the redirect, exchange the code. `openBrowser` is injected so
 * this module stays free of electron imports.
 */
export async function runGoogleOauthFlow(
	clientId: string,
	clientSecret: string,
	loginHint: string,
	openBrowser: (url: string) => void
): Promise<GoogleTokens> {
	const state = randomBytes(16).toString('base64url')
	const pkce = createPkcePair()

	const server = createServer()
	const port = await listenOnLoopback(server)
	const redirectUri = `http://127.0.0.1:${port}`

	try {
		const codePromise = waitForAuthorizationCode(server, state)
		openBrowser(
			buildAuthorizationUrl({
				clientId,
				redirectUri,
				state,
				codeChallenge: pkce.challenge,
				loginHint
			})
		)
		const code = await codePromise

		const payload = await requestTokens({
			client_id: clientId,
			client_secret: clientSecret,
			code,
			code_verifier: pkce.verifier,
			grant_type: 'authorization_code',
			redirect_uri: redirectUri
		})
		if (!payload.access_token || !payload.refresh_token || !payload.expires_in) {
			throw new Error('Google authorization returned incomplete tokens')
		}
		return {
			accessToken: payload.access_token,
			refreshToken: payload.refresh_token,
			expiresAt: tokenExpiryFromNow(payload.expires_in),
			email: payload.id_token ? emailFromIdToken(payload.id_token) : null
		}
	} finally {
		server.close()
	}
}

function listenOnLoopback(server: Server): Promise<number> {
	return new Promise((resolve, reject) => {
		server.once('error', reject)
		server.listen(0, '127.0.0.1', () => {
			const address = server.address()
			if (address === null || typeof address === 'string') {
				reject(new Error('loopback listener has no port'))
				return
			}
			resolve(address.port)
		})
	})
}

function waitForAuthorizationCode(server: Server, expectedState: string): Promise<string> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error('Google sign-in timed out — no redirect received'))
		}, FLOW_TIMEOUT_MS)

		server.on('request', (request, response) => {
			const url = new URL(request.url || '/', 'http://127.0.0.1')
			if (url.pathname !== '/') {
				response.writeHead(404).end()
				return
			}
			const finish = (message: string): void => {
				response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
				response.end(`<!doctype html><body style="font-family:sans-serif">${message}</body>`)
			}

			const errorParameter = url.searchParams.get('error')
			if (errorParameter) {
				finish('Sign-in failed. You can close this tab.')
				clearTimeout(timer)
				reject(new Error(`Google sign-in denied: ${errorParameter}`))
				return
			}
			const code = url.searchParams.get('code')
			const state = url.searchParams.get('state')
			if (!code || state !== expectedState) {
				finish('Invalid sign-in response. You can close this tab.')
				return
			}
			finish('Signed in — you can close this tab and return to Neomail.')
			clearTimeout(timer)
			resolve(code)
		})
	})
}
