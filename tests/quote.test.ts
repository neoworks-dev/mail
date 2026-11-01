import { describe, expect, test } from 'bun:test'
import { extractQuote } from '../ui/lib/quote'

describe('extractQuote', () => {
	test('returns the quote block from a fresh reply', () => {
		const markdown = '\n\nOn 8/1/2026, Jane <jane@example.com> wrote:\n\n> Hello\n> World\n'
		expect(extractQuote(markdown)).toBe('On 8/1/2026, Jane <jane@example.com> wrote:\n\n> Hello\n> World\n')
	})

	test('keeps user text above the quote out of the block', () => {
		const markdown = 'My own text.\n\nOn 8/1/2026, Jane wrote:\n\n> Hi'
		expect(extractQuote(markdown)).toBe('On 8/1/2026, Jane wrote:\n\n> Hi')
		expect(markdown.replace(extractQuote(markdown), '').trim()).toBe('My own text.')
	})

	test('returns empty string when there is no quote', () => {
		expect(extractQuote('Just some text about One thing')).toBe('')
		expect(extractQuote('')).toBe('')
	})

	test('ignores wrote: mentions that are not a quote header line', () => {
		expect(extractQuote('She wrote: nothing important')).toBe('')
	})
})
