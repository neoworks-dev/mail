import { describe, expect, test } from 'bun:test'
import { logoCandidates, logoDomain } from '../ui/lib/senderLogo'

describe('logoDomain', () => {
	test('reduces a sending subdomain to the organization domain', () => {
		expect(logoDomain('newsletter@mail.netcup.com')).toBe('netcup.com')
	})

	test('keeps the registry level of country domains like co.uk', () => {
		expect(logoDomain('hello@news.example.co.uk')).toBe('example.co.uk')
	})

	test('gives no logo for mail providers or broken addresses', () => {
		expect(logoDomain('moritz.utcke@gmx.de')).toBeNull()
		expect(logoDomain('someone@googlemail.com')).toBeNull()
		expect(logoDomain('no-domain')).toBeNull()
		expect(logoDomain('local@localhost')).toBeNull()
	})

	test('tries the touch icon before the favicon', () => {
		expect(logoCandidates('netcup.com')).toEqual([
			'https://netcup.com/apple-touch-icon.png',
			'https://netcup.com/favicon.ico'
		])
	})
})
