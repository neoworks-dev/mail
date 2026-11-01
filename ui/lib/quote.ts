/**
 * The quoted-original block a reply composer starts with ("On …, X wrote:"
 * followed by "> " lines), or '' when the text has none. AI reply drafts
 * stream above this block and keep it intact.
 */
export function extractQuote(markdown: string): string {
	const match = markdown.match(/^On .*wrote:\s*$/m)
	if (!match || match.index === undefined) return ''
	return markdown.slice(match.index)
}
