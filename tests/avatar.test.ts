import { describe, expect, test } from 'bun:test'
import { AVATAR_SCALES, avatarInitials, avatarScale } from '../ui/lib/avatar'

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

describe('avatarScale', () => {
	test('the same address always gets the same scale, whatever its case', () => {
		expect(avatarScale('Ada@Example.com')).toBe(avatarScale('ada@example.com'))
	})

	test('addresses spread over every scale', () => {
		const seen = new Set<string>()
		for (let index = 0; index < 50; index++) {
			seen.add(avatarScale(`sender${index}@example.com`))
		}
		expect(seen.size).toBe(AVATAR_SCALES.length)
	})
})
