import { describe, expect, test } from 'bun:test'
import {
	detectNameSpoof,
	parseAuthenticationResults,
	registrableDomain
} from '../sidecar/mail/authenticity'

describe('parseAuthenticationResults', () => {
	test('parses a typical gmail header', () => {
		const header =
			'mx.google.com; dkim=pass header.i=@example.com header.s=selector; ' +
			'spf=pass (google.com: domain of bounce@example.com designates 1.2.3.4 as permitted sender) ' +
			'smtp.mailfrom=bounce@example.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=example.com'
		expect(parseAuthenticationResults([header])).toEqual({
			spf: 'pass',
			dkim: 'pass',
			dmarc: 'pass'
		})
	})

	test('parses failures and softfail', () => {
		const header = 'mx.example.net; spf=softfail smtp.mailfrom=x@y.com; dkim=fail; dmarc=fail'
		expect(parseAuthenticationResults([header])).toEqual({
			spf: 'softfail',
			dkim: 'fail',
			dmarc: 'fail'
		})
	})

	test('handles folded header values', () => {
		const header = 'mx.google.com;\r\n\tdkim=pass header.i=@example.com;\r\n\tspf=pass'
		expect(parseAuthenticationResults([header])).toEqual({
			spf: 'pass',
			dkim: 'pass',
			dmarc: null
		})
	})

	test('any passing dkim signature wins within one header', () => {
		const header = 'mx.google.com; dkim=fail header.i=@old.example.com; dkim=pass header.i=@example.com'
		const result = parseAuthenticationResults([header])
		expect(result?.dkim).toBe('pass')
	})

	test('topmost header wins over forwarder headers', () => {
		const topmost = 'mx.google.com; dmarc=fail header.from=example.com'
		const forwarder = 'lists.example.org; dmarc=pass header.from=example.com'
		const result = parseAuthenticationResults([topmost, forwarder])
		expect(result?.dmarc).toBe('fail')
	})

	test('missing methods stay null, absent header returns null', () => {
		expect(parseAuthenticationResults(['mx.example.net; spf=pass'])).toEqual({
			spf: 'pass',
			dkim: null,
			dmarc: null
		})
		expect(parseAuthenticationResults([])).toBeNull()
		expect(parseAuthenticationResults(['mx.example.net; iprev=pass'])).toBeNull()
	})

	test('unknown verdict maps to unknown', () => {
		const result = parseAuthenticationResults(['mx.example.net; spf=bogusvalue'])
		expect(result?.spf).toBe('unknown')
	})
})

describe('registrableDomain', () => {
	test('collapses subdomains', () => {
		expect(registrableDomain('mail.paypal.com')).toBe('paypal.com')
		expect(registrableDomain('paypal.com')).toBe('paypal.com')
	})

	test('keeps second-level public suffixes', () => {
		expect(registrableDomain('shop.example.co.uk')).toBe('example.co.uk')
	})
})

describe('detectNameSpoof', () => {
	test('flags a display name claiming a different domain', () => {
		expect(detectNameSpoof('service@paypal.com', 'attacker@evil.example.net')).toEqual({
			claimedDomain: 'paypal.com',
			actualDomain: 'example.net'
		})
	})

	test('ignores matching domains including subdomains', () => {
		expect(detectNameSpoof('service@paypal.com', 'service@mail.paypal.com')).toBeNull()
	})

	test('ignores names without an embedded address', () => {
		expect(detectNameSpoof('PayPal Customer Service', 'attacker@evil.example.net')).toBeNull()
	})

	test('ignores empty or malformed sender addresses', () => {
		expect(detectNameSpoof('service@paypal.com', '')).toBeNull()
		expect(detectNameSpoof('service@paypal.com', 'not-an-address')).toBeNull()
	})
})
