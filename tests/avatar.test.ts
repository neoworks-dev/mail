import { describe, expect, test } from 'bun:test'
import { avatarInitials } from '../ui/lib/avatar'

describe('avatarInitials', () => {
	test('two words give the first letters of the first two', () => {
		expect(avatarInitials('Ada Lovelace', 'ada@example.com')).toBe('AL')
		expect(avatarInitials('DAV Hamburg und Niederelbe', 'info@dav.de')).toBe('DH')
	})

	test('one word gives one letter', () => {
		expect(avatarInitials('FlixBus', 'noreply@flixbus.de')).toBe('F')
	})

	test('without a name the address gives the letter', () => {
		expect(avatarInitials('', 'terminservice@lbv-termine.de')).toBe('T')
	})

	test('an address with dots or dashes gives two letters', () => {
		expect(avatarInitials('', 'moritz.utcke@gmx.de')).toBe('MU')
		expect(avatarInitials('', 'no-reply@unity3d.com')).toBe('NR')
	})

	test('quotes and brackets around a name are skipped', () => {
		expect(avatarInitials('"Mario" (Juskys)', 'mario@juskys.de')).toBe('MJ')
	})

	test('letters outside ASCII are kept whole', () => {
		expect(avatarInitials('Ölfabrik Ärzte', 'x@example.com')).toBe('ÖÄ')
	})

	test('nothing at all gives a question mark', () => {
		expect(avatarInitials('', '')).toBe('?')
	})
})
