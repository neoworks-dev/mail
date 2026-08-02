import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// App-wide Google OAuth client. Google requires a registered client_id for
// every OAuth flow — there is no client-less login — so the credentials are
// configured once (env or config file) and every "Sign in with Google" after
// that is a single click. For desktop apps the client secret is not
// confidential; plain JSON in userData is fine.

export interface GoogleClientConfig {
	clientId: string
	clientSecret: string
}

const ENV_CLIENT_ID = 'NEOMAIL_GOOGLE_CLIENT_ID'
const ENV_CLIENT_SECRET = 'NEOMAIL_GOOGLE_CLIENT_SECRET'

function configPath(): string {
	return join(app.getPath('userData'), 'google-oauth.json')
}

export function getGoogleClientConfig(): GoogleClientConfig | null {
	const envClientId = process.env[ENV_CLIENT_ID]
	const envClientSecret = process.env[ENV_CLIENT_SECRET]
	if (envClientId && envClientSecret) {
		return { clientId: envClientId, clientSecret: envClientSecret }
	}

	try {
		const parsed = JSON.parse(readFileSync(configPath(), 'utf8'))
		if (typeof parsed.clientId === 'string' && typeof parsed.clientSecret === 'string') {
			if (parsed.clientId !== '' && parsed.clientSecret !== '') {
				return { clientId: parsed.clientId, clientSecret: parsed.clientSecret }
			}
		}
	} catch {
		// Missing or malformed file — not configured yet.
	}
	return null
}

export function setGoogleClientConfig(config: GoogleClientConfig): void {
	writeFileSync(configPath(), JSON.stringify(config, null, '\t'))
}
