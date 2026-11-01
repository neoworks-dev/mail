import { describe, expect, test } from 'bun:test'
import type { Block, Inline } from '../shared/document'
import { htmlToDocument, textToDocument } from '../sidecar/mail/document'

const noImages = { remoteImages: false, resolveInlineImage: () => null }

function textOf(inlines: Inline[]): string {
	return inlines.map((inline) => (inline.kind === 'break' ? '\n' : inline.text)).join('')
}

function paragraphs(blocks: Block[]): string[] {
	return blocks.filter((block) => block.kind === 'paragraph').map((block) => textOf(block.inlines))
}

describe('htmlToDocument', () => {
	test('paragraphs, line breaks and collapsed whitespace', () => {
		const document = htmlToDocument(
			'<p>Hello   <b>World</b></p><div>Second<br>line</div>',
			noImages
		)
		expect(paragraphs(document.blocks)).toEqual(['Hello World', 'Second\nline'])
		expect(document.fromHtml).toBe(true)
	})

	test('keeps bold runs and safe links only', () => {
		const document = htmlToDocument(
			'<p><a href="https://example.com/a">site</a> and <a href="javascript:alert(1)">bad</a> <strong>x</strong></p>',
			noImages
		)
		const [paragraph] = document.blocks
		if (paragraph.kind !== 'paragraph') throw new Error('expected a paragraph')
		const runs = paragraph.inlines.filter((inline) => inline.kind === 'text')
		expect(runs.find((run) => run.text === 'site')?.href).toBe('https://example.com/a')
		expect(runs.some((run) => run.href?.startsWith('javascript'))).toBe(false)
		expect(runs.find((run) => run.text === 'x')?.bold).toBe(true)
	})

	test('drops scripts, styles and hidden preheaders', () => {
		const html =
			'<style>p{color:red}</style><script>evil()</script>' +
			'<div style="display:none">preheader</div><span style="max-height:0;overflow:hidden">hidden</span><p>shown</p>'
		expect(paragraphs(htmlToDocument(html, noImages).blocks)).toEqual(['shown'])
	})

	test('headings, quotes and lists', () => {
		const document = htmlToDocument(
			'<h2>Title</h2><blockquote><p>quoted</p></blockquote><ol start="3"><li>one</li><li>two</li></ol>',
			noImages
		)
		expect(document.blocks.map((block) => block.kind)).toEqual(['heading', 'quote', 'list'])
		const list = document.blocks[2]
		if (list.kind !== 'list') throw new Error('expected a list')
		expect(list.ordered).toBe(true)
		expect(list.start).toBe(3)
		expect(list.items).toHaveLength(2)
	})

	test('layout tables flatten and multi-cell rows stay side by side', () => {
		const html =
			'<table><tr><td></td><td><p>only cell</p></td></tr>' +
			'<tr><td><p>left</p></td><td><p>right</p></td></tr></table>'
		const document = htmlToDocument(html, noImages)
		expect(document.blocks[0].kind).toBe('paragraph')
		expect(document.blocks[1].kind).toBe('row')
	})

	test('remote images stay blocked until allowed, and are counted', () => {
		const html = '<img src="http://cdn.example.com/a.png" alt="Logo" width="120" height="40">'
		const blocked = htmlToDocument(html, noImages)
		expect(blocked.remoteImages).toBe(1)
		expect(blocked.blocks[0]).toMatchObject({
			kind: 'image',
			src: null,
			remote: true,
			alt: 'Logo',
			width: 120
		})

		const allowed = htmlToDocument(html, { ...noImages, remoteImages: true })
		expect(allowed.blocks[0]).toMatchObject({
			kind: 'image',
			src: 'https://cdn.example.com/a.png'
		})
	})

	test('tracking pixels and spacers are removed, inline parts resolved', () => {
		const html =
			'<img src="https://list-manage.com/track/open.php?u=1">' +
			'<img src="cid:spacer" width="1" height="1">' +
			'<img src="cid:<logo@x>">'
		const document = htmlToDocument(html, {
			remoteImages: false,
			resolveInlineImage: (contentId) =>
				contentId === 'logo@x' ? 'data:image/png;base64,AAAA' : null
		})
		expect(document.trackersRemoved).toBe(1)
		expect(document.blocks).toHaveLength(1)
		expect(document.blocks[0]).toMatchObject({
			kind: 'image',
			src: 'data:image/png;base64,AAAA',
			remote: false
		})
	})
})

describe('textToDocument', () => {
	test('paragraphs on blank lines, quotes and links', () => {
		const document = textToDocument(
			'Hi there\nsee https://example.com/x.\n\n> quoted\n> more\n\nBye'
		)
		expect(document.blocks.map((block) => block.kind)).toEqual(['paragraph', 'quote', 'paragraph'])
		const [first] = document.blocks
		if (first.kind !== 'paragraph') throw new Error('expected a paragraph')
		const link = first.inlines.find((inline) => inline.kind === 'text' && inline.href)
		expect(link).toMatchObject({ text: 'https://example.com/x', href: 'https://example.com/x' })
		expect(document.fromHtml).toBe(false)
	})
})
