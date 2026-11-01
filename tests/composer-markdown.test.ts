import { describe, expect, test } from 'bun:test'
import { markdownToBlocks } from '../ui/plugins/composer-window/markdown'

describe('markdownToBlocks', () => {
	test('paragraph with emphasis, code and a link', () => {
		const blocks = markdownToBlocks('Hello **bold** and *it* `x<y` [site](https://example.com)')
		expect(blocks).toEqual([
			{
				kind: 'paragraph',
				inlines: [
					{ kind: 'text', text: 'Hello ' },
					{ kind: 'text', text: 'bold', bold: true },
					{ kind: 'text', text: ' and ' },
					{ kind: 'text', text: 'it', italic: true },
					{ kind: 'text', text: ' ' },
					{ kind: 'text', text: 'x<y', code: true },
					{ kind: 'text', text: ' ' },
					{ kind: 'text', text: 'site', href: 'https://example.com' }
				]
			}
		])
	})

	test('soft line breaks become breaks', () => {
		const [block] = markdownToBlocks('one\ntwo')
		expect(block).toEqual({
			kind: 'paragraph',
			inlines: [{ kind: 'text', text: 'one' }, { kind: 'break' }, { kind: 'text', text: 'two' }]
		})
	})

	test('quoted reply becomes a quote block', () => {
		const blocks = markdownToBlocks('Thanks!\n\n> original line\n> second')
		expect(blocks[0].kind).toBe('paragraph')
		expect(blocks[1].kind).toBe('quote')
	})

	test('lists, headings, code and rules', () => {
		const blocks = markdownToBlocks('# Title\n\n3. a\n4. b\n\n```\ncode\n```\n\n---')
		expect(blocks.map((block) => block.kind)).toEqual(['heading', 'list', 'preformatted', 'rule'])
		const list = blocks[1]
		if (list.kind !== 'list') throw new Error('expected a list')
		expect(list.ordered).toBe(true)
		expect(list.start).toBe(3)
		expect(list.items).toHaveLength(2)
	})

	test('unsafe link targets are dropped', () => {
		const [block] = markdownToBlocks('[x](javascript:alert(1))')
		if (block.kind !== 'paragraph') throw new Error('expected a paragraph')
		expect(block.inlines[0]).toEqual({ kind: 'text', text: 'x' })
	})
})
