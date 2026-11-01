// Encryption of stored passwords and OAuth secrets. A prefix byte records which path wrote a
// value, so rows written by any earlier version stay readable:
//
// - 0x00: plaintext, written when no OS keychain was reachable.
// - 0x01: Electron's safeStorage, written by the Electron build. Read-only now: decrypted with
//   Chromium's Linux scheme (AES-128-CBC under a key derived from the keyring password).
// - 0x02: AES-256-GCM under a random key kept in the OS keychain (`Bun.secrets`).

import { createCipheriv, createDecipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const FORMAT_PLAINTEXT = 0x00
const FORMAT_SAFE_STORAGE = 0x01
const FORMAT_KEYCHAIN_GCM = 0x02

const GCM_IV_LENGTH = 12
const GCM_TAG_LENGTH = 16

export interface CredentialCipher {
	/** Whether new secrets are encrypted, rather than stored as plaintext. */
	readonly encrypting: boolean
	encrypt(plaintext: string): Buffer
	decrypt(stored: Buffer): string
}

/**
 * A cipher over `key`, a 32-byte AES key, or a plaintext-only one when `key` is null.
 * `legacyKeyringPassword` reads the Electron build's keyring password, when it ever wrote one.
 */
export function createCredentialCipher(
	key: Buffer | null,
	legacyKeyringPassword: () => string | null = readElectronKeyringPassword
): CredentialCipher {
	return {
		encrypting: key !== null,
		encrypt(plaintext) {
			if (key === null) {
				return Buffer.concat([Buffer.from([FORMAT_PLAINTEXT]), Buffer.from(plaintext, 'utf8')])
			}
			return Buffer.concat([Buffer.from([FORMAT_KEYCHAIN_GCM]), encryptGcm(key, plaintext)])
		},
		decrypt(stored) {
			const format = stored[0]
			const payload = stored.subarray(1)
			if (format === FORMAT_KEYCHAIN_GCM) {
				if (key === null) throw new Error('this secret needs the OS keychain, which is not reachable')
				return decryptGcm(key, payload)
			}
			if (format === FORMAT_SAFE_STORAGE) {
				return decryptSafeStorage(payload, legacyKeyringPassword)
			}
			return payload.toString('utf8')
		}
	}
}

function encryptGcm(key: Buffer, plaintext: string): Buffer {
	const iv = randomBytes(GCM_IV_LENGTH)
	const cipher = createCipheriv('aes-256-gcm', key, iv)
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
	return Buffer.concat([iv, cipher.getAuthTag(), encrypted])
}

function decryptGcm(key: Buffer, payload: Buffer): string {
	const iv = payload.subarray(0, GCM_IV_LENGTH)
	const tag = payload.subarray(GCM_IV_LENGTH, GCM_IV_LENGTH + GCM_TAG_LENGTH)
	const encrypted = payload.subarray(GCM_IV_LENGTH + GCM_TAG_LENGTH)
	const decipher = createDecipheriv('aes-256-gcm', key, iv)
	decipher.setAuthTag(tag)
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** Chromium's `v10`/`v11` OSCrypt format on Linux, which Electron's safeStorage writes. */
export function decryptSafeStorage(payload: Buffer, keyringPassword: () => string | null): string {
	const version = payload.subarray(0, 3).toString('latin1')
	const encrypted = payload.subarray(3)
	let password = 'peanuts'
	if (version === 'v11') {
		const fromKeyring = keyringPassword()
		if (fromKeyring === null) {
			throw new Error('this password was stored in the keyring by the Electron build, which is not reachable')
		}
		password = fromKeyring
	} else if (version !== 'v10') {
		throw new Error(`unknown safeStorage format "${version}"`)
	}
	const key = pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1')
	const decipher = createDecipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
	return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
}

/** The password Chromium's libsecret backend stored for the Electron build, if any. */
function readElectronKeyringPassword(): string | null {
	const result = spawnSync('secret-tool', ['lookup', 'application', 'neoworks-mail'], {
		encoding: 'utf8',
		timeout: 5000
	})
	if (result.status !== 0) return null
	const password = result.stdout.trim()
	if (password === '') return null
	return password
}
