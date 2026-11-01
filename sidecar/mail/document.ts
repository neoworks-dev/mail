// Reduces a message body to the blocks the native reading pane draws (shared/document.ts).
// HTML mail is parsed, trackers are stripped first, and what the window cannot draw (scripts,
// styles, forms, hidden preheaders) is dropped. Layout tables flatten: a row keeps its cells
// side by side only when more than one of them has content. Plain text becomes paragraphs,
// with `>` quoting turned into quote blocks and bare URLs into links.

import { parseDocument } from 'htmlparser2'
import type { ChildNode, Element } from 'domhandler'
import type { Block, Inline, MailDocument, TextAlign, TextRun } from '../../shared/document'
import { stripTrackers } from './trackers'

/** Turns a `cid:` reference into a `data:` URL, or null when the part is missing or too large. */
export type InlineImageResolver = (contentId: string) => string | null

export interface HtmlConversionOptions {
	remoteImages: boolean
	resolveInlineImage: InlineImageResolver
}

interface RunStyle {
	bold: boolean
	italic: boolean
	underline: boolean
	strike: boolean
	code: boolean
	href: string | null
	align: TextAlign | undefined
}

const PLAIN_STYLE: RunStyle = {
	bold: false,
	italic: false,
	underline: false,
	strike: false,
	code: false,
	href: null,
	align: undefined
}

const SKIPPED_TAGS = new Set([
	'head',
	'style',
	'script',
	'title',
	'meta',
	'link',
	'noscript',
	'template',
	'iframe',
	'object',
	'embed',
	'svg',
	'math',
	'input',
	'select',
	'textarea',
	'option',
	'video',
	'audio',
	'map',
	'area'
])

const CONTAINER_TAGS = new Set([
	'html',
	'body',
	'p',
	'div',
	'section',
	'article',
	'header',
	'footer',
	'main',
	'aside',
	'nav',
	'center',
	'figure',
	'figcaption',
	'address',
	'dl',
	'dt',
	'dd',
	'form',
	'fieldset',
	'details',
	'summary',
	'caption'
])

const HEADING_LEVELS: Record<string, 1 | 2 | 3 | 4 | 5 | 6> = {
	h1: 1,
	h2: 2,
	h3: 3,
	h4: 4,
	h5: 5,
	h6: 6
}

const MAX_DEPTH = 160
/** Spacer images in layout tables. */
const SPACER_SIZE = 2

export function htmlToDocument(html: string, options: HtmlConversionOptions): MailDocument {
	const stripped = stripTrackers(html)
	const root = parseDocument(stripped.html, { decodeEntities: true })
	const builder = new BlockBuilder(options)
	builder.walkChildren(root.children, PLAIN_STYLE, 0)
	return {
		blocks: builder.finish(),
		remoteImages: builder.remoteImages,
		trackersRemoved: stripped.pixelsRemoved,
		linksUnwrapped: stripped.linksUnwrapped,
		fromHtml: true
	}
}

class BlockBuilder {
	remoteImages = 0
	private blocks: Block[] = []
	private inlines: Inline[] = []
	private paragraphAlign: TextAlign | undefined = undefined

	constructor(private options: HtmlConversionOptions) {}

	finish(): Block[] {
		this.flushParagraph()
		return this.blocks
	}

	walkChildren(children: ChildNode[], style: RunStyle, depth: number): void {
		if (depth > MAX_DEPTH) return
		for (const child of children) this.walk(child, style, depth + 1)
	}

	private walk(node: ChildNode, style: RunStyle, depth: number): void {
		if (node.type === 'text') {
			this.addText(node.data, style)
			return
		}
		if (node.type !== 'tag' && node.type !== 'script' && node.type !== 'style') return
		const element = node as Element
		const name = element.name.toLowerCase()
		if (SKIPPED_TAGS.has(name) || isHidden(element)) return
		this.walkElement(element, name, styleFor(element, name, style), depth)
	}

