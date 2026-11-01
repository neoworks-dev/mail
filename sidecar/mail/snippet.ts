// The one-line preview of a message in the list: its body text without the noise that bulk mail
// carries into the text part, such as style sheets, bare links and ruler lines.

export const SNIPPET_LENGTH = 160

/** CSS rules like `body, td { font-family: Arial; }`, as some senders leak into the text part. */
const CSS_RULE = /[\w\s.,#:*>+~\-[\]=\"'()%!@]{0,300}\{[^{}]*:[^{}]*\}/g
/** `@media … {` or a selector left after its inner rules were removed. */
const CSS_LEFTOVER = /@media[^{}]*\{|^\s*[}\s]+/g
const BRACKETED_URL = /[(<[]\s*(?:https?:\/\/|mailto:)[^)\]>]*[)\]>]/gi
const BARE_URL = /(?:https?:\/\/|www\.)\S+/gi
/** Runs of rule characters, such as `=====` or `-----`, and markdown-like `***` emphasis. */
const RULER = /([=\-_*~#+.·•|])\1{2,}/g
/** Soft hyphens, zero-width characters and other invisible fillers preheaders are padded with. */
const INVISIBLE =
	/[\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\u3164\ufeff]/g
const EMPTY_BRACKETS = /\(\s*\)|\[\s*\]|<\s*>/g
/** `[Logo]`, `[Click here if the mail does not display]`: image alt texts and link labels. */
const BRACKETED_LABEL = /\[[^\]]{0,80}\]/g
const NUMERIC_ENTITY = /&#(x?)([0-9a-f]+);/gi
const NAMED_ENTITIES: Record<string, string> = {
	nbsp: ' ',
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	zwnj: '',
	zwj: ''
}
const NAMED_ENTITY = /&([a-z]+);/gi
/** Quoted-printable escapes like `=C3=96` in a part whose encoding was not declared. */
const QUOTED_PRINTABLE_RUN = /(?:=[0-9A-F]{2})+/g
const QUOTED_PRINTABLE_ESCAPE = /=[0-9A-F]{2}/
const SOFT_LINE_BREAK = /=\r?\n/g

export function htmlToText(html: string): string {
	return html
		.replace(/<style[\s\S]*?<\/style>/gi, ' ')
		.replace(/<script[\s\S]*?<\/script>/gi, ' ')
		.replace(/<[^>]+>/g, ' ')
		.replace(/&nbsp;/gi, ' ')
		.replace(/&amp;/gi, '&')
		.replace(/&lt;/gi, '<')
		.replace(/&gt;/gi, '>')
		.replace(/\s+/g, ' ')
		.trim()
}

/** The preview of a message: from its text part, or its HTML when the text part says nothing. */
export function messageSnippet(textBody: string | null, htmlBody: string | null): string {
	if (textBody) {
		const snippet = buildSnippet(textBody)
		if (snippet !== '') return snippet
	}
	if (htmlBody) return buildSnippet(htmlToText(htmlBody))
	return ''
}

/** Reduces body text to a clean preview of at most `SNIPPET_LENGTH` characters. */
export function buildSnippet(bodyText: string): string {
	return cleanSnippetText(bodyText).slice(0, SNIPPET_LENGTH).trim()
}

export function cleanSnippetText(text: string): string {
	return decodeQuotedPrintableRuns(decodeEntities(text))
		.replace(INVISIBLE, '')
		.replace(/\s+/g, ' ')
		.replace(CSS_RULE, ' ')
		.replace(CSS_LEFTOVER, ' ')
		.replace(BRACKETED_URL, ' ')
		.replace(BARE_URL, ' ')
		.replace(BRACKETED_LABEL, ' ')
		.replace(RULER, ' ')
		.replace(EMPTY_BRACKETS, ' ')
		.replace(/\s+/g, ' ')
		.trim()
}

function decodeEntities(text: string): string {
	return text
		.replace(NUMERIC_ENTITY, (entity, hexMarker: string, digits: string) => {
			let codePoint = parseInt(digits, 10)
			if (hexMarker !== '') codePoint = parseInt(digits, 16)
			if (!Number.isFinite(codePoint) || codePoint > 0x10ffff) return entity
			return String.fromCodePoint(codePoint)
		})
		.replace(NAMED_ENTITY, (entity, name: string) => {
			const decoded = NAMED_ENTITIES[name.toLowerCase()]
			if (decoded === undefined) return entity
			return decoded
		})
}

function decodeQuotedPrintableRuns(text: string): string {
	if (!QUOTED_PRINTABLE_ESCAPE.test(text)) return text
	return text.replace(SOFT_LINE_BREAK, '').replace(QUOTED_PRINTABLE_RUN, (run) => {
		const bytes = run
			.split('=')
			.filter((part) => part !== '')
			.map((part) => parseInt(part, 16))
		const decoded = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes))
		if (decoded.includes('\uFFFD')) return run
		return decoded
	})
}
