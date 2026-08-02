import { describe, expect, test } from 'bun:test'
import { stripTrackers, unwrapTrackingLink } from '../src/renderer/src/state/trackers'

describe('stripTrackers pixels', () => {
	test('removes a 1x1 remote pixel by attributes', () => {
		const html = '<p>Hi</p><img src="https://t.example.com/o.gif" width="1" height="1" alt="">'
		const result = stripTrackers(html)
		expect(result.html).toBe('<p>Hi</p>')
		expect(result.pixelsRemoved).toBe(1)
	})

	test('removes a pixel sized via inline style', () => {
		const html = '<img style="width:1px;height:1px;border:0" src="https://t.example.com/px">'
		const result = stripTrackers(html)
		expect(result.pixelsRemoved).toBe(1)
	})

	test('removes known tracker hosts regardless of size', () => {
		const html = '<img src="https://foo.list-manage.com/track/open.php?u=abc" width="100" height="50">'
		const result = stripTrackers(html)
		expect(result.pixelsRemoved).toBe(1)
	})

	test('keeps regular remote images', () => {
		const html = '<img src="https://cdn.example.com/logo.png" width="200" height="60">'
		const result = stripTrackers(html)
		expect(result.html).toBe(html)
		expect(result.pixelsRemoved).toBe(0)
	})

	test('keeps cid and data images even at 1x1', () => {
		const html = '<img src="cid:spacer" width="1" height="1"><img src="data:image/gif;base64,R0lGOD" width="1" height="1">'
		const result = stripTrackers(html)
		expect(result.html).toBe(html)
		expect(result.pixelsRemoved).toBe(0)
	})

	test('does not misread max-width or line-height as dimensions', () => {
		const html = '<img src="https://cdn.example.com/hero.png" style="max-width:1px auto; line-height:1px">'
		const result = stripTrackers(html)
		expect(result.pixelsRemoved).toBe(0)
	})

	test('keeps images without stated dimensions', () => {
		const html = '<img src="https://cdn.example.com/photo.jpg">'
		const result = stripTrackers(html)
		expect(result.pixelsRemoved).toBe(0)
	})
})

describe('unwrapTrackingLink', () => {
	test('unwraps outlook safelinks', () => {
		const wrapped =
			'https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2Fdoc%3Fa%3D1&data=05'
		expect(unwrapTrackingLink(wrapped)).toBe('https://example.com/doc?a=1')
	})

	test('unwraps google redirects', () => {
		expect(unwrapTrackingLink('https://www.google.com/url?q=https%3A%2F%2Fexample.com%2F&sa=D')).toBe(
			'https://example.com/'
		)
	})

	test('unwraps proofpoint urldefense v3', () => {
		expect(unwrapTrackingLink('https://urldefense.com/v3/__https://example.com/page__;!!abc!def$')).toBe(
			'https://example.com/page'
		)
	})

	test('unwraps generic click-tracking paths with a url param', () => {
		expect(
			unwrapTrackingLink('https://links.example.com/track/click?url=https%3A%2F%2Fshop.example.com%2F')
		).toBe('https://shop.example.com/')
	})

	test('leaves opaque wrappers alone', () => {
		expect(unwrapTrackingLink('https://foo.list-manage.com/track/click?u=abc&id=def&e=ghi')).toBeNull()
	})

	test('leaves plain links alone', () => {
		expect(unwrapTrackingLink('https://example.com/about')).toBeNull()
		expect(unwrapTrackingLink('mailto:someone@example.com')).toBeNull()
		expect(unwrapTrackingLink('not a url')).toBeNull()
	})
})

describe('stripTrackers links', () => {
	test('rewrites wrapped hrefs and keeps link text', () => {
		const html =
			'<a href="https://eur02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fexample.com%2F&amp;data=05">Open</a>'
		const result = stripTrackers(html)
		expect(result.html).toBe('<a href="https://example.com/">Open</a>')
		expect(result.linksUnwrapped).toBe(1)
	})

	test('escapes ampersands in the rewritten destination', () => {
		const html =
			'<a href="https://links.example.com/track/click?url=https%3A%2F%2Fshop.example.com%2F%3Fa%3D1%26b%3D2">Buy</a>'
		const result = stripTrackers(html)
		expect(result.html).toContain('href="https://shop.example.com/?a=1&amp;b=2"')
	})

	test('unwraps nested wrappers', () => {
		const inner = 'https://www.google.com/url?q=' + encodeURIComponent('https://example.com/final')
		const outer =
			'https://eur02.safelinks.protection.outlook.com/?url=' + encodeURIComponent(inner)
		const result = stripTrackers(`<a href="${outer.replace(/&/g, '&amp;')}">x</a>`)
		expect(result.html).toBe('<a href="https://example.com/final">x</a>')
	})

	test('leaves untracked links untouched', () => {
		const html = '<a href="https://example.com/about?x=1&amp;y=2">About</a>'
		const result = stripTrackers(html)
		expect(result.html).toBe(html)
		expect(result.linksUnwrapped).toBe(0)
	})
})
