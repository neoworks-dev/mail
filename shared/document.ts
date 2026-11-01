// A message body as the UI draws it. There is no HTML engine in the native window, so the
// sidecar reduces each body to these blocks (sidecar/mail/document.ts), and the reading pane
// draws them with native primitives.

export interface TextRun {
	kind: 'text'
	text: string
	bold?: boolean
	italic?: boolean
	underline?: boolean
	strike?: boolean
	code?: boolean
	/** An http(s) or mailto link the run belongs to. */
	href?: string
}

export interface LineBreak {
	kind: 'break'
}

export type Inline = TextRun | LineBreak

export type TextAlign = 'start' | 'center' | 'end'

export interface ParagraphBlock {
	kind: 'paragraph'
	inlines: Inline[]
	align?: TextAlign
}

export interface HeadingBlock {
	kind: 'heading'
	level: 1 | 2 | 3 | 4 | 5 | 6
	inlines: Inline[]
	align?: TextAlign
}

export interface QuoteBlock {
	kind: 'quote'
	blocks: Block[]
}

export interface ListBlock {
	kind: 'list'
	ordered: boolean
	/** The first number of an ordered list. */
	start: number
	items: Block[][]
}

export interface PreformattedBlock {
	kind: 'preformatted'
	text: string
}

export interface RuleBlock {
	kind: 'rule'
}

export interface ImageBlock {
	kind: 'image'
	/** A `data:` URL for an inline part, an https URL once remote images are allowed, or null. */
	src: string | null
	/** The image lives on a server; drawing it tells the sender the mail was opened. */
	remote: boolean
	alt: string
	width: number | null
	height: number | null
	href?: string
	align?: TextAlign
}

/** Cells laid side by side, from a table row with more than one non-empty cell. */
export interface RowBlock {
	kind: 'row'
	cells: Block[][]
}

export type Block =
	| ParagraphBlock
	| HeadingBlock
	| QuoteBlock
	| ListBlock
	| PreformattedBlock
	| RuleBlock
	| ImageBlock
	| RowBlock

export interface MailDocument {
	blocks: Block[]
	/** Remote images in the body, drawn or not. */
	remoteImages: number
	trackersRemoved: number
	linksUnwrapped: number
	/** The body came from HTML rather than plain text. */
	fromHtml: boolean
}

export interface DocumentOptions {
	remoteImages: boolean
}