	private walkElement(element: Element, name: string, style: RunStyle, depth: number): void {
		if (name === 'br') {
			this.inlines.push({ kind: 'break' })
			return
		}
		if (name === 'img') {
			this.addImage(element, style)
			return
		}
		if (name === 'hr') {
			this.pushBlock({ kind: 'rule' })
			return
		}
		const heading = HEADING_LEVELS[name]
		if (heading !== undefined) {
			this.addHeading(element, heading, style, depth)
			return
		}
		if (this.walkStructural(element, name, style, depth)) return
		if (CONTAINER_TAGS.has(name)) {
			this.flushParagraph()
			this.walkChildren(element.children, style, depth)
			this.flushParagraph()
			return
		}
		this.walkChildren(element.children, style, depth)
	}

	/** Quotes, lists, preformatted text and tables; false for anything else. */
	private walkStructural(element: Element, name: string, style: RunStyle, depth: number): boolean {
		if (name === 'blockquote') {
			this.pushBlock({ kind: 'quote', blocks: this.nested(element.children, style, depth) })
			return true
		}
		if (name === 'ul' || name === 'ol') {
			this.addList(element, name === 'ol', style, depth)
			return true
		}
		if (name === 'pre') {
			this.pushBlock({ kind: 'preformatted', text: textContent(element).replace(/\n+$/, '') })
			return true
		}
		if (name === 'table') {
			this.addTable(element, style, depth)
			return true
		}
		return false
	}

	private addText(raw: string, style: RunStyle): void {
		let text = raw.replace(/[\s ]+/g, ' ')
		if (this.atLineStart()) text = text.replace(/^ /, '')
		if (text === '') return
		if (this.inlines.length === 0) this.paragraphAlign = style.align
		const previous = this.inlines[this.inlines.length - 1]
		if (previous && previous.kind === 'text' && sameStyle(previous, style)) {
			previous.text += text
			return
		}
		this.inlines.push(runFor(text, style))
	}

	private atLineStart(): boolean {
		const previous = this.inlines[this.inlines.length - 1]
		if (!previous) return true
		if (previous.kind === 'break') return true
		return previous.text.endsWith(' ')
	}

	private addHeading(
		element: Element,
		level: 1 | 2 | 3 | 4 | 5 | 6,
		style: RunStyle,
		depth: number
	): void {
		this.flushParagraph()
		this.walkChildren(element.children, { ...style, bold: true }, depth)
		const inlines = trimInlines(this.inlines)
		this.inlines = []
		if (inlines.length === 0) return
		this.blocks.push({ kind: 'heading', level, inlines, align: style.align })
	}

	private addList(element: Element, ordered: boolean, style: RunStyle, depth: number): void {
		const items: Block[][] = []
		for (const child of element.children) {
			if (child.type !== 'tag' || (child as Element).name.toLowerCase() !== 'li') continue
			const item = this.nested((child as Element).children, style, depth)
			if (item.length > 0) items.push(item)
		}
		if (items.length === 0) return
		this.pushBlock({ kind: 'list', ordered, start: listStart(element), items })
	}

	private addTable(element: Element, style: RunStyle, depth: number): void {
		this.flushParagraph()
		for (const row of tableRows(element)) {
			const cells = row
				.map((cell) => this.nested(cell.children, styleFor(cell, cell.name, style), depth))
				.filter((blocks) => blocks.length > 0)
			if (cells.length === 0) continue
			if (cells.length === 1) {
				this.blocks.push(...cells[0])
				continue
			}
			this.blocks.push({ kind: 'row', cells })
		}
	}

	private addImage(element: Element, style: RunStyle): void {
		const width = dimension(element, 'width')
		const height = dimension(element, 'height')
		if (width !== null && height !== null && width <= SPACER_SIZE && height <= SPACER_SIZE) return
		const source = (element.attribs.src ?? '').trim()
		const resolved = this.resolveImage(source)
		if (resolved === undefined) return
		this.flushParagraph()
		this.blocks.push({
			kind: 'image',
			src: resolved.src,
			remote: resolved.remote,
			alt: (element.attribs.alt ?? '').trim(),
			width,
			height,
			href: style.href ?? undefined,
			align: style.align
		})
	}

