import { refreshGoogleAccessToken } from './oauth'
import type { AccountCredentials, MailStore } from './store'

// Access-token upkeep for OAuth accounts. Sync, ops and SMTP all call in here
// right before connecting; password accounts pass through untouched.

/** Shape imapflow accepts: pass for password logins, accessToken for XOAUTH2. */
export interface ImapAuth {
	user: string
	pass?: string
	accessToken?: string
}

const inflightRefreshes = new Map<number, Promise<string>>()

export async function imapAuthFor(
	store: MailStore,
	credentials: AccountCredentials
): Promise<ImapAuth> {
	if (credentials.authType !== 'oauth') {
		return { user: credentials.imapUser, pass: credentials.imapPassword }
	}
	return { user: credentials.imapUser, accessToken: await freshAccessToken(store, credentials) }
}

/**
 * Return a non-expired access token, refreshing and persisting when needed.
 * Concurrent callers for the same account share one refresh request.
 */
export async function freshAccessToken(
	store: MailStore,
	credentials: AccountCredentials
): Promise<string> {
	if (credentials.oauthRefreshToken === null || credentials.oauthClientId === null) {
		throw new Error('account has no OAuth tokens')
	}
	const stored = store.getOauthAccessToken(credentials.accountId)
	if (stored && new Date(stored.expiresAt).getTime() > Date.now()) {
		return stored.accessToken
	}

	const running = inflightRefreshes.get(credentials.accountId)
	if (running) return running

	const refresh = refreshGoogleAccessToken(
		credentials.oauthClientId,
		credentials.oauthClientSecret || '',
		credentials.oauthRefreshToken
	)
		.then((tokens) => {
			store.setOauthAccessToken(credentials.accountId, tokens.accessToken, tokens.expiresAt)
			return tokens.accessToken
		})
		.finally(() => {
			inflightRefreshes.delete(credentials.accountId)
		})
	inflightRefreshes.set(credentials.accountId, refresh)
	return refresh
}
