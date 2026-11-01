import { describe, expect, test } from 'bun:test'
import { createCipheriv, pbkdf2Sync, randomBytes } from 'node:crypto'
import { createCredentialCipher, decryptSafeStorage } from '../sidecar/mail/credentials'

/** What Electron's safeStorage writes on Linux: `v10` or `v11`, then AES-128-CBC. */
function chromiumEncrypt(version: 'v10' | 'v11', password: string, plaintext: string): Buffer {
	const key = pbkdf2Sync(password, 'saltysalt', 1, 16, 'sha1')
	const cipher = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
	return Buffer.concat([Buffer.from(version), cipher.update(plaintext, 'utf8'), cipher.final()])
}

describe('credential cipher', () => {
	test('round-trips through the keychain format', () => {
		const cipher = createCredentialCipher(randomBytes(32), () => null)
		const stored = cipher.encrypt('hunter2')
		expect(stored[0]).toBe(0x02)
		expect(stored.includes(Buffer.from('hunter2'))).toBe(false)
		expect(cipher.decrypt(stored)).toBe('hunter2')
	})

	test('stores plaintext without a keychain and still reads it', () => {
		const cipher = createCredentialCipher(null, () => null)
		const stored = cipher.encrypt('secret')
		expect(stored[0]).toBe(0x00)
		expect(cipher.decrypt(stored)).toBe('secret')
		expect(cipher.encrypting).toBe(false)
	})

	test('reads rows the Electron build wrote with safeStorage', () => {
		const legacy = Buffer.concat([
			Buffer.from([0x01]),
			chromiumEncrypt('v11', 'keyring-password', 'old pass')
		])
		const cipher = createCredentialCipher(randomBytes(32), () => 'keyring-password')
		expect(cipher.decrypt(legacy)).toBe('old pass')
	})

	test('v10 rows need no keyring', () => {
		expect(decryptSafeStorage(chromiumEncrypt('v10', 'peanuts', 'abc'), () => null)).toBe('abc')
	})

	test('a v11 row without a keyring explains itself', () => {
		expect(() => decryptSafeStorage(chromiumEncrypt('v11', 'x', 'abc'), () => null)).toThrow(
			/keyring/
		)
	})
})