	/** Where an image's pixels come from; undefined drops an image that can never be drawn. */
	private resolveImage(source: string): { src: string | null; remote: boolean } | undefined {
		if (/^cid:/i.test(source)) {
			return {
				src: this.options.resolveInlineImage(source.slice(4).replace(/^<|>$/g, '')),
				remote: false
			}
		}
		if (/^data:image\//i.test(source)) return { src: source, remote: false }
		if (/^https?:\/\//i.test(source)) {
			this.remoteImages += 1
			if (this.options.remoteImages)
				return { src: source.replace(/^http:/i, 'https:'), remote: true }
			return { src: null, remote: true }
		}
		return undefined
	}

	/** The blocks of a subtree, built apart from this builder's open paragraph. */
	private nested(children: ChildNode[], style: RunStyle, depth: number): Block[] {
		const builder = new BlockBuilder(this.options)
		builder.walkChildren(children, style, depth)
		this.remoteImages += builder.remoteImages
		return builder.finish()
	}

	private pushBlock(block: Block): void {
		this.flushParagraph()
		this.blocks.push(block)
	}

	private flushParagraph(): void {
		const inlines = trimInlines(this.inlines)
		this.inlines = []
		if (inlines.length === 0) return
		this.blocks.push({ kind: 'paragraph', inlines, align: this.paragraphAlign })
	}
}

function listStart(element: Element): number {
	const start = Number.parseInt(element.attribs.start ?? '1', 10)
	if (Number.isFinite(start)) return start
	return 1
}

function styleFor(element: Element, name: string, inherited: RunStyle): RunStyle {
	const style = { ...inherited }
	const css = (element.attribs.style ?? '').toLowerCase()
	if (name === 'b' || name === 'strong' || /font-weight\s*:\s*(bold|[6-9]00)/.test(css))
		style.bold = true
	if (name === 'i' || name === 'em' || /font-style\s*:\s*italic/.test(css)) style.italic = true
	if (name === 'u' || name === 'ins') style.underline = true
	if (name === 's' || name === 'strike' || name === 'del') style.strike = true
	if (name === 'code' || name === 'kbd' || name === 'tt' || name === 'samp') style.code = true
	if (name === 'a') style.href = safeHref(element.attribs.href)
	const align = alignmentOf(element, name, css)
	if (align !== undefined) style.align = align
	return style
}

function alignmentOf(element: Element, name: string, css: string): TextAlign | undefined {
	if (name === 'center') return 'center'
	const declared = (element.attribs.align ?? '').toLowerCase()
	const fromCss = css.match(/text-align\s*:\s*(left|right|center|start|end)/)
	let value = declared
	if (fromCss) value = fromCss[1]
	if (value === 'center') return 'center'
	if (value === 'right' || value === 'end') return 'end'
	if (value === 'left' || value === 'start') return 'start'
	return undefined
}

function safeHref(href: string | undefined): string | null {
	if (!href) return null
	const trimmed = href.trim()
	if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed
	return null
}

function isHidden(element: Element): boolean {
	if (element.attribs.hidden !== undefined) return true
	const css = (element.attribs.style ?? '').toLowerCase().replace(/\s+/g, '')
	if (
		css.includes('display:none') ||
		css.includes('visibility:hidden') ||
		css.includes('mso-hide:all')
	)
		return true
	// Preheaders hide this way, to show in the inbox list but not in the body.
	return /max-height:0(px)?[;!]/.test(`${css};`) && css.includes('overflow:hidden')
}

function dimension(element: Element, name: 'width' | 'height'): number | null {
	const attribute = element.attribs[name]
	if (attribute && /^\d+$/.test(attribute.trim())) return Number(attribute.trim())
	const css = element.attribs.style ?? ''
	const match = css.match(new RegExp(`(?:^|[^-\\w])${name}\\s*:\\s*(\\d+(?:\\.\\d+)?)px`, 'i'))
	if (match) return Math.round(Number(match[1]))
	return null
}

/** The cells of each row, through thead, tbody and tfoot; a nested table stays inside its cell. */
function tableRows(table: Element): Element[][] {
	const rows: Element[][] = []
	const visit = (parent: Element): void => {
		for (const child of parent.children) {
			if (child.type !== 'tag') continue
			const element = child as Element
			const name = element.name.toLowerCase()
			if (name === 'tr') rows.push(cellsOf(element))
			if (name === 'thead' || name === 'tbody' || name === 'tfoot') visit(element)
		}
	}
	visit(table)
	return rows
}

function cellsOf(row: Element): Element[] {
	return row.children.filter((child): child is Element => {
		if (child.type !== 'tag') return false
		const name = (child as Element).name.toLowerCase()
		return name === 'td' || name === 'th'
	})
}

function textContent(node: ChildNode): string {
	if (node.type === 'text') return node.data
	if (node.type !== 'tag') return ''
	const element = node as Element
	if (element.name.toLowerCase() === 'br') return '\n'
	return element.children.map(textContent).join('')
}

function runFor(text: string, style: RunStyle): TextRun {
	const run: TextRun = { kind: 'text', text }
	if (style.bold) run.bold = true
	if (style.italic) run.italic = true
	if (style.underline) run.underline = true
	if (style.strike) run.strike = true
	if (style.code) run.code = true
	if (style.href !== null) run.href = style.href
	return run
}

function sameStyle(run: TextRun, style: RunStyle): boolean {
	const other = runFor('', style)
	return (
		Boolean(run.bold) === Boolean(other.bold) &&
		Boolean(run.italic) === Boolean(other.italic) &&
		Boolean(run.underline) === Boolean(other.underline) &&
		Boolean(run.strike) === Boolean(other.strike) &&
		Boolean(run.code) === Boolean(other.code) &&
		run.href === other.href
	)
}

/** Drops breaks and spaces at either end of a paragraph, and a paragraph of only those. */
function trimInlines(inlines: Inline[]): Inline[] {
	const trimmed = [...inlines]
	while (trimmed.length > 0 && isBlankInline(trimmed[0])) trimmed.shift()
	while (trimmed.length > 0 && isBlankInline(trimmed[trimmed.length - 1])) trimmed.pop()
	if (trimmed.length === 0) return []
	const last = trimmed[trimmed.length - 1]
	if (last.kind === 'text')
		trimmed[trimmed.length - 1] = { ...last, text: last.text.replace(/ +$/, '') }
	return trimmed
}

function isBlankInline(inline: Inline): boolean {
	if (inline.kind === 'break') return true
	return inline.text.trim() === ''
}

const URL_PATTERN = /\b(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g

export function textToDocument(text: string): MailDocument {
	return {
		blocks: textBlocks(text.replace(/\r\n?/g, '\n').split('\n')),
		remoteImages: 0,
		trackersRemoved: 0,
		linksUnwrapped: 0,
		fromHtml: false
	}
}

/** Paragraphs split on blank lines, with each run of `>` lines as a nested quote. */
function textBlocks(lines: string[]): Block[] {
	const blocks: Block[] = []
	let paragraph: string[] = []
	let quoted: string[] = []

	const flushParagraph = (): void => {
		if (paragraph.length > 0) blocks.push({ kind: 'paragraph', inlines: linkedLines(paragraph) })
		paragraph = []
	}
	const flushQuote = (): void => {
		if (quoted.length > 0) blocks.push({ kind: 'quote', blocks: textBlocks(quoted) })
		quoted = []
	}

	for (const line of lines) {
		const quote = line.match(/^ ?> ?(.*)$/)
		if (quote) {
			flushParagraph()
			quoted.push(quote[1])
			continue
		}
		flushQuote()
		if (line.trim() === '') {
			flushParagraph()
			continue
		}
		paragraph.push(line)
	}
	flushParagraph()
	flushQuote()
	return blocks
}

function linkedLines(lines: string[]): Inline[] {
	const inlines: Inline[] = []
	lines.forEach((line, index) => {
		if (index > 0) inlines.push({ kind: 'break' })
		inlines.push(...linkedText(line))
	})
	return inlines
}

function linkedText(line: string): Inline[] {
	const inlines: Inline[] = []
	let position = 0
	for (const match of line.matchAll(URL_PATTERN)) {
		const start = match.index ?? 0
		if (start > position) inlines.push({ kind: 'text', text: line.slice(position, start) })
		inlines.push({ kind: 'text', text: match[0], href: match[0] })
		position = start + match[0].length
	}
	if (position < line.length) inlines.push({ kind: 'text', text: line.slice(position) })
	return inlines
}
