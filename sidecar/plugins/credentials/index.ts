// Provides `credentials`: the cipher stored passwords and OAuth secrets go through. Its key
// lives in the OS keychain; without a reachable keychain new secrets are stored as plaintext,
// as the Electron build did, and a warning says so.

import type { Context } from '@neoworks/extension-system'
import { randomBytes } from 'node:crypto'
import { createCredentialCipher, type CredentialCipher } from '../../mail/credentials'

declare module '@neoworks/extension-system' {
	interface Context {
		credentials: CredentialCipher
	}
}

const KEYCHAIN_ENTRY = { service: 'dev.neoworks.mail', name: 'credentials-key' }
const KEY_LENGTH = 32

export const credentials = {
	name: 'credentials',
	async apply(ctx: Context) {
		const key = await keychainKey(ctx)
		ctx.provide('credentials', createCredentialCipher(key))
	}
}

/** The key from the keychain, created on first use, or null when there is no keychain. */
async function keychainKey(ctx: Context): Promise<Buffer | null> {
	try {
		const stored = await Bun.secrets.get(KEYCHAIN_ENTRY)
		if (stored !== null) return Buffer.from(stored, 'base64')
		const created = randomBytes(KEY_LENGTH)
		await Bun.secrets.set({ ...KEYCHAIN_ENTRY, value: created.toString('base64') })
		return created
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error)
		ctx
			.logger('credentials')
			.warn(`no OS keychain (${message}); new passwords are stored unencrypted`)
		return null
	}
}
