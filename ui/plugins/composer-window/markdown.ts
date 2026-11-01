// The composer's markdown as document blocks, for its preview. `marked`'s lexer does the parsing;
// this maps its tokens onto shared/document blocks so DocumentView draws the preview the way it
// draws a received message.

import { Lexer, type Token, type Tokens } from 'marked'
import type { Block, Inline, TextRun } from '../../../shared/document'

type RunStyle = Pick<TextRun, 'bold' | 'italic' | 'strike' | 'code' | 'href'>

export function markdownToBlocks(markdown: string): Block[] {
	const tokens = Lexer.lex(markdown, { gfm: true, breaks: true })
	return blocksOf(tokens)
}

function blocksOf(tokens: Token[]): Block[] {
	const blocks: Block[] = []
	for (const token of tokens) {
		const block = blockOf(token)
		if (block) blocks.push(block)
	}
	return blocks
}

function blockOf(token: Token): Block | null {
	switch (token.type) {
		case 'paragraph':
			return { kind: 'paragraph', inlines: inlinesOf((token as Tokens.Paragraph).tokens, {}) }
		case 'text':
			return { kind: 'paragraph', inlines: inlinesOf(childTokens(token), {}) }
		case 'heading':
			return {
				kind: 'heading',
				level: headingLevel((token as Tokens.Heading).depth),
				inlines: inlinesOf((token as Tokens.Heading).tokens, {})
			}
		case 'blockquote':
			return { kind: 'quote', blocks: blocksOf((token as Tokens.Blockquote).tokens) }
		case 'list':
			return listOf(token as Tokens.List)
		case 'code':
			return { kind: 'preformatted', text: (token as Tokens.Code).text }
		case 'hr':
			return { kind: 'rule' }
		case 'table':
			return { kind: 'preformatted', text: tableText(token as Tokens.Table) }
		case 'html':
			return { kind: 'paragraph', inlines: [{ kind: 'text', text: (token as Tokens.HTML).text }] }
		default:
			return null
	}
}

function listOf(token: Tokens.List): Block {
	let start = 1
	if (typeof token.start === 'number') start = token.start
	const items = token.items.map((item) => {
		const blocks = blocksOf(item.tokens)
		if (!item.task) return blocks
		let mark = '☐ '
		if (item.checked) mark = '☑ '
		const first = blocks[0]
		if (first && first.kind === 'paragraph') first.inlines.unshift({ kind: 'text', text: mark })
		return blocks
	})
	return { kind: 'list', ordered: token.ordered, start, items }
}

/** Text tokens in a list item carry their own inline tokens, or just text. */
function childTokens(token: Token): Token[] {
	const nested = (token as { tokens?: Token[] }).tokens
	if (nested && nested.length > 0) return nested
	return [{ type: 'text', raw: token.raw, text: (token as Tokens.Text).text } as Tokens.Text]
}

function inlinesOf(tokens: Token[] | undefined, style: RunStyle): Inline[] {
	const inlines: Inline[] = []
	for (const token of tokens ?? []) inlines.push(...inlineOf(token, style))
	return inlines
}

function inlineOf(token: Token, style: RunStyle): Inline[] {
	switch (token.type) {
		case 'strong':
			return inlinesOf((token as Tokens.Strong).tokens, { ...style, bold: true })
		case 'em':
			return inlinesOf((token as Tokens.Em).tokens, { ...style, italic: true })
		case 'del':
			return inlinesOf((token as Tokens.Del).tokens, { ...style, strike: true })
		case 'codespan':
			return [run(unescape((token as Tokens.Codespan).text), { ...style, code: true })]
		case 'link':
			return inlinesOf((token as Tokens.Link).tokens, {
				...style,
				href: safeHref((token as Tokens.Link).href)
			})
		case 'br':
			return [{ kind: 'break' }]
		case 'image':
			return [run(`[image: ${(token as Tokens.Image).text}]`, style)]
		case 'text': {
			const nested = (token as Tokens.Text).tokens
			if (nested && nested.length > 0) return inlinesOf(nested, style)
			return textWithBreaks(unescape((token as Tokens.Text).text), style)
		}
		default:
			return textWithBreaks(unescape((token as { text?: string }).text ?? token.raw), style)
	}
}

/** Soft line breaks inside a text token become breaks, as `breaks: true` renders them. */
function textWithBreaks(text: string, style: RunStyle): Inline[] {
	const inlines: Inline[] = []
	text.split('\n').forEach((line, index) => {
		if (index > 0) inlines.push({ kind: 'break' })
		if (line !== '') inlines.push(run(line, style))
	})
	return inlines
}

function run(text: string, style: RunStyle): TextRun {
	const textRun: TextRun = { kind: 'text', text }
	if (style.bold) textRun.bold = true
	if (style.italic) textRun.italic = true
	if (style.strike) textRun.strike = true
	if (style.code) textRun.code = true
	if (style.href) textRun.href = style.href
	return textRun
}

function safeHref(href: string): string | undefined {
	if (/^(https?:|mailto:)/i.test(href)) return href
	return undefined
}

function headingLevel(depth: number): 1 | 2 | 3 | 4 | 5 | 6 {
	return Math.min(6, Math.max(1, depth)) as 1 | 2 | 3 | 4 | 5 | 6
}

/** marked keeps entities in token text; the preview shows the characters. */
function unescape(text: string): string {
	return text
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&')
}

function tableText(token: Tokens.Table): string {
	const cellText = (cell: Tokens.TableCell): string => unescape(cell.text)
	const lines = [token.header.map(cellText).join(' │ ')]
	for (const row of token.rows) lines.push(row.map(cellText).join(' │ '))
	return lines.join('\n')
}
