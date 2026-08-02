import { safeStorage } from 'electron'

// safeStorage is OS-keychain backed. On Linux without a reachable secret
// service (gnome-keyring / kwallet over org.freedesktop.secrets) there is no
// backend at all, so the prototype falls back to storing the password
// unencrypted. A prefix byte records which path wrote the value, so rows stay
// readable if a keychain appears later.
const FORMAT_PLAINTEXT = 0x00
const FORMAT_SAFE_STORAGE = 0x01

export function encryptionAvailable(): boolean {
	return safeStorage.isEncryptionAvailable()
}

export function encryptPassword(plaintext: string): Buffer {
	if (safeStorage.isEncryptionAvailable()) {
		return Buffer.concat([Buffer.from([FORMAT_SAFE_STORAGE]), safeStorage.encryptString(plaintext)])
	}
	console.warn('[mail] no OS keychain available — storing IMAP password unencrypted')
	return Buffer.concat([Buffer.from([FORMAT_PLAINTEXT]), Buffer.from(plaintext, 'utf8')])
}

export function decryptPassword(stored: Buffer): string {
	const format = stored[0]
	const payload = stored.subarray(1)
	if (format === FORMAT_SAFE_STORAGE) {
		return safeStorage.decryptString(payload)
	}
	return payload.toString('utf8')
}
