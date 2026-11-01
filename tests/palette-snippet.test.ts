import { describe, expect, test } from 'bun:test'
import { snippetParts } from '../ui/plugins/palette/snippet'

describe('snippetParts', () => {
	test('marks hits and keeps the text between them', () => {
		expect(snippetParts('see [netcup] and [CCP] …')).toEqual([
			{ text: 'see ', hit: false },
			{ text: 'netcup', hit: true },
			{ text: ' and ', hit: false },
			{ text: 'CCP', hit: true },
			{ text: ' …', hit: false }
		])
	})

	test('a snippet without hits is one part', () => {
		expect(snippetParts('plain')).toEqual([{ text: 'plain', hit: false }])
	})
})
